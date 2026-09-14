const express = require('express');

function criarRotasGps({
    pool,
    autenticar,
    autenticarEmpresaIntegracao,
    exigirEscopo,
    localizacaoLimiter,
    processarLocalizacaoUnificada,
    processarFilaGuardiao
}) {
    const router = express.Router();
    const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

    router.post('/integracoes/gps/localizacao', autenticarEmpresaIntegracao,
        exigirEscopo('telemetria:escrever'), localizacaoLimiter, processarLocalizacaoUnificada);

    router.get('/integracoes/gps/processamentos/:id', autenticarEmpresaIntegracao,
        exigirEscopo('diagnostico:ler'), asyncRoute(async (req, res) => {
            const r = await pool.query(`SELECT f.id,f.status,f.qualidade,f.tentativas,
                f.ultimo_erro,f.resultado,f.criado_em,f.processado_em
                FROM guardiao_fila f WHERE f.id_ingestao=$1 AND f.id_empresa=$2`,
            [req.params.id, req.empresaIntegracao.id]);
            if (!r.rows.length) return res.status(404).json({ erro: 'Processamento não encontrado.' });
            return res.json(r.rows[0]);
        }));

    router.post('/admin/guardiao-fila/:id/reprocessar', autenticar, asyncRoute(async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const r = await pool.query(`UPDATE guardiao_fila SET status='pendente',qualidade='nao_processada',
            tentativas=0,proxima_tentativa_em=CURRENT_TIMESTAMP,reservado_em=NULL,worker_id=NULL,
            ultimo_erro=NULL WHERE id=$1 RETURNING id,status,qualidade,tentativas,proxima_tentativa_em`, [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ erro: 'Processamento não encontrado.' });
        setTimeout(processarFilaGuardiao, 10);
        return res.json(r.rows[0]);
    }));

    return router;
}

module.exports = { criarRotasGps };
