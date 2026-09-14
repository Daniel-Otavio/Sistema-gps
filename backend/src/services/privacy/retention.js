function inteiroAmbiente(nome, padrao, minimo = 1, maximo = 3650) {
    const valor = Number(process.env[nome]);
    return Number.isInteger(valor) ? Math.max(minimo, Math.min(maximo, valor)) : padrao;
}

async function executarRetencao({ pool, logger = console }) {
    const padroes = {
        payloadGps: inteiroAmbiente('GPS_PAYLOAD_RETENTION_DAYS', 30),
        logs: inteiroAmbiente('LOG_RETENTION_DAYS', 90, 7),
        integracao: inteiroAmbiente('INTEGRATION_LOG_RETENTION_DAYS', 90, 7),
        alertas: inteiroAmbiente('ALERT_RETENTION_DAYS', 365, 30)
    };
    const resultados = {};

    const payload = await pool.query(`
        UPDATE gps_ingestoes g
        SET payload=jsonb_build_object('removido_por_retencao',TRUE,'removido_em',CURRENT_TIMESTAMP)
        WHERE g.recebido_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.payload_gps_dias FROM politicas_retencao p WHERE p.id_empresa=g.id_empresa),$1)||' days')::interval
          AND NOT(g.payload ? 'removido_por_retencao')
    `, [padroes.payloadGps]);
    resultados.payloadsGpsMinimizados = payload.rowCount;

    resultados.ingestoesGpsExpiradas = (await pool.query(`
        DELETE FROM gps_ingestoes g
        WHERE g.recebido_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.gps_bruto_dias FROM politicas_retencao p WHERE p.id_empresa=g.id_empresa),$1)||' days')::interval
    `, [inteiroAmbiente('GPS_RAW_RETENTION_DAYS', 180)])).rowCount;

    resultados.logsRemovidos = (await pool.query(`
        DELETE FROM logs_sistema l
        WHERE l.criado_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.logs_dias FROM politicas_retencao p WHERE p.id_empresa=l.id_empresa),$1)||' days')::interval
    `, [padroes.logs])).rowCount;
    resultados.integracoesRemovidas = (await pool.query(`
        DELETE FROM integracao_requisicoes i
        WHERE i.recebido_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.integracao_logs_dias FROM politicas_retencao p WHERE p.id_empresa=i.id_empresa),$1)||' days')::interval
    `, [padroes.integracao])).rowCount;
    resultados.alertasEncerradosRemovidos = (await pool.query(`
        DELETE FROM guardiao_sombra_eventos g
        WHERE NOT g.ativo AND g.ultimo_evento_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.alertas_dias FROM politicas_retencao p WHERE p.id_empresa=g.id_empresa),$1)||' days')::interval
    `, [padroes.alertas])).rowCount;
    resultados.sessoesExpiradasRemovidas = (await pool.query(`DELETE FROM auth_sessoes WHERE expira_em<CURRENT_TIMESTAMP-INTERVAL '7 days'`)).rowCount;
    resultados.notificacoesRemovidas = (await pool.query(`DELETE FROM notificacoes_outbox WHERE status IN('enviado','falhou') AND criado_em<CURRENT_TIMESTAMP-INTERVAL '180 days'`)).rowCount;
    resultados.limitesExpiradosRemovidos = (await pool.query(`DELETE FROM limites_requisicao WHERE expira_em<CURRENT_TIMESTAMP-INTERVAL '1 day'`)).rowCount;
    resultados.geocodificacoesExpiradasRemovidas = (await pool.query(`DELETE FROM geocodificacao_cache WHERE expira_em<CURRENT_TIMESTAMP`)).rowCount;
    logger.log('🧹 Política de retenção aplicada:', resultados);
    return resultados;
}

module.exports = { executarRetencao };
