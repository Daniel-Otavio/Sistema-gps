const express = require('express');

function criarRotasNotificacoes({
    pool, autenticar, processarNotificacoesOutbox,
    alertWebhookUrl, alertEmailTo, brevoApiKey, emailRemetente
}) {
    const router = express.Router();
    const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    const somenteAdmin = (req, res, next) => req.usuario?.tipo === 'admin'
        ? next() : res.status(403).json({ erro: 'Acesso negado' });

    router.get('/notificacoes/diagnostico', autenticar, somenteAdmin, asyncRoute(async (req, res) => {
        const resumo = await pool.query(`SELECT status,COUNT(*)::int AS total FROM notificacoes_outbox GROUP BY status`);
        const recentes = await pool.query(`SELECT id,entrega_id,id_empresa,tipo,referencia_tipo,referencia_id,
            CASE WHEN destinatario='painel' THEN 'painel' WHEN destinatario='webhook' THEN 'webhook'
                 WHEN destinatario LIKE '%@%' THEN 'email' ELSE 'canal' END AS canal,
            status,tentativas,proxima_tentativa_em,ultimo_erro,criado_em,enviado_em
            FROM notificacoes_outbox ORDER BY criado_em DESC LIMIT 100`);
        return res.json({
            canais: {
                painel: true,
                webhook: Boolean(alertWebhookUrl),
                email: Boolean(alertEmailTo && brevoApiKey && emailRemetente)
            },
            resumo: resumo.rows,
            recentes: recentes.rows
        });
    }));

    router.post('/notificacoes/:id/reenviar', autenticar, somenteAdmin, asyncRoute(async (req, res) => {
        const r = await pool.query(`UPDATE notificacoes_outbox SET status='pendente',tentativas=0,
            proxima_tentativa_em=CURRENT_TIMESTAMP,ultimo_erro=NULL,enviado_em=NULL
            WHERE id=$1 RETURNING id,status`, [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ erro: 'Notificação não encontrada.' });
        setTimeout(processarNotificacoesOutbox, 10);
        return res.json({ mensagem: 'Notificação colocada novamente na fila.', notificacao: r.rows[0] });
    }));

    return router;
}

module.exports = { criarRotasNotificacoes };
