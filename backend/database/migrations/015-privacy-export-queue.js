module.exports = {
    versao: '015_privacy_export_queue_2026_09',
    async aplicar({ client }) {
        await client.query(`
            CREATE TABLE IF NOT EXISTS privacidade_exportacao_fila(
                id BIGSERIAL PRIMARY KEY,
                id_solicitacao BIGINT NOT NULL UNIQUE REFERENCES privacidade_solicitacoes(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','processando','concluido','falhou')),
                tentativas INTEGER NOT NULL DEFAULT 0,
                proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reservado_em TIMESTAMPTZ,
                iniciado_em TIMESTAMPTZ,
                processado_em TIMESTAMPTZ,
                worker_id VARCHAR(120),
                ultimo_erro TEXT,
                criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_privacidade_exportacao_fila_pendente
                ON privacidade_exportacao_fila(status,proxima_tentativa_em,criado_em);
        `);
    }
};
