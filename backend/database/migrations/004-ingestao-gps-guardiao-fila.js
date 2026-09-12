module.exports={
 versao:'004_ingestao_gps_guardiao_fila_2026_09',
 async aplicar({client}){
  await client.query(`CREATE TABLE IF NOT EXISTS gps_ingestoes(
   id BIGSERIAL PRIMARY KEY,id_empresa INTEGER REFERENCES empresas_integracao(id)ON DELETE CASCADE,
   id_veiculo INTEGER NOT NULL REFERENCES veiculos(id)ON DELETE CASCADE,id_motorista INTEGER REFERENCES usuarios(id)ON DELETE SET NULL,
   id_viagem INTEGER REFERENCES viagens(id)ON DELETE SET NULL,origem VARCHAR(30)NOT NULL,
   sessao_chave VARCHAR(120)NOT NULL,sequencia BIGINT NOT NULL,request_id VARCHAR(80),
   lat DOUBLE PRECISION NOT NULL,lon DOUBLE PRECISION NOT NULL,velocidade_kmh DOUBLE PRECISION,direcao_graus DOUBLE PRECISION,
   precisao_m DOUBLE PRECISION,altitude_m DOUBLE PRECISION,timestamp_dispositivo TIMESTAMPTZ,
   recebido_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,classificacao VARCHAR(40)NOT NULL,
   apta_historico BOOLEAN NOT NULL DEFAULT TRUE,apta_tempo_real BOOLEAN NOT NULL DEFAULT FALSE,
   motivos JSONB NOT NULL DEFAULT'[]'::jsonb,payload JSONB NOT NULL DEFAULT'{}'::jsonb,
   UNIQUE(id_empresa,id_veiculo,sessao_chave,sequencia))`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gps_ingestao_sem_empresa ON gps_ingestoes(id_veiculo,sessao_chave,sequencia)WHERE id_empresa IS NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_gps_ingestao_veiculo_data ON gps_ingestoes(id_veiculo,timestamp_dispositivo DESC,recebido_em DESC)`);
  await client.query(`CREATE TABLE IF NOT EXISTS guardiao_fila(
   id BIGSERIAL PRIMARY KEY,id_ingestao BIGINT UNIQUE NOT NULL REFERENCES gps_ingestoes(id)ON DELETE CASCADE,
   id_empresa INTEGER REFERENCES empresas_integracao(id)ON DELETE CASCADE,id_veiculo INTEGER NOT NULL REFERENCES veiculos(id)ON DELETE CASCADE,
   status VARCHAR(24)NOT NULL DEFAULT'pendente',qualidade VARCHAR(40)NOT NULL DEFAULT'nao_processada',
   tentativas INTEGER NOT NULL DEFAULT 0,proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
   reservado_em TIMESTAMPTZ,worker_id VARCHAR(100),ultimo_erro TEXT,resultado JSONB,
   criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,processado_em TIMESTAMPTZ)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_fila_pendente ON guardiao_fila(status,proxima_tentativa_em)`);
  await client.query(`CREATE TABLE IF NOT EXISTS ors_consumo(
   id BIGSERIAL PRIMARY KEY,dia DATE NOT NULL DEFAULT CURRENT_DATE,id_empresa INTEGER REFERENCES empresas_integracao(id)ON DELETE SET NULL,
   id_veiculo INTEGER REFERENCES veiculos(id)ON DELETE SET NULL,motivo VARCHAR(80)NOT NULL,cache_usado BOOLEAN NOT NULL DEFAULT FALSE,
   sucesso BOOLEAN NOT NULL,latencia_ms INTEGER,status_http INTEGER,erro TEXT,criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ors_consumo_dia ON ors_consumo(dia,sucesso,cache_usado)`);
  await client.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS id_ingestao BIGINT REFERENCES gps_ingestoes(id)ON DELETE SET NULL`);
  await client.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS classificacao VARCHAR(40)`);
  await client.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS motivos_qualidade JSONB NOT NULL DEFAULT'[]'::jsonb`);
  await client.query(`ALTER TABLE localizacoes ADD COLUMN IF NOT EXISTS timestamp_dispositivo TIMESTAMPTZ`);
 }
};
