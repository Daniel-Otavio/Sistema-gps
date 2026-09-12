module.exports = {
    versao: '002_seguranca_multiempresa_2026_09',
    async aplicar({ client }) {
        await client.query(`ALTER TABLE notificacoes_outbox ADD COLUMN IF NOT EXISTS id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE CASCADE`);
        await client.query(`ALTER TABLE notificacoes_outbox ADD COLUMN IF NOT EXISTS reservado_em TIMESTAMPTZ`);
        await client.query(`ALTER TABLE notificacoes_outbox ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100)`);
        await client.query(`UPDATE notificacoes_outbox n SET id_empresa=g.id_empresa FROM guardiao_sombra_eventos g WHERE n.id_empresa IS NULL AND n.referencia_tipo='guardiao_sombra_evento' AND n.referencia_id=g.id::text`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa_data ON notificacoes_outbox(id_empresa,criado_em DESC)`);
        await client.query(`WITH duplicadas AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY id_veiculo ORDER BY iniciado_em DESC,id DESC) AS ordem FROM piloto_mobile_sessoes WHERE status='ativa') UPDATE piloto_mobile_sessoes s SET status='interrompida',encerrado_em=CURRENT_TIMESTAMP,motivo_encerramento='sessao_duplicada_corrigida' FROM duplicadas d WHERE s.id=d.id AND d.ordem>1`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_piloto_mobile_ativo_veiculo ON piloto_mobile_sessoes(id_veiculo) WHERE status='ativa'`);
    }
};
