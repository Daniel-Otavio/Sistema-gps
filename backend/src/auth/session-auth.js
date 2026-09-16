const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function criarAutenticacao({ pool, jwtSecret }) {
    const cookieSeguro = process.env.NODE_ENV === 'production';

    function lerCookies(req) {
        return String(req.headers.cookie || '').split(';').reduce((acc, parte) => {
            const indice = parte.indexOf('=');
            if (indice > 0) acc[parte.slice(0, indice).trim()] = decodeURIComponent(parte.slice(indice + 1).trim());
            return acc;
        }, {});
    }

    function estabelecerSessaoWeb(req, res, token) {
        if (req.headers['x-client-type'] !== 'dashboard' && !lerCookies(req).gps_session) return null;
        const csrfToken = crypto.randomBytes(32).toString('hex');
        const base = { secure: cookieSeguro, sameSite: cookieSeguro ? 'none' : 'lax', path: '/' };
        res.cookie('gps_session', token, { ...base, httpOnly: true, maxAge: 2 * 60 * 60 * 1000 });
        res.cookie('gps_csrf', csrfToken, { ...base, httpOnly: true, maxAge: 2 * 60 * 60 * 1000 });
        return csrfToken;
    }

    function limparSessaoWeb(res) {
        const base = { secure: cookieSeguro, sameSite: cookieSeguro ? 'none' : 'lax', path: '/' };
        res.clearCookie('gps_session', { ...base, httpOnly: true });
        res.clearCookie('gps_csrf', { ...base, httpOnly: true });
    }

    function protegerCsrf(req, res, next) {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        if (['/login', '/integracoes/portal/login'].includes(req.path)) return next();
        const cookies = lerCookies(req);
        if (!cookies.gps_session) return next();
        const recebido = String(req.headers['x-csrf-token'] || '');
        const esperado = String(cookies.gps_csrf || '');
        if (!recebido || !esperado || recebido.length !== esperado.length ||
            !crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
            return res.status(403).json({ erro: 'Proteção CSRF inválida. Atualize a página e tente novamente.' });
        }
        return next();
    }
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
        const cookieToken = lerCookies(req).gps_session;
        if (!header && !cookieToken) return res.status(401).json({ erro: 'Sessão não fornecida' });
        const token = header ? (header.startsWith('Bearer ') ? header.slice(7) : header) : cookieToken;
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
                const perfisLeitura = new Set(['administrador', 'supervisor', 'analista', 'somente_leitura']);
                const rotaDashboardLeitura = req.method === 'GET'
                    && ['/dashboard/resumo', '/dashboard/localizacoes'].includes(req.path)
                    && perfisLeitura.has(decoded.perfil);
                if (!rotaEmpresarial && !rotaSessao && !rotaDashboardLeitura) {
                    return res.status(403).json({ erro: 'Use a área empresarial autorizada para esta operação.' });
                }
            }
            return next();
        } catch {
            return res.status(401).json({ erro: 'Token inválido' });
        }
    }

    return { autenticar, emitirTokenSessao, estabelecerSessaoWeb, limparSessaoWeb, protegerCsrf };
}

module.exports = { criarAutenticacao };
