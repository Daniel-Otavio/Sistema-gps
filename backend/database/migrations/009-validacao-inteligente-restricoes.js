module.exports = {
    versao: '009_validacao_inteligente_restricoes_2026_09',
    async aplicar({ client }) {
        await client.query(`
            CREATE TABLE IF NOT EXISTS restricoes_risco_catalogo (
                id BIGSERIAL PRIMARY KEY,
                id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE CASCADE,
                grupo_chave VARCHAR(180) NOT NULL,
                tipo VARCHAR(60) NOT NULL,
                nome TEXT,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                raio_metros DOUBLE PRECISION NOT NULL DEFAULT 180,
                status VARCHAR(30) NOT NULL DEFAULT 'possivel_risco'
                    CHECK(status IN ('possivel_risco','em_revisao','validada','descartada')),
                prioridade_score INTEGER NOT NULL DEFAULT 10,
                prioridade_nivel VARCHAR(15) NOT NULL DEFAULT 'baixa',
                fontes JSONB NOT NULL DEFAULT '[]'::jsonb,
                total_ocorrencias INTEGER NOT NULL DEFAULT 1,
                total_passagens INTEGER NOT NULL DEFAULT 0,
                total_veiculos_expostos INTEGER NOT NULL DEFAULT 0,
                total_viagens_expostas INTEGER NOT NULL DEFAULT 0,
                ultima_passagem_em TIMESTAMPTZ,
                evidencia_atualizada_em TIMESTAMPTZ,
                evidencia_validade_dias INTEGER NOT NULL DEFAULT 180,
                revisado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                revisado_em TIMESTAMPTZ,
                decisao_observacao TEXT,
                id_restricao_validada BIGINT REFERENCES restricoes_validadas(id) ON DELETE SET NULL,
                primeira_deteccao_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ultima_deteccao_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS restricao_catalogo_ocorrencias (
                id BIGSERIAL PRIMARY KEY,
                id_catalogo BIGINT NOT NULL REFERENCES restricoes_risco_catalogo(id) ON DELETE CASCADE,
                fonte VARCHAR(40) NOT NULL,
                fonte_id VARCHAR(180) NOT NULL,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                dados JSONB NOT NULL DEFAULT '{}'::jsonb,
                detectada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(id_catalogo,fonte,fonte_id)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS restricao_catalogo_evidencias (
                id BIGSERIAL PRIMARY KEY,
                id_catalogo BIGINT NOT NULL REFERENCES restricoes_risco_catalogo(id) ON DELETE CASCADE,
                tipo VARCHAR(20) NOT NULL CHECK(tipo IN ('foto','documento','link','vistoria','relato')),
                url TEXT,
                descricao TEXT NOT NULL,
                fonte VARCHAR(120),
                coordenada_lat DOUBLE PRECISION,
                coordenada_lng DOUBLE PRECISION,
                capturada_em TIMESTAMPTZ NOT NULL,
                adicionada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                criada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS restricao_catalogo_revisoes (
                id BIGSERIAL PRIMARY KEY,
                id_catalogo BIGINT NOT NULL REFERENCES restricoes_risco_catalogo(id) ON DELETE CASCADE,
                acao VARCHAR(30) NOT NULL,
                status_anterior VARCHAR(30),
                status_novo VARCHAR(30) NOT NULL,
                observacao TEXT NOT NULL,
                revisado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`ALTER TABLE restricoes_candidatas ADD COLUMN IF NOT EXISTS id_catalogo BIGINT REFERENCES restricoes_risco_catalogo(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS evidencias JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await client.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS evidencia_atualizada_em TIMESTAMPTZ`);
        await client.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS evidencia_validade_dias INTEGER NOT NULL DEFAULT 180`);
        await client.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS id_catalogo_origem BIGINT REFERENCES restricoes_risco_catalogo(id) ON DELETE SET NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogo_risco_empresa_grupo ON restricoes_risco_catalogo((COALESCE(id_empresa,0)),grupo_chave)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_catalogo_risco_geo ON restricoes_risco_catalogo(lat,lng) WHERE status IN ('possivel_risco','em_revisao')`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_catalogo_risco_prioridade ON restricoes_risco_catalogo(status,prioridade_score DESC,ultima_passagem_em DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_catalogo_evidencias_data ON restricao_catalogo_evidencias(id_catalogo,capturada_em DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_historico_localizacoes_geo_data ON historico_localizacoes(lat,lon,registrado_em DESC)`);
    }
};
