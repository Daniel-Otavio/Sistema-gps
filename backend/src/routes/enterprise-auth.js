const express = require('express');
const bcrypt = require('bcryptjs');

function criarRotasAutenticacaoEmpresarial({ pool, autenticar, cadastroLimiter, emitirTokenSessao }) {
    const router = express.Router();

    router.post('/integracoes/portal/login', cadastroLimiter, async (req, res) => {
        try {
            const empresa = String(req.body?.empresa || req.body?.id_empresa || '').trim();
            const email = String(req.body?.email || '').trim().toLowerCase();
            const senha = String(req.body?.senha || '');
            if (!empresa || !email || !senha) return res.status(400).json({ erro: 'Informe empresa, e-mail e senha.' });
            const r = await pool.query(`
                SELECT u.id,u.id_empresa,u.nome,u.email,u.perfil,u.senha_hash,u.token_version,
                       e.nome AS empresa_nome,e.ativo AS empresa_ativa
                FROM empresa_usuarios u
                JOIN empresas_integracao e ON e.id=u.id_empresa
                WHERE u.email=$1 AND u.ativo=TRUE
                  AND(e.id::text=$2 OR LOWER(e.nome)=LOWER($2))
                LIMIT 1
            `, [email, empresa]);
            const u = r.rows[0];
            if (!u || !u.empresa_ativa || !u.senha_hash || !bcrypt.compareSync(senha, u.senha_hash)) {
                return res.status(401).json({ erro: 'Credenciais empresariais inválidas.' });
            }
            const usuario = { id: u.id, nome: u.nome, tipo: 'empresa_usuario', perfil: u.perfil, id_empresa: u.id_empresa, empresa: u.empresa_nome, token_version: u.token_version };
            return res.json({ token: await emitirTokenSessao(usuario, '2h'), usuario });
        } catch {
            return res.status(500).json({ erro: 'Não foi possível iniciar a sessão.' });
        }
    });

    router.post('/auth/logout', autenticar, async (req, res) => {
        await pool.query(`UPDATE auth_sessoes SET revogada_em=CURRENT_TIMESTAMP,motivo_revogacao='logout' WHERE jti=$1`, [req.usuario.jti]);
        return res.json({ mensagem: 'Sessão encerrada.' });
    });

    router.post('/auth/logout-todos', autenticar, async (req, res) => {
        const tabela = req.usuario.tipo === 'empresa_usuario' ? 'empresa_usuarios' : 'usuarios';
        await pool.query(`UPDATE ${tabela} SET token_version=token_version+1 WHERE id=$1`, [req.usuario.id]);
        await pool.query(`UPDATE auth_sessoes SET revogada_em=CURRENT_TIMESTAMP,motivo_revogacao='logout_todos' WHERE tipo_usuario=$1 AND id_usuario=$2 AND revogada_em IS NULL`, [req.usuario.tipo, req.usuario.id]);
        return res.json({ mensagem: 'Todas as sessões foram encerradas.' });
    });

    router.post('/auth/renovar', autenticar, async (req, res) => {
        const usuario = { ...req.usuario };
        delete usuario.iat;
        delete usuario.exp;
        delete usuario.jti;
        const token = await emitirTokenSessao(usuario, req.usuario.tipo === 'empresa_usuario' ? '2h' : '8h');
        await pool.query(`UPDATE auth_sessoes SET revogada_em=CURRENT_TIMESTAMP,motivo_revogacao='token_renovado' WHERE jti=$1`, [req.usuario.jti]);
        return res.json({ token });
    });

    router.post('/admin/sessoes/revogar', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const tipo = String(req.body?.tipo_usuario || '');
        const id = Number(req.body?.id_usuario);
        if (!['admin', 'motorista', 'empresa_usuario'].includes(tipo) || !Number.isInteger(id)) {
            return res.status(400).json({ erro: 'Informe tipo_usuario e id_usuario válidos.' });
        }
        const tabela = tipo === 'empresa_usuario' ? 'empresa_usuarios' : 'usuarios';
        await pool.query(`UPDATE ${tabela} SET token_version=token_version+1 WHERE id=$1`, [id]);
        const r = await pool.query(`UPDATE auth_sessoes SET revogada_em=CURRENT_TIMESTAMP,motivo_revogacao='revogada_pelo_administrador' WHERE tipo_usuario=$1 AND id_usuario=$2 AND revogada_em IS NULL RETURNING jti`, [tipo, id]);
        return res.json({ mensagem: 'Sessões revogadas.', total: r.rowCount });
    });

    return router;
}

module.exports = { criarRotasAutenticacaoEmpresarial };
