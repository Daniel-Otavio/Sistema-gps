// Snapshot imutável do esquema inicial. Não editar; crie uma nova migração.
async function criarTabelas(pool) {
    console.log('🔄 Verificando/migrando banco PostgreSQL...');

    // Usuários existentes
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('admin','motorista')),
            login VARCHAR(255) UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Veículos
    await pool.query(`
        CREATE TABLE IF NOT EXISTS veiculos (
            id SERIAL PRIMARY KEY,
            placa VARCHAR(10) UNIQUE NOT NULL,
            frota VARCHAR(50),
            modelo VARCHAR(150),
            comprimento DOUBLE PRECISION,
            largura DOUBLE PRECISION,
            peso DOUBLE PRECISION,
            ativo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migração de dimensões dos veículos existentes
    await pool.query(`ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS comprimento DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS largura DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS peso DOUBLE PRECISION`);

    // Novos campos em usuários
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id_veiculo INTEGER`);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_unico
        ON usuarios(LOWER(email))
        WHERE email IS NOT NULL
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_veiculo_unico
        ON usuarios(id_veiculo)
        WHERE id_veiculo IS NOT NULL AND tipo = 'motorista'
    `);

    await pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_usuario_veiculo'
            ) THEN
                ALTER TABLE usuarios
                ADD CONSTRAINT fk_usuario_veiculo
                FOREIGN KEY (id_veiculo)
                REFERENCES veiculos(id)
                ON DELETE SET NULL;
            END IF;
        END $$;
    `);

    // Cadastros pendentes de confirmação
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cadastros_pendentes (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            id_veiculo INTEGER NOT NULL,
            codigo_hash TEXT NOT NULL,
            codigo_expira_em TIMESTAMPTZ NOT NULL,
            email_verificado BOOLEAN DEFAULT FALSE,
            verificado_em TIMESTAMPTZ,
            tentativas INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_cadastro_veiculo
                FOREIGN KEY (id_veiculo)
                REFERENCES veiculos(id)
                ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cadastro_veiculo_unico
        ON cadastros_pendentes(id_veiculo)
    `);

    // Rotas
    await pool.query(`
        CREATE TABLE IF NOT EXISTS rotas (
            id SERIAL PRIMARY KEY,
            nome TEXT,
            origem TEXT,
            destino TEXT,
            restricoes JSONB DEFAULT '{}'::jsonb,
            dados_geojson JSONB,
            id_motorista INTEGER,
            id_veiculo INTEGER,
            status VARCHAR(30) DEFAULT 'pendente'
                CHECK (status IN ('pendente','em_andamento','concluida')),
            criada_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_rotas_motorista
                FOREIGN KEY (id_motorista)
                REFERENCES usuarios(id)
                ON DELETE SET NULL,
            CONSTRAINT fk_rotas_veiculo
                FOREIGN KEY (id_veiculo)
                REFERENCES veiculos(id)
                ON DELETE SET NULL
        )
    `);

    // Se a tabela rotas já existia antes, adiciona o campo novo
    await pool.query(`ALTER TABLE rotas ADD COLUMN IF NOT EXISTS id_veiculo INTEGER`);
    // A empresa é criada em uma migração posterior. A FK é instalada depois dela,
    // mantendo a inicialização de um banco vazio válida.
    await pool.query(`ALTER TABLE rotas ADD COLUMN IF NOT EXISTS id_empresa INTEGER`);
    await pool.query(`ALTER TABLE rotas ADD COLUMN IF NOT EXISTS origem_aprendida BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE rotas ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1`);

    await pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_rotas_veiculo'
            ) THEN
                ALTER TABLE rotas
                ADD CONSTRAINT fk_rotas_veiculo
                FOREIGN KEY (id_veiculo)
                REFERENCES veiculos(id)
                ON DELETE SET NULL;
            END IF;
        END $$;
    `);

    // Viagens operacionais
    await pool.query(`
        CREATE TABLE IF NOT EXISTS viagens (
            id SERIAL PRIMARY KEY,
            id_rota INTEGER NOT NULL,
            id_veiculo INTEGER NOT NULL,
            id_motorista INTEGER,
            carga TEXT,
            altura_total DOUBLE PRECISION,
            peso_total DOUBLE PRECISION,
            status VARCHAR(30) DEFAULT 'planejada'
                CHECK (status IN ('planejada','em_andamento','concluida','cancelada')),
            saida_prevista TIMESTAMPTZ,
            saida_real TIMESTAMPTZ,
            chegada_prevista TIMESTAMPTZ,
            chegada_real TIMESTAMPTZ,
            criada_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_viagem_rota FOREIGN KEY (id_rota) REFERENCES rotas(id) ON DELETE CASCADE,
            CONSTRAINT fk_viagem_veiculo FOREIGN KEY (id_veiculo) REFERENCES veiculos(id) ON DELETE CASCADE,
            CONSTRAINT fk_viagem_motorista FOREIGN KEY (id_motorista) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_viagens_veiculo_status
        ON viagens(id_veiculo, status)
    `);

    // Rotas específicas por conjunto de restrições.
    // Não pertencem a uma placa: podem ser reutilizadas por qualquer veículo
    // com as mesmas dimensões/peso/altura para a mesma rota base.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS rotas_especificas (
            id SERIAL PRIMARY KEY,
            id_rota_base INTEGER NOT NULL,
            comprimento DOUBLE PRECISION NOT NULL,
            largura DOUBLE PRECISION NOT NULL,
            altura DOUBLE PRECISION NOT NULL,
            peso DOUBLE PRECISION NOT NULL,
            assinatura VARCHAR(255) NOT NULL,
            dados_geojson JSONB NOT NULL,
            reutilizavel BOOLEAN DEFAULT FALSE,
            validada_em TIMESTAMPTZ,
            viagens_concluidas INTEGER DEFAULT 0,
            viagens_com_desvio INTEGER DEFAULT 0,
            max_desvio_validacao_km DOUBLE PRECISION DEFAULT 0,
            criada_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            ultima_utilizacao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_rota_especifica_base
                FOREIGN KEY (id_rota_base) REFERENCES rotas(id) ON DELETE CASCADE
        )
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rota_especifica_assinatura
        ON rotas_especificas(id_rota_base, assinatura)
    `);

    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS id_rota_especifica INTEGER`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS rota_reutilizada BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS max_desvio_km DOUBLE PRECISION DEFAULT 0`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS desvio_longo BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS rota_validada BOOLEAN DEFAULT FALSE`);

    await pool.query(`ALTER TABLE rotas_especificas ADD COLUMN IF NOT EXISTS nivel_confianca VARCHAR(20) DEFAULT 'teste'`);
    await pool.query(`ALTER TABLE rotas_especificas ADD COLUMN IF NOT EXISTS valida_ate TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE rotas_especificas ADD COLUMN IF NOT EXISTS bloqueada BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE rotas_especificas ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT`);
    await pool.query(`ALTER TABLE rotas_especificas ADD COLUMN IF NOT EXISTS falhas_validacao INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE rotas_especificas ADD COLUMN IF NOT EXISTS versao INTEGER DEFAULT 1`);

    await pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_viagem_rota_especifica'
            ) THEN
                ALTER TABLE viagens
                ADD CONSTRAINT fk_viagem_rota_especifica
                FOREIGN KEY (id_rota_especifica)
                REFERENCES rotas_especificas(id)
                ON DELETE SET NULL;
            END IF;
        END $$;
    `);

    // Histórico de GPS
    await pool.query(`
        CREATE TABLE IF NOT EXISTS historico_localizacoes (
            id BIGSERIAL PRIMARY KEY,
            id_motorista INTEGER NOT NULL,
            id_veiculo INTEGER,
            id_viagem INTEGER,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            registrado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_hist_motorista FOREIGN KEY (id_motorista) REFERENCES usuarios(id) ON DELETE CASCADE,
            CONSTRAINT fk_hist_veiculo FOREIGN KEY (id_veiculo) REFERENCES veiculos(id) ON DELETE SET NULL,
            CONSTRAINT fk_hist_viagem FOREIGN KEY (id_viagem) REFERENCES viagens(id) ON DELETE SET NULL
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_hist_veiculo_data
        ON historico_localizacoes(id_veiculo, registrado_em DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_hist_viagem_data
        ON historico_localizacoes(id_viagem, registrado_em ASC)
    `);

    // V21 - telemetria bruta para aprendizado futuro (somente coleta)
    await pool.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS velocidade_kmh DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS precisao_m DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS direcao_graus DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS altitude_m DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS timestamp_dispositivo TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE historico_localizacoes ADD COLUMN IF NOT EXISTS origem_coleta VARCHAR(20) DEFAULT 'gps_app'`);
    await pool.query(`ALTER TABLE historico_localizacoes ALTER COLUMN id_motorista DROP NOT NULL`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS resumo_coleta_viagem (
            id_viagem INTEGER PRIMARY KEY,
            id_veiculo INTEGER,
            id_motorista INTEGER,
            primeiro_gps_em TIMESTAMPTZ,
            ultimo_gps_em TIMESTAMPTZ,
            total_pontos INTEGER DEFAULT 0,
            pontos_com_velocidade INTEGER DEFAULT 0,
            soma_velocidade_kmh DOUBLE PRECISION DEFAULT 0,
            velocidade_max_kmh DOUBLE PRECISION,
            soma_precisao_m DOUBLE PRECISION DEFAULT 0,
            pontos_com_precisao INTEGER DEFAULT 0,
            distancia_gps_bruta_km DOUBLE PRECISION DEFAULT 0,
            ultima_lat DOUBLE PRECISION,
            ultima_lon DOUBLE PRECISION,
            atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`CREATE TABLE IF NOT EXISTS trajetos_realizados (
        id BIGSERIAL PRIMARY KEY,id_viagem INTEGER NOT NULL UNIQUE REFERENCES viagens(id) ON DELETE CASCADE,
        id_veiculo INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,id_motorista INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        bruto_geojson JSONB,tratado_geojson JSONB,metricas JSONB NOT NULL DEFAULT '{}'::jsonb,
        metodo_tratamento VARCHAR(50) NOT NULL DEFAULT 'gps_filtrado',id_rota_gerada INTEGER REFERENCES rotas(id) ON DELETE SET NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trajetos_realizados_veiculo ON trajetos_realizados(id_veiculo,criado_em DESC)`);
    await pool.query(`ALTER TABLE trajetos_realizados ADD COLUMN IF NOT EXISTS id_empresa INTEGER`);


    // ==================================================
    // V21.8 - observabilidade / retenção / integridade
    // ==================================================
    await pool.query(`
        CREATE TABLE IF NOT EXISTS logs_sistema (
            id BIGSERIAL PRIMARY KEY,
            nivel VARCHAR(12) NOT NULL DEFAULT 'error',
            origem VARCHAR(80),
            mensagem TEXT NOT NULL,
            detalhes JSONB DEFAULT '{}'::jsonb,
            request_id VARCHAR(80),
            metodo VARCHAR(12),
            rota TEXT,
            status_http INTEGER,
            duracao_ms INTEGER,
            id_usuario INTEGER,
            criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_logs_sistema_data
        ON logs_sistema(criado_em DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_logs_sistema_nivel_data
        ON logs_sistema(nivel, criado_em DESC)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS trajetos_viagem_arquivados (
            id_viagem INTEGER PRIMARY KEY,
            id_veiculo INTEGER,
            id_motorista INTEGER,
            total_pontos INTEGER NOT NULL DEFAULT 0,
            primeiro_ponto_em TIMESTAMPTZ,
            ultimo_ponto_em TIMESTAMPTZ,
            distancia_gps_bruta_km DOUBLE PRECISION,
            pontos JSONB NOT NULL DEFAULT '[]'::jsonb,
            arquivado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            formato_versao INTEGER DEFAULT 1
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_trajetos_arquivados_veiculo
        ON trajetos_viagem_arquivados(id_veiculo, arquivado_em DESC)
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS manutencao_sistema (
            chave VARCHAR(80) PRIMARY KEY,
            executado_em TIMESTAMPTZ,
            status VARCHAR(20),
            detalhes JSONB DEFAULT '{}'::jsonb
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_hist_localizacoes_data_global
        ON historico_localizacoes(registrado_em DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_hist_localizacoes_viagem_data_desc
        ON historico_localizacoes(id_viagem, registrado_em DESC)
    `);


    // Localizações
    await pool.query(`
        CREATE TABLE IF NOT EXISTS localizacoes (
            id SERIAL PRIMARY KEY,
            id_motorista INTEGER UNIQUE NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            ultima_atualizacao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_localizacoes_motorista
                FOREIGN KEY (id_motorista)
                REFERENCES usuarios(id)
                ON DELETE CASCADE
        )
    `);

    // Integrações empresariais de telemetria vinculadas pela placa
    await pool.query(`CREATE TABLE IF NOT EXISTS empresas_integracao (
        id SERIAL PRIMARY KEY, nome VARCHAR(180) NOT NULL,
        chave_hash CHAR(64) UNIQUE NOT NULL, chave_prefixo VARCHAR(20) NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        ultimo_uso_em TIMESTAMPTZ
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS empresa_integracao_veiculos (
        id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        id_veiculo INTEGER NOT NULL UNIQUE REFERENCES veiculos(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_empresa,id_veiculo)
    )`);
    await pool.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rotas_empresa') THEN
                ALTER TABLE rotas ADD CONSTRAINT fk_rotas_empresa
                FOREIGN KEY(id_empresa) REFERENCES empresas_integracao(id) ON DELETE SET NULL;
            END IF;
        END $$;
    `);
    await pool.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_trajetos_empresa') THEN
                ALTER TABLE trajetos_realizados ADD CONSTRAINT fk_trajetos_empresa
                FOREIGN KEY(id_empresa) REFERENCES empresas_integracao(id) ON DELETE CASCADE;
            END IF;
        END $$;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_empresa_integracao_hash ON empresas_integracao(chave_hash) WHERE ativo=TRUE`);
    await pool.query(`ALTER TABLE empresas_integracao ADD COLUMN IF NOT EXISTS modo_sombra BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`ALTER TABLE empresas_integracao ADD COLUMN IF NOT EXISTS status_operacional VARCHAR(20) NOT NULL DEFAULT 'nunca_conectou'`);
    await pool.query(`ALTER TABLE empresas_integracao ADD COLUMN IF NOT EXISTS ultimo_erro TEXT`);
    await pool.query(`ALTER TABLE empresas_integracao ADD COLUMN IF NOT EXISTS ultimo_erro_em TIMESTAMPTZ`);
    await pool.query(`CREATE TABLE IF NOT EXISTS empresa_integracao_chaves (
        id BIGSERIAL PRIMARY KEY, id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        nome VARCHAR(120) NOT NULL DEFAULT 'Chave principal', chave_hash CHAR(64) UNIQUE NOT NULL,
        chave_prefixo VARCHAR(20) NOT NULL, escopos TEXT[] NOT NULL DEFAULT ARRAY['telemetria:escrever']::TEXT[],
        ativo BOOLEAN NOT NULL DEFAULT TRUE, expira_em TIMESTAMPTZ, ultimo_uso_em TIMESTAMPTZ,
        revogada_em TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_integracao_chaves_hash ON empresa_integracao_chaves(chave_hash) WHERE ativo=TRUE`);
    await pool.query(`INSERT INTO empresa_integracao_chaves(id_empresa,nome,chave_hash,chave_prefixo,ultimo_uso_em,created_at)
        SELECT id,'Chave legada',chave_hash,chave_prefixo,ultimo_uso_em,created_at FROM empresas_integracao
        ON CONFLICT(chave_hash) DO NOTHING`);
    await pool.query(`CREATE TABLE IF NOT EXISTS empresa_usuarios (
        id BIGSERIAL PRIMARY KEY, id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        nome VARCHAR(160) NOT NULL, email VARCHAR(220) NOT NULL,
        perfil VARCHAR(30) NOT NULL CHECK(perfil IN('administrador','supervisor','analista','somente_leitura')),
        ativo BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(id_empresa,email)
    )`);
    await pool.query(`ALTER TABLE empresa_usuarios ADD COLUMN IF NOT EXISTS senha_hash TEXT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS integracao_requisicoes (
        id BIGSERIAL PRIMARY KEY, id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE SET NULL,
        id_chave BIGINT REFERENCES empresa_integracao_chaves(id) ON DELETE SET NULL,
        request_id VARCHAR(80), placa VARCHAR(10), endpoint VARCHAR(180), metodo VARCHAR(10),
        status_http INTEGER NOT NULL, sucesso BOOLEAN NOT NULL, erro_codigo VARCHAR(80), erro_mensagem TEXT,
        payload_resumo JSONB NOT NULL DEFAULT '{}'::jsonb, duracao_ms INTEGER,
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_integracao_req_empresa_data ON integracao_requisicoes(id_empresa,recebido_em DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS guardiao_analises (
        id BIGSERIAL PRIMARY KEY, id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
        request_id VARCHAR(80), lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
        velocidade_kmh DOUBLE PRECISION, direcao_graus DOUBLE PRECISION, status VARCHAR(30) NOT NULL,
        alcance_km DOUBLE PRECISION, riscos_encontrados INTEGER NOT NULL DEFAULT 0,
        resultado JSONB NOT NULL DEFAULT '{}'::jsonb, analisado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_analises_empresa_data ON guardiao_analises(id_empresa,analisado_em DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS auditoria_empresarial (
        id BIGSERIAL PRIMARY KEY, id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE SET NULL,
        id_usuario INTEGER, ator_tipo VARCHAR(30) NOT NULL, ator_nome VARCHAR(180), acao VARCHAR(100) NOT NULL,
        recurso VARCHAR(80) NOT NULL, recurso_id VARCHAR(80), dados_anteriores JSONB DEFAULT '{}'::jsonb,
        dados_novos JSONB DEFAULT '{}'::jsonb, request_id VARCHAR(80), criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_empresarial_data ON auditoria_empresarial(id_empresa,criado_em DESC)`);
    await pool.query(`ALTER TABLE localizacoes ALTER COLUMN id_motorista DROP NOT NULL`);
    await pool.query(`ALTER TABLE localizacoes ADD COLUMN IF NOT EXISTS id_veiculo INTEGER REFERENCES veiculos(id) ON DELETE CASCADE`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_localizacoes_veiculo_unique ON localizacoes(id_veiculo) WHERE id_veiculo IS NOT NULL`);
    await pool.query(`CREATE TABLE IF NOT EXISTS perfis_composicao (
        id SERIAL PRIMARY KEY, id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
        nome VARCHAR(160) NOT NULL, carreta VARCHAR(160), carga VARCHAR(200),
        altura DOUBLE PRECISION NOT NULL, largura DOUBLE PRECISION NOT NULL,
        comprimento DOUBLE PRECISION NOT NULL, peso DOUBLE PRECISION NOT NULL,
        eixos INTEGER, ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_perfil_composicao_ativo_veiculo ON perfis_composicao(id_veiculo) WHERE ativo=TRUE`);
    await pool.query(`CREATE TABLE IF NOT EXISTS empresa_telemetria_estado (
        id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
        lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL,
        velocidade_kmh DOUBLE PRECISION, direcao_graus DOUBLE PRECISION,
        atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id_empresa,id_veiculo)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS guardiao_sombra_eventos (
        id BIGSERIAL PRIMARY KEY, id_empresa INTEGER NOT NULL REFERENCES empresas_integracao(id) ON DELETE CASCADE,
        id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
        id_restricao INTEGER,
        nivel VARCHAR(20) NOT NULL, tipo_risco VARCHAR(50), distancia_km DOUBLE PRECISION,
        tempo_estimado_min DOUBLE PRECISION, placa VARCHAR(10) NOT NULL,
        dados JSONB NOT NULL DEFAULT '{}'::jsonb, primeiro_evento_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        ultimo_evento_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, ativo BOOLEAN NOT NULL DEFAULT TRUE
    )`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS classificacao VARCHAR(30) NOT NULL DEFAULT 'aberto'`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS feedback_observacao TEXT`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS feedback_por INTEGER`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS feedback_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS status_operacional VARCHAR(24) NOT NULL DEFAULT 'novo'`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS assumido_por INTEGER`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS assumido_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS resolvido_por INTEGER`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE guardiao_sombra_eventos ADD COLUMN IF NOT EXISTS resolucao TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_guardiao_sombra_empresa_data ON guardiao_sombra_eventos(id_empresa,ultimo_evento_em DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes_outbox (
        id BIGSERIAL PRIMARY KEY, tipo VARCHAR(50) NOT NULL, referencia_tipo VARCHAR(50), referencia_id VARCHAR(80),
        destinatario TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'pendente',
        tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimo_erro TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, enviado_em TIMESTAMPTZ,
        UNIQUE(tipo,referencia_tipo,referencia_id,destinatario)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notificacoes_pendentes ON notificacoes_outbox(status,proxima_tentativa_em)`);

    // Piloto móvel do Guardião: o celular atua como fonte independente de GPS.
    await pool.query(`CREATE TABLE IF NOT EXISTS piloto_mobile_sessoes (
        id BIGSERIAL PRIMARY KEY,
        id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE SET NULL,
        id_motorista INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
        id_viagem INTEGER REFERENCES viagens(id) ON DELETE SET NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'ativa'
            CHECK(status IN('ativa','encerrada','interrompida')),
        modo_sombra BOOLEAN NOT NULL DEFAULT TRUE,
        composicao JSONB NOT NULL DEFAULT '{}'::jsonb,
        dispositivo JSONB NOT NULL DEFAULT '{}'::jsonb,
        ultima_lat DOUBLE PRECISION,
        ultima_lon DOUBLE PRECISION,
        ultima_precisao_m DOUBLE PRECISION,
        ultima_velocidade_kmh DOUBLE PRECISION,
        bateria_percentual DOUBLE PRECISION,
        carregando BOOLEAN,
        tipo_rede VARCHAR(30),
        gps_ativo BOOLEAN,
        app_segundo_plano BOOLEAN,
        ultima_sequencia BIGINT,
        total_posicoes INTEGER NOT NULL DEFAULT 0,
        total_analises INTEGER NOT NULL DEFAULT 0,
        total_riscos INTEGER NOT NULL DEFAULT 0,
        iniciado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultima_comunicacao_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        encerrado_em TIMESTAMPTZ,
        motivo_encerramento VARCHAR(120)
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_piloto_mobile_ativo_motorista ON piloto_mobile_sessoes(id_motorista) WHERE status='ativa'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_piloto_mobile_empresa_status ON piloto_mobile_sessoes(id_empresa,status,ultima_comunicacao_em DESC)`);

    // Reportes
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reportes (
            id SERIAL PRIMARY KEY,
            id_motorista INTEGER NOT NULL,
            tipo VARCHAR(30) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            data_hora TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_reportes_motorista
                FOREIGN KEY (id_motorista)
                REFERENCES usuarios(id)
                ON DELETE CASCADE
        )
    `);

    await pool.query(`ALTER TABLE reportes ADD COLUMN IF NOT EXISTS id_veiculo INTEGER`);
    await pool.query(`ALTER TABLE reportes ADD COLUMN IF NOT EXISTS id_viagem INTEGER`);
    await pool.query(`ALTER TABLE reportes ADD COLUMN IF NOT EXISTS status_reporte VARCHAR(20) DEFAULT 'ativo'`);
    await pool.query(`ALTER TABLE reportes ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE reportes ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ`);

    await pool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reportes_veiculo') THEN
                ALTER TABLE reportes ADD CONSTRAINT fk_reportes_veiculo
                FOREIGN KEY (id_veiculo) REFERENCES veiculos(id) ON DELETE SET NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reportes_viagem') THEN
                ALTER TABLE reportes ADD CONSTRAINT fk_reportes_viagem
                FOREIGN KEY (id_viagem) REFERENCES viagens(id) ON DELETE SET NULL;
            END IF;
        END $$;
    `);


    // --------------------------------------------------
    // RESTRIÇÕES CANDIDATAS — descobertas em scanners
    // --------------------------------------------------
    await pool.query(`
        CREATE TABLE IF NOT EXISTS restricoes_candidatas (
            id BIGSERIAL PRIMARY KEY,
            id_viagem INTEGER NOT NULL,
            id_rota INTEGER NOT NULL,
            id_rota_especifica INTEGER,
            id_veiculo INTEGER NOT NULL,

            fonte VARCHAR(40) NOT NULL DEFAULT 'antt',
            fonte_id VARCHAR(160) NOT NULL,
            tipo VARCHAR(60) NOT NULL,
            nome TEXT,

            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            distancia_rota_km DOUBLE PRECISION,

            limite_altura DOUBLE PRECISION,
            limite_largura DOUBLE PRECISION,
            limite_comprimento DOUBLE PRECISION,
            limite_peso DOUBLE PRECISION,
            limite_eixo DOUBLE PRECISION,

            compatibilidade VARCHAR(30) NOT NULL DEFAULT 'verificar',
            risco VARCHAR(20) NOT NULL DEFAULT 'medio',
            confianca INTEGER NOT NULL DEFAULT 30,

            status_validacao VARCHAR(20) NOT NULL DEFAULT 'descoberta'
                CHECK (status_validacao IN ('descoberta','confirmada','validada','rejeitada')),

            tags JSONB DEFAULT '{}'::jsonb,
            observacao TEXT,

            validado_por INTEGER,
            validado_em TIMESTAMPTZ,

            primeira_deteccao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            ultima_deteccao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (id_viagem, fonte, fonte_id)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_restricoes_candidatas_viagem
        ON restricoes_candidatas(id_viagem, status_validacao)
    `);

    // --------------------------------------------------
    // BASE GLOBAL DE RESTRIÇÕES VALIDADAS
    // Reutilizada por QUALQUER viagem futura.
    // --------------------------------------------------
    await pool.query(`
        CREATE TABLE IF NOT EXISTS restricoes_validadas (
            id BIGSERIAL PRIMARY KEY,

            fonte VARCHAR(40) NOT NULL,
            fonte_id VARCHAR(160),
            candidato_origem_id BIGINT,

            tipo VARCHAR(60) NOT NULL,
            nome TEXT,

            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            raio_metros DOUBLE PRECISION DEFAULT 180,

            limite_altura DOUBLE PRECISION,
            limite_largura DOUBLE PRECISION,
            limite_comprimento DOUBLE PRECISION,
            limite_peso DOUBLE PRECISION,
            limite_eixo DOUBLE PRECISION,

            sentido VARCHAR(100),
            rodovia VARCHAR(120),
            km VARCHAR(60),
            concessionaria VARCHAR(180),

            evidencia_url TEXT,
            evidencia_texto TEXT,
            observacao TEXT,

            confianca INTEGER DEFAULT 95,
            ativa BOOLEAN DEFAULT TRUE,
            valida_ate TIMESTAMPTZ,

            validado_por INTEGER,
            validado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            atualizada_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (fonte, fonte_id)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_restricoes_validadas_ativas
        ON restricoes_validadas(ativa, valida_ate)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_restricoes_validadas_geo
        ON restricoes_validadas(lat, lng)
    `);
    await pool.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS status_confiabilidade VARCHAR(30) NOT NULL DEFAULT 'confirmada'`);
    await pool.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS fonte_atualizada_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS natureza VARCHAR(20) NOT NULL DEFAULT 'definitiva' CHECK(natureza IN('definitiva','temporaria'))`);
    await pool.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS vigencia_inicio TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE restricoes_validadas ADD COLUMN IF NOT EXISTS id_empresa INTEGER REFERENCES empresas_integracao(id) ON DELETE CASCADE`);

    // GUARDIÃO V1
    await pool.query(`
        CREATE TABLE IF NOT EXISTS guardiao_eventos (
            id BIGSERIAL PRIMARY KEY,
            id_viagem INTEGER NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
            id_veiculo INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
            id_restricao BIGINT REFERENCES restricoes_validadas(id) ON DELETE SET NULL,
            nivel VARCHAR(20) NOT NULL DEFAULT 'atencao',
            tipo_risco VARCHAR(60) NOT NULL,
            distancia_km DOUBLE PRECISION,
            tempo_estimado_min DOUBLE PRECISION,
            mensagem TEXT NOT NULL,
            dados JSONB DEFAULT '{}'::jsonb,
            ativo BOOLEAN DEFAULT TRUE,
            criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_guardiao_viagem_ativo
        ON guardiao_eventos(id_viagem, ativo, atualizado_em DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_guardiao_veiculo_ativo
        ON guardiao_eventos(id_veiculo, ativo, atualizado_em DESC)
    `);

    // Segurança operacional da viagem.
    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS liberacao_rota VARCHAR(20) DEFAULT 'liberada'
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS checagem_seguranca JSONB DEFAULT '{}'::jsonb
    `);

    // Aprovação formal da viagem.
    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS status_aprovacao VARCHAR(30) DEFAULT 'aguardando_aprovacao'
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS aprovado_por INTEGER
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS observacao_aprovacao TEXT
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS versao_aprovacao INTEGER DEFAULT 0
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS snapshot_seguranca_aprovado JSONB DEFAULT '{}'::jsonb
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS aprovacao_invalidada_em TIMESTAMPTZ
    `);

    await pool.query(`
        ALTER TABLE viagens
        ADD COLUMN IF NOT EXISTS motivo_invalidacao_aprovacao TEXT
    `);

    // Registros antigos seguros ficam aguardando aprovação formal.
    await pool.query(`
        UPDATE viagens
        SET status_aprovacao =
            CASE
                WHEN COALESCE(liberacao_rota, 'liberada') = 'bloqueada'
                    THEN 'bloqueada'
                ELSE COALESCE(status_aprovacao, 'aguardando_aprovacao')
            END
        WHERE status IN ('planejada','em_andamento')
    `);

    // Trilha imutável de auditoria operacional.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria_viagens (
            id BIGSERIAL PRIMARY KEY,
            id_viagem INTEGER NOT NULL,
            id_usuario INTEGER,
            tipo_usuario VARCHAR(30),
            acao VARCHAR(80) NOT NULL,
            status_anterior VARCHAR(50),
            status_novo VARCHAR(50),
            detalhes JSONB DEFAULT '{}'::jsonb,
            ip VARCHAR(120),
            user_agent TEXT,
            criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_auditoria_viagem
                FOREIGN KEY (id_viagem)
                REFERENCES viagens(id)
                ON DELETE CASCADE,

            CONSTRAINT fk_auditoria_usuario
                FOREIGN KEY (id_usuario)
                REFERENCES usuarios(id)
                ON DELETE SET NULL
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_auditoria_viagens_viagem_data
        ON auditoria_viagens(id_viagem, criado_em DESC)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_auditoria_viagens_data
        ON auditoria_viagens(criado_em DESC)
    `);

    // V18 - snapshot/versionamento imutável da rota aprovada
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS rota_aprovada_geojson JSONB`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS id_rota_especifica_aprovada INTEGER`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS versao_rota_aprovada INTEGER`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS rota_aprovada_em TIMESTAMPTZ`);

    // V18 - monitor operacional em tempo real
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS estado_monitoramento VARCHAR(30) DEFAULT 'normal'`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS desvio_inicio_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS gps_offline_desde TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS ultima_revalidacao_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS ultima_distancia_rota_km DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS ultimo_progresso DOUBLE PRECISION DEFAULT 0`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS ultima_eta_calculada TIMESTAMPTZ`);

    // V19 - dados econômicos do veículo
    await pool.query(`ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS consumo_medio_km_l DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS tipo_combustivel VARCHAR(30) DEFAULT 'diesel'`);
    await pool.query(`ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS preco_combustivel_ref DOUBLE PRECISION`);

    // V19 - estimativas e inteligência salvas na viagem
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS distancia_estimada_km DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS duracao_estimada_min DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS combustivel_estimado_l DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS custo_combustivel_estimado DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS score_rota INTEGER`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS memoria_rota_snapshot JSONB DEFAULT '{}'::jsonb`);

    // Memória privada da frota por rota + configuração operacional
    await pool.query(`
        CREATE TABLE IF NOT EXISTS memoria_rotas_operacionais (
            id BIGSERIAL PRIMARY KEY,
            id_rota INTEGER NOT NULL,
            assinatura_config VARCHAR(160) NOT NULL,

            comprimento DOUBLE PRECISION,
            largura DOUBLE PRECISION,
            altura DOUBLE PRECISION,
            peso DOUBLE PRECISION,

            viagens_total INTEGER DEFAULT 0,
            viagens_sem_ocorrencia INTEGER DEFAULT 0,
            viagens_com_desvio INTEGER DEFAULT 0,
            incidentes_total INTEGER DEFAULT 0,

            duracao_media_min DOUBLE PRECISION,
            combustivel_medio_l DOUBLE PRECISION,

            score_confiabilidade INTEGER DEFAULT 50,
            ultima_viagem_em TIMESTAMPTZ,
            atualizada_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(id_rota, assinatura_config)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_memoria_rota_config
        ON memoria_rotas_operacionais(id_rota, assinatura_config)
    `);

    // Passagens reais da frota por restrições validadas
    await pool.query(`
        CREATE TABLE IF NOT EXISTS passagens_restricoes (
            id BIGSERIAL PRIMARY KEY,
            id_restricao BIGINT NOT NULL,
            id_viagem INTEGER NOT NULL,
            id_veiculo INTEGER NOT NULL,

            comprimento DOUBLE PRECISION,
            largura DOUBLE PRECISION,
            altura DOUBLE PRECISION,
            peso DOUBLE PRECISION,

            passou_sem_ocorrencia BOOLEAN DEFAULT TRUE,
            registrado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(id_restricao, id_viagem)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_passagens_restricao
        ON passagens_restricoes(id_restricao, registrado_em DESC)
    `);

    // V20 - consumo real da viagem
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS consumo_real_km_l DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS combustivel_real_l DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS custo_combustivel_real DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS variacao_consumo_percentual DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS consumo_anormal BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS consumo_informado_em TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS consumo_informado_por INTEGER`);

    // V22 - qualidade da telemetria + resumo operacional oficial
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS qualidade_gps VARCHAR(20)`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS qualidade_gps_score INTEGER`);
    await pool.query(`ALTER TABLE viagens ADD COLUMN IF NOT EXISTS resumo_operacional JSONB DEFAULT '{}'::jsonb`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS historico_consumo_viagens (
            id BIGSERIAL PRIMARY KEY,
            id_viagem INTEGER NOT NULL UNIQUE,
            id_veiculo INTEGER NOT NULL,
            id_rota INTEGER NOT NULL,
            distancia_km DOUBLE PRECISION,
            consumo_real_km_l DOUBLE PRECISION NOT NULL,
            combustivel_real_l DOUBLE PRECISION,
            custo_real DOUBLE PRECISION,
            consumo_previsto_km_l DOUBLE PRECISION,
            combustivel_previsto_l DOUBLE PRECISION,
            variacao_percentual DOUBLE PRECISION,
            consumo_anormal BOOLEAN DEFAULT FALSE,
            criado_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_hist_consumo_veiculo_rota
        ON historico_consumo_viagens(id_veiculo, id_rota, criado_em DESC)
    `);




    // Índices
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rotas_motorista ON rotas(id_motorista)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rotas_veiculo ON rotas(id_veiculo)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reportes_motorista ON reportes(id_motorista)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reportes_data ON reportes(data_hora DESC)`);

    console.log('✅ PostgreSQL preparado!');
}


module.exports = { criarTabelas };
