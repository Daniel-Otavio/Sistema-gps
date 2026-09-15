module.exports = {
    versao: '008_observabilidade_filas_dashboard_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE INDEX IF NOT EXISTS idx_logs_dashboard_resumo_data
            ON logs_sistema(criado_em DESC) WHERE origem='dashboard_resumo'`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_fila_status_criado
            ON guardiao_fila(status,criado_em)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_notificacoes_status_criado
            ON notificacoes_outbox(status,criado_em)`);
    }
};
