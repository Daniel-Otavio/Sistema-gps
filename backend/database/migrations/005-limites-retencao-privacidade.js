module.exports = {
    versao: '005_limites_retencao_privacidade_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE TABLE IF NOT EXISTS limites_requisicao (
            chave VARCHAR(300) PRIMARY KEY,
            janela_inicio TIMESTAMPTZ NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            expira_em TIMESTAMPTZ NOT NULL
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_limites_requisicao_expira ON limites_requisicao(expira_em)`);
        await client.query(`CREATE TABLE IF NOT EXISTS politicas_retencao (
            id_empresa INTEGER PRIMARY KEY REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            gps_bruto_dias INTEGER NOT NULL DEFAULT 180 CHECK(gps_bruto_dias BETWEEN 1 AND 3650),
            payload_gps_dias INTEGER NOT NULL DEFAULT 30 CHECK(payload_gps_dias BETWEEN 1 AND 3650),
            logs_dias INTEGER NOT NULL DEFAULT 90 CHECK(logs_dias BETWEEN 7 AND 3650),
            integracao_logs_dias INTEGER NOT NULL DEFAULT 90 CHECK(integracao_logs_dias BETWEEN 7 AND 3650),
            alertas_dias INTEGER NOT NULL DEFAULT 365 CHECK(alertas_dias BETWEEN 30 AND 3650),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_por BIGINT
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS privacidade_solicitacoes (
            id BIGSERIAL PRIMARY KEY,
            id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            tipo VARCHAR(30) NOT NULL CHECK(tipo IN('exportacao','anonimizacao','exclusao')),
            titular_tipo VARCHAR(30) NOT NULL CHECK(titular_tipo IN('motorista','usuario','veiculo')),
            titular_id BIGINT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','em_processamento','concluida','rejeitada')),
            justificativa TEXT,
            solicitado_por BIGINT,
            solicitado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            concluido_em TIMESTAMPTZ
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_privacidade_empresa_status ON privacidade_solicitacoes(id_empresa,status,solicitado_em DESC)`);
    }
};
