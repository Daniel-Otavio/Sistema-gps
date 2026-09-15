module.exports={
    versao:'013_execucao_privacidade_2026_09',
    async aplicar({client}){
        await client.query(`ALTER TABLE privacidade_solicitacoes ADD COLUMN IF NOT EXISTS resultado JSONB`);
        await client.query(`ALTER TABLE privacidade_solicitacoes ADD COLUMN IF NOT EXISTS processado_por BIGINT`);
        await client.query(`ALTER TABLE privacidade_solicitacoes ADD COLUMN IF NOT EXISTS processado_em TIMESTAMPTZ`);
        await client.query(`ALTER TABLE privacidade_solicitacoes ADD COLUMN IF NOT EXISTS erro_processamento TEXT`);
    }
};
