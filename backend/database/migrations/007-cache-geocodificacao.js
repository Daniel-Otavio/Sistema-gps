module.exports = {
    versao: '007_cache_geocodificacao_2026_09',
    async aplicar({ client }) {
        await client.query(`
            CREATE TABLE IF NOT EXISTS geocodificacao_cache (
                consulta_hash CHAR(64) PRIMARY KEY,
                consulta_normalizada VARCHAR(250) NOT NULL,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                nome_exibicao VARCHAR(500),
                encontrado BOOLEAN NOT NULL,
                provedor VARCHAR(40) NOT NULL DEFAULT 'nominatim',
                criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expira_em TIMESTAMPTZ NOT NULL
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_geocodificacao_cache_expira
            ON geocodificacao_cache(expira_em)
        `);
    }
};
