module.exports = {
    versao: '012_guardiao_corredor_regional_2026_09',
    async aplicar({ client }) {
        await client.query(`ALTER TABLE indexacao_regional_fila ADD COLUMN IF NOT EXISTS ultima_solicitacao_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await client.query(`ALTER TABLE indexacao_regional_fila ADD COLUMN IF NOT EXISTS ultima_indexacao_em TIMESTAMPTZ`);
        await client.query(`UPDATE indexacao_regional_fila SET ultima_indexacao_em=COALESCE(ultima_indexacao_em,concluido_em) WHERE status='concluido'`);
        await client.query(`CREATE TABLE IF NOT EXISTS guardiao_veiculo_locks (
            id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
            id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
            worker_id VARCHAR(100) NOT NULL,
            reservado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expira_em TIMESTAMPTZ NOT NULL,
            PRIMARY KEY(id_empresa,id_veiculo)
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_veiculo_locks_expira ON guardiao_veiculo_locks(expira_em)`);
    }
};
