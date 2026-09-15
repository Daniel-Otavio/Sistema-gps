module.exports = {
    versao: '011_fila_indexacao_regional_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE TABLE IF NOT EXISTS indexacao_regional_fila (
            id BIGSERIAL PRIMARY KEY,
            id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            celula VARCHAR(40) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            raio_km DOUBLE PRECISION NOT NULL DEFAULT 12,
            status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','processando','concluido','falhou')),
            tentativas INTEGER NOT NULL DEFAULT 0,
            proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reservado_em TIMESTAMPTZ,
            worker_id VARCHAR(100),
            ultimo_erro TEXT,
            criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            concluido_em TIMESTAMPTZ,
            UNIQUE(id_empresa,celula)
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_indexacao_regional_fila_pendente
            ON indexacao_regional_fila(status,proxima_tentativa_em,criado_em)`);
    }
};
