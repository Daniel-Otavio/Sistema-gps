module.exports = {
    versao: '017_indices_retencao_filas_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE INDEX IF NOT EXISTS idx_gps_ingestoes_recebido_em ON gps_ingestoes(recebido_em)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_analises_analisado_em ON guardiao_analises(analisado_em)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_fila_finalizados ON guardiao_fila(status,processado_em) WHERE status IN('concluido','falhou')`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_privacidade_exportacao_fila_finalizados ON privacidade_exportacao_fila(status,processado_em) WHERE status IN('concluido','falhou')`);
    }
};
