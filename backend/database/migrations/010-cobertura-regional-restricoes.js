module.exports = {
    versao: '010_cobertura_regional_restricoes_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE TABLE IF NOT EXISTS restricao_catalogo_cobertura (
            id BIGSERIAL PRIMARY KEY,
            id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            celula VARCHAR(40) NOT NULL,
            centro_lat DOUBLE PRECISION NOT NULL,
            centro_lng DOUBLE PRECISION NOT NULL,
            raio_km DOUBLE PRECISION NOT NULL DEFAULT 12,
            status VARCHAR(20) NOT NULL DEFAULT 'processando' CHECK(status IN('processando','concluida','falhou')),
            candidatos_encontrados INTEGER NOT NULL DEFAULT 0,
            fontes JSONB NOT NULL DEFAULT '[]'::jsonb,
            ultimo_erro TEXT,
            indexada_em TIMESTAMPTZ,
            atualizada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(id_empresa,celula)
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS restricao_catalogo_exposicao_empresa (
            id_catalogo BIGINT NOT NULL REFERENCES restricoes_risco_catalogo(id) ON DELETE CASCADE,
            id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            total_posicoes INTEGER NOT NULL DEFAULT 0,
            total_veiculos INTEGER NOT NULL DEFAULT 0,
            total_viagens INTEGER NOT NULL DEFAULT 0,
            ultima_passagem_em TIMESTAMPTZ,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(id_catalogo,id_empresa)
        )`);
        await client.query(`ALTER TABLE restricoes_risco_catalogo ADD COLUMN IF NOT EXISTS notificado_evidencia_em TIMESTAMPTZ`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_cobertura_empresa_data ON restricao_catalogo_cobertura(id_empresa,atualizada_em DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_exposicao_empresa_prioridade ON restricao_catalogo_exposicao_empresa(id_empresa,total_veiculos DESC,total_viagens DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_evento_catalogo_ativo ON guardiao_sombra_eventos(id_empresa,id_veiculo,((dados->>'id_catalogo'))) WHERE id_restricao IS NULL AND ativo=TRUE`);
    }
};
