const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function criarAutenticacao({ pool, jwtSecret }) {
    async function emitirTokenSessao(usuario, validade = '8h') {
        const jti = crypto.randomUUID();
        const token = jwt.sign({ ...usuario, jti }, jwtSecret, { expiresIn: validade });
        const decoded = jwt.decode(token);
        await pool.query(
            `INSERT INTO auth_sessoes(jti,tipo_usuario,id_usuario,id_empresa,expira_em)
             VALUES($1,$2,$3,$4,to_timestamp($5))`,
            [jti, usuario.tipo, usuario.id, usuario.id_empresa || null, decoded.exp]
        );
        return token;
    }

    async function autenticar(req, res, next) {
        const header = req.headers.authorization;
        if (!header) return res.status(401).json({ erro: 'Token não fornecido' });
        const token = header.startsWith('Bearer ') ? header.slice(7) : header;
        try {
            const decoded = jwt.verify(token, jwtSecret);
            if (!decoded.jti) return res.status(401).json({ erro: 'Sessão antiga ou inválida. Entre novamente.' });
            const sessao = await pool.query(
                `SELECT 1 FROM auth_sessoes
                 WHERE jti=$1 AND revogada_em IS NULL AND expira_em>CURRENT_TIMESTAMP`,
                [decoded.jti]
            );
            if (!sessao.rows.length) return res.status(401).json({ erro: 'Sessão encerrada ou expirada.' });

            if (decoded.tipo === 'empresa_usuario') {
                const atual = await pool.query(
                    `SELECT u.token_version,u.ativo,e.ativo AS empresa_ativa
                     FROM empresa_usuarios u JOIN empresas_integracao e ON e.id=u.id_empresa
                     WHERE u.id=$1 AND u.id_empresa=$2`,
                    [decoded.id, decoded.id_empresa]
                );
                if (!atual.rows[0]?.ativo || !atual.rows[0]?.empresa_ativa || Number(atual.rows[0].token_version) !== Number(decoded.token_version)) {
                    return res.status(401).json({ erro: 'Acesso empresarial revogado.' });
                }
            } else {
                const atual = await pool.query('SELECT ativo,token_version FROM usuarios WHERE id=$1', [decoded.id]);
                if (!atual.rows[0]?.ativo || Number(atual.rows[0].token_version) !== Number(decoded.token_version)) {
                    return res.status(401).json({ erro: 'Acesso revogado.' });
                }
            }

            req.usuario = decoded;
            if (decoded.tipo === 'empresa_usuario') {
                const rotaEmpresarial = req.path.startsWith('/integracoes/portal/');
                const rotaSessao = req.path.startsWith('/auth/');
                if (!rotaEmpresarial && !rotaSessao) {
                    return res.status(403).json({ erro: 'Use a área empresarial autorizada para esta operação.' });
                }
            }
            return next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido' });
        }
    }

    return { autenticar, emitirTokenSessao };
}

module.exports = { criarAutenticacao };
