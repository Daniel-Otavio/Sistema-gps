module.exports={
    versao:'014_privacidade_regional_evidencias_2026_09',
    async aplicar({client}){
        await client.query(`ALTER TABLE indexacao_regional_fila
            ADD COLUMN IF NOT EXISTS execucao_iniciada_em TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS execucao_finalizada_em TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS duracao_ms INTEGER,
            ADD COLUMN IF NOT EXISTS cobertura_status VARCHAR(30) NOT NULL DEFAULT 'aguardando_complementacao',
            ADD COLUMN IF NOT EXISTS fontes_ok JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS fontes_falha JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await client.query(`ALTER TABLE restricao_catalogo_cobertura
            ADD COLUMN IF NOT EXISTS cobertura_status VARCHAR(30) NOT NULL DEFAULT 'aguardando_complementacao',
            ADD COLUMN IF NOT EXISTS fontes_falha JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await client.query(`CREATE TABLE IF NOT EXISTS integracao_circuitos (
            provedor VARCHAR(80) PRIMARY KEY,
            falhas_consecutivas INTEGER NOT NULL DEFAULT 0,
            aberto_ate TIMESTAMPTZ,
            ultimo_sucesso_em TIMESTAMPTZ,
            ultima_falha_em TIMESTAMPTZ,
            ultimo_erro TEXT,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query(`ALTER TABLE restricao_catalogo_evidencias
            ADD COLUMN IF NOT EXISTS conteudo BYTEA,
            ADD COLUMN IF NOT EXISTS conteudo_hash_sha256 CHAR(64),
            ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120),
            ADD COLUMN IF NOT EXISTS tamanho_bytes INTEGER,
            ADD COLUMN IF NOT EXISTS nome_arquivo VARCHAR(255)`);
        await client.query(`CREATE TABLE IF NOT EXISTS privacidade_exportacoes (
            id UUID PRIMARY KEY,
            id_solicitacao BIGINT NOT NULL REFERENCES privacidade_solicitacoes(id) ON DELETE CASCADE,
            id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            conteudo_criptografado BYTEA NOT NULL,
            iv BYTEA NOT NULL,
            auth_tag BYTEA NOT NULL,
            hash_sha256 CHAR(64) NOT NULL,
            tamanho_bytes INTEGER NOT NULL,
            expira_em TIMESTAMPTZ NOT NULL,
            baixado_em TIMESTAMPTZ,
            baixado_por BIGINT,
            criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_privacidade_exportacoes_expira ON privacidade_exportacoes(expira_em)`);
    }
};
