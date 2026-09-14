module.exports = {
    versao: '006_logs_por_empresa_2026_09',
    async aplicar({ client }) {
        await client.query(`
            ALTER TABLE logs_sistema
            ADD COLUMN IF NOT EXISTS id_empresa INTEGER
            REFERENCES empresas_integracao(id)
            ON DELETE SET NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_logs_sistema_empresa_data
            ON logs_sistema(id_empresa,criado_em DESC)
        `);
    }
};
