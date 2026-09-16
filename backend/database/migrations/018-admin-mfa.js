module.exports = {
    versao: '018_admin_mfa_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE TABLE IF NOT EXISTS admin_mfa_desafios(
            id UUID PRIMARY KEY,
            id_usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            codigo_hash TEXT NOT NULL,
            expira_em TIMESTAMPTZ NOT NULL,
            tentativas INTEGER NOT NULL DEFAULT 0,
            usado_em TIMESTAMPTZ,
            criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            request_id TEXT
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_mfa_desafios_pendentes
            ON admin_mfa_desafios(id_usuario,expira_em)
            WHERE usado_em IS NULL`);
    }
};