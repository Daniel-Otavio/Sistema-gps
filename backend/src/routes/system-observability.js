const express = require('express');

function criarRotasObservabilidade({ pool, autenticar, registrarLogSistema }) {
    const router = express.Router();
    const somenteAdmin = (req, res, next) =>
        req.usuario?.tipo === 'admin' ? next() : res.status(403).json({ erro: 'Acesso negado' });

    router.get('/admin/logs-sistema', autenticar, somenteAdmin, async (req, res) => {
        const limite = Math.max(1, Math.min(500, Number(req.query.limite || 100)));
        const r = await pool.query(`
            SELECT id,criado_em,nivel,origem,mensagem,request_id,metodo,rota,
                   status_http,duracao_ms,id_empresa
            FROM logs_sistema
            ORDER BY criado_em DESC LIMIT $1
        `, [limite]);
        return res.json(r.rows);
    });

    router.get('/admin/saude-sistema', autenticar, somenteAdmin, async (req, res) => {
        const inicio = Date.now();
        try {
            const [integracoes, guardiao, empresas, eventos] = await Promise.all([
                pool.query(`SELECT COUNT(*) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes')::int AS requisicoes_15m,COUNT(*) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND sucesso)::int AS sucessos_15m,COUNT(*) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND NOT sucesso)::int AS falhas_15m,ROUND(AVG(duracao_ms) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes'))::int AS latencia_media_ms,ROUND(PERCENTILE_CONT(.95)WITHIN GROUP(ORDER BY duracao_ms)FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes'))::int AS latencia_p95_ms,MAX(recebido_em) AS ultima_posicao FROM integracao_requisicoes`),
                pool.query(`SELECT COUNT(*) FILTER(WHERE analisado_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes')::int AS analises_15m,COUNT(*) FILTER(WHERE analisado_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND status='risco')::int AS riscos_15m,COUNT(*) FILTER(WHERE analisado_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND status='seguro')::int AS seguras_15m,MAX(analisado_em) AS ultima_analise FROM guardiao_analises`),
                pool.query(`SELECT e.id,e.nome,e.status_operacional,e.ultimo_uso_em,e.ultimo_erro_em,COUNT(ev.id_veiculo)::int AS veiculos FROM empresas_integracao e LEFT JOIN empresa_integracao_veiculos ev ON ev.id_empresa=e.id WHERE e.ativo=TRUE GROUP BY e.id ORDER BY CASE e.status_operacional WHEN 'erro' THEN 0 WHEN 'offline' THEN 1 WHEN 'nunca_conectou' THEN 2 ELSE 3 END,e.nome`),
                pool.query(`SELECT * FROM(
                    SELECT criado_em AS horario,nivel,origem,mensagem,status_http,duracao_ms,request_id,CASE WHEN origem='http_lento' THEN 'Banco, rede ou processamento acima do limite esperado' WHEN origem='http_5xx' THEN 'Falha interna da API; consulte o request ID' WHEN origem='health' THEN 'Banco de dados indisponível ou conexão interrompida' ELSE NULL END AS causa FROM logs_sistema
                    UNION ALL
                    SELECT recebido_em,CASE WHEN sucesso THEN 'success' ELSE 'error' END,'gps_empresa',CASE WHEN sucesso THEN 'Posição processada: '||COALESCE(placa,'sem placa') ELSE 'Falha ao processar posição: '||COALESCE(placa,'sem placa') END,status_http,duracao_ms,request_id,CASE erro_codigo WHEN 'CHAVE_INVALIDA' THEN 'Chave expirada, revogada ou incorreta' WHEN 'PLACA_NAO_AUTORIZADA' THEN 'Placa não vinculada à empresa' WHEN 'POSICAO_INVALIDA' THEN 'Posição inválida' ELSE NULL END FROM integracao_requisicoes
                    UNION ALL
                    SELECT analisado_em,CASE WHEN status='risco' THEN 'warn' ELSE 'success' END,'guardiao','Análise '||status||' · veículo '||id_veiculo,NULL,NULL,request_id,CASE WHEN status='calibrando' THEN 'GPS ainda sem direção suficiente' ELSE NULL END FROM guardiao_analises
                )linha ORDER BY horario DESC LIMIT 150`)
            ]);
            const i = integracoes.rows[0] || {};
            const g = guardiao.rows[0] || {};
            const ultima = i.ultima_posicao ? new Date(i.ultima_posicao) : null;
            const apiStatus = Number(i.falhas_15m || 0) > 0 ? 'atencao' : 'operacional';
            const telemetriaStatus = !ultima ? 'sem_dados' : Date.now() - ultima.getTime() > 300000 ? 'offline' : 'operacional';
            return res.json({
                timestamp: new Date(),
                status: apiStatus,
                tempo_resposta_ms: Date.now() - inicio,
                servicos: {
                    api: { status: apiStatus },
                    banco: { status: 'operacional' },
                    telemetria: { status: telemetriaStatus, ultima_posicao: i.ultima_posicao },
                    guardiao: { status: g.ultima_analise ? 'operacional' : 'sem_dados', ultima_analise: g.ultima_analise }
                },
                metricas: { ...i, ...g },
                empresas: empresas.rows,
                eventos: eventos.rows
            });
        } catch (erro) {
            await registrarLogSistema({ nivel: 'error', origem: 'saude_sistema', mensagem: erro.message, detalhes: { name: erro.name, code: erro.code }, req, statusHttp: 500, duracaoMs: Date.now() - inicio });
            return res.status(500).json({ erro: 'Não foi possível consultar a saúde do sistema.', request_id: req.requestId });
        }
    });

    return router;
}

module.exports = { criarRotasObservabilidade };
