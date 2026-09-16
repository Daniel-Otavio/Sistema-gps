module.exports = {
    versao: '016_workers_notifications_2026_09',
    async aplicar({ client }) {
        await client.query(`CREATE TABLE IF NOT EXISTS worker_heartbeats(
            nome VARCHAR(80) NOT NULL,
            instancia VARCHAR(160) NOT NULL,
            versao VARCHAR(120),
            estado VARCHAR(20) NOT NULL DEFAULT 'iniciando' CHECK(estado IN('iniciando','executando','operacional','erro','encerrado')),
            ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ultimo_sucesso_em TIMESTAMPTZ,
            ultimo_erro_em TIMESTAMPTZ,
            ultimo_erro TEXT,
            PRIMARY KEY(nome,instancia)
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_atividade ON worker_heartbeats(ultima_atividade_em DESC)`);
        await client.query(`CREATE TABLE IF NOT EXISTS notificacao_destino_locks(
            chave CHAR(64) PRIMARY KEY,
            worker_id VARCHAR(160) NOT NULL,
            reservado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expira_em TIMESTAMPTZ NOT NULL
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS notificacao_circuitos(
            chave CHAR(64) PRIMARY KEY,
            falhas_consecutivas INTEGER NOT NULL DEFAULT 0,
            aberto_ate TIMESTAMPTZ,
            ultimo_sucesso_em TIMESTAMPTZ,
            ultima_falha_em TIMESTAMPTZ,
            ultimo_erro TEXT,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
    }
};
