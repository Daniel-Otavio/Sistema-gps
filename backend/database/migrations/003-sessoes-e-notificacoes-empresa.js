module.exports = {
    versao: '003_sessoes_notificacoes_empresa_2026_09',
    async aplicar({ client }) {
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1`);
        await client.query(`ALTER TABLE empresa_usuarios ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1`);
        await client.query(`CREATE TABLE IF NOT EXISTS auth_sessoes (
            jti UUID PRIMARY KEY, tipo_usuario VARCHAR(30) NOT NULL, id_usuario BIGINT NOT NULL,
            id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            expira_em TIMESTAMPTZ NOT NULL, revogada_em TIMESTAMPTZ,
            motivo_revogacao VARCHAR(180), criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_auth_sessoes_usuario ON auth_sessoes(tipo_usuario,id_usuario,revogada_em)`);
        await client.query(`CREATE TABLE IF NOT EXISTS empresa_notificacao_config (
            id_empresa INTEGER PRIMARY KEY REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            painel_ativo BOOLEAN NOT NULL DEFAULT TRUE, webhook_ativo BOOLEAN NOT NULL DEFAULT FALSE,
            webhook_url TEXT, webhook_segredo TEXT, emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            email_ativo BOOLEAN NOT NULL DEFAULT FALSE,
            severidade_minima VARCHAR(20) NOT NULL DEFAULT 'atencao',
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK(severidade_minima IN('preventivo','atencao','critico','iminente'))
        )`);
        await client.query(`ALTER TABLE notificacoes_outbox ADD COLUMN IF NOT EXISTS entrega_id UUID`);
        await client.query(`ALTER TABLE notificacoes_outbox ADD COLUMN IF NOT EXISTS assinatura_hmac TEXT`);
        await client.query(`ALTER TABLE notificacoes_outbox ADD COLUMN IF NOT EXISTS assinatura_timestamp BIGINT`);
        await client.query(`UPDATE notificacoes_outbox SET entrega_id=gen_random_uuid() WHERE entrega_id IS NULL`);
        await client.query(`ALTER TABLE notificacoes_outbox ALTER COLUMN entrega_id SET DEFAULT gen_random_uuid()`);
        await client.query(`ALTER TABLE restricoes_validadas DROP CONSTRAINT IF EXISTS restricoes_validadas_fonte_fonte_id_key`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_restricao_empresa_fonte_id ON restricoes_validadas(COALESCE(id_empresa,0),fonte,fonte_id)`);
    }
};
