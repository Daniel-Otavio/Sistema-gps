const express = require('express');

function criarRotasPrivacidade({
    pool,
    autenticar,
    autorizarPerfilEmpresa,
    gpsRetencaoPadrao,
    registrarLogSistema
}) {
    const router = express.Router();
    const perfisLeitura = ['administrador', 'supervisor', 'analista', 'somente_leitura'];

    router.get('/integracoes/empresas/:id/retencao', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const r = await pool.query(`SELECT id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_em FROM politicas_retencao WHERE id_empresa=$1`, [req.params.id]);
        return res.json(r.rows[0] || { id_empresa: Number(req.params.id), gps_bruto_dias: gpsRetencaoPadrao, payload_gps_dias: 30, logs_dias: 90, integracao_logs_dias: 90, alertas_dias: 365 });
    });

    router.put('/integracoes/empresas/:id/retencao', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const campos = ['gps_bruto_dias', 'payload_gps_dias', 'logs_dias', 'integracao_logs_dias', 'alertas_dias'];
        const valores = campos.map(c => Number(req.body?.[c]));
        if (valores.some((v, i) => !Number.isInteger(v) || v < (i < 2 ? 1 : i === 4 ? 30 : 7) || v > 3650)) {
            return res.status(400).json({ erro: 'Prazos de retenção inválidos.' });
        }
        const r = await pool.query(`
            INSERT INTO politicas_retencao(id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_por)
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(id_empresa) DO UPDATE SET
                gps_bruto_dias=EXCLUDED.gps_bruto_dias,
                payload_gps_dias=EXCLUDED.payload_gps_dias,
                logs_dias=EXCLUDED.logs_dias,
                integracao_logs_dias=EXCLUDED.integracao_logs_dias,
                alertas_dias=EXCLUDED.alertas_dias,
                atualizado_por=EXCLUDED.atualizado_por,
                atualizado_em=CURRENT_TIMESTAMP
            RETURNING id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_em
        `, [req.params.id, ...valores, req.usuario.id]);
        return res.json(r.rows[0]);
    });

    router.get('/privacidade/solicitacoes', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const idEmpresa = req.query.id_empresa ? Number(req.query.id_empresa) : null;
        const r = await pool.query(`
            SELECT id,id_empresa,tipo,titular_tipo,titular_id,status,justificativa,solicitado_por,solicitado_em,concluido_em
            FROM privacidade_solicitacoes
            WHERE($1::INTEGER IS NULL OR id_empresa=$1)
            ORDER BY solicitado_em DESC LIMIT 500
        `, [idEmpresa]);
        return res.json(r.rows);
    });

    router.patch('/privacidade/solicitacoes/:id', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const status = String(req.body?.status || '');
        if (!['pendente', 'em_processamento', 'concluida', 'rejeitada'].includes(status)) {
            return res.status(400).json({ erro: 'Status de solicitação inválido.' });
        }
        const justificativa = req.body?.justificativa ? String(req.body.justificativa).slice(0, 2000) : null;
        const r = await pool.query(`
            UPDATE privacidade_solicitacoes
            SET status=$1,justificativa=COALESCE($2,justificativa),
                concluido_em=CASE WHEN $1 IN('concluida','rejeitada') THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id=$3
            RETURNING id,id_empresa,tipo,titular_tipo,titular_id,status,justificativa,solicitado_por,solicitado_em,concluido_em
        `, [status, justificativa, req.params.id]);
        if (!r.rows.length) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
        await registrarLogSistema({ nivel: 'info', origem: 'privacidade', mensagem: `Solicitação de privacidade atualizada para ${status}`, detalhes: { id_solicitacao: r.rows[0].id, id_empresa: r.rows[0].id_empresa }, req });
        return res.json(r.rows[0]);
    });

    router.get('/integracoes/portal/privacidade/politica', autenticar, autorizarPerfilEmpresa(perfisLeitura), async (req, res) => {
        const r = await pool.query(`SELECT id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_em FROM politicas_retencao WHERE id_empresa=$1`, [req.usuario.id_empresa]);
        return res.json(r.rows[0] || { id_empresa: req.usuario.id_empresa, gps_bruto_dias: gpsRetencaoPadrao, payload_gps_dias: 30, logs_dias: 90, integracao_logs_dias: 90, alertas_dias: 365 });
    });

    router.get('/integracoes/portal/privacidade/solicitacoes', autenticar, autorizarPerfilEmpresa(perfisLeitura), async (req, res) => {
        const r = await pool.query(`
            SELECT id,tipo,titular_tipo,titular_id,status,justificativa,solicitado_em,concluido_em
            FROM privacidade_solicitacoes WHERE id_empresa=$1
            ORDER BY solicitado_em DESC LIMIT 200
        `, [req.usuario.id_empresa]);
        return res.json(r.rows);
    });

    router.post('/integracoes/portal/privacidade/solicitacoes', autenticar, autorizarPerfilEmpresa(['administrador', 'supervisor']), async (req, res) => {
        const tipo = String(req.body?.tipo || '');
        const titularTipo = String(req.body?.titular_tipo || '');
        const titularId = Number(req.body?.titular_id);
        if (!['exportacao', 'anonimizacao', 'exclusao'].includes(tipo) || !['motorista', 'usuario', 'veiculo'].includes(titularTipo) || !Number.isInteger(titularId) || titularId <= 0) {
            return res.status(400).json({ erro: 'Solicitação de privacidade inválida.' });
        }
        const r = await pool.query(`
            INSERT INTO privacidade_solicitacoes(id_empresa,tipo,titular_tipo,titular_id,justificativa,solicitado_por)
            VALUES($1,$2,$3,$4,$5,$6)
            RETURNING id,tipo,titular_tipo,titular_id,status,justificativa,solicitado_em
        `, [req.usuario.id_empresa, tipo, titularTipo, titularId, String(req.body?.justificativa || '').slice(0, 2000), req.usuario.id]);
        return res.status(201).json(r.rows[0]);
    });

    return router;
}

module.exports = { criarRotasPrivacidade };
