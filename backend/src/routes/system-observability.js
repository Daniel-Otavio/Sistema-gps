const express = require('express');

function criarRotasObservabilidade({ pool, autenticar, registrarLogSistema, guardiaoSlaMs = 5000 }) {
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
            const [integracoes, guardiao, empresas, eventos, filaGuardiao, filaNotificacoes, filaRegional, dashboard, sla] = await Promise.all([
                pool.query(`SELECT COUNT(*) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes')::int AS requisicoes_15m,COUNT(*) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND sucesso)::int AS sucessos_15m,COUNT(*) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND NOT sucesso)::int AS falhas_15m,ROUND(AVG(duracao_ms) FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes'))::int AS latencia_media_ms,ROUND(PERCENTILE_CONT(.95)WITHIN GROUP(ORDER BY duracao_ms)FILTER(WHERE recebido_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes'))::int AS latencia_p95_ms,MAX(recebido_em) AS ultima_posicao FROM integracao_requisicoes`),
                pool.query(`SELECT COUNT(*) FILTER(WHERE analisado_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes')::int AS analises_15m,COUNT(*) FILTER(WHERE analisado_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND status='risco')::int AS riscos_15m,COUNT(*) FILTER(WHERE analisado_em>CURRENT_TIMESTAMP-INTERVAL '15 minutes' AND status='seguro')::int AS seguras_15m,MAX(analisado_em) AS ultima_analise FROM guardiao_analises`),
                pool.query(`SELECT e.id,e.nome,e.status_operacional,e.ultimo_uso_em,e.ultimo_erro_em,COUNT(ev.id_veiculo)::int AS veiculos FROM empresas_integracao e LEFT JOIN empresa_integracao_veiculos ev ON ev.id_empresa=e.id WHERE e.ativo=TRUE GROUP BY e.id ORDER BY CASE e.status_operacional WHEN 'erro' THEN 0 WHEN 'offline' THEN 1 WHEN 'nunca_conectou' THEN 2 ELSE 3 END,e.nome`),
                pool.query(`SELECT * FROM(
                    SELECT criado_em AS horario,nivel,origem,mensagem,status_http,duracao_ms,request_id,CASE WHEN origem='http_lento' THEN 'Banco, rede ou processamento acima do limite esperado' WHEN origem='http_5xx' THEN 'Falha interna da API; consulte o request ID' WHEN origem='health' THEN 'Banco de dados indisponível ou conexão interrompida' ELSE NULL END AS causa FROM logs_sistema
                    UNION ALL
                    SELECT recebido_em,CASE WHEN sucesso THEN 'success' ELSE 'error' END,'gps_empresa',CASE WHEN sucesso THEN 'Posição processada: '||COALESCE(placa,'sem placa') ELSE 'Falha ao processar posição: '||COALESCE(placa,'sem placa') END,status_http,duracao_ms,request_id,CASE erro_codigo WHEN 'CHAVE_INVALIDA' THEN 'Chave expirada, revogada ou incorreta' WHEN 'PLACA_NAO_AUTORIZADA' THEN 'Placa não vinculada à empresa' WHEN 'POSICAO_INVALIDA' THEN 'Posição inválida' ELSE NULL END FROM integracao_requisicoes
                    UNION ALL
                    SELECT analisado_em,CASE WHEN status='risco' THEN 'warn' ELSE 'success' END,'guardiao','Análise '||status||' · veículo '||id_veiculo,NULL,NULL,request_id,CASE WHEN status='calibrando' THEN 'GPS ainda sem direção suficiente' ELSE NULL END FROM guardiao_analises
                )linha ORDER BY horario DESC LIMIT 150`),
                pool.query(`SELECT
                    COUNT(*) FILTER(WHERE status='pendente')::int AS pendentes,
                    COUNT(*) FILTER(WHERE status='processando')::int AS processando,
                    COUNT(*) FILTER(WHERE status='falhou')::int AS falhas_permanentes,
                    EXTRACT(EPOCH FROM(CURRENT_TIMESTAMP-MIN(criado_em)FILTER(WHERE status='pendente')))::int AS item_mais_antigo_seg,
                    ROUND(AVG(EXTRACT(EPOCH FROM(processado_em-criado_em))*1000)FILTER(WHERE status='concluido' AND processado_em>CURRENT_TIMESTAMP-INTERVAL '24 hours'))::int AS tempo_medio_ms
                    FROM guardiao_fila`),
                pool.query(`SELECT
                    COUNT(*) FILTER(WHERE status='pendente')::int AS pendentes,
                    COUNT(*) FILTER(WHERE status='tentando')::int AS processando,
                    COUNT(*) FILTER(WHERE status='falhou')::int AS falhas_permanentes,
                    EXTRACT(EPOCH FROM(CURRENT_TIMESTAMP-MIN(criado_em)FILTER(WHERE status='pendente')))::int AS item_mais_antigo_seg,
                    ROUND(AVG(EXTRACT(EPOCH FROM(enviado_em-criado_em))*1000)FILTER(WHERE status='enviado' AND enviado_em>CURRENT_TIMESTAMP-INTERVAL '24 hours'))::int AS tempo_medio_ms
                    FROM notificacoes_outbox`),
                pool.query(`SELECT COUNT(*)FILTER(WHERE status='pendente')::int AS pendentes,
                    COUNT(*)FILTER(WHERE status='processando')::int AS processando,
                    COUNT(*)FILTER(WHERE status='falhou')::int AS falhas_permanentes,
                    EXTRACT(EPOCH FROM(CURRENT_TIMESTAMP-MIN(criado_em)FILTER(WHERE status='pendente')))::int AS item_mais_antigo_seg,
                    ROUND(AVG(duracao_ms)FILTER(WHERE status='concluido' AND execucao_finalizada_em>CURRENT_TIMESTAMP-INTERVAL '24 hours'))::int AS tempo_medio_ms,
                    ROUND(AVG(EXTRACT(EPOCH FROM(execucao_iniciada_em-criado_em))*1000)FILTER(WHERE execucao_iniciada_em>CURRENT_TIMESTAMP-INTERVAL '24 hours'))::int AS espera_media_ms,
                    COUNT(*)FILTER(WHERE cobertura_status<>'completa')::int AS coberturas_parciais,
                    MAX(ultima_indexacao_em) AS ultima_indexacao FROM indexacao_regional_fila`),
                pool.query(`SELECT COUNT(*)::int AS chamadas_24h,
                    ROUND(AVG(duracao_ms))::int AS latencia_media_ms,
                    ROUND(PERCENTILE_CONT(.95)WITHIN GROUP(ORDER BY duracao_ms))::int AS latencia_p95_ms,
                    MAX(duracao_ms)::int AS latencia_maxima_ms,
                    ROUND(AVG((detalhes->>'linhas')::numeric))::int AS linhas_medias,
                    MAX(criado_em) AS ultima_atualizacao
                    FROM logs_sistema WHERE origem='dashboard_resumo'
                    AND criado_em>CURRENT_TIMESTAMP-INTERVAL '24 hours'`),
                pool.query(`SELECT
                    COUNT(*)::int AS posicoes_recebidas,
                    COUNT(*) FILTER(WHERE f.status='concluido')::int AS posicoes_analisadas,
                    COUNT(*) FILTER(WHERE f.status='concluido' AND EXTRACT(EPOCH FROM(f.processado_em-f.criado_em))*1000<=$1)::int AS dentro_sla,
                    ROUND(100.0*COUNT(*)FILTER(WHERE f.status='concluido')/NULLIF(COUNT(*),0),2) AS disponibilidade_percentual,
                    ROUND(100.0*COUNT(*)FILTER(WHERE f.status='concluido' AND EXTRACT(EPOCH FROM(f.processado_em-f.criado_em))*1000<=$1)/NULLIF(COUNT(*),0),2) AS dentro_sla_percentual,
                    ROUND(AVG(EXTRACT(EPOCH FROM(f.processado_em-f.criado_em))*1000)FILTER(WHERE f.status='concluido'))::int AS latencia_media_ms,
                    ROUND(PERCENTILE_CONT(.95)WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM(f.processado_em-f.criado_em))*1000)FILTER(WHERE f.status='concluido'))::int AS latencia_p95_ms,
                    COUNT(*)FILTER(WHERE f.qualidade IN('completa','corredor_historico_alta'))::int AS analises_completas,
                    COUNT(*)FILTER(WHERE f.qualidade IN('limitada_radar_direcional','utilizando_cache'))::int AS analises_limitadas,
                    COUNT(*)FILTER(WHERE f.qualidade IN('sem_direcao','sem_perfil_completo','corredor_historico_baixa'))::int AS analises_degradadas,
                    (SELECT COUNT(*)::int FROM guardiao_sombra_eventos WHERE primeiro_evento_em>CURRENT_TIMESTAMP-INTERVAL '24 hours') AS alertas_gerados,
                    (SELECT COUNT(*)::int FROM notificacoes_outbox WHERE criado_em>CURRENT_TIMESTAMP-INTERVAL '24 hours' AND status='enviado') AS alertas_entregues,
                    (SELECT COUNT(*)::int FROM notificacoes_outbox WHERE criado_em>CURRENT_TIMESTAMP-INTERVAL '24 hours' AND status='falhou') AS alertas_falhos
                    FROM guardiao_fila f WHERE f.criado_em>CURRENT_TIMESTAMP-INTERVAL '24 hours'`, [guardiaoSlaMs])
            ]);
            const i = integracoes.rows[0] || {};
            const g = guardiao.rows[0] || {};
            const ultima = i.ultima_posicao ? new Date(i.ultima_posicao) : null;
            const fg = filaGuardiao.rows[0] || {};
            const fn = filaNotificacoes.rows[0] || {};
            const fr = filaRegional.rows[0] || {};
            const dm = dashboard.rows[0] || {};
            const sl = sla.rows[0] || {};
            const filaGuardiaoStatus = Number(fg.falhas_permanentes || 0) > 0 || Number(fg.item_mais_antigo_seg || 0) > 60 ||
                (Number(sl.posicoes_recebidas || 0) > 0 && Number(sl.dentro_sla_percentual || 0) < 95) ? 'atencao' : 'operacional';
            const filaNotificacaoStatus = Number(fn.falhas_permanentes || 0) > 0 || Number(fn.item_mais_antigo_seg || 0) > 300 ? 'atencao' : 'operacional';
            const filaRegionalStatus = Number(fr.falhas_permanentes || 0) > 0 || Number(fr.item_mais_antigo_seg || 0) > 900 ? 'atencao' : fr.ultima_indexacao ? 'operacional' : 'sem_dados';
            const dashboardStatus = Number(dm.latencia_p95_ms || 0) > 3000 ? 'atencao' : dm.ultima_atualizacao ? 'operacional' : 'sem_dados';
            const apiStatus = Number(i.falhas_15m || 0) > 0 || filaGuardiaoStatus === 'atencao' || filaRegionalStatus === 'atencao' ? 'atencao' : 'operacional';
            const telemetriaStatus = !ultima ? 'sem_dados' : Date.now() - ultima.getTime() > 300000 ? 'offline' : 'operacional';
            return res.json({
                timestamp: new Date(),
                status: apiStatus,
                tempo_resposta_ms: Date.now() - inicio,
                servicos: {
                    api: { status: apiStatus },
                    banco: { status: 'operacional', conexoes_total:pool.totalCount,
                        conexoes_ociosas:pool.idleCount, aguardando_conexao:pool.waitingCount },
                    telemetria: { status: telemetriaStatus, ultima_posicao: i.ultima_posicao },
                    guardiao: { status: g.ultima_analise ? filaGuardiaoStatus : 'sem_dados', ultima_analise: g.ultima_analise },
                    notificacoes: { status: filaNotificacaoStatus },
                    indexacao_regional: { status: filaRegionalStatus, ultima_indexacao:fr.ultima_indexacao },
                    dashboard: { status: dashboardStatus, ultima_atualizacao: dm.ultima_atualizacao }
                },
                metricas: { ...i, ...g },
                filas: { guardiao: fg, notificacoes: fn, indexacao_regional:fr },
                dashboard: dm,
                sla_guardiao: { ...sl, meta_ms:guardiaoSlaMs },
                empresas: empresas.rows,
                eventos: eventos.rows
            });
        } catch (erro) {
            await registrarLogSistema({ nivel: 'error', origem: 'saude_sistema', mensagem: erro.message, detalhes: { name: erro.name, code: erro.code }, req, statusHttp: 500, duracaoMs: Date.now() - inicio });
            return res.status(500).json({ erro: 'Não foi possível consultar a saúde do sistema.', request_id: req.requestId });
        }
    });

    router.post('/admin/filas/:tipo/reprocessar-falhas', autenticar, somenteAdmin, async (req, res) => {
        const tipo = String(req.params.tipo || '');
        if (!['guardiao', 'notificacoes', 'indexacao_regional'].includes(tipo)) return res.status(400).json({ erro:'Fila inválida.' });
        try {
            const tabela = tipo === 'guardiao' ? 'guardiao_fila' : tipo === 'indexacao_regional' ? 'indexacao_regional_fila' : 'notificacoes_outbox';
            const resultado = await pool.query(`WITH falhas AS(
                SELECT id FROM ${tabela} WHERE status='falhou' ORDER BY criado_em LIMIT 100
            ) UPDATE ${tabela} f SET status='pendente',tentativas=0,ultimo_erro=NULL,
                proxima_tentativa_em=CURRENT_TIMESTAMP,reservado_em=NULL,worker_id=NULL
                FROM falhas WHERE f.id=falhas.id RETURNING f.id`);
            await registrarLogSistema({ nivel:'info', origem:'fila_reprocessada',
                mensagem:`Reprocessamento manual da fila ${tipo}`, detalhes:{ quantidade:resultado.rowCount }, req });
            return res.json({ mensagem:'Itens reenfileirados.', tipo, quantidade:resultado.rowCount });
        } catch (erro) {
            await registrarLogSistema({ nivel:'error', origem:'fila_reprocessada', mensagem:erro.message,
                detalhes:{ name:erro.name, code:erro.code }, req, statusHttp:500 });
            return res.status(500).json({ erro:'Não foi possível reprocessar a fila.', request_id:req.requestId });
        }
    });

    return router;
}

module.exports = { criarRotasObservabilidade };
