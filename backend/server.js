// backend/server.js
// GPS Caminhão - PostgreSQL + cadastro por placa + confirmação por e-mail (Brevo)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ======================================================
// VARIÁVEIS DE AMBIENTE
// ======================================================
const DATABASE_URL = process.env.DATABASE_URL;
const ORS_API_KEY = process.env.ORS_API_KEY;
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE;
const EMAIL_NOME = process.env.EMAIL_NOME || 'GPS Caminhão';

// ======================================================
// V21.8 - CONFIGURAÇÃO DE PRODUÇÃO
// ======================================================
// Raw GPS stays available for this many days before compaction.
// Compaction preserves the full sampled path in compressed JSONB.
// Set 0 to disable automatic compaction.
const GPS_RAW_RETENTION_DAYS =
    Math.max(
        0,
        Number(
            process.env.GPS_RAW_RETENTION_DAYS ||
            180
        )
    );

const MANUTENCAO_INTERVALO_MS =
    Math.max(
        60 * 60 * 1000,
        Number(
            process.env.MANUTENCAO_INTERVALO_MS ||
            6 * 60 * 60 * 1000
        )
    );

const SLOW_REQUEST_MS =
    Math.max(
        1000,
        Number(
            process.env.SLOW_REQUEST_MS ||
            8000
        )
    );


if (!DATABASE_URL) console.error('❌ DATABASE_URL não configurada!');
if (!JWT_SECRET) console.error('❌ JWT_SECRET não configurada!');
if (!ORS_API_KEY) console.warn('⚠️ ORS_API_KEY não configurada!');
if (!TOMTOM_API_KEY) console.warn('⚠️ TOMTOM_API_KEY não configurada!');
if (!BREVO_API_KEY) console.warn('⚠️ BREVO_API_KEY não configurada!');
if (!EMAIL_REMETENTE) console.warn('⚠️ EMAIL_REMETENTE não configurado!');

// ======================================================
// POSTGRESQL
// ======================================================
const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', err => {
    console.error('❌ Erro inesperado no PostgreSQL:', err);
});


// ======================================================
// V21.8 - LOGS / OBSERVABILIDADE
// ======================================================
function gerarRequestId() {
    return (
        Date.now().toString(36) +
        '-' +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function serializarErro(erro) {
    if (!erro) return {};

    return {
        name:
            erro.name ||
            null,
        message:
            erro.message ||
            String(erro),
        code:
            erro.code ||
            null,
        stack:
            process.env.NODE_ENV === 'production'
                ? undefined
                : erro.stack
    };
}

async function registrarLogSistema({
    nivel = 'error',
    origem = 'app',
    mensagem,
    detalhes = {},
    req = null,
    statusHttp = null,
    duracaoMs = null
}) {
    try {
        await pool.query(`
            INSERT INTO logs_sistema
            (
                nivel,
                origem,
                mensagem,
                detalhes,
                request_id,
                metodo,
                rota,
                status_http,
                duracao_ms,
                id_usuario
            )
            VALUES
            ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)
        `, [
            nivel,
            origem,
            String(mensagem || '').slice(0,4000),
            JSON.stringify(detalhes || {}),
            req?.requestId || null,
            req?.method || null,
            req?.originalUrl || null,
            statusHttp,
            duracaoMs,
            req?.usuario?.id || null
        ]);
    } catch (erroLog) {
        // Nunca derruba a API por falha no mecanismo de log.
        console.error(
            '⚠️ Falha ao persistir log:',
            erroLog.message
        );
    }
}

// ======================================================
// MIDDLEWARES
// ======================================================
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*'
}));
app.use(express.json({ limit: '2mb' }));

// Correlation ID + diagnóstico de 5xx e requests lentas.
app.use((req, res, next) => {
    req.requestId =
        req.headers['x-request-id'] ||
        gerarRequestId();

    res.setHeader(
        'X-Request-Id',
        req.requestId
    );

    const inicio =
        Date.now();

    res.on('finish', () => {
        const duracao =
            Date.now() -
            inicio;

        if (
            res.statusCode >= 500 ||
            duracao >= SLOW_REQUEST_MS
        ) {
            registrarLogSistema({
                nivel:
                    res.statusCode >= 500
                        ? 'error'
                        : 'warn',
                origem:
                    res.statusCode >= 500
                        ? 'http_5xx'
                        : 'http_lento',
                mensagem:
                    res.statusCode >= 500
                        ? `HTTP ${res.statusCode}`
                        : `Request lenta: ${duracao} ms`,
                detalhes:{
                    ip:req.ip || null
                },
                req,
                statusHttp:
                    res.statusCode,
                duracaoMs:
                    duracao
            }).catch(() => {});
        }
    });

    next();
});


// ======================================================
// HELPERS
// ======================================================
function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizarPlaca(placa) {
    return String(placa || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function gerarCodigo() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function enviarEmailCodigo({ nome, email, codigo, placa }) {
    if (!BREVO_API_KEY || !EMAIL_REMETENTE) {
        throw new Error('Serviço de e-mail não configurado');
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
            <div style="max-width:520px;margin:30px auto;background:#fff;border-radius:14px;padding:30px;box-shadow:0 5px 20px rgba(0,0,0,.08);">
                <h2 style="color:#1e293b;margin:0 0 12px;">🚛 GPS Caminhão</h2>
                <p style="color:#334155;">Olá, <strong>${nome}</strong>.</p>
                <p style="color:#334155;">Recebemos uma solicitação para criar sua conta de motorista para o veículo <strong>${placa}</strong>.</p>
                <p style="color:#334155;">Seu código de confirmação é:</p>
                <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2563eb;text-align:center;padding:20px;background:#eff6ff;border-radius:12px;margin:18px 0;">${codigo}</div>
                <p style="color:#64748b;font-size:13px;">O código expira em <strong>10 minutos</strong>.</p>
                <p style="color:#64748b;font-size:13px;">Se você não solicitou este cadastro, ignore esta mensagem.</p>
            </div>
        </body>
        </html>
    `;

    await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
            sender: { name: EMAIL_NOME, email: EMAIL_REMETENTE },
            to: [{ email, name: nome }],
            subject: 'Código de confirmação - GPS Caminhão',
            htmlContent
        },
        {
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            timeout: 15000
        }
    );
}

// ======================================================
// BANCO / MIGRAÇÕES
// ======================================================
async function criarTabelas() {
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

    // Usuários padrão mantidos para compatibilidade/teste
    const senhaAdmin = bcrypt.hashSync('admin123', 10);
    const senhaMotorista = bcrypt.hashSync('motor123', 10);

    await pool.query(
        `INSERT INTO usuarios (nome,tipo,login,senha,email_verificado)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (login) DO NOTHING`,
        ['Administrador', 'admin', 'admin', senhaAdmin]
    );

    await pool.query(
        `INSERT INTO usuarios (nome,tipo,login,senha,email_verificado)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (login) DO NOTHING`,
        ['Motorista José', 'motorista', 'jose', senhaMotorista]
    );

    console.log('✅ PostgreSQL preparado!');
}

async function testarBanco() {
    try {
        const result = await pool.query('SELECT NOW() AS agora');
        console.log('✅ PostgreSQL conectado!');
        console.log('🕒 Banco:', result.rows[0].agora);
        return true;
    } catch (erro) {
        console.error('❌ Erro ao conectar no PostgreSQL:', erro.message);
        return false;
    }
}

// ======================================================
// AUTENTICAÇÃO
// ======================================================
function autenticar(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ erro: 'Token não fornecido' });

    const token = header.startsWith('Bearer ') ? header.slice(7) : header;

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ erro: 'Token inválido' });
        req.usuario = decoded;
        next();
    });
}

// ======================================================
// RATE LIMIT
// ======================================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { erro: 'Muitas requisições.' }
});

const heavyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    message: { erro: 'Limite excedido.' }
});

const cadastroLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { erro: 'Muitas tentativas de cadastro. Aguarde alguns minutos.' }
});

app.use(globalLimiter);

// ======================================================
// JOI
// ======================================================
const schemas = {
    login: Joi.object({
        login: Joi.string().required(),
        senha: Joi.string().required()
    }),

    iniciarCadastro: Joi.object({
        nome: Joi.string().trim().min(3).max(150).required(),
        email: Joi.string().email().required(),
        placa: Joi.string().min(6).max(10).required()
    }),

    verificarCadastro: Joi.object({
        email: Joi.string().email().required(),
        codigo: Joi.string().pattern(/^\d{6}$/).required()
    }),

    criarSenha: Joi.object({
        email: Joi.string().email().required(),
        senha: Joi.string().min(6).max(100).required()
    }),

    veiculo: Joi.object({
        placa: Joi.string().min(6).max(10).required(),
        frota: Joi.string().allow('').optional(),
        modelo: Joi.string().allow('').optional(),
        comprimento: Joi.number().positive().required(),
        largura: Joi.number().positive().required(),
        peso: Joi.number().positive().required(),
        consumo_medio_km_l: Joi.number().positive().allow(null).optional(),
        tipo_combustivel: Joi.string().max(30).allow('').optional(),
        preco_combustivel_ref: Joi.number().positive().allow(null).optional()
    }),

    motorista: Joi.object({
        nome: Joi.string().min(3).required(),
        login: Joi.string().min(3).required(),
        senha: Joi.string().min(4).required(),
        tipo: Joi.string().valid('motorista').optional()
    }),

    rota:
        Joi.object({
            nome: Joi.string().min(1).required(),
            origem: Joi.string().required(),
            destino: Joi.string().required(),
            restricoes: Joi.object().optional(),
            dados_geojson: Joi.object().required()
        }),

    novaViagem:
        Joi.object({
            id_rota: Joi.number().integer().positive().required(),
            id_veiculo: Joi.number().integer().positive().required(),
            carga: Joi.string().allow('').max(300).optional(),
            altura_total: Joi.number().positive().required(),
            peso_total: Joi.number().positive().optional(),
            saida_prevista: Joi.date().iso().allow(null).optional()
        }),

    calcularRota: Joi.object({
        origem: Joi.object({
            lat: Joi.number().min(-90).max(90).required(),
            lon: Joi.number().min(-180).max(180).required()
        }).required(),
        destino: Joi.object({
            lat: Joi.number().min(-90).max(90).required(),
            lon: Joi.number().min(-180).max(180).required()
        }).required(),
        altura: Joi.number().positive().optional(),
        peso: Joi.number().positive().optional(),
        comprimento: Joi.number().positive().optional(),
        largura: Joi.number().positive().optional(),
        perfil: Joi.string().valid('driving-car', 'driving-hgv').required(),
        preferencia: Joi.string().valid('fastest', 'shortest', 'recommended').optional()
    }),

    recalcularDesvio: Joi.object({
        pontoSaida: Joi.array().items(Joi.number()).length(2).required(),
        pontoIncidente: Joi.array().items(Joi.number()).length(2).required(),
        pontoReentrada: Joi.array().items(Joi.number()).length(2).required(),
        raioBloqueio: Joi.number().min(50).max(1000).optional(),
        perfil: Joi.string().valid('driving-car', 'driving-hgv').optional(),
        altura: Joi.number().positive().optional(),
        peso: Joi.number().positive().optional(),
        comprimento: Joi.number().positive().optional(),
        largura: Joi.number().positive().optional()
    }),

    localizacao: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lon: Joi.number().min(-180).max(180).required(),
        velocidade_kmh: Joi.number().min(0).max(250).allow(null).optional(),
        precisao_m: Joi.number().min(0).max(5000).allow(null).optional(),
        direcao_graus: Joi.number().min(0).max(360).allow(null).optional(),
        altitude_m: Joi.number().min(-500).max(10000).allow(null).optional(),
        timestamp_dispositivo: Joi.date().iso().allow(null).optional(),
        origem_coleta: Joi.string().valid('gps_app','offline_sync','simulacao').optional()
    }),

    status: Joi.object({
        status: Joi.string().valid('pendente', 'em_andamento', 'concluida').required()
    }),

    traffic: Joi.object({
        top: Joi.number().min(-90).max(90).required(),
        bottom: Joi.number().min(-90).max(90).required(),
        left: Joi.number().min(-180).max(180).required(),
        right: Joi.number().min(-180).max(180).required()
    }),

    reporte: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        tipo: Joi.string().valid('radar', 'acidente', 'obra', 'perigo', 'risco').required()
    })
};

function validar(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, { abortEarly: false });
        if (error) {
            return res.status(400).json({
                erro: 'Dados inválidos',
                detalhes: error.details.map(d => d.message).join(', ')
            });
        }
        req.body = value;
        next();
    };
}

function validarQuery(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, { abortEarly: false, convert: true });
        if (error) {
            return res.status(400).json({
                erro: 'Parâmetros inválidos',
                detalhes: error.details.map(d => d.message).join(', ')
            });
        }
        req.query = value;
        next();
    };
}

// ======================================================
// CACHE DE ROTAS
// ======================================================
const routeCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

function gerarChaveRota(origem, destino, perfil, preferencia, altura, peso, comprimento) {
    return JSON.stringify({
        origem,
        destino,
        perfil,
        preferencia: preferencia || 'fastest',
        altura: altura || 0,
        peso: peso || 0,
        comprimento: comprimento || 0
    });
}

// ======================================================
// HOME / HEALTH / ROTA TESTE
// ======================================================
app.get('/', (req, res) => {
    res.json({
        mensagem: '🚀 GPS Caminhão API',
        banco: 'PostgreSQL',
        email: !!BREVO_API_KEY,
        status: 'online'
    });
});


// ======================================================
// TOMTOM - LIMITES DE VELOCIDADE (CHAVE PROTEGIDA NO SERVIDOR)
// ======================================================
app.post('/tomtom/speed-limits', autenticar, async (req, res) => {
    try {
        const apiKey = String(process.env.TOMTOM_API_KEY || '').trim();

        if (!apiKey) {
            return res.status(503).json({
                erro: 'TOMTOM_API_KEY não configurada no servidor'
            });
        }

        const pathRecebido = req.body?.path;

        if (!Array.isArray(pathRecebido) || pathRecebido.length < 2) {
            return res.status(400).json({
                erro: 'Path da rota é obrigatório'
            });
        }

        // Proteção contra payload gigante.
        if (pathRecebido.length > 1500) {
            return res.status(400).json({
                erro: 'Path possui pontos demais',
                maximo: 1500
            });
        }

        const path = [];

        for (const ponto of pathRecebido) {
            if (!Array.isArray(ponto) || ponto.length < 2) {
                continue;
            }

            const lng = Number(ponto[0]);
            const lat = Number(ponto[1]);

            if (
                Number.isFinite(lng) &&
                Number.isFinite(lat) &&
                lng >= -180 && lng <= 180 &&
                lat >= -90 && lat <= 90
            ) {
                path.push([lng, lat]);
            }
        }

        if (path.length < 2) {
            return res.status(400).json({
                erro: 'Path não possui coordenadas válidas suficientes'
            });
        }

        const origem = path[0];
        const destino = path[path.length - 1];

        const body = {
            routePlanningLocations: {
                origin: {
                    type: 'Point',
                    coordinates: origem
                },
                destination: {
                    type: 'Point',
                    coordinates: destino
                }
            },
            path: {
                type: 'LineString',
                coordinates: path
            },
            routeType: 'fast',
            travelMode: 'car'
        };

        const peso = Number(
            req.body?.vehicleWeightInKilograms
        );

        if (Number.isFinite(peso) && peso > 0) {
            body.vehicleWeightInKilograms =
                Math.round(peso);
        }

        const tomtomResp = await fetch(
            'https://api.tomtom.com/maps/orbis/routing/routes/calculate?apiVersion=3',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'TomTom-Api-Version': '3',
                    'TomTom-Api-Key': apiKey,
                    'Attributes': 'routes'
                },
                body: JSON.stringify(body)
            }
        );

        const data = await tomtomResp
            .json()
            .catch(() => ({}));

        if (!tomtomResp.ok) {
            console.error(
                '❌ TomTom:',
                tomtomResp.status,
                JSON.stringify(data)
            );

            return res.status(502).json({
                erro: 'Falha ao consultar TomTom',
                status_tomtom: tomtomResp.status,
                detalhes:
                    data?.detailedError?.message ||
                    data?.message ||
                    'Resposta inválida da TomTom'
            });
        }

        const route = data?.routes?.[0];

        if (!route) {
            return res.status(502).json({
                erro: 'TomTom não retornou rota'
            });
        }

        const pathTomTom = [];

        for (const leg of route.legs || []) {
            const coords =
                leg?.path?.coordinates || [];

            for (let i = 0; i < coords.length; i++) {
                const c = coords[i];

                if (
                    pathTomTom.length &&
                    i === 0
                ) {
                    const ultimo =
                        pathTomTom[pathTomTom.length - 1];

                    if (
                        Math.abs(ultimo[0] - c[0]) < 1e-8 &&
                        Math.abs(ultimo[1] - c[1]) < 1e-8
                    ) {
                        continue;
                    }
                }

                pathTomTom.push([
                    Number(c[0]),
                    Number(c[1])
                ]);
            }
        }

        const secoesRaw =
            route?.sections?.speedLimit || [];

        const sections = [];

        for (const secao of secoesRaw) {
            const restricoes =
                secao?.speedRestrictions || [];

            const maxima =
                restricoes.find(item =>
                    item?.type === 'maximum' &&
                    Number.isFinite(
                        Number(
                            item?.inKilometersPerHour
                        )
                    )
                );

            if (!maxima) continue;

            const inicio =
                Number(secao.startPathIndex);

            const fim =
                Number(secao.endPathIndex);

            const limite =
                Number(
                    maxima.inKilometersPerHour
                );

            if (
                Number.isFinite(inicio) &&
                Number.isFinite(fim) &&
                Number.isFinite(limite)
            ) {
                sections.push({
                    startPathIndex: inicio,
                    endPathIndex: fim,
                    limite
                });
            }
        }

        res.json({
            path: pathTomTom,
            sections,
            consultado_em:
                new Date().toISOString(),
            fonte: 'TomTom Orbis v3 via servidor'
        });

    } catch (erro) {
        console.error(
            '❌ /tomtom/speed-limits:',
            erro
        );

        res.status(500).json({
            erro: 'Erro interno ao consultar limites TomTom',
            detalhes: erro.message
        });
    }
});



// ======================================================
// V21.8 - RETENÇÃO / COMPACTAÇÃO GPS
// ======================================================
async function arquivarViagensGpsAntigas({
    limite = 20
} = {}) {
    if (
        !Number.isFinite(GPS_RAW_RETENTION_DAYS) ||
        GPS_RAW_RETENTION_DAYS <= 0
    ) {
        return {
            desativado:true,
            arquivadas:0,
            pontos_removidos:0
        };
    }

    const client =
        await pool.connect();

    let arquivadas = 0;
    let pontosRemovidos = 0;

    try {
        await client.query('BEGIN');

        const viagens = await client.query(`
            SELECT
                vg.id,
                vg.id_veiculo,
                vg.id_motorista
            FROM viagens vg
            WHERE vg.status = 'concluida'
              AND COALESCE(
                    vg.chegada_real,
                    vg.criada_em
                  ) <
                  CURRENT_TIMESTAMP -
                  ($1 || ' days')::interval
              AND EXISTS (
                    SELECT 1
                    FROM historico_localizacoes h
                    WHERE h.id_viagem = vg.id
                  )
            ORDER BY
                COALESCE(
                    vg.chegada_real,
                    vg.criada_em
                ) ASC
            LIMIT $2
            FOR UPDATE OF vg SKIP LOCKED
        `, [
            GPS_RAW_RETENTION_DAYS,
            Math.max(
                1,
                Math.min(
                    100,
                    Number(limite) || 20
                )
            )
        ]);

        for (const viagem of viagens.rows) {
            const resumo =
                await client.query(`
                    SELECT
                        COUNT(*)::int AS total,
                        MIN(registrado_em) AS primeiro,
                        MAX(registrado_em) AS ultimo,
                        COALESCE(
                            (
                                SELECT distancia_gps_bruta_km
                                FROM resumo_coleta_viagem
                                WHERE id_viagem = $1
                            ),
                            0
                        ) AS distancia,
                        jsonb_agg(
                            jsonb_build_array(
                                lon,
                                lat,
                                EXTRACT(
                                    EPOCH FROM
                                    COALESCE(
                                        timestamp_dispositivo,
                                        registrado_em
                                    )
                                )::bigint,
                                velocidade_kmh,
                                precisao_m,
                                direcao_graus,
                                altitude_m
                            )
                            ORDER BY registrado_em
                        ) AS pontos
                    FROM historico_localizacoes
                    WHERE id_viagem = $1
                `, [
                    viagem.id
                ]);

            const row =
                resumo.rows[0];

            if (
                !row ||
                Number(row.total || 0) <= 0
            ) {
                continue;
            }

            await client.query(`
                INSERT INTO trajetos_viagem_arquivados
                (
                    id_viagem,
                    id_veiculo,
                    id_motorista,
                    total_pontos,
                    primeiro_ponto_em,
                    ultimo_ponto_em,
                    distancia_gps_bruta_km,
                    pontos,
                    arquivado_em,
                    formato_versao
                )
                VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,CURRENT_TIMESTAMP,1)
                ON CONFLICT (id_viagem)
                DO UPDATE SET
                    id_veiculo = EXCLUDED.id_veiculo,
                    id_motorista = EXCLUDED.id_motorista,
                    total_pontos = EXCLUDED.total_pontos,
                    primeiro_ponto_em = EXCLUDED.primeiro_ponto_em,
                    ultimo_ponto_em = EXCLUDED.ultimo_ponto_em,
                    distancia_gps_bruta_km = EXCLUDED.distancia_gps_bruta_km,
                    pontos = EXCLUDED.pontos,
                    arquivado_em = CURRENT_TIMESTAMP
            `, [
                viagem.id,
                viagem.id_veiculo,
                viagem.id_motorista,
                row.total,
                row.primeiro,
                row.ultimo,
                row.distancia,
                JSON.stringify(
                    row.pontos || []
                )
            ]);

            const removido =
                await client.query(`
                    DELETE FROM historico_localizacoes
                    WHERE id_viagem = $1
                `, [
                    viagem.id
                ]);

            arquivadas += 1;
            pontosRemovidos +=
                Number(
                    removido.rowCount || 0
                );
        }

        await client.query(`
            INSERT INTO manutencao_sistema
            (
                chave,
                executado_em,
                status,
                detalhes
            )
            VALUES
            (
                'compactacao_gps',
                CURRENT_TIMESTAMP,
                'ok',
                $1::jsonb
            )
            ON CONFLICT (chave)
            DO UPDATE SET
                executado_em =
                    EXCLUDED.executado_em,
                status =
                    EXCLUDED.status,
                detalhes =
                    EXCLUDED.detalhes
        `, [
            JSON.stringify({
                retencao_dias:
                    GPS_RAW_RETENTION_DAYS,
                viagens_arquivadas:
                    arquivadas,
                pontos_removidos:
                    pontosRemovidos
            })
        ]);

        await client.query('COMMIT');

        return {
            desativado:false,
            retencao_dias:
                GPS_RAW_RETENTION_DAYS,
            arquivadas,
            pontos_removidos:
                pontosRemovidos
        };

    } catch (erro) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}

        await registrarLogSistema({
            nivel:'error',
            origem:'compactacao_gps',
            mensagem:
                erro.message,
            detalhes:
                serializarErro(erro)
        });

        throw erro;

    } finally {
        client.release();
    }
}

let manutencaoEmExecucao = false;

async function executarManutencaoPeriodica() {
    if (manutencaoEmExecucao) {
        return;
    }

    manutencaoEmExecucao = true;

    try {
        const resultado =
            await arquivarViagensGpsAntigas({
                limite:20
            });

        console.log(
            '🧹 Manutenção GPS:',
            resultado
        );

    } catch (erro) {
        console.error(
            '❌ Manutenção periódica:',
            erro
        );

    } finally {
        manutencaoEmExecucao =
            false;
    }
}

app.get('/health', async (req, res) => {
    const inicio = Date.now();

    try {
        const resultado =
            await pool.query(`
                SELECT
                    NOW() AS agora,
                    pg_database_size(
                        current_database()
                    ) AS database_bytes
            `);

        res.json({
            status:'ok',
            banco:'postgresql',
            database:'conectado',
            database_bytes:
                Number(
                    resultado.rows[0]
                        .database_bytes || 0
                ),
            brevo:
                BREVO_API_KEY
                    ? 'configurado'
                    : 'não configurado',
            retencao_gps_dias:
                GPS_RAW_RETENTION_DAYS,
            tempo_resposta_ms:
                Date.now() - inicio,
            timestamp:
                resultado.rows[0].agora
        });

    } catch (erro) {
        await registrarLogSistema({
            nivel:'error',
            origem:'health',
            mensagem:
                erro.message,
            detalhes:
                serializarErro(erro),
            req,
            statusHttp:500,
            duracaoMs:
                Date.now() - inicio
        });

        res.status(500).json({
            status:'erro',
            database:'desconectado',
            request_id:
                req.requestId,
            erro:
                erro.message
        });
    }
});

app.get('/admin/saude-producao', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({
            erro:'Acesso negado'
        });
    }

    try {
        const [
            banco,
            gps,
            logs,
            viagens,
            manutencao,
            arquivos
        ] = await Promise.all([
            pool.query(`
                SELECT
                    pg_database_size(
                        current_database()
                    ) AS bytes
            `),

            pool.query(`
                SELECT
                    COUNT(*)::bigint AS total,
                    MIN(registrado_em) AS mais_antigo,
                    MAX(registrado_em) AS mais_novo,
                    pg_total_relation_size(
                        'historico_localizacoes'
                    ) AS bytes_tabela
                FROM historico_localizacoes
            `),

            pool.query(`
                SELECT
                    COUNT(*) FILTER (
                        WHERE nivel = 'error'
                          AND criado_em >
                              CURRENT_TIMESTAMP -
                              INTERVAL '24 hours'
                    )::int AS erros_24h,
                    COUNT(*) FILTER (
                        WHERE nivel = 'warn'
                          AND criado_em >
                              CURRENT_TIMESTAMP -
                              INTERVAL '24 hours'
                    )::int AS avisos_24h
                FROM logs_sistema
            `),

            pool.query(`
                SELECT
                    COUNT(*) FILTER (
                        WHERE status = 'em_andamento'
                    )::int AS em_andamento,
                    COUNT(*) FILTER (
                        WHERE status = 'planejada'
                    )::int AS planejadas,
                    COUNT(*) FILTER (
                        WHERE status_aprovacao =
                            'revisao_obrigatoria'
                    )::int AS revisao_obrigatoria
                FROM viagens
                WHERE status IN (
                    'planejada',
                    'em_andamento'
                )
            `),

            pool.query(`
                SELECT *
                FROM manutencao_sistema
                WHERE chave =
                    'compactacao_gps'
            `),

            pool.query(`
                SELECT
                    COUNT(*)::int AS viagens_arquivadas,
                    COALESCE(
                        SUM(total_pontos),
                        0
                    )::bigint AS pontos_arquivados
                FROM trajetos_viagem_arquivados
            `)
        ]);

        const gpsRow = gps.rows[0];
        const dbBytes =
            Number(
                banco.rows[0]?.bytes || 0
            );

        const gpsBytes =
            Number(
                gpsRow?.bytes_tabela || 0
            );

        res.json({
            status:
                Number(
                    logs.rows[0]
                        ?.erros_24h || 0
                ) > 0
                    ? 'atencao'
                    : 'ok',

            banco:{
                bytes:dbBytes,
                mb:
                    Number(
                        (
                            dbBytes /
                            1024 /
                            1024
                        ).toFixed(2)
                    )
            },

            gps_raw:{
                total_pontos:
                    Number(
                        gpsRow?.total || 0
                    ),
                mais_antigo:
                    gpsRow?.mais_antigo || null,
                mais_novo:
                    gpsRow?.mais_novo || null,
                bytes:gpsBytes,
                mb:
                    Number(
                        (
                            gpsBytes /
                            1024 /
                            1024
                        ).toFixed(2)
                    ),
                retencao_dias:
                    GPS_RAW_RETENTION_DAYS
            },

            gps_arquivado:{
                viagens:
                    Number(
                        arquivos.rows[0]
                            ?.viagens_arquivadas || 0
                    ),
                pontos:
                    Number(
                        arquivos.rows[0]
                            ?.pontos_arquivados || 0
                    )
            },

            logs:{
                erros_24h:
                    Number(
                        logs.rows[0]
                            ?.erros_24h || 0
                    ),
                avisos_24h:
                    Number(
                        logs.rows[0]
                            ?.avisos_24h || 0
                    )
            },

            viagens:
                viagens.rows[0],

            manutencao:
                manutencao.rows[0] ||
                {
                    status:'ainda_nao_executada'
                },

            configuracao:{
                slow_request_ms:
                    SLOW_REQUEST_MS,
                manutencao_intervalo_horas:
                    Number(
                        (
                            MANUTENCAO_INTERVALO_MS /
                            3600000
                        ).toFixed(1)
                    )
            }
        });

    } catch (erro) {
        await registrarLogSistema({
            nivel:'error',
            origem:'saude_producao',
            mensagem:
                erro.message,
            detalhes:
                serializarErro(erro),
            req
        });

        res.status(500).json({
            erro:
                erro.message,
            request_id:
                req.requestId
        });
    }
});

app.get('/admin/logs-sistema', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({
            erro:'Acesso negado'
        });
    }

    const limite =
        Math.max(
            1,
            Math.min(
                500,
                Number(
                    req.query.limite ||
                    100
                )
            )
        );

    try {
        const r = await pool.query(`
            SELECT *
            FROM logs_sistema
            ORDER BY criado_em DESC
            LIMIT $1
        `, [
            limite
        ]);

        res.json(r.rows);

    } catch (erro) {
        res.status(500).json({
            erro:
                erro.message
        });
    }
});

app.post('/admin/manutencao/compactar-gps', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({
            erro:'Acesso negado'
        });
    }

    try {
        const resultado =
            await arquivarViagensGpsAntigas({
                limite:
                    Number(
                        req.body?.limite ||
                        20
                    )
            });

        res.json({
            mensagem:
                'Manutenção executada.',
            resultado
        });

    } catch (erro) {
        res.status(500).json({
            erro:
                erro.message,
            request_id:
                req.requestId
        });
    }
});

app.get('/teste-rota', (req, res) => {
    res.json({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [-40.064, -19.394],
                    [-40.10, -19.50],
                    [-40.15, -19.70],
                    [-40.20, -19.90],
                    [-40.25, -20.10],
                    [-40.338, -20.319]
                ]
            },
            properties: {
                segments: [{ distance: 140000, duration: 7200 }]
            }
        }],
        origem: 'Linhares, ES',
        destino: 'Vitória, ES',
        restricoes: { altura: 4.2, peso: 15, comprimento: 12 }
    });
});

// ======================================================
// LOGIN
// ======================================================
app.post('/login', validar(schemas.login), async (req, res) => {
    try {
        const identificador = req.body.login.trim();

        const resultado = await pool.query(`
            SELECT
                u.id, u.nome, u.tipo, u.login, u.senha,
                u.email, u.email_verificado, u.id_veiculo,
                v.placa, v.frota, v.modelo, v.ativo AS veiculo_ativo
            FROM usuarios u
            LEFT JOIN veiculos v ON v.id = u.id_veiculo
            WHERE LOWER(u.login) = LOWER($1)
               OR LOWER(COALESCE(u.email,'')) = LOWER($1)
            LIMIT 1
        `, [identificador]);

        const user = resultado.rows[0];
        if (!user) return res.status(401).json({ erro: 'Usuário não encontrado' });

        if (user.tipo === 'motorista' && user.email && !user.email_verificado) {
            return res.status(403).json({ erro: 'Confirme seu e-mail antes de acessar o aplicativo' });
        }

        if (user.tipo === 'motorista' && user.id_veiculo && user.veiculo_ativo === false) {
            return res.status(403).json({ erro: 'O veículo vinculado à sua conta está bloqueado' });
        }

        const senhaCorreta = bcrypt.compareSync(req.body.senha, user.senha);
        if (!senhaCorreta) return res.status(401).json({ erro: 'Senha incorreta' });

        const token = jwt.sign({
            id: user.id,
            login: user.login,
            tipo: user.tipo,
            id_veiculo: user.id_veiculo || null
        }, JWT_SECRET, { expiresIn: '8h' });

        res.json({
            token,
            usuario: {
                id: user.id,
                nome: user.nome,
                tipo: user.tipo,
                email: user.email,
                id_veiculo: user.id_veiculo,
                placa: user.placa,
                frota: user.frota,
                modelo: user.modelo
            }
        });
    } catch (erro) {
        console.error('❌ Erro login:', erro);
        res.status(500).json({ erro: 'Erro interno no login' });
    }
});

// ======================================================
// CADASTRO DO MOTORISTA - ETAPA 1
// ======================================================
app.post('/cadastro/iniciar', cadastroLimiter, validar(schemas.iniciarCadastro), async (req, res) => {
    try {
        const nome = req.body.nome.trim();
        const email = normalizarEmail(req.body.email);
        const placa = normalizarPlaca(req.body.placa);

        const resultadoVeiculo = await pool.query(`
            SELECT id, placa, frota, modelo, ativo
            FROM veiculos
            WHERE placa = $1
            LIMIT 1
        `, [placa]);

        const veiculo = resultadoVeiculo.rows[0];
        if (!veiculo) return res.status(403).json({ erro: 'Placa não cadastrada no sistema' });
        if (!veiculo.ativo) return res.status(403).json({ erro: 'Este veículo está bloqueado' });

        const placaEmUso = await pool.query(`
            SELECT id FROM usuarios
            WHERE tipo = 'motorista' AND id_veiculo = $1
            LIMIT 1
        `, [veiculo.id]);

        if (placaEmUso.rows.length > 0) {
            return res.status(409).json({ erro: 'Esta placa já está vinculada a outro motorista' });
        }

        const pendenteOutraPessoa = await pool.query(`
            SELECT id, email
            FROM cadastros_pendentes
            WHERE id_veiculo = $1 AND LOWER(email) <> LOWER($2)
            LIMIT 1
        `, [veiculo.id, email]);

        if (pendenteOutraPessoa.rows.length > 0) {
            return res.status(409).json({ erro: 'Já existe um cadastro em andamento para esta placa' });
        }

        const emailExistente = await pool.query(`
            SELECT id FROM usuarios
            WHERE LOWER(COALESCE(email,'')) = LOWER($1)
               OR LOWER(login) = LOWER($1)
            LIMIT 1
        `, [email]);

        if (emailExistente.rows.length > 0) {
            return res.status(409).json({ erro: 'Este e-mail já possui uma conta' });
        }

        const codigo = gerarCodigo();
        const codigoHash = bcrypt.hashSync(codigo, 10);
        const expiracao = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(`
            INSERT INTO cadastros_pendentes
                (nome,email,id_veiculo,codigo_hash,codigo_expira_em,email_verificado,tentativas,created_at)
            VALUES ($1,$2,$3,$4,$5,FALSE,0,CURRENT_TIMESTAMP)
            ON CONFLICT (email)
            DO UPDATE SET
                nome = EXCLUDED.nome,
                id_veiculo = EXCLUDED.id_veiculo,
                codigo_hash = EXCLUDED.codigo_hash,
                codigo_expira_em = EXCLUDED.codigo_expira_em,
                email_verificado = FALSE,
                verificado_em = NULL,
                tentativas = 0,
                created_at = CURRENT_TIMESTAMP
        `, [nome, email, veiculo.id, codigoHash, expiracao]);

        try {
            await enviarEmailCodigo({ nome, email, codigo, placa });
        } catch (erroEmail) {
            console.error('❌ Brevo:', erroEmail.response?.data || erroEmail.message);
            return res.status(502).json({
                erro: 'Não foi possível enviar o e-mail de confirmação',
                detalhe: erroEmail.response?.data?.message || erroEmail.message
            });
        }

        console.log(`📧 Código enviado para ${email} / placa ${placa}`);
        res.json({
            mensagem: 'Código enviado para seu e-mail',
            email,
            placa,
            expira_em_minutos: 10
        });
    } catch (erro) {
        console.error('❌ Cadastro iniciar:', erro);
        res.status(500).json({ erro: 'Erro ao iniciar cadastro' });
    }
});

// ======================================================
// CADASTRO DO MOTORISTA - ETAPA 2
// ======================================================
app.post('/cadastro/verificar', cadastroLimiter, validar(schemas.verificarCadastro), async (req, res) => {
    try {
        const email = normalizarEmail(req.body.email);
        const codigo = req.body.codigo;

        const resultado = await pool.query(`
            SELECT * FROM cadastros_pendentes
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
        `, [email]);

        const cadastro = resultado.rows[0];
        if (!cadastro) return res.status(404).json({ erro: 'Cadastro não encontrado' });
        if (cadastro.tentativas >= 5) {
            return res.status(429).json({ erro: 'Muitas tentativas incorretas. Solicite um novo código.' });
        }
        if (new Date() > new Date(cadastro.codigo_expira_em)) {
            return res.status(410).json({ erro: 'Código expirado. Solicite um novo código.' });
        }

        const codigoCorreto = bcrypt.compareSync(codigo, cadastro.codigo_hash);
        if (!codigoCorreto) {
            await pool.query(`
                UPDATE cadastros_pendentes
                SET tentativas = tentativas + 1
                WHERE id = $1
            `, [cadastro.id]);

            return res.status(400).json({ erro: 'Código incorreto' });
        }

        await pool.query(`
            UPDATE cadastros_pendentes
            SET email_verificado = TRUE,
                verificado_em = CURRENT_TIMESTAMP,
                tentativas = 0
            WHERE id = $1
        `, [cadastro.id]);

        res.json({ mensagem: 'E-mail confirmado com sucesso', email_verificado: true });
    } catch (erro) {
        console.error('❌ Verificar código:', erro);
        res.status(500).json({ erro: 'Erro ao confirmar código' });
    }
});

// ======================================================
// CADASTRO DO MOTORISTA - ETAPA 3
// ======================================================
app.post('/cadastro/criar-senha', cadastroLimiter, validar(schemas.criarSenha), async (req, res) => {
    const client = await pool.connect();

    try {
        const email = normalizarEmail(req.body.email);
        await client.query('BEGIN');

        const resultado = await client.query(`
            SELECT cp.*, v.placa, v.ativo
            FROM cadastros_pendentes cp
            JOIN veiculos v ON v.id = cp.id_veiculo
            WHERE LOWER(cp.email) = LOWER($1)
            LIMIT 1
            FOR UPDATE
        `, [email]);

        const cadastro = resultado.rows[0];

        if (!cadastro) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Cadastro não encontrado' });
        }

        if (!cadastro.email_verificado) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'Confirme seu e-mail primeiro' });
        }

        if (!cadastro.ativo) {
            await client.query('ROLLBACK');
            return res.status(403).json({ erro: 'O veículo não está mais autorizado' });
        }

        if (!cadastro.verificado_em || Date.now() - new Date(cadastro.verificado_em).getTime() > 30 * 60 * 1000) {
            await client.query('ROLLBACK');
            return res.status(410).json({ erro: 'Confirmação expirada. Solicite um novo código.' });
        }

        const placaEmUso = await client.query(`
            SELECT id FROM usuarios
            WHERE tipo = 'motorista' AND id_veiculo = $1
            LIMIT 1
        `, [cadastro.id_veiculo]);

        if (placaEmUso.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ erro: 'Esta placa foi vinculada a outra conta' });
        }

        const senhaHash = bcrypt.hashSync(req.body.senha, 10);

        const novoUsuario = await client.query(`
            INSERT INTO usuarios
                (nome,tipo,login,senha,email,email_verificado,id_veiculo)
            VALUES ($1,'motorista',$2,$3,$4,TRUE,$5)
            RETURNING id,nome,login,email,id_veiculo
        `, [cadastro.nome, email, senhaHash, email, cadastro.id_veiculo]);

        await client.query(`DELETE FROM cadastros_pendentes WHERE id = $1`, [cadastro.id]);
        await client.query('COMMIT');

        console.log(`✅ Conta criada: ${email} / placa ${cadastro.placa}`);

        res.status(201).json({
            mensagem: 'Conta criada com sucesso',
            usuario: {
                id: novoUsuario.rows[0].id,
                nome: novoUsuario.rows[0].nome,
                email: novoUsuario.rows[0].email,
                placa: cadastro.placa
            }
        });
    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('❌ Criar conta:', erro);

        if (erro.code === '23505') {
            return res.status(409).json({ erro: 'E-mail ou veículo já possui uma conta' });
        }

        res.status(500).json({ erro: 'Erro ao criar conta' });
    } finally {
        client.release();
    }
});

// ======================================================
// VEÍCULOS
// ======================================================
app.get('/veiculos', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT
                v.id, v.placa, v.frota, v.modelo,
                v.comprimento, v.largura, v.peso,
                v.consumo_medio_km_l,
                v.tipo_combustivel,
                v.preco_combustivel_ref,
                v.ativo, v.created_at,
                u.id AS id_motorista, u.nome AS motorista, u.email
            FROM veiculos v
            LEFT JOIN usuarios u
                ON u.id_veiculo = v.id
               AND u.tipo = 'motorista'
            ORDER BY v.placa ASC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.post('/veiculos', autenticar, validar(schemas.veiculo), async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const placa = normalizarPlaca(req.body.placa);
        const resultado = await pool.query(`
            INSERT INTO veiculos
                (
                    placa,frota,modelo,
                    comprimento,largura,peso,
                    consumo_medio_km_l,
                    tipo_combustivel,
                    preco_combustivel_ref
                )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *
        `, [
            placa,
            req.body.frota || null,
            req.body.modelo || null,
            req.body.comprimento,
            req.body.largura,
            req.body.peso,
            req.body.consumo_medio_km_l || null,
            req.body.tipo_combustivel || 'diesel',
            req.body.preco_combustivel_ref || null
        ]);

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        if (erro.code === '23505') return res.status(409).json({ erro: 'Placa já cadastrada' });
        res.status(500).json({ erro: erro.message });
    }
});

app.put('/veiculos/:id', autenticar, validar(schemas.veiculo), async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const placa = normalizarPlaca(req.body.placa);
        const resultado = await pool.query(`
            UPDATE veiculos
            SET placa = $1,
                frota = $2,
                modelo = $3,
                comprimento = $4,
                largura = $5,
                peso = $6,
                consumo_medio_km_l = $7,
                tipo_combustivel = $8,
                preco_combustivel_ref = $9
            WHERE id = $10
            RETURNING *
        `, [
            placa,
            req.body.frota || null,
            req.body.modelo || null,
            req.body.comprimento,
            req.body.largura,
            req.body.peso,
            req.body.consumo_medio_km_l || null,
            req.body.tipo_combustivel || 'diesel',
            req.body.preco_combustivel_ref || null,
            req.params.id
        ]);

        if (!resultado.rows.length) {
            return res.status(404).json({ erro: 'Veículo não encontrado' });
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        if (erro.code === '23505') return res.status(409).json({ erro: 'Placa já cadastrada' });
        res.status(500).json({ erro: erro.message });
    }
});

app.patch('/veiculos/:id/status', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
    if (typeof req.body.ativo !== 'boolean') {
        return res.status(400).json({ erro: 'Informe ativo como true ou false' });
    }

    try {
        const resultado = await pool.query(`
            UPDATE veiculos
            SET ativo = $1
            WHERE id = $2
            RETURNING *
        `, [req.body.ativo, req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Veículo não encontrado' });
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// MOTORISTAS
// ======================================================
app.get('/motoristas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT
                u.id, u.nome, u.login, u.email, u.tipo,
                u.email_verificado, u.id_veiculo,
                v.placa, v.frota, v.modelo,
                v.comprimento, v.largura, v.peso
            FROM usuarios u
            LEFT JOIN veiculos v ON v.id = u.id_veiculo
            WHERE u.tipo = 'motorista'
            ORDER BY u.nome ASC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// Cadastro antigo mantido por compatibilidade
app.post('/motoristas', autenticar, validar(schemas.motorista), async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const existe = await pool.query(`SELECT id FROM usuarios WHERE login = $1 LIMIT 1`, [req.body.login]);
        if (existe.rows.length) return res.status(400).json({ erro: 'Login já em uso' });

        const senhaHash = bcrypt.hashSync(req.body.senha, 10);
        const resultado = await pool.query(`
            INSERT INTO usuarios (nome,tipo,login,senha,email_verificado)
            VALUES ($1,'motorista',$2,$3,TRUE)
            RETURNING id,nome,login,tipo
        `, [req.body.nome, req.body.login, senhaHash]);

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// ROTAS ESPECÍFICAS / REUTILIZAÇÃO
// ======================================================

function arredondarRestricao(valor) {
    return Number(Number(valor).toFixed(2));
}

function gerarAssinaturaRestricoes({ comprimento, largura, altura, peso }) {
    return [
        arredondarRestricao(comprimento),
        arredondarRestricao(largura),
        arredondarRestricao(altura),
        arredondarRestricao(peso)
    ].join('|');
}

async function calcularRotaEspecificaORS({
    rotaBase,
    comprimento,
    largura,
    altura,
    peso,
    avoidPolygons = null
}) {
    const coords = rotaBase?.dados_geojson?.features?.[0]?.geometry?.coordinates;

    if (!Array.isArray(coords) || coords.length < 2) {
        throw new Error('A rota base não possui geometria válida');
    }

    const inicio = coords[0];
    const fim = coords[coords.length - 1];

    const response = await axios.post(
        'https://api.openrouteservice.org/v2/directions/driving-hgv/geojson',
        {
            coordinates: [
                [Number(inicio[0]), Number(inicio[1])],
                [Number(fim[0]), Number(fim[1])]
            ],
            preference: 'fastest',
            options: {
                profile_params: {
                    restrictions: {
                        height: arredondarRestricao(altura),
                        weight: arredondarRestricao(peso),
                        length: arredondarRestricao(comprimento),
                        width: arredondarRestricao(largura)
                    }
                },
                ...(avoidPolygons
                    ? { avoid_polygons: avoidPolygons }
                    : {})
            }
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ORS_API_KEY
            },
            timeout: 25000
        }
    );

    return response.data;
}

function analisarDesvioLongo(pontosGps, geojsonRota) {
    // Regra de validação:
    // considera "desvio longo" quando o veículo permanece a mais de 1 km
    // da rota específica por pelo menos 5 minutos.
    const LIMITE_KM = 1.0;
    const DURACAO_MINIMA_MS = 5 * 60 * 1000;

    let maxDesvio = 0;
    let inicioFora = null;
    let desvioLongo = false;

    for (const ponto of pontosGps) {
        const analise = analisarPosicaoNaRota(
            geojsonRota,
            Number(ponto.lat),
            Number(ponto.lon)
        );

        const d = Number(analise.distanciaRotaKm);

        if (Number.isFinite(d)) {
            maxDesvio = Math.max(maxDesvio, d);
        }

        if (Number.isFinite(d) && d > LIMITE_KM) {
            const momento = new Date(ponto.registrado_em).getTime();

            if (!inicioFora) inicioFora = momento;

            if (momento - inicioFora >= DURACAO_MINIMA_MS) {
                desvioLongo = true;
            }
        } else {
            inicioFora = null;
        }
    }

    return {
        desvioLongo,
        maxDesvioKm: Number(maxDesvio.toFixed(3)),
        limiteKm: LIMITE_KM,
        duracaoMinutos: 5
    };
}

// ======================================================
// CÁLCULOS DE MONITORAMENTO
// ======================================================
function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ======================================================
// ANTT — INFRAESTRUTURA OFICIAL
// ======================================================
const ANTT_CKAN_BASE = 'https://dados.antt.gov.br';
const ANTT_PACKAGE_SHOW =
    `${ANTT_CKAN_BASE}/api/3/action/package_show`;

const ANTT_DATASETS = {
    pontes: 'pontes-similares',
    altura: 'deteccao-de-altura'
};

const anttDatasetCache = new NodeCache({
    stdTTL: 6 * 60 * 60,
    checkperiod: 10 * 60
});

function semAcentoANTT(valor) {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function chaveANTT(valor) {
    return semAcentoANTT(valor)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizarRegistroANTT(registro) {
    const saida = {};
    for (const [k, v] of Object.entries(registro || {})) {
        saida[chaveANTT(k)] = v;
    }
    return saida;
}

function primeiroANTT(registro, ...nomes) {
    for (const nome of nomes) {
        const chave = chaveANTT(nome);
        if (
            Object.prototype.hasOwnProperty.call(registro, chave) &&
            registro[chave] !== null &&
            registro[chave] !== ''
        ) return registro[chave];
    }
    return null;
}

function numeroANTT(valor) {
    if (valor === null || valor === undefined) return null;
    let s = String(valor).trim();
    if (!s) return null;
    s = s.replace(/\s/g, '');

    if (s.includes(',') && !s.includes('.')) {
        s = s.replace(',', '.');
    } else if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    }

    s = s.replace(/[^0-9.+-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

async function consultarDatasetANTT(slug) {
    const cacheKey = `antt_dataset_${slug}`;
    const cache = anttDatasetCache.get(cacheKey);
    if (cache) return cache;

    const pacoteResp = await axios.get(
        ANTT_PACKAGE_SHOW,
        {
            params: { id: slug },
            headers: { 'User-Agent': 'GPS-Caminhao-ANTT/2.0' },
            timeout: 30000
        }
    );

    const pacote = pacoteResp.data;

    if (!pacote?.success || !pacote?.result) {
        throw new Error(`ANTT não retornou o dataset ${slug}`);
    }

    const recursos = Array.isArray(pacote.result.resources)
        ? pacote.result.resources
        : [];

    const candidatos = recursos
        .filter(r => {
            const nome = String(r.name || '').toLowerCase();
            const formato = String(r.format || '').toUpperCase();
            const url = String(r.url || '');

            if (!url || nome.includes('dicion')) return false;

            return (
                formato === 'JSON' ||
                formato === 'CSV' ||
                url.toLowerCase().endsWith('.json') ||
                url.toLowerCase().endsWith('.csv')
            );
        })
        .sort((a, b) => {
            const peso = r => {
                const formato = String(r.format || '').toUpperCase();
                const url = String(r.url || '').toLowerCase();
                if (formato === 'JSON') return 0;
                if (formato === 'CSV') return 1;
                if (url.endsWith('.json')) return 2;
                if (url.endsWith('.csv')) return 3;
                return 99;
            };
            return peso(a) - peso(b);
        });

    if (!candidatos.length) {
        throw new Error(`Nenhum recurso JSON/CSV no dataset ANTT ${slug}`);
    }

    const recurso = candidatos[0];

    const resp = await axios.get(
        recurso.url,
        {
            headers: { 'User-Agent': 'GPS-Caminhao-ANTT/2.0' },
            timeout: 90000,
            responseType: 'text',
            maxContentLength: 20 * 1024 * 1024
        }
    );

    let dados = resp.data;
    const formato = String(recurso.format || '').toUpperCase();
    const urlLower = String(recurso.url || '').toLowerCase();
    let registros = [];

    if (formato === 'JSON' || urlLower.includes('.json')) {
        if (typeof dados === 'string') dados = JSON.parse(dados);

        function coletarListas(obj, listas = []) {
            if (Array.isArray(obj)) {
                if (
                    obj.length &&
                    obj.every(x => x && typeof x === 'object' && !Array.isArray(x))
                ) listas.push(obj);

                for (const item of obj) coletarListas(item, listas);

            } else if (obj && typeof obj === 'object') {
                for (const valor of Object.values(obj)) {
                    coletarListas(valor, listas);
                }
            }
            return listas;
        }

        if (Array.isArray(dados)) {
            registros = dados;

        } else if (
            dados?.type === 'FeatureCollection' &&
            Array.isArray(dados.features)
        ) {
            registros = dados.features.map(feature => {
                const props = { ...(feature.properties || {}) };
                const coords = feature?.geometry?.coordinates;

                if (
                    Array.isArray(coords) &&
                    coords.length >= 2 &&
                    Number.isFinite(Number(coords[0])) &&
                    Number.isFinite(Number(coords[1]))
                ) {
                    props.longitude ??= Number(coords[0]);
                    props.latitude ??= Number(coords[1]);
                }

                return props;
            });

        } else {
            const listas = coletarListas(dados);
            listas.sort((a, b) => b.length - a.length);
            registros = listas[0] || [];
        }

    } else {
        const texto = String(dados || '').replace(/^\uFEFF/, '');
        const linhas = texto.split(/\r?\n/).filter(Boolean);

        if (linhas.length >= 2) {
            const primeira = linhas[0];
            const sep =
                (primeira.match(/;/g) || []).length >
                (primeira.match(/,/g) || []).length
                    ? ';'
                    : ',';

            function parseLinha(linha) {
                const campos = [];
                let atual = '';
                let aspas = false;

                for (let i = 0; i < linha.length; i++) {
                    const c = linha[i];

                    if (c === '"') {
                        if (aspas && linha[i + 1] === '"') {
                            atual += '"';
                            i++;
                        } else {
                            aspas = !aspas;
                        }
                    } else if (c === sep && !aspas) {
                        campos.push(atual);
                        atual = '';
                    } else {
                        atual += c;
                    }
                }

                campos.push(atual);
                return campos;
            }

            const cab = parseLinha(linhas[0]);

            registros = linhas.slice(1).map(linha => {
                const vals = parseLinha(linha);
                const obj = {};
                cab.forEach((k, i) => obj[k] = vals[i] ?? '');
                return obj;
            });
        }
    }

    if (!registros.length) {
        throw new Error(`ANTT ${slug}: recurso sem registros reconhecidos`);
    }

    const resultado = {
        titulo: pacote.result.title,
        recurso: recurso.name,
        registros
    };

    anttDatasetCache.set(cacheKey, resultado);

    console.log(`✅ ANTT ${slug}: ${registros.length} registro(s) carregados`);

    return resultado;
}

function prepararPonteANTT(original) {
    const r = normalizarRegistroANTT(original);

    const rodovia = primeiroANTT(
        r,
        'no_rodovia_entrada',
        'rodovia_uf_entrada',
        'rodovia',
        'br'
    );

    return {
        categoria: 'PONTE_SIMILAR',
        tipo: String(primeiroANTT(
            r,
            'ds_tipo_ponte_similares',
            'tipo_de_ponte_e_similares',
            'tipo_de_ponte',
            'tipo'
        ) || ''),
        nome: String(primeiroANTT(
            r,
            'no_ponte_similares',
            'nome_de_ponte_e_similares',
            'nome_de_ponte',
            'nome'
        ) || ''),
        concessionaria: String(primeiroANTT(
            r,
            'no_concessionaria',
            'concessionaria'
        ) || ''),
        rodovia: String(rodovia || ''),
        km: String(primeiroANTT(
            r,
            'nu_km_inicial_entrada',
            'km_m_entrada',
            'km_entrada',
            'km_m',
            'km'
        ) || ''),
        sentido: String(primeiroANTT(
            r,
            'ds_sentido_entrada',
            'sentido_entrada',
            'sentido'
        ) || ''),
        latitude: numeroANTT(primeiroANTT(
            r,
            'cg_latitude_inicial_entrada',
            'latitude_entrada',
            'latitude',
            'lat'
        )),
        longitude: numeroANTT(primeiroANTT(
            r,
            'cg_longitude_inicial_entrada',
            'longitude_entrada',
            'longitude',
            'lon',
            'lng'
        )),
        original
    };
}

function prepararDeteccaoAlturaANTT(original) {
    const r = normalizarRegistroANTT(original);
    const tipo = String(primeiroANTT(
        r,
        'tipo_de_equipamento',
        'tipo_equipamento',
        'tipo'
    ) || '');

    return {
        categoria: 'DETECCAO_ALTURA',
        tipo,
        nome: tipo,
        concessionaria: String(primeiroANTT(r, 'concessionaria') || ''),
        rodovia: String(primeiroANTT(r, 'rodovia', 'br') || ''),
        km: String(primeiroANTT(r, 'km_m', 'km') || ''),
        sentido: String(primeiroANTT(r, 'sentido') || ''),
        latitude: numeroANTT(primeiroANTT(r, 'latitude', 'lat')),
        longitude: numeroANTT(primeiroANTT(r, 'longitude', 'lon', 'lng')),
        original
    };
}

function hashFonteANTT(registro) {
    const base = [
        registro.categoria,
        registro.tipo,
        registro.nome,
        registro.rodovia,
        registro.km,
        registro.latitude,
        registro.longitude,
        registro.concessionaria
    ].join('|');

    let hash = 2166136261;
    for (let i = 0; i < base.length; i++) {
        hash ^= base.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

async function carregarInfraestruturaANTT() {
    const [pontesDataset, alturaDataset] =
        await Promise.all([
            consultarDatasetANTT(ANTT_DATASETS.pontes),
            consultarDatasetANTT(ANTT_DATASETS.altura)
        ]);

    const pontes = pontesDataset.registros
        .map(prepararPonteANTT)
        .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

    const deteccaoAltura = alturaDataset.registros
        .map(prepararDeteccaoAlturaANTT)
        .filter(r =>
            Number.isFinite(r.latitude) &&
            Number.isFinite(r.longitude) &&
            semAcentoANTT(r.tipo).toLowerCase().includes('altura')
        );

    return {
        pontes,
        deteccaoAltura,
        datasets: {
            pontes: pontesDataset.titulo,
            altura: alturaDataset.titulo
        }
    };
}

// ======================================================
// BASE GLOBAL VALIDADA + MOTOR DE SEGURANÇA
// ======================================================

// ======================================================
// APROVAÇÃO FORMAL / AUDITORIA
// ======================================================
async function registrarAuditoriaViagem({
    client = pool,
    idViagem,
    usuario = null,
    acao,
    statusAnterior = null,
    statusNovo = null,
    detalhes = {},
    req = null
}) {
    try {
        await client.query(`
            INSERT INTO auditoria_viagens
            (
                id_viagem,
                id_usuario,
                tipo_usuario,
                acao,
                status_anterior,
                status_novo,
                detalhes,
                ip,
                user_agent
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
        `, [
            idViagem,
            usuario?.id || null,
            usuario?.tipo || null,
            acao,
            statusAnterior,
            statusNovo,
            JSON.stringify(detalhes || {}),
            req?.ip || null,
            req?.headers?.['user-agent'] || null
        ]);
    } catch (erro) {
        // Auditoria não deve derrubar o fluxo principal por falha isolada.
        console.error('⚠️ Falha ao registrar auditoria:', erro.message);
    }
}


// ======================================================
// V18 - MONITORAMENTO DE SEGURANÇA EM TEMPO REAL
// ======================================================

// ======================================================
// V19 - INTELIGÊNCIA / MEMÓRIA OPERACIONAL
// ======================================================

async function obterMediaConsumoHistorica({ idVeiculo, idRota, client = pool }) {
    const r = await client.query(`
        SELECT
            AVG(consumo_real_km_l) AS media_geral,
            AVG(consumo_real_km_l) FILTER (
                WHERE criado_em >= CURRENT_TIMESTAMP - INTERVAL '30 days'
            ) AS media_30_dias,
            COUNT(*)::int AS viagens_total
        FROM historico_consumo_viagens
        WHERE id_veiculo = $1 AND id_rota = $2
    `, [idVeiculo, idRota]);

    const row = r.rows[0] || {};

    return {
        media_geral: row.media_geral !== null ? Number(row.media_geral) : null,
        media_30_dias: row.media_30_dias !== null ? Number(row.media_30_dias) : null,
        viagens_total: Number(row.viagens_total || 0)
    };
}

async function registrarConsumoRealViagem({
    viagem,
    consumoRealKmL,
    client = pool,
    usuario = null,
    req = null
}) {
    const consumo = Number(consumoRealKmL);

    if (!Number.isFinite(consumo) || consumo <= 0 || consumo > 20) {
        throw new Error('Média de consumo inválida. Informe em km/L.');
    }

    const distanciaKm = Number(viagem.distancia_estimada_km || 0);
    const combustivelReal = distanciaKm > 0 ? distanciaKm / consumo : null;
    const precoRef = Number(viagem.preco_combustivel_ref || 0);
    const custoReal =
        combustivelReal !== null && precoRef > 0
            ? combustivelReal * precoRef
            : null;

    const previstoKmL = Number(viagem.consumo_medio_km_l || 0);
    const variacao =
        previstoKmL > 0
            ? ((consumo - previstoKmL) / previstoKmL) * 100
            : null;

    const hist = await obterMediaConsumoHistorica({
        idVeiculo: viagem.id_veiculo,
        idRota: viagem.id_rota,
        client
    });

    const referencia =
        hist.media_30_dias ||
        hist.media_geral ||
        (previstoKmL > 0 ? previstoKmL : null);

    const desvioRef =
        referencia
            ? ((consumo - Number(referencia)) / Number(referencia)) * 100
            : null;

    const anormal =
        desvioRef !== null &&
        desvioRef <= -15;

    await client.query(`
        UPDATE viagens
        SET
            consumo_real_km_l = $1,
            combustivel_real_l = $2,
            custo_combustivel_real = $3,
            variacao_consumo_percentual = $4,
            consumo_anormal = $5,
            consumo_informado_em = CURRENT_TIMESTAMP,
            consumo_informado_por = $6
        WHERE id = $7
    `, [
        consumo,
        combustivelReal,
        custoReal,
        variacao,
        anormal,
        usuario?.id || null,
        viagem.id
    ]);

    await client.query(`
        INSERT INTO historico_consumo_viagens
        (
            id_viagem,id_veiculo,id_rota,distancia_km,
            consumo_real_km_l,combustivel_real_l,custo_real,
            consumo_previsto_km_l,combustivel_previsto_l,
            variacao_percentual,consumo_anormal
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id_viagem)
        DO UPDATE SET
            distancia_km = EXCLUDED.distancia_km,
            consumo_real_km_l = EXCLUDED.consumo_real_km_l,
            combustivel_real_l = EXCLUDED.combustivel_real_l,
            custo_real = EXCLUDED.custo_real,
            consumo_previsto_km_l = EXCLUDED.consumo_previsto_km_l,
            combustivel_previsto_l = EXCLUDED.combustivel_previsto_l,
            variacao_percentual = EXCLUDED.variacao_percentual,
            consumo_anormal = EXCLUDED.consumo_anormal
    `, [
        viagem.id,
        viagem.id_veiculo,
        viagem.id_rota,
        distanciaKm || null,
        consumo,
        combustivelReal,
        custoReal,
        previstoKmL || null,
        viagem.combustivel_estimado_l || null,
        variacao,
        anormal
    ]);

    await registrarAuditoriaViagem({
        client,
        idViagem: viagem.id,
        usuario,
        acao: anormal ? 'CONSUMO_REAL_ANORMAL' : 'CONSUMO_REAL_INFORMADO',
        statusAnterior: null,
        statusNovo: anormal ? 'consumo_anormal' : 'consumo_ok',
        detalhes: {
            consumo_real_km_l: consumo,
            consumo_previsto_km_l: previstoKmL || null,
            combustivel_real_l: combustivelReal,
            combustivel_previsto_l: viagem.combustivel_estimado_l || null,
            variacao_percentual: variacao,
            media_historica_referencia: referencia,
            desvio_referencia_percentual: desvioRef
        },
        req
    });

    return {
        consumo_real_km_l: consumo,
        combustivel_real_l:
            combustivelReal !== null ? Number(combustivelReal.toFixed(1)) : null,
        custo_combustivel_real:
            custoReal !== null ? Number(custoReal.toFixed(2)) : null,
        variacao_percentual:
            variacao !== null ? Number(variacao.toFixed(1)) : null,
        consumo_anormal: anormal,
        media_historica_referencia:
            referencia !== null ? Number(Number(referencia).toFixed(2)) : null,
        desvio_referencia_percentual:
            desvioRef !== null ? Number(desvioRef.toFixed(1)) : null
    };
}

function assinaturaConfigOperacional({
    comprimento,
    largura,
    altura,
    peso
}) {
    // Agrupa configurações equivalentes para reaproveitar histórico.
    const c = Math.round(Number(comprimento || 0) * 2) / 2;
    const l = Math.round(Number(largura || 0) * 20) / 20;
    const a = Math.round(Number(altura || 0) * 20) / 20;
    const p = Math.round(Number(peso || 0) / 2) * 2;

    return `C${c}|L${l}|A${a}|P${p}`;
}

function calcularScoreMemoria(memoria) {
    const total = Number(memoria?.viagens_total || 0);
    const boas = Number(memoria?.viagens_sem_ocorrencia || 0);
    const desvios = Number(memoria?.viagens_com_desvio || 0);
    const incidentes = Number(memoria?.incidentes_total || 0);

    if (total <= 0) return 55;

    const taxaBoa = boas / total;

    let score =
        45 +
        taxaBoa * 35 +
        Math.min(15, total * 2) -
        Math.min(15, desvios * 3) -
        Math.min(20, incidentes * 5);

    return Math.max(
        0,
        Math.min(
            100,
            Math.round(score)
        )
    );
}

async function obterMemoriaOperacional({
    idRota,
    assinatura,
    client = pool
}) {
    const r = await client.query(`
        SELECT *
        FROM memoria_rotas_operacionais
        WHERE id_rota = $1
          AND assinatura_config = $2
        LIMIT 1
    `, [
        idRota,
        assinatura
    ]);

    return r.rows[0] || null;
}

async function calcularEstimativaViagem({
    idRota,
    geojson,
    comprimento,
    largura,
    altura,
    peso,
    consumoKmL,
    precoLitro,
    client = pool
}) {
    const assinatura =
        assinaturaConfigOperacional({
            comprimento,
            largura,
            altura,
            peso
        });

    const memoria =
        await obterMemoriaOperacional({
            idRota,
            assinatura,
            client
        });

    const resumo =
        resumoGeoJsonRota(
            geojson
        );

    const distanciaKm =
        resumo.distancia_m > 0
            ? resumo.distancia_m / 1000
            : 0;

    let duracaoMin =
        resumo.duracao_s > 0
            ? resumo.duracao_s / 60
            : null;

    // Quando já existe histórico real, dá peso ao tempo real da frota.
    if (
        memoria &&
        Number(memoria.duracao_media_min) > 0
    ) {
        duracaoMin =
            duracaoMin
                ? (
                    duracaoMin * 0.55 +
                    Number(memoria.duracao_media_min) * 0.45
                )
                : Number(memoria.duracao_media_min);
    }

    const consumo =
        Number(consumoKmL);

    const combustivelL =
        distanciaKm > 0 &&
        Number.isFinite(consumo) &&
        consumo > 0
            ? distanciaKm / consumo
            : null;

    const preco =
        Number(precoLitro);

    const custo =
        combustivelL !== null &&
        Number.isFinite(preco) &&
        preco > 0
            ? combustivelL * preco
            : null;

    const score =
        memoria
            ? calcularScoreMemoria(memoria)
            : 55;

    return {
        assinatura_config:
            assinatura,

        distancia_estimada_km:
            distanciaKm > 0
                ? Number(
                    distanciaKm.toFixed(1)
                )
                : null,

        duracao_estimada_min:
            duracaoMin !== null
                ? Number(
                    duracaoMin.toFixed(0)
                )
                : null,

        combustivel_estimado_l:
            combustivelL !== null
                ? Number(
                    combustivelL.toFixed(1)
                )
                : null,

        custo_combustivel_estimado:
            custo !== null
                ? Number(
                    custo.toFixed(2)
                )
                : null,

        score_rota:
            score,

        memoria: memoria
            ? {
                viagens_total:
                    Number(memoria.viagens_total || 0),
                viagens_sem_ocorrencia:
                    Number(memoria.viagens_sem_ocorrencia || 0),
                viagens_com_desvio:
                    Number(memoria.viagens_com_desvio || 0),
                incidentes_total:
                    Number(memoria.incidentes_total || 0),
                duracao_media_min:
                    memoria.duracao_media_min !== null
                        ? Number(memoria.duracao_media_min)
                        : null,
                combustivel_medio_l:
                    memoria.combustivel_medio_l !== null
                        ? Number(memoria.combustivel_medio_l)
                        : null,
                score_confiabilidade:
                    Number(memoria.score_confiabilidade || score),
                ultima_viagem_em:
                    memoria.ultima_viagem_em || null
            }
            : {
                viagens_total:0,
                viagens_sem_ocorrencia:0,
                viagens_com_desvio:0,
                incidentes_total:0,
                score_confiabilidade:55
            }
    };
}

async function salvarEstimativaInteligenciaViagem({
    viagemId,
    idRota,
    geojson,
    comprimento,
    largura,
    altura,
    peso,
    consumoKmL,
    precoLitro,
    client = pool
}) {
    const estimativa =
        await calcularEstimativaViagem({
            idRota,
            geojson,
            comprimento,
            largura,
            altura,
            peso,
            consumoKmL,
            precoLitro,
            client
        });

    await client.query(`
        UPDATE viagens
        SET
            distancia_estimada_km = $1,
            duracao_estimada_min = $2,
            combustivel_estimado_l = $3,
            custo_combustivel_estimado = $4,
            score_rota = $5,
            memoria_rota_snapshot = $6::jsonb
        WHERE id = $7
    `, [
        estimativa.distancia_estimada_km,
        estimativa.duracao_estimada_min,
        estimativa.combustivel_estimado_l,
        estimativa.custo_combustivel_estimado,
        estimativa.score_rota,
        JSON.stringify(estimativa),
        viagemId
    ]);

    return estimativa;
}

async function atualizarMemoriaAposConclusao({
    viagem,
    validacao,
    client = pool
}) {
    const veiculoResult =
        await client.query(`
            SELECT
                comprimento,
                largura,
                peso,
                consumo_medio_km_l
            FROM veiculos
            WHERE id = $1
            LIMIT 1
        `, [
            viagem.id_veiculo
        ]);

    const veiculo =
        veiculoResult.rows[0];

    if (!veiculo) return;

    const assinatura =
        assinaturaConfigOperacional({
            comprimento:
                veiculo.comprimento,
            largura:
                veiculo.largura,
            altura:
                viagem.altura_total,
            peso:
                viagem.peso_total ||
                veiculo.peso
        });

    const duracaoRealMin =
        viagem.saida_real
            ? Math.max(
                0,
                (
                    Date.now() -
                    new Date(
                        viagem.saida_real
                    ).getTime()
                ) / 60000
            )
            : null;

    const reportesResult =
        await client.query(`
            SELECT COUNT(*)::int AS total
            FROM incidentes
            WHERE id_motorista = $1
              AND criado_em >= COALESCE(
                    $2::timestamptz,
                    CURRENT_TIMESTAMP - INTERVAL '2 days'
                  )
              AND criado_em <= CURRENT_TIMESTAMP
        `, [
            viagem.id_motorista,
            viagem.saida_real
        ]);

    const incidentes =
        Number(
            reportesResult.rows[0]?.total || 0
        );

    const semOcorrencia =
        !validacao.desvioLongo &&
        incidentes === 0;

    const combustivelEstimado =
        Number(
            viagem.combustivel_real_l ||
            viagem.combustivel_estimado_l
        );

    const anterior =
        await obterMemoriaOperacional({
            idRota:
                viagem.id_rota,
            assinatura,
            client
        });

    const totalAnterior =
        Number(anterior?.viagens_total || 0);

    const novaDuracaoMedia =
        duracaoRealMin !== null
            ? (
                (
                    Number(anterior?.duracao_media_min || 0) *
                    totalAnterior
                ) +
                duracaoRealMin
            ) /
            (totalAnterior + 1)
            : Number(
                anterior?.duracao_media_min || 0
            ) || null;

    const novoCombMedio =
        Number.isFinite(combustivelEstimado) &&
        combustivelEstimado > 0
            ? (
                (
                    Number(anterior?.combustivel_medio_l || 0) *
                    totalAnterior
                ) +
                combustivelEstimado
            ) /
            (totalAnterior + 1)
            : Number(
                anterior?.combustivel_medio_l || 0
            ) || null;

    const novaMemoria = {
        viagens_total:
            totalAnterior + 1,

        viagens_sem_ocorrencia:
            Number(
                anterior?.viagens_sem_ocorrencia || 0
            ) +
            (semOcorrencia ? 1 : 0),

        viagens_com_desvio:
            Number(
                anterior?.viagens_com_desvio || 0
            ) +
            (validacao.desvioLongo ? 1 : 0),

        incidentes_total:
            Number(
                anterior?.incidentes_total || 0
            ) +
            incidentes
    };

    const score =
        calcularScoreMemoria(
            novaMemoria
        );

    await client.query(`
        INSERT INTO memoria_rotas_operacionais
        (
            id_rota,
            assinatura_config,
            comprimento,
            largura,
            altura,
            peso,
            viagens_total,
            viagens_sem_ocorrencia,
            viagens_com_desvio,
            incidentes_total,
            duracao_media_min,
            combustivel_medio_l,
            score_confiabilidade,
            ultima_viagem_em,
            atualizada_em
        )
        VALUES
        (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,
            $11,$12,$13,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT
            (id_rota, assinatura_config)
        DO UPDATE SET
            viagens_total =
                EXCLUDED.viagens_total,
            viagens_sem_ocorrencia =
                EXCLUDED.viagens_sem_ocorrencia,
            viagens_com_desvio =
                EXCLUDED.viagens_com_desvio,
            incidentes_total =
                EXCLUDED.incidentes_total,
            duracao_media_min =
                EXCLUDED.duracao_media_min,
            combustivel_medio_l =
                EXCLUDED.combustivel_medio_l,
            score_confiabilidade =
                EXCLUDED.score_confiabilidade,
            ultima_viagem_em =
                CURRENT_TIMESTAMP,
            atualizada_em =
                CURRENT_TIMESTAMP
    `, [
        viagem.id_rota,
        assinatura,
        veiculo.comprimento,
        veiculo.largura,
        viagem.altura_total,
        viagem.peso_total ||
            veiculo.peso,
        novaMemoria.viagens_total,
        novaMemoria.viagens_sem_ocorrencia,
        novaMemoria.viagens_com_desvio,
        novaMemoria.incidentes_total,
        novaDuracaoMedia,
        novoCombMedio,
        score
    ]);

    // Registra evidência operacional de passagem
    // somente por restrições globais próximas da rota aprovada.
    const restricoes =
        await buscarRestricoesValidadasAtivas(
            client
        );

    const geojson =
        viagem.rota_aprovada_geojson ||
        viagem.rota_especifica_geojson;

    if (geojson) {
        for (const r of restricoes) {
            const analise =
                analisarPosicaoNaRota(
                    geojson,
                    Number(r.lat),
                    Number(r.lng)
                );

            const raioKm =
                Math.max(
                    0.05,
                    Number(
                        r.raio_metros || 180
                    ) / 1000
                );

            if (
                analise.distanciaRotaKm !== null &&
                Number(
                    analise.distanciaRotaKm
                ) <= raioKm
            ) {
                await client.query(`
                    INSERT INTO passagens_restricoes
                    (
                        id_restricao,
                        id_viagem,
                        id_veiculo,
                        comprimento,
                        largura,
                        altura,
                        peso,
                        passou_sem_ocorrencia
                    )
                    VALUES
                    ($1,$2,$3,$4,$5,$6,$7,$8)
                    ON CONFLICT
                        (id_restricao, id_viagem)
                    DO NOTHING
                `, [
                    r.id,
                    viagem.id,
                    viagem.id_veiculo,
                    veiculo.comprimento,
                    veiculo.largura,
                    viagem.altura_total,
                    viagem.peso_total ||
                        veiculo.peso,
                    semOcorrencia
                ]);
            }
        }
    }
}


function distanciaHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = v => Number(v) * Math.PI / 180;

    const dLat = rad(Number(lat2) - Number(lat1));
    const dLon = rad(Number(lon2) - Number(lon1));

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat1)) *
        Math.cos(rad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(a));
}

function resumoGeoJsonRota(geojson) {
    const props = geojson?.features?.[0]?.properties || {};
    const segmento = props?.segments?.[0] || {};
    const summary = props?.summary || {};

    return {
        distancia_m:
            Number(summary.distance) ||
            Number(segmento.distance) ||
            0,
        duracao_s:
            Number(summary.duration) ||
            Number(segmento.duration) ||
            0
    };
}

async function calcularVelocidadeMediaRecente(idViagem, client = pool) {
    const r = await client.query(`
        SELECT lat, lon, registrado_em
        FROM historico_localizacoes
        WHERE id_viagem = $1
          AND registrado_em > CURRENT_TIMESTAMP - INTERVAL '10 minutes'
        ORDER BY registrado_em DESC
        LIMIT 12
    `, [idViagem]);

    if (r.rows.length < 2) return null;

    let distanciaKm = 0;

    for (let i = 1; i < r.rows.length; i++) {
        distanciaKm += distanciaHaversineKm(
            Number(r.rows[i - 1].lat),
            Number(r.rows[i - 1].lon),
            Number(r.rows[i].lat),
            Number(r.rows[i].lon)
        );
    }

    const novo = new Date(r.rows[0].registrado_em).getTime();
    const antigo = new Date(r.rows[r.rows.length - 1].registrado_em).getTime();
    const horas = Math.max(1 / 3600, (novo - antigo) / 3600000);
    const kmh = distanciaKm / horas;

    return Number.isFinite(kmh)
        ? Math.max(0, Math.min(140, kmh))
        : null;
}

async function atualizarEstadoDesvioTempoReal({
    viagem,
    lat,
    lon,
    client = pool,
    usuario = null,
    req = null
}) {
    const geojson =
        viagem.rota_aprovada_geojson ||
        viagem.dados_geojson;

    if (!geojson) return null;

    const analise = analisarPosicaoNaRota(
        geojson,
        Number(lat),
        Number(lon)
    );

    const distancia = Number(analise.distanciaRotaKm);
    const progresso = Number(analise.progresso || 0);

    if (!Number.isFinite(distancia)) return null;

    const anterior = viagem.estado_monitoramento || 'normal';
    let novoEstado = anterior;
    let desvioInicio = viagem.desvio_inicio_em || null;

    if (distancia > 0.5) {
        if (!desvioInicio) {
            desvioInicio = new Date();
        } else {
            const persistencia =
                Date.now() - new Date(desvioInicio).getTime();

            if (
                persistencia >= 90000 &&
                anterior !== 'fora_rota'
            ) {
                novoEstado = 'fora_rota';

                await registrarAuditoriaViagem({
                    client,
                    idViagem: viagem.id,
                    usuario,
                    acao: 'SAIU_DA_ROTA',
                    statusAnterior: anterior,
                    statusNovo: novoEstado,
                    detalhes: {
                        distancia_rota_km:
                            Number(distancia.toFixed(3)),
                        persistencia_segundos:
                            Math.round(persistencia / 1000)
                    },
                    req
                });
            }
        }

    } else if (
        distancia <= 0.2 &&
        anterior === 'fora_rota'
    ) {
        novoEstado = 'normal';
        desvioInicio = null;

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.id,
            usuario,
            acao: 'RETORNOU_A_ROTA',
            statusAnterior: anterior,
            statusNovo: novoEstado,
            detalhes: {
                distancia_rota_km:
                    Number(distancia.toFixed(3))
            },
            req
        });

    } else if (distancia <= 0.3) {
        desvioInicio = null;

        if (
            !['gps_offline','revisao_obrigatoria']
                .includes(anterior)
        ) {
            novoEstado = 'normal';
        }
    }

    await client.query(`
        UPDATE viagens
        SET
            estado_monitoramento = $1,
            desvio_inicio_em = $2,
            ultima_distancia_rota_km = $3,
            ultimo_progresso = $4,
            gps_offline_desde = NULL
        WHERE id = $5
    `, [
        novoEstado,
        desvioInicio,
        distancia,
        progresso,
        viagem.id
    ]);

    return {
        distancia_rota_km: distancia,
        progresso,
        estado: novoEstado
    };
}

async function revalidarAprovacaoViagem({
    viagem,
    client = pool,
    usuario = null,
    req = null
}) {
    if (
        viagem.status !== 'planejada' ||
        viagem.status_aprovacao !== 'aprovada'
    ) {
        return { alterada:false };
    }

    const ultima =
        viagem.ultima_revalidacao_em
            ? new Date(viagem.ultima_revalidacao_em).getTime()
            : 0;

    if (ultima && Date.now() - ultima < 60000) {
        return { alterada:false };
    }

    const atual = await obterViagemParaAprovacao(
        viagem.id,
        client,
        false
    );

    if (!atual) return { alterada:false };

    const versaoAtual = Number(atual.rota_especifica_versao || 0);
    const versaoAprovada = Number(atual.versao_rota_aprovada || 0);

    let motivo = null;

    if (
        atual.id_rota_especifica_aprovada &&
        atual.id_rota_especifica &&
        Number(atual.id_rota_especifica_aprovada) !==
            Number(atual.id_rota_especifica)
    ) {
        motivo =
            'A rota específica vinculada à viagem mudou após a aprovação.';

    } else if (
        versaoAprovada > 0 &&
        versaoAtual > 0 &&
        versaoAprovada !== versaoAtual
    ) {
        motivo =
            `A rota mudou da versão ${versaoAprovada} para ${versaoAtual}.`;
    }

    const check = await checarSegurancaFormalViagem(
        {
            ...atual,
            dados_geojson:
                atual.rota_aprovada_geojson ||
                atual.dados_geojson
        },
        client
    );

    if (!check.liberada) {
        motivo =
            'Nova restrição global validada tornou a rota aprovada incompatível.';
    }

    if (motivo) {
        await client.query(`
            UPDATE viagens
            SET
                status_aprovacao = 'revisao_obrigatoria',
                liberacao_rota = 'bloqueada',
                estado_monitoramento = 'revisao_obrigatoria',
                aprovacao_invalidada_em = CURRENT_TIMESTAMP,
                motivo_invalidacao_aprovacao = $1,
                ultima_revalidacao_em = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [
            motivo,
            viagem.id
        ]);

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.id,
            usuario,
            acao: 'APROVACAO_INVALIDADA',
            statusAnterior: 'aprovada',
            statusNovo: 'revisao_obrigatoria',
            detalhes: {
                motivo,
                versao_rota_aprovada: versaoAprovada,
                versao_rota_atual: versaoAtual,
                checagem: check
            },
            req
        });

        return {
            alterada:true,
            motivo
        };
    }

    await client.query(`
        UPDATE viagens
        SET ultima_revalidacao_em = CURRENT_TIMESTAMP
        WHERE id = $1
    `, [viagem.id]);

    return { alterada:false };
}

async function processarGpsOfflineMonitoramento(viagens, req) {
    const agora = Date.now();

    for (const v of viagens) {
        if (v.status !== 'em_andamento') continue;

        const ultima =
            v.ultima_atualizacao
                ? new Date(v.ultima_atualizacao).getTime()
                : 0;

        const offline =
            !ultima ||
            agora - ultima > 5 * 60 * 1000;

        if (
            offline &&
            v.estado_monitoramento !== 'gps_offline'
        ) {
            await pool.query(`
                UPDATE viagens
                SET
                    estado_monitoramento = 'gps_offline',
                    gps_offline_desde =
                        COALESCE(gps_offline_desde, CURRENT_TIMESTAMP)
                WHERE id = $1
            `, [v.id]);

            await registrarAuditoriaViagem({
                idViagem: v.id,
                usuario: req.usuario,
                acao: 'GPS_OFFLINE',
                statusAnterior:
                    v.estado_monitoramento || 'normal',
                statusNovo: 'gps_offline',
                detalhes: {
                    ultima_atualizacao:
                        v.ultima_atualizacao || null
                },
                req
            });
        }
    }
}


async function obterViagemParaAprovacao(idViagem, client = pool, lock = false) {
    const result = await client.query(`
        SELECT
            vg.*,
            v.placa,
            v.frota,
            v.modelo,
            v.comprimento,
            v.largura,
            COALESCE(vg.peso_total, v.peso) AS peso_operacional,
            r.nome AS rota_nome,
            r.origem,
            r.destino,
            COALESCE(re.dados_geojson, r.dados_geojson) AS dados_geojson,
            re.versao AS rota_especifica_versao
        FROM viagens vg
        JOIN veiculos v ON v.id = vg.id_veiculo
        JOIN rotas r ON r.id = vg.id_rota
        LEFT JOIN rotas_especificas re
            ON re.id = vg.id_rota_especifica
        WHERE vg.id = $1
        LIMIT 1
        ${lock ? 'FOR UPDATE OF vg' : ''}
    `, [idViagem]);

    return result.rows[0] || null;
}

async function checarSegurancaFormalViagem(viagem, client = pool) {
    if (!viagem?.dados_geojson) {
        throw new Error('Viagem sem geometria para pré-checagem.');
    }

    return preChecarRotaSegura({
        geojson: viagem.dados_geojson,
        comprimento: viagem.comprimento,
        largura: viagem.largura,
        altura: viagem.altura_total,
        peso: viagem.peso_operacional,
        client
    });
}


function valorPositivoOuNulo(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function restricaoIncompativelComVeiculo(restricao, veiculo) {
    const motivos = [];

    const altura = Number(veiculo.altura);
    const largura = Number(veiculo.largura);
    const comprimento = Number(veiculo.comprimento);
    const peso = Number(veiculo.peso);

    if (
        valorPositivoOuNulo(restricao.limite_altura) !== null &&
        Number.isFinite(altura) &&
        altura > Number(restricao.limite_altura)
    ) {
        motivos.push(
            `altura ${altura.toFixed(2)} m > ${Number(restricao.limite_altura).toFixed(2)} m`
        );
    }

    if (
        valorPositivoOuNulo(restricao.limite_largura) !== null &&
        Number.isFinite(largura) &&
        largura > Number(restricao.limite_largura)
    ) {
        motivos.push(
            `largura ${largura.toFixed(2)} m > ${Number(restricao.limite_largura).toFixed(2)} m`
        );
    }

    if (
        valorPositivoOuNulo(restricao.limite_comprimento) !== null &&
        Number.isFinite(comprimento) &&
        comprimento > Number(restricao.limite_comprimento)
    ) {
        motivos.push(
            `comprimento ${comprimento.toFixed(2)} m > ${Number(restricao.limite_comprimento).toFixed(2)} m`
        );
    }

    if (
        valorPositivoOuNulo(restricao.limite_peso) !== null &&
        Number.isFinite(peso) &&
        peso > Number(restricao.limite_peso)
    ) {
        motivos.push(
            `peso ${peso.toFixed(2)} t > ${Number(restricao.limite_peso).toFixed(2)} t`
        );
    }

    const tipo = String(restricao.tipo || '').toLowerCase();

    if (
        ['proibicao_caminhao','acesso_restrito'].includes(tipo)
    ) {
        motivos.push('acesso validado como proibido/restrito para caminhão');
    }

    return {
        incompativel: motivos.length > 0,
        motivos
    };
}

async function buscarRestricoesValidadasAtivas(client = pool) {
    const result = await client.query(`
        SELECT *
        FROM restricoes_validadas
        WHERE ativa = TRUE
          AND (valida_ate IS NULL OR valida_ate > CURRENT_TIMESTAMP)
        ORDER BY validado_em DESC
    `);

    return result.rows;
}

async function preChecarRotaSegura({
    geojson,
    comprimento,
    largura,
    altura,
    peso,
    client = pool
}) {
    const restricoes = await buscarRestricoesValidadasAtivas(client);

    const veiculo = {
        comprimento: Number(comprimento),
        largura: Number(largura),
        altura: Number(altura),
        peso: Number(peso)
    };

    const encontradas = [];

    for (const r of restricoes) {
        const analise = analisarPosicaoNaRota(
            geojson,
            Number(r.lat),
            Number(r.lng)
        );

        if (
            analise.distanciaRotaKm === null ||
            !Number.isFinite(Number(analise.distanciaRotaKm))
        ) continue;

        const raioKm = Math.max(
            0.05,
            Number(r.raio_metros || 180) / 1000
        );

        if (Number(analise.distanciaRotaKm) > raioKm) continue;

        const comp = restricaoIncompativelComVeiculo(r, veiculo);

        encontradas.push({
            ...r,
            distancia_rota_km: Number(
                Number(analise.distanciaRotaKm).toFixed(3)
            ),
            incompativel: comp.incompativel,
            motivos: comp.motivos
        });
    }

    const incompativeis = encontradas.filter(x => x.incompativel);

    return {
        liberada: incompativeis.length === 0,
        total_validadas_proximas: encontradas.length,
        incompativeis,
        compatíveis_ou_informativas:
            encontradas.filter(x => !x.incompativel)
    };
}

function poligonoQuadradoAoRedor(lng, lat, raioMetros = 220) {
    const dLat = raioMetros / 111320;
    const dLng = raioMetros / (
        111320 * Math.max(0.2, Math.cos(Number(lat) * Math.PI / 180))
    );

    return [[
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat]
    ]];
}

function montarAvoidPolygons(restricoes) {
    const polygons = (restricoes || []).map(r =>
        poligonoQuadradoAoRedor(
            Number(r.lng),
            Number(r.lat),
            Math.max(180, Number(r.raio_metros || 180))
        )
    );

    if (!polygons.length) return null;

    return {
        type: 'MultiPolygon',
        coordinates: polygons
    };
}


function analisarPosicaoNaRota(geojson, lat, lon) {
    const coords = geojson?.features?.[0]?.geometry?.coordinates || [];
    if (!coords.length) return { distanciaRotaKm: null, progresso: 0, indice: -1 };

    let menor = Infinity;
    let melhor = 0;
    let total = 0;
    const acumulado = [0];

    for (let i = 1; i < coords.length; i++) {
        total += distanciaKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
        acumulado[i] = total;
    }

    for (let i = 0; i < coords.length; i++) {
        const d = distanciaKm(lat, lon, coords[i][1], coords[i][0]);
        if (d < menor) {
            menor = d;
            melhor = i;
        }
    }

    return {
        distanciaRotaKm: menor,
        progresso: total > 0 ? Math.min(1, acumulado[melhor] / total) : 0,
        indice: melhor
    };
}

// ======================================================
// ROTAS
// ======================================================
app.post('/rotas', autenticar, validar(schemas.rota), async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            INSERT INTO rotas
                (nome,origem,destino,restricoes,dados_geojson,id_motorista,id_veiculo,status)
            VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,NULL,NULL,'pendente')
            RETURNING id
        `, [
            req.body.nome,
            req.body.origem,
            req.body.destino,
            JSON.stringify(req.body.restricoes || {}),
            JSON.stringify(req.body.dados_geojson)
        ]);

        res.status(201).json({
            mensagem: 'Rota salva na biblioteca!',
            id: resultado.rows[0].id
        });
    } catch (erro) {
        console.error('❌ Criar rota:', erro);
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/rotas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT r.*, v.placa, v.frota, v.modelo,
                   v.comprimento, v.largura, v.peso,
                   u.nome AS motorista
            FROM rotas r
            LEFT JOIN veiculos v ON v.id = r.id_veiculo
            LEFT JOIN usuarios u ON u.id = r.id_motorista
            ORDER BY r.criada_em DESC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/motorista/diagnostico-viagem', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const usuario = await pool.query(`
            SELECT id, nome, login, id_veiculo
            FROM usuarios
            WHERE id = $1
            LIMIT 1
        `, [req.usuario.id]);

        const user = usuario.rows[0];

        if (!user) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        let veiculo = null;
        let viagens = [];

        if (user.id_veiculo) {
            const v = await pool.query(`
                SELECT id, placa, frota, modelo, ativo
                FROM veiculos
                WHERE id = $1
                LIMIT 1
            `, [user.id_veiculo]);

            veiculo = v.rows[0] || null;

            const vg = await pool.query(`
                SELECT
                    id,
                    id_rota,
                    id_veiculo,
                    status,
                    saida_prevista,
                    saida_real,
                    chegada_prevista
                FROM viagens
                WHERE id_veiculo = $1
                ORDER BY id DESC
                LIMIT 10
            `, [user.id_veiculo]);

            viagens = vg.rows;
        }

        res.json({
            motorista: user,
            veiculo,
            viagens,
            viagem_ativa: viagens.find(v =>
                ['planejada', 'em_andamento'].includes(v.status)
            ) || null
        });

    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/rotas/minha-rota', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const usuario = await pool.query(`
            SELECT id, id_veiculo
            FROM usuarios
            WHERE id = $1
            LIMIT 1
        `, [req.usuario.id]);

        const user = usuario.rows[0];

        if (!user) {
            return res.status(404).json({
                erro: 'Usuário não encontrado'
            });
        }

        if (!user.id_veiculo) {
            return res.json({
                disponivel: false,
                codigo: 'SEM_VEICULO',
                mensagem:
                    'Este motorista ainda não possui um veículo vinculado.'
            });
        }

        /*
         * A rota não é mais atribuída diretamente ao veículo.
         * Quem recebe o veículo é a VIAGEM.
         *
         * Fluxo:
         * motorista -> id_veiculo -> viagens -> rota base/específica
         */
        const resultado = await pool.query(`
            SELECT
                r.id,
                r.nome,
                r.origem,
                r.destino,
                r.restricoes,

                COALESCE(
                    vg.rota_aprovada_geojson,
                    re.dados_geojson,
                    r.dados_geojson
                ) AS dados_geojson,

                r.criada_em,

                vg.id AS viagem_id,
                vg.status AS viagem_status,
                vg.carga,
                vg.altura_total,
                vg.peso_total,
                vg.saida_prevista,
                vg.saida_real,
                vg.chegada_prevista,
                vg.chegada_real,
                vg.rota_reutilizada,
                vg.id_rota_especifica,
                vg.liberacao_rota,
                vg.checagem_seguranca,
                vg.status_aprovacao,
                vg.aprovado_em,
                vg.versao_aprovacao,
                vg.distancia_estimada_km,
                vg.duracao_estimada_min,
                vg.combustivel_estimado_l,
                vg.custo_combustivel_estimado,
                vg.score_rota,
                vg.consumo_real_km_l,
                vg.combustivel_real_l,
                vg.custo_combustivel_real,
                vg.variacao_consumo_percentual,
                vg.consumo_anormal,

                v.id AS veiculo_id,
                v.placa,
                v.frota,
                v.modelo,
                v.comprimento,
                v.largura,
                v.peso AS peso_veiculo

            FROM viagens vg

            JOIN rotas r
                ON r.id = vg.id_rota

            JOIN veiculos v
                ON v.id = vg.id_veiculo

            LEFT JOIN rotas_especificas re
                ON re.id = vg.id_rota_especifica

            WHERE vg.id_veiculo = $1
              AND vg.status IN ('planejada', 'em_andamento')
              AND COALESCE(vg.liberacao_rota, 'liberada') <> 'bloqueada'
              AND COALESCE(vg.status_aprovacao, 'aguardando_aprovacao') = 'aprovada'

            ORDER BY
                CASE
                    WHEN vg.status = 'em_andamento' THEN 0
                    ELSE 1
                END,
                vg.saida_prevista ASC NULLS LAST,
                vg.id DESC

            LIMIT 1
        `, [user.id_veiculo]);

        if (!resultado.rows.length) {
            /*
             * Diagnóstico operacional:
             * procura uma viagem ativa mesmo que ainda não esteja liberada.
             * Assim o app sabe se está aguardando aprovação, bloqueada,
             * em revisão ou realmente não existe viagem.
             */
            const diagnostico = await pool.query(`
                SELECT
                    vg.id AS viagem_id,
                    vg.status AS viagem_status,
                    vg.liberacao_rota,
                    vg.status_aprovacao,
                    vg.motivo_invalidacao_aprovacao,
                    vg.saida_prevista,
                    r.nome AS rota_nome,
                    r.origem,
                    r.destino,
                    v.placa,
                    v.frota
                FROM viagens vg
                JOIN rotas r
                    ON r.id = vg.id_rota
                JOIN veiculos v
                    ON v.id = vg.id_veiculo
                WHERE vg.id_veiculo = $1
                  AND vg.status IN ('planejada','em_andamento')
                ORDER BY
                    CASE
                        WHEN vg.status = 'em_andamento' THEN 0
                        ELSE 1
                    END,
                    vg.saida_prevista ASC NULLS LAST,
                    vg.id DESC
                LIMIT 1
            `, [user.id_veiculo]);

            if (!diagnostico.rows.length) {
                return res.json({
                    disponivel: false,
                    codigo: 'SEM_VIAGEM',
                    mensagem:
                        'Nenhuma viagem ativa foi encontrada para este veículo.'
                });
            }

            const v = diagnostico.rows[0];
            const aprovacao =
                v.status_aprovacao ||
                'aguardando_aprovacao';

            const liberacao =
                v.liberacao_rota ||
                'liberada';

            if (
                aprovacao === 'revisao_obrigatoria'
            ) {
                return res.json({
                    disponivel: false,
                    codigo: 'REVISAO_OBRIGATORIA',
                    mensagem:
                        'A viagem precisa ser revisada e aprovada novamente pelo gestor.',
                    detalhe:
                        v.motivo_invalidacao_aprovacao ||
                        'A aprovação anterior perdeu a validade.',
                    viagem: v
                });
            }

            if (
                liberacao === 'bloqueada' ||
                aprovacao === 'bloqueada'
            ) {
                return res.json({
                    disponivel: false,
                    codigo: 'VIAGEM_BLOQUEADA',
                    mensagem:
                        'Esta viagem está bloqueada pelo gestor ou pela verificação de segurança.',
                    detalhe:
                        v.motivo_invalidacao_aprovacao ||
                        null,
                    viagem: v
                });
            }

            if (
                aprovacao === 'aguardando_aprovacao'
            ) {
                return res.json({
                    disponivel: false,
                    codigo: 'AGUARDANDO_APROVACAO',
                    mensagem:
                        'A viagem foi criada, mas ainda aguarda aprovação do gestor.',
                    viagem: v
                });
            }

            return res.json({
                disponivel: false,
                codigo: 'ROTA_INDISPONIVEL',
                mensagem:
                    'A viagem existe, mas ainda não está disponível para navegação.',
                viagem: v
            });
        }

        res.json({
            disponivel: true,
            ...resultado.rows[0]
        });

    } catch (erro) {
        console.error('❌ Minha rota:', erro);

        res.status(500).json({
            erro: erro.message
        });
    }
});

app.patch('/rotas/:id/status', autenticar, validar(schemas.status), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const usuario = await pool.query(`SELECT id_veiculo FROM usuarios WHERE id = $1`, [req.usuario.id]);
        const idVeiculo = usuario.rows[0]?.id_veiculo || null;

        const resultado = await pool.query(`
            UPDATE rotas
            SET status = $1
            WHERE id = $2
              AND (
                    id_motorista = $3
                    OR ($4::INTEGER IS NOT NULL AND id_veiculo = $4)
                  )
        `, [req.body.status, req.params.id, req.usuario.id, idVeiculo]);

        if (!resultado.rowCount) return res.status(404).json({ erro: 'Rota não encontrada' });
        res.json({ mensagem: 'Status atualizado' });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// VIAGENS
// ======================================================

async function finalizarSegurancaNovaViagem({
    client,
    viagem,
    rotaGeoJson,
    comprimento,
    largura,
    altura,
    peso
}) {
    const check = await preChecarRotaSegura({
        geojson: rotaGeoJson,
        comprimento,
        largura,
        altura,
        peso,
        client
    });

    const liberacao =
        check.liberada
            ? 'liberada'
            : 'bloqueada';

    const statusAprovacao =
        check.liberada
            ? 'aguardando_aprovacao'
            : 'bloqueada';

    await client.query(`
        UPDATE viagens
        SET
            liberacao_rota = $1,
            checagem_seguranca = $2::jsonb,
            status_aprovacao = $3,
            aprovado_por = NULL,
            aprovado_em = NULL,
            snapshot_seguranca_aprovado = '{}'::jsonb
        WHERE id = $4
    `, [
        liberacao,
        JSON.stringify(check),
        statusAprovacao,
        viagem.id
    ]);

    return {
        liberacao_rota: liberacao,
        status_aprovacao: statusAprovacao,
        checagem_seguranca: check
    };
}

app.post('/viagens', autenticar, validar(schemas.novaViagem), async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const rotaResult = await client.query(`
            SELECT id, nome, origem, destino, dados_geojson
            FROM rotas
            WHERE id = $1
            LIMIT 1
        `, [req.body.id_rota]);

        if (!rotaResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Rota base não encontrada' });
        }

        const rotaBase = rotaResult.rows[0];

        const veiculoResult = await client.query(`
            SELECT
                id, placa, frota, modelo,
                comprimento, largura, peso,
                consumo_medio_km_l,
                tipo_combustivel,
                preco_combustivel_ref,
                ativo
            FROM veiculos
            WHERE id = $1
            LIMIT 1
        `, [req.body.id_veiculo]);

        if (!veiculoResult.rows.length || !veiculoResult.rows[0].ativo) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                erro: 'Veículo não encontrado ou inativo'
            });
        }

        const veiculo = veiculoResult.rows[0];

        const comprimento = Number(veiculo.comprimento);
        const largura = Number(veiculo.largura);
        const altura = Number(req.body.altura_total);
        const peso = Number(req.body.peso_total || veiculo.peso);

        if (![comprimento, largura, altura, peso].every(v => Number.isFinite(v) && v > 0)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                erro: 'Comprimento, largura, altura e peso precisam ser válidos'
            });
        }

        const viagemAtiva = await client.query(`
            SELECT id
            FROM viagens
            WHERE id_veiculo = $1
              AND status IN ('planejada','em_andamento')
            LIMIT 1
        `, [req.body.id_veiculo]);

        if (viagemAtiva.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                erro: 'Este veículo já possui uma viagem ativa ou planejada'
            });
        }

        const assinatura = gerarAssinaturaRestricoes({
            comprimento,
            largura,
            altura,
            peso
        });

        // 1. Primeiro procura uma rota específica já VALIDADA.
        const cacheResult = await client.query(`
            SELECT *
            FROM rotas_especificas
            WHERE id_rota_base = $1
              AND assinatura = $2
              AND reutilizavel = TRUE
              AND bloqueada = FALSE
              AND (valida_ate IS NULL OR valida_ate > CURRENT_TIMESTAMP)
            ORDER BY nivel_confianca = 'confiavel' DESC, validada_em DESC NULLS LAST
            LIMIT 1
        `, [req.body.id_rota, assinatura]);

        let rotaEspecifica;
        let rotaReutilizada = false;

        if (cacheResult.rows.length) {
            rotaEspecifica = cacheResult.rows[0];

            const checkCache = await preChecarRotaSegura({
                geojson: rotaEspecifica.dados_geojson,
                comprimento,
                largura,
                altura,
                peso,
                client
            });

            // Uma nova restrição global pode invalidar uma rota antes confiável.
            if (!checkCache.liberada) {
                await client.query(`
                    UPDATE rotas_especificas
                    SET
                        bloqueada = TRUE,
                        motivo_bloqueio = $1
                    WHERE id = $2
                `, [
                    'Restrição global validada incompatível detectada na pré-checagem.',
                    rotaEspecifica.id
                ]);

                // Força o fluxo de cálculo de uma rota nova.
                rotaEspecifica = null;
                rotaReutilizada = false;
            } else {
                rotaReutilizada = true;
            }

            if (rotaEspecifica) {
                await client.query(`
                    UPDATE rotas_especificas
                    SET ultima_utilizacao = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [rotaEspecifica.id]);

                console.log(
                    `♻️ Rota específica reutilizada: base=${req.body.id_rota} assinatura=${assinatura}`
                );
            }

        }

        if (!rotaEspecifica) {
            // 2. Não existe rota validada segura: calcula uma específica no ORS.
            await client.query('COMMIT');
            client.release();

            let geojsonEspecifico;

            try {
                geojsonEspecifico = await calcularRotaEspecificaORS({
                    rotaBase,
                    comprimento,
                    largura,
                    altura,
                    peso
                });

                // Pré-checagem global antes de salvar a rota definitiva.
                let precheckInicial = await preChecarRotaSegura({
                    geojson: geojsonEspecifico,
                    comprimento,
                    largura,
                    altura,
                    peso
                });

                // Se houver restrição VALIDADA incompatível, tenta contornar no ORS.
                if (!precheckInicial.liberada && precheckInicial.incompativeis.length) {
                    const avoidPolygons =
                        montarAvoidPolygons(precheckInicial.incompativeis);

                    if (avoidPolygons) {
                        console.log(
                            `🛡️ ${precheckInicial.incompativeis.length} restrição(ões) validada(s) incompatível(is). Tentando rota alternativa.`
                        );

                        geojsonEspecifico = await calcularRotaEspecificaORS({
                            rotaBase,
                            comprimento,
                            largura,
                            altura,
                            peso,
                            avoidPolygons
                        });
                    }
                }
            } catch (erroORS) {
                console.error('❌ ORS rota específica:', erroORS.response?.data || erroORS.message);
                return res.status(502).json({
                    erro: 'Não foi possível calcular a rota específica do veículo',
                    detalhe: erroORS.response?.data || erroORS.message
                });
            }

            const client2 = await pool.connect();

            try {
                await client2.query('BEGIN');

                const insertEspecifica = await client2.query(`
                    INSERT INTO rotas_especificas
                    (
                        id_rota_base,
                        comprimento,
                        largura,
                        altura,
                        peso,
                        assinatura,
                        dados_geojson,
                        reutilizavel,
                        nivel_confianca,
                        bloqueada,
                        ultima_utilizacao
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,FALSE,'teste',FALSE,CURRENT_TIMESTAMP)

                    ON CONFLICT (id_rota_base, assinatura)
                    DO UPDATE SET
                        dados_geojson = EXCLUDED.dados_geojson,
                        reutilizavel = FALSE,
                        nivel_confianca = 'teste',
                        bloqueada = FALSE,
                        motivo_bloqueio = NULL,
                        valida_ate = NULL,
                        ultima_utilizacao = CURRENT_TIMESTAMP,
                        versao = COALESCE(rotas_especificas.versao, 1) + 1

                    RETURNING *
                `, [
                    req.body.id_rota,
                    arredondarRestricao(comprimento),
                    arredondarRestricao(largura),
                    arredondarRestricao(altura),
                    arredondarRestricao(peso),
                    assinatura,
                    JSON.stringify(geojsonEspecifico)
                ]);

                rotaEspecifica = insertEspecifica.rows[0];

                const motoristaAtual = await client2.query(`
                    SELECT id
                    FROM usuarios
                    WHERE tipo = 'motorista'
                      AND id_veiculo = $1
                    LIMIT 1
                `, [req.body.id_veiculo]);

                const duracaoSeg =
                    Number(rotaEspecifica.dados_geojson?.features?.[0]?.properties?.segments?.[0]?.duration) || 0;

                const saidaPrevista = req.body.saida_prevista
                    ? new Date(req.body.saida_prevista)
                    : new Date();

                const chegadaPrevista =
                    new Date(saidaPrevista.getTime() + duracaoSeg * 1000);

                const viagem = await client2.query(`
                    INSERT INTO viagens
                    (
                        id_rota,
                        id_rota_especifica,
                        id_veiculo,
                        id_motorista,
                        carga,
                        altura_total,
                        peso_total,
                        status,
                        saida_prevista,
                        chegada_prevista,
                        rota_reutilizada
                    )
                    VALUES
                    ($1,$2,$3,$4,$5,$6,$7,'planejada',$8,$9,FALSE)
                    RETURNING *
                `, [
                    req.body.id_rota,
                    rotaEspecifica.id,
                    req.body.id_veiculo,
                    motoristaAtual.rows[0]?.id || null,
                    req.body.carga || null,
                    altura,
                    peso,
                    saidaPrevista,
                    chegadaPrevista
                ]);

                const seguranca = await finalizarSegurancaNovaViagem({
                    client: client2,
                    viagem: viagem.rows[0],
                    rotaGeoJson: rotaEspecifica.dados_geojson,
                    comprimento,
                    largura,
                    altura,
                    peso
                });

                const inteligencia = await salvarEstimativaInteligenciaViagem({
                    viagemId: viagem.rows[0].id,
                    idRota: req.body.id_rota,
                    geojson: rotaEspecifica.dados_geojson,
                    comprimento,
                    largura,
                    altura,
                    peso,
                    consumoKmL: veiculo.consumo_medio_km_l,
                    precoLitro: veiculo.preco_combustivel_ref,
                    client: client2
                });

                await registrarAuditoriaViagem({
                    client: client2,
                    idViagem: viagem.rows[0].id,
                    usuario: req.usuario,
                    acao: 'VIAGEM_CRIADA',
                    statusAnterior: null,
                    statusNovo: seguranca.status_aprovacao,
                    detalhes: {
                        rota_especifica_id: rotaEspecifica.id,
                        rota_reutilizada: false,
                        liberacao_rota: seguranca.liberacao_rota,
                        checagem_seguranca: seguranca.checagem_seguranca
                    },
                    req
                });

                await client2.query('COMMIT');

                return res.status(201).json({
                    mensagem:
                        seguranca.liberacao_rota === 'liberada'
                            ? 'Viagem criada e pré-checagem de segurança aprovada'
                            : 'Viagem criada, mas BLOQUEADA por restrição validada incompatível',
                    viagem: {
                        ...viagem.rows[0],
                        ...seguranca,
                        ...inteligencia
                    },
                    seguranca,
                    inteligencia,
                    rota_especifica: {
                        id: rotaEspecifica.id,
                        reutilizada: false,
                        reutilizavel: false,
                        assinatura
                    }
                });

            } catch (erro2) {
                await client2.query('ROLLBACK');
                console.error('❌ Salvar rota específica/viagem:', erro2);
                return res.status(500).json({ erro: erro2.message });
            } finally {
                client2.release();
            }
        }

        // Fluxo de rota específica reutilizada.
        const motoristaAtual = await client.query(`
            SELECT id
            FROM usuarios
            WHERE tipo = 'motorista'
              AND id_veiculo = $1
            LIMIT 1
        `, [req.body.id_veiculo]);

        const duracaoSeg =
            Number(rotaEspecifica.dados_geojson?.features?.[0]?.properties?.segments?.[0]?.duration) || 0;

        const saidaPrevista = req.body.saida_prevista
            ? new Date(req.body.saida_prevista)
            : new Date();

        const chegadaPrevista =
            new Date(saidaPrevista.getTime() + duracaoSeg * 1000);

        const viagem = await client.query(`
            INSERT INTO viagens
            (
                id_rota,
                id_rota_especifica,
                id_veiculo,
                id_motorista,
                carga,
                altura_total,
                peso_total,
                status,
                saida_prevista,
                chegada_prevista,
                rota_reutilizada
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,'planejada',$8,$9,$10)
            RETURNING *
        `, [
            req.body.id_rota,
            rotaEspecifica.id,
            req.body.id_veiculo,
            motoristaAtual.rows[0]?.id || null,
            req.body.carga || null,
            altura,
            peso,
            saidaPrevista,
            chegadaPrevista,
            rotaReutilizada
        ]);

        const seguranca = await finalizarSegurancaNovaViagem({
            client,
            viagem: viagem.rows[0],
            rotaGeoJson: rotaEspecifica.dados_geojson,
            comprimento,
            largura,
            altura,
            peso
        });

        const inteligencia = await salvarEstimativaInteligenciaViagem({
            viagemId: viagem.rows[0].id,
            idRota: req.body.id_rota,
            geojson: rotaEspecifica.dados_geojson,
            comprimento,
            largura,
            altura,
            peso,
            consumoKmL: veiculo.consumo_medio_km_l,
            precoLitro: veiculo.preco_combustivel_ref,
            client
        });

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.rows[0].id,
            usuario: req.usuario,
            acao: 'VIAGEM_CRIADA',
            statusAnterior: null,
            statusNovo: seguranca.status_aprovacao,
            detalhes: {
                rota_especifica_id: rotaEspecifica.id,
                rota_reutilizada: true,
                liberacao_rota: seguranca.liberacao_rota,
                checagem_seguranca: seguranca.checagem_seguranca
            },
            req
        });

        await client.query('COMMIT');

        res.status(201).json({
            mensagem:
                seguranca.liberacao_rota === 'liberada'
                    ? 'Viagem criada usando rota específica validada e segura'
                    : 'Viagem criada, mas BLOQUEADA por restrição validada incompatível',
            viagem: {
                ...viagem.rows[0],
                ...seguranca,
                ...inteligencia
            },
            seguranca,
            inteligencia,
            rota_especifica: {
                id: rotaEspecifica.id,
                reutilizada: true,
                reutilizavel: true,
                assinatura
            }
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(e) {}
        console.error('❌ Criar viagem:', erro);
        res.status(500).json({ erro: erro.message });
    } finally {
        try { client.release(); } catch(e) {}
    }
});


// ======================================================
// ADMIN - RETIRAR ROTA/VIAGEM ATUAL DE UM VEÍCULO
// Mantém o registro no histórico e remove a viagem da lista ativa.
// ======================================================
app.post('/viagens/:id/retirar-veiculo', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const idViagem = Number(req.params.id);
    if (!Number.isInteger(idViagem) || idViagem <= 0) {
        return res.status(400).json({ erro: 'ID da viagem inválido' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const atual = await client.query(`
            SELECT
                vg.id,
                vg.id_rota,
                vg.id_veiculo,
                vg.id_motorista,
                vg.status,
                v.placa,
                v.frota
            FROM viagens vg
            JOIN veiculos v ON v.id = vg.id_veiculo
            WHERE vg.id = $1
            FOR UPDATE OF vg
        `, [idViagem]);

        if (!atual.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        const viagem = atual.rows[0];

        if (!['planejada', 'em_andamento'].includes(viagem.status)) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                erro: 'Esta viagem não está ativa',
                status: viagem.status
            });
        }

        // "Retirar a rota" significa cancelar a viagem operacional.
        // Não apagamos a viagem nem o histórico/GPS.
        const atualizado = await client.query(`
            UPDATE viagens
            SET
                status = 'cancelada',
                chegada_real = CASE
                    WHEN status = 'em_andamento'
                        THEN COALESCE(chegada_real, CURRENT_TIMESTAMP)
                    ELSE chegada_real
                END,
                estado_monitoramento = 'normal'
            WHERE id = $1
            RETURNING *
        `, [idViagem]);

        await registrarAuditoriaViagem({
            client,
            idViagem,
            usuario: req.usuario,
            acao: 'ROTA_RETIRADA_DO_VEICULO',
            statusAnterior: viagem.status,
            statusNovo: 'cancelada',
            detalhes: {
                id_veiculo: viagem.id_veiculo,
                id_motorista: viagem.id_motorista,
                placa: viagem.placa,
                frota: viagem.frota,
                motivo: 'Rota retirada manualmente pelo gestor'
            },
            req
        });

        // Só volta a rota base para pendente se não existir outra viagem
        // ativa usando a mesma rota.
        await client.query(`
            UPDATE rotas r
            SET status = 'pendente'
            WHERE r.id = $1
              AND NOT EXISTS (
                    SELECT 1
                    FROM viagens vg
                    WHERE vg.id_rota = r.id
                      AND vg.id <> $2
                      AND vg.status IN ('planejada', 'em_andamento')
              )
        `, [viagem.id_rota, idViagem]);

        await client.query('COMMIT');

        return res.json({
            sucesso: true,
            mensagem: `Rota retirada do veículo ${viagem.placa}`,
            viagem: atualizado.rows[0]
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch (_) {}

        console.error('❌ Retirar rota do veículo:', erro);

        return res.status(500).json({
            erro: 'Erro ao retirar rota do veículo',
            detalhes: erro.message
        });
    } finally {
        client.release();
    }
});

app.post('/viagens/:id/iniciar', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            UPDATE viagens vg
            SET status = 'em_andamento',
                id_motorista = $1,
                saida_real = COALESCE(saida_real, CURRENT_TIMESTAMP)
            FROM usuarios u
            WHERE vg.id = $2
              AND u.id = $1
              AND u.id_veiculo = vg.id_veiculo
              AND vg.status IN ('planejada','em_andamento')
              AND COALESCE(vg.liberacao_rota, 'liberada') <> 'bloqueada'
              AND COALESCE(vg.status_aprovacao, 'aguardando_aprovacao') = 'aprovada'
            RETURNING vg.*
        `, [req.usuario.id, req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Viagem não encontrada para este veículo' });

        await pool.query(`
            UPDATE rotas SET status = 'em_andamento'
            WHERE id = $1
        `, [resultado.rows[0].id_rota]);

        await registrarAuditoriaViagem({
            idViagem: resultado.rows[0].id,
            usuario: req.usuario,
            acao: 'VIAGEM_INICIADA',
            statusAnterior: 'planejada',
            statusNovo: 'em_andamento',
            detalhes: {
                versao_aprovacao: resultado.rows[0].versao_aprovacao
            },
            req
        });

        res.json({ mensagem: 'Viagem iniciada', viagem: resultado.rows[0] });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});


app.post('/viagens/:id/consumo-real', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro:'Acesso negado' });
    }

    const consumo = Number(req.body?.consumo_real_km_l);

    if (!Number.isFinite(consumo) || consumo <= 0) {
        return res.status(400).json({
            erro:'Informe a média real da viagem em km/L.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const r = await client.query(`
            SELECT
                vg.*,
                v.consumo_medio_km_l,
                v.preco_combustivel_ref,
                v.tipo_combustivel
            FROM viagens vg
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN usuarios u
              ON u.id = $1
             AND u.id_veiculo = vg.id_veiculo
            WHERE vg.id = $2
              AND vg.status IN ('em_andamento','concluida')
            LIMIT 1
            FOR UPDATE OF vg
        `, [req.usuario.id, req.params.id]);

        if (!r.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro:'Viagem não encontrada.' });
        }

        const resultado = await registrarConsumoRealViagem({
            viagem: r.rows[0],
            consumoRealKmL: consumo,
            client,
            usuario: req.usuario,
            req
        });

        await client.query('COMMIT');

        res.json({
            mensagem:
                resultado.consumo_anormal
                    ? 'Consumo registrado, abaixo do padrão histórico.'
                    : 'Consumo real registrado.',
            consumo: resultado
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        res.status(500).json({ erro:erro.message });
    } finally {
        client.release();
    }
});


function avaliarQualidadeGpsViagem(pontos = []) {
    if (!Array.isArray(pontos) || pontos.length < 2) {
        return { status:'ruim', score:20, total_pontos:pontos?.length || 0, precisao_media_m:null, maior_gap_seg:null, gaps_relevantes:0, saltos_anormais:0 };
    }
    let somaPrecisao=0, nPrecisao=0, maiorGap=0, gaps=0, saltos=0, distancia=0;
    for (let i=0;i<pontos.length;i++) {
        const p=pontos[i];
        const pr=Number(p.precisao_m);
        if (Number.isFinite(pr) && pr >= 0) { somaPrecisao += pr; nPrecisao++; }
        if (i===0) continue;
        const ant=pontos[i-1];
        const dt=Math.max(0,(new Date(p.registrado_em)-new Date(ant.registrado_em))/1000);
        if (dt>maiorGap) maiorGap=dt;
        if (dt>90) gaps++;
        const d=distanciaKmEntrePontos(Number(ant.lat),Number(ant.lon),Number(p.lat),Number(p.lon));
        if (Number.isFinite(d) && d>=0 && d<20) distancia += d;
        const velCalc=dt>0 ? d/(dt/3600) : 0;
        if ((Number.isFinite(d) && d>2 && dt<60) || velCalc>180) saltos++;
    }
    const precisaoMedia=nPrecisao ? somaPrecisao/nPrecisao : null;
    let score=100;
    if (pontos.length < 10) score -= 20;
    if (precisaoMedia !== null) {
        if (precisaoMedia > 100) score -= 35;
        else if (precisaoMedia > 50) score -= 20;
        else if (precisaoMedia > 25) score -= 8;
    } else score -= 10;
    score -= Math.min(35, gaps*8);
    if (maiorGap>300) score -= 15;
    score -= Math.min(30, saltos*15);
    score=Math.max(0,Math.min(100,Math.round(score)));
    return {
        status: score>=80 ? 'boa' : score>=55 ? 'instavel' : 'ruim',
        score, total_pontos:pontos.length,
        precisao_media_m: precisaoMedia===null ? null : Number(precisaoMedia.toFixed(1)),
        maior_gap_seg:Math.round(maiorGap), gaps_relevantes:gaps, saltos_anormais:saltos,
        distancia_gps_km:Number(distancia.toFixed(2))
    };
}

app.post('/viagens/:id/concluir', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const viagemResult = await client.query(`
            SELECT
                vg.*,
                re.dados_geojson AS rota_especifica_geojson,
                re.reutilizavel,
                v.consumo_medio_km_l,
                v.preco_combustivel_ref,
                v.tipo_combustivel
            FROM viagens vg
            LEFT JOIN rotas_especificas re
                ON re.id = vg.id_rota_especifica
            JOIN veiculos v
                ON v.id = vg.id_veiculo
            JOIN usuarios u
                ON u.id = $1
               AND u.id_veiculo = vg.id_veiculo
            WHERE vg.id = $2
              AND vg.status = 'em_andamento'
            LIMIT 1
            FOR UPDATE OF vg
        `, [req.usuario.id, req.params.id]);

        if (!viagemResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                erro: 'Viagem em andamento não encontrada'
            });
        }

        const viagem = viagemResult.rows[0];

        const historico = await client.query(`
            SELECT lat, lon, registrado_em, precisao_m, velocidade_kmh
            FROM historico_localizacoes
            WHERE id_viagem = $1
            ORDER BY registrado_em ASC
        `, [viagem.id]);

        let validacao = {
            desvioLongo: false,
            maxDesvioKm: 0,
            limiteKm: 1,
            duracaoMinutos: 5
        };

        if (
            viagem.id_rota_especifica &&
            viagem.rota_especifica_geojson &&
            historico.rows.length >= 2
        ) {
            validacao = analisarDesvioLongo(
                historico.rows,
                viagem.rota_especifica_geojson
            );
        }

        const rotaPodeSerValidada =
            Boolean(viagem.id_rota_especifica) &&
            !validacao.desvioLongo;

        const qualidadeGps = avaliarQualidadeGpsViagem(historico.rows);

        await client.query(`
            UPDATE viagens
            SET
                status = 'concluida',
                chegada_real = CURRENT_TIMESTAMP,
                max_desvio_km = $1,
                desvio_longo = $2,
                rota_validada = $3,
                qualidade_gps = $4,
                qualidade_gps_score = $5
            WHERE id = $6
        `, [
            validacao.maxDesvioKm,
            validacao.desvioLongo,
            rotaPodeSerValidada,
            qualidadeGps.status,
            qualidadeGps.score,
            viagem.id
        ]);

        await client.query(`
            UPDATE rotas
            SET status = 'concluida'
            WHERE id = $1
        `, [viagem.id_rota]);

        if (viagem.id_rota_especifica) {
            if (rotaPodeSerValidada) {
                await client.query(`
                    UPDATE rotas_especificas
                    SET
                        reutilizavel = TRUE,
                        validada_em = COALESCE(validada_em, CURRENT_TIMESTAMP),
                        valida_ate = CURRENT_TIMESTAMP + INTERVAL '60 days',
                        viagens_concluidas = viagens_concluidas + 1,
                        nivel_confianca =
                            CASE
                                WHEN (viagens_concluidas + 1 - COALESCE(viagens_com_desvio,0)) >= 3
                                    THEN 'confiavel'
                                ELSE 'validada'
                            END,
                        max_desvio_validacao_km =
                            GREATEST(COALESCE(max_desvio_validacao_km,0), $1),
                        ultima_utilizacao = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [
                    validacao.maxDesvioKm,
                    viagem.id_rota_especifica
                ]);
            } else {
                await client.query(`
                    UPDATE rotas_especificas
                    SET
                        viagens_concluidas = viagens_concluidas + 1,
                        viagens_com_desvio = viagens_com_desvio + 1,
                        falhas_validacao = falhas_validacao + 1,
                        reutilizavel = FALSE,
                        nivel_confianca = 'revisao',
                        valida_ate = NULL,
                        max_desvio_validacao_km =
                            GREATEST(COALESCE(max_desvio_validacao_km,0), $1),
                        ultima_utilizacao = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [
                    validacao.maxDesvioKm,
                    viagem.id_rota_especifica
                ]);
            }
        }

        let consumoRealResultado = null;

        if (
            req.body?.consumo_real_km_l !== undefined &&
            req.body?.consumo_real_km_l !== null &&
            req.body?.consumo_real_km_l !== ''
        ) {
            consumoRealResultado =
                await registrarConsumoRealViagem({
                    viagem,
                    consumoRealKmL: Number(req.body.consumo_real_km_l),
                    client,
                    usuario: req.usuario,
                    req
                });

            viagem.consumo_real_km_l =
                consumoRealResultado.consumo_real_km_l;

            viagem.combustivel_real_l =
                consumoRealResultado.combustivel_real_l;
        }

        await atualizarMemoriaAposConclusao({
            viagem,
            validacao,
            client
        });

        const ocorrenciasResult = await client.query(`
            SELECT COUNT(*)::int AS total
            FROM reportes
            WHERE id_viagem = $1
        `, [viagem.id]);

        const inicioReal = viagem.saida_real ? new Date(viagem.saida_real) : null;
        const fimReal = new Date();
        const duracaoRealMin = inicioReal ? Math.max(0, Math.round((fimReal - inicioReal)/60000)) : null;
        const resumoOperacional = {
            versao: 1,
            gerado_em: fimReal.toISOString(),
            distancia_planejada_km: viagem.distancia_estimada_km !== null ? Number(viagem.distancia_estimada_km) : null,
            distancia_gps_km: qualidadeGps.distancia_gps_km,
            duracao_prevista_min: viagem.duracao_estimada_min !== null ? Number(viagem.duracao_estimada_min) : null,
            duracao_real_min: duracaoRealMin,
            consumo_previsto_km_l: viagem.consumo_medio_km_l !== null ? Number(viagem.consumo_medio_km_l) : null,
            consumo_real_km_l: consumoRealResultado?.consumo_real_km_l ?? null,
            combustivel_previsto_l: viagem.combustivel_estimado_l !== null ? Number(viagem.combustivel_estimado_l) : null,
            combustivel_real_l: consumoRealResultado?.combustivel_real_l ?? null,
            desvio_longo: Boolean(validacao.desvioLongo),
            max_desvio_km: Number(validacao.maxDesvioKm || 0),
            ocorrencias: Number(ocorrenciasResult.rows[0]?.total || 0),
            qualidade_gps: qualidadeGps
        };

        await client.query(`
            UPDATE viagens
            SET resumo_operacional = $1::jsonb
            WHERE id = $2
        `, [JSON.stringify(resumoOperacional), viagem.id]);

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.id,
            usuario: req.usuario,
            acao: 'VIAGEM_CONCLUIDA',
            statusAnterior: 'em_andamento',
            statusNovo: 'concluida',
            detalhes: {
                rota_validada: rotaPodeSerValidada,
                max_desvio_km: validacao.maxDesvioKm,
                desvio_longo: validacao.desvioLongo
            },
            req
        });

        await client.query('COMMIT');

        res.json({
            mensagem: rotaPodeSerValidada
                ? 'Viagem concluída. A rota específica foi validada para reutilização.'
                : 'Viagem concluída. A rota específica não foi liberada para reutilização.',
            validacao_rota: {
                reutilizavel: rotaPodeSerValidada,
                desvio_longo: validacao.desvioLongo,
                max_desvio_km: validacao.maxDesvioKm,
                regra:
                    'Desvio maior que 1 km por 5 minutos ou mais impede a validação.'
            },
            consumo_real: consumoRealResultado,
            qualidade_gps: qualidadeGps,
            resumo_operacional: resumoOperacional
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(e) {}
        console.error('❌ Concluir/validar viagem:', erro);
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
    }
});


// ======================================================
// APROVAÇÃO FORMAL DE VIAGENS
// ======================================================
app.post('/viagens/:id/aprovar', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const viagem = await obterViagemParaAprovacao(
            req.params.id,
            client,
            true
        );

        if (!viagem) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        if (viagem.status !== 'planejada') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                erro: 'Somente viagens planejadas podem ser aprovadas.'
            });
        }

        const statusAnterior =
            viagem.status_aprovacao || 'aguardando_aprovacao';

        const check =
            await checarSegurancaFormalViagem(
                viagem,
                client
            );

        if (!check.liberada) {
            await client.query(`
                UPDATE viagens
                SET
                    liberacao_rota = 'bloqueada',
                    status_aprovacao = 'bloqueada',
                    checagem_seguranca = $1::jsonb,
                    aprovado_por = NULL,
                    aprovado_em = NULL,
                    aprovacao_invalidada_em = CURRENT_TIMESTAMP,
                    motivo_invalidacao_aprovacao =
                        'Pré-checagem formal encontrou restrição validada incompatível.'
                WHERE id = $2
            `, [
                JSON.stringify(check),
                viagem.id
            ]);

            await registrarAuditoriaViagem({
                client,
                idViagem: viagem.id,
                usuario: req.usuario,
                acao: 'APROVACAO_NEGADA_SEGURANCA',
                statusAnterior,
                statusNovo: 'bloqueada',
                detalhes: {
                    observacao: req.body?.observacao || null,
                    checagem: check
                },
                req
            });

            await client.query('COMMIT');

            return res.status(409).json({
                erro:
                    'A viagem não pode ser aprovada: existe restrição global validada incompatível.',
                status_aprovacao: 'bloqueada',
                checagem: check
            });
        }

        const atualizado = await client.query(`
            UPDATE viagens
            SET
                liberacao_rota = 'liberada',
                status_aprovacao = 'aprovada',
                aprovado_por = $1,
                aprovado_em = CURRENT_TIMESTAMP,
                observacao_aprovacao = $2,
                versao_aprovacao =
                    COALESCE(versao_aprovacao,0) + 1,
                snapshot_seguranca_aprovado = $3::jsonb,
                checagem_seguranca = $3::jsonb,
                rota_aprovada_geojson = $4::jsonb,
                id_rota_especifica_aprovada = id_rota_especifica,
                versao_rota_aprovada = COALESCE($5, 1),
                rota_aprovada_em = CURRENT_TIMESTAMP,
                estado_monitoramento = 'normal',
                aprovacao_invalidada_em = NULL,
                motivo_invalidacao_aprovacao = NULL,
                ultima_revalidacao_em = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [
            req.usuario.id,
            req.body?.observacao
                ? String(req.body.observacao).slice(0,1500)
                : null,
            JSON.stringify(check),
            JSON.stringify(viagem.dados_geojson),
            viagem.rota_especifica_versao || 1,
            viagem.id
        ]);

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.id,
            usuario: req.usuario,
            acao: 'VIAGEM_APROVADA',
            statusAnterior,
            statusNovo: 'aprovada',
            detalhes: {
                observacao: req.body?.observacao || null,
                versao_aprovacao:
                    atualizado.rows[0].versao_aprovacao,
                versao_rota_aprovada:
                    atualizado.rows[0].versao_rota_aprovada,
                id_rota_especifica_aprovada:
                    atualizado.rows[0].id_rota_especifica_aprovada,
                checagem: check
            },
            req
        });

        await client.query('COMMIT');

        res.json({
            mensagem:
                'Viagem formalmente aprovada e liberada ao motorista.',
            viagem: atualizado.rows[0],
            checagem: check
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(_) {}
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
    }
});

app.post('/viagens/:id/bloquear-aprovacao', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const motivo =
        String(req.body?.motivo || '').trim();

    if (!motivo) {
        return res.status(400).json({
            erro: 'Informe o motivo do bloqueio.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const viagem =
            await obterViagemParaAprovacao(
                req.params.id,
                client,
                true
            );

        if (!viagem) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        if (viagem.status !== 'planejada') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                erro: 'Somente viagem planejada pode ser bloqueada antes da saída.'
            });
        }

        const anterior =
            viagem.status_aprovacao || 'aguardando_aprovacao';

        const atualizado = await client.query(`
            UPDATE viagens
            SET
                status_aprovacao = 'bloqueada',
                liberacao_rota = 'bloqueada',
                aprovado_por = NULL,
                aprovado_em = NULL,
                aprovacao_invalidada_em = CURRENT_TIMESTAMP,
                motivo_invalidacao_aprovacao = $1
            WHERE id = $2
            RETURNING *
        `, [
            motivo.slice(0,1500),
            viagem.id
        ]);

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.id,
            usuario: req.usuario,
            acao: 'VIAGEM_BLOQUEADA_GESTOR',
            statusAnterior: anterior,
            statusNovo: 'bloqueada',
            detalhes: { motivo },
            req
        });

        await client.query('COMMIT');

        res.json({
            mensagem: 'Viagem bloqueada pelo gestor.',
            viagem: atualizado.rows[0]
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(_) {}
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
    }
});

app.post('/viagens/:id/reabrir-aprovacao', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const viagem =
            await obterViagemParaAprovacao(
                req.params.id,
                client,
                true
            );

        if (!viagem) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        if (viagem.status !== 'planejada') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                erro: 'A aprovação só pode ser reaberta antes do início da viagem.'
            });
        }

        const anterior =
            viagem.status_aprovacao || 'aguardando_aprovacao';

        const check =
            await checarSegurancaFormalViagem(
                viagem,
                client
            );

        const novoStatus =
            check.liberada
                ? 'aguardando_aprovacao'
                : 'bloqueada';

        const liberacao =
            check.liberada
                ? 'liberada'
                : 'bloqueada';

        const atualizado = await client.query(`
            UPDATE viagens
            SET
                status_aprovacao = $1,
                liberacao_rota = $2,
                checagem_seguranca = $3::jsonb,
                aprovado_por = NULL,
                aprovado_em = NULL,
                snapshot_seguranca_aprovado = '{}'::jsonb,
                rota_aprovada_geojson = NULL,
                id_rota_especifica_aprovada = NULL,
                versao_rota_aprovada = NULL,
                rota_aprovada_em = NULL,
                aprovacao_invalidada_em = CURRENT_TIMESTAMP,
                motivo_invalidacao_aprovacao = $4
            WHERE id = $5
            RETURNING *
        `, [
            novoStatus,
            liberacao,
            JSON.stringify(check),
            req.body?.motivo
                ? String(req.body.motivo).slice(0,1500)
                : 'Aprovação reaberta pelo gestor.',
            viagem.id
        ]);

        await registrarAuditoriaViagem({
            client,
            idViagem: viagem.id,
            usuario: req.usuario,
            acao: 'APROVACAO_REABERTA',
            statusAnterior: anterior,
            statusNovo: novoStatus,
            detalhes: {
                motivo: req.body?.motivo || null,
                checagem: check
            },
            req
        });

        await client.query('COMMIT');

        res.json({
            mensagem:
                novoStatus === 'aguardando_aprovacao'
                    ? 'Viagem voltou para aguardando aprovação.'
                    : 'Pré-checagem continua bloqueando a viagem.',
            viagem: atualizado.rows[0],
            checagem: check
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(_) {}
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
    }
});

app.get('/viagens/:id/auditoria', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            SELECT
                a.*,
                u.nome AS usuario_nome,
                v.placa,
                r.origem,
                r.destino
            FROM auditoria_viagens a
            JOIN viagens vg ON vg.id = a.id_viagem
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = a.id_usuario
            WHERE a.id_viagem = $1
            ORDER BY a.criado_em DESC
            LIMIT 300
        `, [req.params.id]);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/auditoria/viagens', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const placa =
        String(req.query.placa || '')
            .trim()
            .toUpperCase();

    const acao =
        String(req.query.acao || '')
            .trim();

    try {
        const resultado = await pool.query(`
            SELECT
                a.*,
                u.nome AS usuario_nome,
                v.placa,
                r.origem,
                r.destino
            FROM auditoria_viagens a
            JOIN viagens vg ON vg.id = a.id_viagem
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = a.id_usuario
            WHERE
                ($1 = '' OR UPPER(v.placa) LIKE '%' || $1 || '%')
                AND ($2 = '' OR a.acao = $2)
            ORDER BY a.criado_em DESC
            LIMIT 500
        `, [
            placa,
            acao
        ]);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});




app.get('/veiculos/:id/historico-consumo', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro:'Acesso negado' });
    }

    try {
        const viagens = await pool.query(`
            SELECT h.*, r.origem, r.destino
            FROM historico_consumo_viagens h
            JOIN rotas r ON r.id = h.id_rota
            WHERE h.id_veiculo = $1
            ORDER BY h.criado_em DESC
            LIMIT 100
        `, [req.params.id]);

        const resumo = await pool.query(`
            SELECT
                AVG(consumo_real_km_l) AS media_geral,
                AVG(consumo_real_km_l) FILTER (
                    WHERE criado_em >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                ) AS media_30_dias,
                COUNT(*)::int AS viagens_total,
                COUNT(*) FILTER (
                    WHERE consumo_anormal = TRUE
                )::int AS viagens_anormais
            FROM historico_consumo_viagens
            WHERE id_veiculo = $1
        `, [req.params.id]);

        res.json({
            resumo: resumo.rows[0],
            viagens: viagens.rows
        });

    } catch (erro) {
        res.status(500).json({ erro:erro.message });
    }
});

app.get('/viagens/:id/inteligencia', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({
            erro:'Acesso negado'
        });
    }

    try {
        const r = await pool.query(`
            SELECT
                vg.id,
                vg.id_rota,
                vg.id_veiculo,
                vg.distancia_estimada_km,
                vg.duracao_estimada_min,
                vg.combustivel_estimado_l,
                vg.custo_combustivel_estimado,
                vg.score_rota,
                vg.memoria_rota_snapshot,
                vg.altura_total,
                vg.peso_total,
                v.placa,
                v.frota,
                v.modelo,
                v.consumo_medio_km_l,
                v.tipo_combustivel,
                v.preco_combustivel_ref,
                r.nome AS rota_nome,
                r.origem,
                r.destino
            FROM viagens vg
            JOIN veiculos v
                ON v.id = vg.id_veiculo
            JOIN rotas r
                ON r.id = vg.id_rota
            WHERE vg.id = $1
            LIMIT 1
        `, [
            req.params.id
        ]);

        if (!r.rows.length) {
            return res.status(404).json({
                erro:'Viagem não encontrada'
            });
        }

        res.json(r.rows[0]);

    } catch (erro) {
        res.status(500).json({
            erro: erro.message
        });
    }
});

app.get('/monitoramento/resumo', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT vg.*, r.dados_geojson, l.lat, l.lon, l.ultima_atualizacao,
                   rc.total_pontos, rc.pontos_com_precisao, rc.soma_precisao_m
            FROM viagens vg
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = vg.id_motorista
            LEFT JOIN usuarios aprovador ON aprovador.id = vg.aprovado_por
            LEFT JOIN localizacoes l ON l.id_motorista = u.id
            WHERE vg.status IN ('planejada','em_andamento')
        `);

        const agora = Date.now();
        let emViagem = 0, planejadas = 0, atrasadas = 0, foraRota = 0, semSinal = 0;

        for (const row of resultado.rows) {
            if (row.status === 'em_andamento') emViagem++;
            if (row.status === 'planejada') planejadas++;

            if (row.status === 'em_andamento') {
                const atualizado = row.ultima_atualizacao ? new Date(row.ultima_atualizacao).getTime() : 0;
                if (!atualizado || agora - atualizado > 5 * 60 * 1000) semSinal++;

                if (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
                    const analise = analisarPosicaoNaRota(row.dados_geojson, Number(row.lat), Number(row.lon));
                    if (analise.distanciaRotaKm !== null && analise.distanciaRotaKm > 0.5) foraRota++;
                }

                if (row.chegada_prevista && new Date(row.chegada_prevista).getTime() < agora) atrasadas++;
            }
        }

        res.json({
            em_viagem: emViagem,
            planejadas,
            atrasadas,
            fora_da_rota: foraRota,
            sem_sinal: semSinal
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});


app.get('/guardiao/eventos', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro:'Acesso negado' });
    }
    try {
        const resultado = await pool.query(`
            SELECT ge.*, v.placa, v.frota, r.nome AS rota_nome, r.origem, r.destino
            FROM guardiao_eventos ge
            JOIN viagens vg ON vg.id = ge.id_viagem
            JOIN veiculos v ON v.id = ge.id_veiculo
            JOIN rotas r ON r.id = vg.id_rota
            WHERE ge.ativo = TRUE
              AND vg.status = 'em_andamento'
              AND ge.atualizado_em > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
            ORDER BY
              CASE WHEN ge.nivel='critico' THEN 0 ELSE 1 END,
              ge.distancia_km ASC,
              ge.atualizado_em DESC
            LIMIT 100
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro:erro.message });
    }
});

app.get('/alertas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT vg.id, vg.chegada_prevista, v.placa, v.frota,
                   r.dados_geojson, l.lat, l.lon, l.ultima_atualizacao
            FROM viagens vg
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = vg.id_motorista
            LEFT JOIN localizacoes l ON l.id_motorista = u.id
            LEFT JOIN resumo_coleta_viagem rc ON rc.id_viagem = vg.id
            WHERE vg.status = 'em_andamento'
        `);

        const agora = Date.now();
        const alertas = [];

        for (const row of resultado.rows) {
            const atualizado = row.ultima_atualizacao ? new Date(row.ultima_atualizacao).getTime() : 0;

            if (!atualizado || agora - atualizado > 5 * 60 * 1000) {
                alertas.push({
                    tipo: 'sem_sinal',
                    severidade: 'alta',
                    placa: row.placa,
                    frota: row.frota,
                    viagem_id: row.id,
                    mensagem: 'Sem GPS há mais de 5 minutos'
                });
            }

            if (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
                const analise = analisarPosicaoNaRota(row.dados_geojson, Number(row.lat), Number(row.lon));
                if (analise.distanciaRotaKm !== null && analise.distanciaRotaKm > 0.5) {
                    alertas.push({
                        tipo: 'fora_rota',
                        severidade: 'alta',
                        placa: row.placa,
                        frota: row.frota,
                        viagem_id: row.id,
                        mensagem: `Veículo está ${analise.distanciaRotaKm.toFixed(2)} km fora da rota`
                    });
                }
            }

            const nPrec = Number(row.pontos_com_precisao || 0);
            const precMedia = nPrec > 0 ? Number(row.soma_precisao_m || 0) / nPrec : null;
            if (Number(row.total_pontos || 0) >= 5 && precMedia !== null && precMedia > 80) {
                alertas.push({
                    tipo:'telemetria_ruim', severidade:'media', placa:row.placa, frota:row.frota,
                    viagem_id:row.id, mensagem:`GPS com baixa precisão média (${precMedia.toFixed(0)} m)`
                });
            }

            if (row.chegada_prevista) {
                const atraso = Math.round((agora - new Date(row.chegada_prevista).getTime()) / 60000);
                if (atraso >= 10) {
                    alertas.push({
                        tipo: 'atraso',
                        severidade: 'media',
                        placa: row.placa,
                        frota: row.frota,
                        viagem_id: row.id,
                        mensagem: `Atraso de ${atraso} min`
                    });
                }
            }
        }

        const guardiaoAtivos = await pool.query(`
            SELECT
                ge.id,ge.id_viagem,ge.nivel,ge.tipo_risco,ge.distancia_km,
                ge.tempo_estimado_min,ge.mensagem,ge.atualizado_em,
                v.placa,v.frota
            FROM guardiao_eventos ge
            JOIN viagens vg ON vg.id = ge.id_viagem
            JOIN veiculos v ON v.id = ge.id_veiculo
            WHERE ge.ativo = TRUE
              AND vg.status = 'em_andamento'
              AND ge.atualizado_em > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
            ORDER BY
              CASE WHEN ge.nivel='critico' THEN 0 ELSE 1 END,
              ge.distancia_km ASC
            LIMIT 50
        `);

        for (const g of guardiaoAtivos.rows) {
            alertas.push({
                tipo:'guardiao',
                severidade:g.nivel==='critico'?'alta':'media',
                placa:g.placa,
                frota:g.frota,
                viagem_id:g.id_viagem,
                guardiao_evento_id:g.id,
                mensagem:`🛡️ ${g.mensagem}`,
                distancia_km:g.distancia_km,
                tempo_estimado_min:g.tempo_estimado_min
            });
        }

        res.json(alertas);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/monitoramento/viagens', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({
            erro:'Acesso negado'
        });
    }

    try {
        const buscar = async () =>
            pool.query(`
                SELECT
                    vg.*,

                    v.placa,
                    v.frota,
                    v.modelo,

                    u.nome AS motorista,
                    aprovador.nome AS aprovado_por_nome,

                    r.nome AS rota_nome,
                    r.origem,
                    r.destino,

                    COALESCE(
                        vg.rota_aprovada_geojson,
                        re.dados_geojson,
                        r.dados_geojson
                    ) AS dados_geojson,

                    re.versao AS rota_especifica_versao_atual,

                    l.lat,
                    l.lon,
                    l.ultima_atualizacao

                FROM viagens vg

                JOIN veiculos v
                    ON v.id = vg.id_veiculo

                JOIN rotas r
                    ON r.id = vg.id_rota

                LEFT JOIN rotas_especificas re
                    ON re.id = vg.id_rota_especifica

                LEFT JOIN usuarios u
                    ON u.id = vg.id_motorista

                LEFT JOIN usuarios aprovador
                    ON aprovador.id = vg.aprovado_por

                LEFT JOIN localizacoes l
                    ON l.id_motorista = u.id

                WHERE vg.status IN (
                    'planejada',
                    'em_andamento'
                )

                ORDER BY
                    vg.saida_prevista ASC NULLS LAST,
                    vg.criada_em DESC
            `);

        let resultado = await buscar();

        for (const row of resultado.rows) {
            await revalidarAprovacaoViagem({
                viagem: row,
                usuario: req.usuario,
                req
            });
        }

        resultado = await buscar();

        await processarGpsOfflineMonitoramento(
            resultado.rows,
            req
        );

        resultado = await buscar();

        const agora = new Date();
        const dados = [];

        for (const row of resultado.rows) {
            let desvioKm =
                Number.isFinite(
                    Number(row.ultima_distancia_rota_km)
                )
                    ? Number(row.ultima_distancia_rota_km)
                    : null;

            let progresso =
                Number.isFinite(
                    Number(row.ultimo_progresso)
                )
                    ? Number(row.ultimo_progresso)
                    : 0;

            if (
                Number.isFinite(Number(row.lat)) &&
                Number.isFinite(Number(row.lon))
            ) {
                const analise = analisarPosicaoNaRota(
                    row.dados_geojson,
                    Number(row.lat),
                    Number(row.lon)
                );

                desvioKm =
                    analise.distanciaRotaKm;

                progresso =
                    analise.progresso;
            }

            const resumo =
                resumoGeoJsonRota(
                    row.dados_geojson
                );

            const distanciaTotalKm =
                resumo.distancia_m > 0
                    ? resumo.distancia_m / 1000
                    : 0;

            const restanteKm =
                distanciaTotalKm > 0
                    ? Math.max(
                        0,
                        distanciaTotalKm *
                            (1 - progresso)
                    )
                    : null;

            const velocidadeMedia =
                row.status === 'em_andamento'
                    ? await calcularVelocidadeMediaRecente(
                        row.id
                    )
                    : null;

            let eta =
                row.chegada_prevista
                    ? new Date(row.chegada_prevista)
                    : null;

            let atrasoMin = 0;

            if (
                row.status === 'em_andamento' &&
                restanteKm !== null &&
                velocidadeMedia !== null &&
                velocidadeMedia >= 15
            ) {
                const horas =
                    restanteKm /
                    velocidadeMedia;

                eta =
                    new Date(
                        agora.getTime() +
                        horas * 3600000
                    );

            } else if (
                row.status === 'em_andamento' &&
                resumo.duracao_s > 0
            ) {
                eta =
                    new Date(
                        agora.getTime() +
                        resumo.duracao_s *
                        (1 - progresso) *
                        1000
                    );
            }

            if (
                eta &&
                row.chegada_prevista
            ) {
                atrasoMin =
                    Math.max(
                        0,
                        Math.round(
                            (
                                eta.getTime() -
                                new Date(
                                    row.chegada_prevista
                                ).getTime()
                            ) / 60000
                        )
                    );
            }

            const ultimaGpsMs =
                row.ultima_atualizacao
                    ? new Date(
                        row.ultima_atualizacao
                    ).getTime()
                    : 0;

            const gpsIdadeSeg =
                ultimaGpsMs
                    ? Math.max(
                        0,
                        Math.round(
                            (
                                agora.getTime() -
                                ultimaGpsMs
                            ) / 1000
                        )
                    )
                    : null;

            const gpsStatus =
                gpsIdadeSeg === null
                    ? 'sem_gps'
                    : gpsIdadeSeg > 300
                        ? 'offline'
                        : gpsIdadeSeg > 60
                            ? 'atrasado'
                            : 'online';

            let severidade = 'normal';

            if (
                row.status_aprovacao === 'revisao_obrigatoria' ||
                row.liberacao_rota === 'bloqueada' ||
                row.estado_monitoramento === 'gps_offline' ||
                row.estado_monitoramento === 'fora_rota'
            ) {
                severidade = 'critico';

            } else if (
                (
                    desvioKm !== null &&
                    desvioKm > 0.3
                ) ||
                atrasoMin >= 10 ||
                gpsStatus === 'atrasado'
            ) {
                severidade = 'atencao';
            }

            dados.push({
                ...row,
                dados_geojson: undefined,

                desvio_km: desvioKm,

                fora_da_rota:
                    row.estado_monitoramento === 'fora_rota',

                progresso_percentual:
                    Math.round(
                        progresso * 100
                    ),

                distancia_total_km:
                    distanciaTotalKm || null,

                restante_km:
                    restanteKm,

                velocidade_media_kmh:
                    velocidadeMedia !== null
                        ? Math.round(
                            velocidadeMedia
                        )
                        : null,

                eta_atual:
                    eta,

                atraso_minutos:
                    atrasoMin,

                atrasada:
                    atrasoMin >= 10,

                gps_idade_segundos:
                    gpsIdadeSeg,

                gps_status:
                    gpsStatus,

                severidade_operacional:
                    severidade,

                rota_snapshot_ativa:
                    !!row.rota_aprovada_geojson,

                versao_rota_atual:
                    row.rota_especifica_versao_atual || null
            });
        }

        res.json(dados);

    } catch (erro) {
        console.error(
            '❌ Monitoramento V18:',
            erro
        );

        res.status(500).json({
            erro: erro.message
        });
    }
});


// ======================================================
// SCANNER ANTT / CENTRAL DE VALIDAÇÃO
// ======================================================
app.post('/viagens/:id/scan-restricoes', autenticar, heavyLimiter, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const result = await pool.query(`
            SELECT
                vg.id,
                vg.id_rota,
                vg.id_rota_especifica,
                vg.id_veiculo,
                vg.altura_total,
                vg.peso_total,
                r.nome AS rota_nome,
                r.origem,
                r.destino,
                COALESCE(re.dados_geojson, r.dados_geojson) AS dados_geojson,
                v.placa,
                v.comprimento,
                v.largura,
                COALESCE(vg.peso_total, v.peso) AS peso
            FROM viagens vg
            JOIN rotas r ON r.id = vg.id_rota
            JOIN veiculos v ON v.id = vg.id_veiculo
            LEFT JOIN rotas_especificas re ON re.id = vg.id_rota_especifica
            WHERE vg.id = $1
            LIMIT 1
        `, [req.params.id]);

        if (!result.rows.length) {
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        const viagem = result.rows[0];

        const infraestrutura = await carregarInfraestruturaANTT();

        const registros = [
            ...infraestrutura.pontes,
            ...infraestrutura.deteccaoAltura
        ];

        const salvos = [];

        for (const reg of registros) {
            const analise = analisarPosicaoNaRota(
                viagem.dados_geojson,
                reg.latitude,
                reg.longitude
            );

            if (
                analise.distanciaRotaKm === null ||
                analise.distanciaRotaKm > 1
            ) continue;

            const tipoTexto = semAcentoANTT(reg.tipo).toLowerCase();

            let tipo =
                reg.categoria === 'DETECCAO_ALTURA'
                    ? 'equipamento_deteccao_altura'
                    : tipoTexto.includes('passagem inferior')
                        ? 'passagem_inferior'
                        : 'ponte_viaduto';

            const fonteId =
                `${reg.categoria}/${hashFonteANTT(reg)}`;

            const tags = {
                categoria_antt: reg.categoria,
                tipo_antt: reg.tipo,
                concessionaria: reg.concessionaria,
                rodovia: reg.rodovia,
                km: reg.km,
                sentido: reg.sentido,
                origem_dado: 'Portal de Dados Abertos ANTT',
                dados_originais: reg.original
            };

            const observacao =
                reg.categoria === 'DETECCAO_ALTURA'
                    ? 'Equipamento oficial de detecção de altura. Não representa sozinho o limite máximo permitido.'
                    : 'Estrutura oficial ANTT. A existência/localização tem alta confiança, mas a altura livre precisa ser validada antes de qualquer bloqueio.';

            const salvo = await pool.query(`
                INSERT INTO restricoes_candidatas
                (
                    id_viagem,id_rota,id_rota_especifica,id_veiculo,
                    fonte,fonte_id,tipo,nome,
                    lat,lng,distancia_rota_km,
                    compatibilidade,risco,confianca,tags,observacao,
                    ultima_deteccao
                )
                VALUES
                (
                    $1,$2,$3,$4,
                    'antt',$5,$6,$7,
                    $8,$9,$10,
                    'verificar','baixo',$11,$12::jsonb,$13,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (id_viagem, fonte, fonte_id)
                DO UPDATE SET
                    tipo = EXCLUDED.tipo,
                    nome = EXCLUDED.nome,
                    lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng,
                    distancia_rota_km = EXCLUDED.distancia_rota_km,
                    tags = EXCLUDED.tags,
                    observacao = EXCLUDED.observacao,
                    ultima_deteccao = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                viagem.id,
                viagem.id_rota,
                viagem.id_rota_especifica,
                viagem.id_veiculo,
                fonteId,
                tipo,
                reg.nome || reg.tipo || null,
                reg.latitude,
                reg.longitude,
                Number(analise.distanciaRotaKm.toFixed(3)),
                reg.categoria === 'PONTE_SIMILAR' ? 90 : 92,
                JSON.stringify(tags),
                observacao
            ]);

            salvos.push(salvo.rows[0]);
        }

        res.json({
            mensagem: 'Varredura ANTT concluída.',
            fonte: 'ANTT',
            candidatos_na_rota: salvos.length,
            pontes_similares_na_rota:
                salvos.filter(x =>
                    ['ponte_viaduto','passagem_inferior'].includes(x.tipo)
                ).length,
            equipamentos_altura_na_rota:
                salvos.filter(x =>
                    x.tipo === 'equipamento_deteccao_altura'
                ).length
        });

    } catch (erro) {
        console.error('❌ Scanner ANTT:', erro.response?.data || erro.message);

        res.status(502).json({
            erro: 'Não foi possível concluir a varredura ANTT',
            detalhe:
                erro.response?.data?.message ||
                erro.message
        });
    }
});

app.get('/viagens/:id/restricoes-candidatas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            SELECT
                rc.*,
                v.placa,
                r.nome AS rota_nome,
                rv.id AS restricao_global_id,
                COALESCE(pr.passagens_total,0) AS passagens_total,
                COALESCE(pr.passagens_sem_ocorrencia,0) AS passagens_sem_ocorrencia,
                pr.maior_altura_passou,
                pr.maior_peso_passou,
                pr.ultima_passagem
            FROM restricoes_candidatas rc
            JOIN veiculos v ON v.id = rc.id_veiculo
            JOIN rotas r ON r.id = rc.id_rota
            LEFT JOIN restricoes_validadas rv
                ON rv.fonte = rc.fonte
               AND rv.fonte_id = rc.fonte_id
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::int AS passagens_total,
                    COUNT(*) FILTER (
                        WHERE passou_sem_ocorrencia = TRUE
                    )::int AS passagens_sem_ocorrencia,
                    MAX(altura) AS maior_altura_passou,
                    MAX(peso) AS maior_peso_passou,
                    MAX(registrado_em) AS ultima_passagem
                FROM passagens_restricoes
                WHERE id_restricao = rv.id
            ) pr ON TRUE
            WHERE rc.id_viagem = $1
            ORDER BY
                CASE rc.status_validacao
                    WHEN 'validada' THEN 0
                    WHEN 'confirmada' THEN 1
                    WHEN 'descoberta' THEN 2
                    ELSE 3
                END,
                rc.distancia_rota_km ASC
        `, [req.params.id]);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// Confirma somente a existência; ainda não vai para a base global.
app.patch('/restricoes-candidatas/:id/confirmar', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            UPDATE restricoes_candidatas
            SET
                status_validacao = 'confirmada',
                observacao = COALESCE($1, observacao),
                validado_por = $2,
                validado_em = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `, [
            req.body?.observacao
                ? String(req.body.observacao).slice(0,1000)
                : null,
            req.usuario.id,
            req.params.id
        ]);

        if (!resultado.rows.length) {
            return res.status(404).json({ erro: 'Candidato não encontrado' });
        }

        res.json({
            mensagem: 'Existência confirmada. Ainda não interfere no roteamento.',
            restricao: resultado.rows[0]
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// Validação completa: promove para a base GLOBAL.
app.post('/restricoes-candidatas/:id/validar-global', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const candidatoResult = await client.query(`
            SELECT *
            FROM restricoes_candidatas
            WHERE id = $1
            LIMIT 1
            FOR UPDATE
        `, [req.params.id]);

        if (!candidatoResult.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: 'Candidato não encontrado' });
        }

        const c = candidatoResult.rows[0];
        const tags = c.tags || {};

        const limiteAltura = valorPositivoOuNulo(req.body?.limite_altura);
        const limiteLargura = valorPositivoOuNulo(req.body?.limite_largura);
        const limiteComprimento = valorPositivoOuNulo(req.body?.limite_comprimento);
        const limitePeso = valorPositivoOuNulo(req.body?.limite_peso);
        const limiteEixo = valorPositivoOuNulo(req.body?.limite_eixo);

        const tipo = String(req.body?.tipo || c.tipo || '').slice(0,60);
        const evidenciaUrl = String(req.body?.evidencia_url || '').trim() || null;
        const evidenciaTexto = String(req.body?.evidencia_texto || '').trim() || null;
        const observacao = String(req.body?.observacao || '').trim() || null;

        const validaDias =
            Math.max(1, Math.min(3650, Number(req.body?.valida_dias || 180)));

        const raioMetros =
            Math.max(30, Math.min(1500, Number(req.body?.raio_metros || 180)));

        // Para tipos dimensionais, exige pelo menos um limite.
        const exigeLimite =
            ![
                'proibicao_caminhao',
                'acesso_restrito'
            ].includes(tipo);

        if (
            exigeLimite &&
            [
                limiteAltura,
                limiteLargura,
                limiteComprimento,
                limitePeso,
                limiteEixo
            ].every(v => v === null)
        ) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                erro:
                    'Para validar para roteamento, informe pelo menos um limite dimensional confirmado ou escolha um tipo de proibição/acesso restrito.'
            });
        }

        const global = await client.query(`
            INSERT INTO restricoes_validadas
            (
                fonte,
                fonte_id,
                candidato_origem_id,
                tipo,
                nome,
                lat,
                lng,
                raio_metros,
                limite_altura,
                limite_largura,
                limite_comprimento,
                limite_peso,
                limite_eixo,
                sentido,
                rodovia,
                km,
                concessionaria,
                evidencia_url,
                evidencia_texto,
                observacao,
                confianca,
                ativa,
                valida_ate,
                validado_por,
                validado_em,
                atualizada_em
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,
                $9,$10,$11,$12,$13,
                $14,$15,$16,$17,
                $18,$19,$20,
                100,TRUE,
                CURRENT_TIMESTAMP + ($21 || ' days')::INTERVAL,
                $22,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
            )
            ON CONFLICT (fonte, fonte_id)
            DO UPDATE SET
                candidato_origem_id = EXCLUDED.candidato_origem_id,
                tipo = EXCLUDED.tipo,
                nome = EXCLUDED.nome,
                lat = EXCLUDED.lat,
                lng = EXCLUDED.lng,
                raio_metros = EXCLUDED.raio_metros,
                limite_altura = EXCLUDED.limite_altura,
                limite_largura = EXCLUDED.limite_largura,
                limite_comprimento = EXCLUDED.limite_comprimento,
                limite_peso = EXCLUDED.limite_peso,
                limite_eixo = EXCLUDED.limite_eixo,
                sentido = EXCLUDED.sentido,
                rodovia = EXCLUDED.rodovia,
                km = EXCLUDED.km,
                concessionaria = EXCLUDED.concessionaria,
                evidencia_url = EXCLUDED.evidencia_url,
                evidencia_texto = EXCLUDED.evidencia_texto,
                observacao = EXCLUDED.observacao,
                confianca = 100,
                ativa = TRUE,
                valida_ate = EXCLUDED.valida_ate,
                validado_por = EXCLUDED.validado_por,
                validado_em = CURRENT_TIMESTAMP,
                atualizada_em = CURRENT_TIMESTAMP
            RETURNING *
        `, [
            c.fonte,
            c.fonte_id,
            c.id,
            tipo,
            req.body?.nome || c.nome,
            c.lat,
            c.lng,
            raioMetros,
            limiteAltura,
            limiteLargura,
            limiteComprimento,
            limitePeso,
            limiteEixo,
            req.body?.sentido || tags.sentido || null,
            req.body?.rodovia || tags.rodovia || null,
            req.body?.km || tags.km || null,
            req.body?.concessionaria || tags.concessionaria || null,
            evidenciaUrl,
            evidenciaTexto,
            observacao,
            validaDias,
            req.usuario.id
        ]);

        await client.query(`
            UPDATE restricoes_candidatas
            SET
                status_validacao = 'validada',
                limite_altura = $1,
                limite_largura = $2,
                limite_comprimento = $3,
                limite_peso = $4,
                limite_eixo = $5,
                observacao = COALESCE($6, observacao),
                validado_por = $7,
                validado_em = CURRENT_TIMESTAMP
            WHERE id = $8
        `, [
            limiteAltura,
            limiteLargura,
            limiteComprimento,
            limitePeso,
            limiteEixo,
            observacao,
            req.usuario.id,
            c.id
        ]);

        await client.query('COMMIT');

        res.json({
            mensagem:
                'Restrição validada e adicionada à base global de segurança.',
            restricao_global: global.rows[0]
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(_) {}
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
    }
});

app.patch('/restricoes-candidatas/:id/rejeitar', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            UPDATE restricoes_candidatas
            SET
                status_validacao = 'rejeitada',
                observacao = COALESCE($1, observacao),
                validado_por = $2,
                validado_em = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `, [
            req.body?.observacao
                ? String(req.body.observacao).slice(0,1000)
                : null,
            req.usuario.id,
            req.params.id
        ]);

        if (!resultado.rows.length) {
            return res.status(404).json({ erro: 'Candidato não encontrado' });
        }

        res.json({
            mensagem: 'Candidato rejeitado.',
            restricao: resultado.rows[0]
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/restricoes-validadas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            SELECT
                rv.*,
                u.nome AS validado_por_nome
            FROM restricoes_validadas rv
            LEFT JOIN usuarios u ON u.id = rv.validado_por
            ORDER BY
                rv.ativa DESC,
                rv.validado_em DESC
            LIMIT 1000
        `);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.patch('/restricoes-validadas/:id', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            UPDATE restricoes_validadas
            SET
                ativa = COALESCE($1, ativa),
                limite_altura = COALESCE($2, limite_altura),
                limite_largura = COALESCE($3, limite_largura),
                limite_comprimento = COALESCE($4, limite_comprimento),
                limite_peso = COALESCE($5, limite_peso),
                limite_eixo = COALESCE($6, limite_eixo),
                observacao = COALESCE($7, observacao),
                evidencia_url = COALESCE($8, evidencia_url),
                atualizada_em = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [
            req.body?.ativa ?? null,
            valorPositivoOuNulo(req.body?.limite_altura),
            valorPositivoOuNulo(req.body?.limite_largura),
            valorPositivoOuNulo(req.body?.limite_comprimento),
            valorPositivoOuNulo(req.body?.limite_peso),
            valorPositivoOuNulo(req.body?.limite_eixo),
            req.body?.observacao || null,
            req.body?.evidencia_url || null,
            req.params.id
        ]);

        if (!resultado.rows.length) {
            return res.status(404).json({ erro: 'Restrição global não encontrada' });
        }

        res.json({
            mensagem: 'Restrição global atualizada.',
            restricao: resultado.rows[0]
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.post('/viagens/:id/precheck-seguranca', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const r = await pool.query(`
            SELECT
                vg.*,
                v.comprimento,
                v.largura,
                COALESCE(vg.peso_total, v.peso) AS peso_operacional,
                COALESCE(re.dados_geojson, ro.dados_geojson) AS dados_geojson
            FROM viagens vg
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN rotas ro ON ro.id = vg.id_rota
            LEFT JOIN rotas_especificas re ON re.id = vg.id_rota_especifica
            WHERE vg.id = $1
            LIMIT 1
        `, [req.params.id]);

        if (!r.rows.length) {
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        const vg = r.rows[0];

        const check = await preChecarRotaSegura({
            geojson: vg.dados_geojson,
            comprimento: vg.comprimento,
            largura: vg.largura,
            altura: vg.altura_total,
            peso: vg.peso_operacional
        });

        const liberacao = check.liberada ? 'liberada' : 'bloqueada';

        await pool.query(`
            UPDATE viagens
            SET
                liberacao_rota = $1,
                checagem_seguranca = $2::jsonb
            WHERE id = $3
        `, [
            liberacao,
            JSON.stringify(check),
            vg.id
        ]);

        res.json({
            liberacao_rota: liberacao,
            checagem: check
        });

    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});


app.get('/rotas-especificas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    try {
        const resultado = await pool.query(`
            SELECT
                re.id,
                re.id_rota_base,
                r.nome AS rota_base,
                r.origem,
                r.destino,
                re.comprimento,
                re.largura,
                re.altura,
                re.peso,
                re.assinatura,
                re.reutilizavel,
                re.nivel_confianca,
                re.validada_em,
                re.valida_ate,
                re.bloqueada,
                re.motivo_bloqueio,
                re.versao,
                re.viagens_concluidas,
                re.viagens_com_desvio,
                re.falhas_validacao,
                re.max_desvio_validacao_km,
                re.criada_em,
                re.ultima_utilizacao
            FROM rotas_especificas re
            JOIN rotas r ON r.id = re.id_rota_base
            ORDER BY re.ultima_utilizacao DESC
        `);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.patch('/rotas-especificas/:id/bloqueio', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    const bloqueada = Boolean(req.body.bloqueada);
    const motivo = bloqueada ? String(req.body.motivo || 'Bloqueada pelo gestor') : null;

    try {
        const resultado = await pool.query(`
            UPDATE rotas_especificas
            SET bloqueada = $1,
                motivo_bloqueio = $2
            WHERE id = $3
            RETURNING *
        `, [bloqueada, motivo, req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Rota específica não encontrada' });
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.post('/rotas-especificas/:id/forcar-recalculo', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            UPDATE rotas_especificas
            SET reutilizavel = FALSE,
                nivel_confianca = 'revisao',
                valida_ate = NULL,
                motivo_bloqueio = 'Recálculo solicitado pelo gestor'
            WHERE id = $1
            RETURNING *
        `, [req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Rota específica não encontrada' });
        res.json({
            mensagem: 'A rota não será reutilizada. Na próxima viagem compatível o sistema calculará novamente.',
            rota: resultado.rows[0]
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// Verifica reportes ativos próximos da geometria e bloqueia temporariamente
// as rotas específicas afetadas. Distância conservadora: 1 km da linha.
app.post('/rotas-especificas/verificar-reportes', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const reportes = await pool.query(`
            SELECT id, tipo, lat, lng
            FROM reportes
            WHERE status_reporte = 'ativo'
              AND (expira_em IS NULL OR expira_em > CURRENT_TIMESTAMP)
        `);

        const rotas = await pool.query(`
            SELECT id, dados_geojson
            FROM rotas_especificas
            WHERE reutilizavel = TRUE
        `);

        const bloqueadas = [];

        for (const rota of rotas.rows) {
            let motivo = null;

            for (const reporte of reportes.rows) {
                const analise = analisarPosicaoNaRota(
                    rota.dados_geojson,
                    Number(reporte.lat),
                    Number(reporte.lng)
                );

                if (
                    analise.distanciaRotaKm !== null &&
                    analise.distanciaRotaKm <= 1
                ) {
                    motivo = `Reporte ativo próximo à rota: ${reporte.tipo} (#${reporte.id})`;
                    break;
                }
            }

            if (motivo) {
                await pool.query(`
                    UPDATE rotas_especificas
                    SET bloqueada = TRUE,
                        motivo_bloqueio = $1
                    WHERE id = $2
                `, [motivo, rota.id]);

                bloqueadas.push({ id: rota.id, motivo });
            } else {
                // Só desbloqueia bloqueios automáticos gerados por reportes.
                await pool.query(`
                    UPDATE rotas_especificas
                    SET bloqueada = FALSE,
                        motivo_bloqueio = NULL
                    WHERE id = $1
                      AND motivo_bloqueio LIKE 'Reporte ativo próximo à rota:%'
                `, [rota.id]);
            }
        }

        res.json({
            verificadas: rotas.rows.length,
            bloqueadas
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/historico/viagens', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT
                vg.id, vg.status, vg.carga, vg.altura_total, vg.peso_total,
                vg.saida_prevista, vg.saida_real, vg.chegada_prevista, vg.chegada_real,
                vg.qualidade_gps, vg.qualidade_gps_score, vg.resumo_operacional,
                vg.consumo_real_km_l, vg.variacao_consumo_percentual, vg.consumo_anormal,
                v.id AS id_veiculo, v.placa, v.frota, v.modelo,
                u.nome AS motorista,
                r.nome AS rota_nome, r.origem, r.destino
            FROM viagens vg
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = vg.id_motorista
            ORDER BY vg.criada_em DESC
            LIMIT 500
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/viagens/:id/resumo-operacional', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro:'Acesso negado' });
    try {
        const r = await pool.query(`
            SELECT vg.id, vg.status, vg.resumo_operacional, vg.qualidade_gps,
                   vg.qualidade_gps_score, vg.consumo_real_km_l,
                   v.placa, v.frota, r.nome AS rota_nome, r.origem, r.destino,
                   u.nome AS motorista
            FROM viagens vg
            JOIN veiculos v ON v.id=vg.id_veiculo
            JOIN rotas r ON r.id=vg.id_rota
            LEFT JOIN usuarios u ON u.id=vg.id_motorista
            WHERE vg.id=$1
            LIMIT 1
        `,[req.params.id]);
        if (!r.rows.length) return res.status(404).json({erro:'Viagem não encontrada'});
        res.json(r.rows[0]);
    } catch (erro) { res.status(500).json({erro:erro.message}); }
});

app.get('/veiculos/:id/historico', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 30));

    try {
        const veiculo = await pool.query(`SELECT * FROM veiculos WHERE id = $1`, [req.params.id]);
        if (!veiculo.rows.length) return res.status(404).json({ erro: 'Veículo não encontrado' });

        const viagens = await pool.query(`
            SELECT vg.*, r.nome AS rota_nome, r.origem, r.destino, u.nome AS motorista
            FROM viagens vg
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = vg.id_motorista
            WHERE vg.id_veiculo = $1
              AND vg.criada_em >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
            ORDER BY vg.criada_em DESC
        `, [req.params.id, dias]);

        const gps = await pool.query(`
            SELECT id_viagem, lat, lon, registrado_em
            FROM historico_localizacoes
            WHERE id_veiculo = $1
              AND registrado_em >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
            ORDER BY registrado_em ASC
            LIMIT 5000
        `, [req.params.id, dias]);

        const reportes = await pool.query(`
            SELECT r.id, r.tipo, r.lat, r.lng, r.data_hora, u.nome AS motorista
            FROM reportes r
            LEFT JOIN usuarios u ON u.id = r.id_motorista
            WHERE r.id_veiculo = $1
              AND r.data_hora >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
            ORDER BY r.data_hora DESC
        `, [req.params.id, dias]);

        res.json({
            veiculo: veiculo.rows[0],
            viagens: viagens.rows,
            gps: gps.rows,
            reportes: reportes.rows
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// REPORTES
// ======================================================
app.post('/reportar', autenticar, validar(schemas.reporte), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const contexto = await pool.query(`
            SELECT
                u.id_veiculo,
                vg.id AS id_viagem,
                vg.status,
                vg.estado_monitoramento,
                vg.desvio_inicio_em,
                vg.rota_aprovada_geojson,
                COALESCE(
                    vg.rota_aprovada_geojson,
                    re.dados_geojson,
                    r.dados_geojson
                ) AS dados_geojson
            FROM usuarios u

            LEFT JOIN LATERAL (
                SELECT *
                FROM viagens
                WHERE id_veiculo = u.id_veiculo
                  AND status = 'em_andamento'
                ORDER BY saida_real DESC NULLS LAST
                LIMIT 1
            ) vg ON TRUE

            LEFT JOIN rotas r
                ON r.id = vg.id_rota

            LEFT JOIN rotas_especificas re
                ON re.id = vg.id_rota_especifica

            WHERE u.id = $1
        `, [req.usuario.id]);

        const resultado = await pool.query(`
            INSERT INTO reportes
                (id_motorista,id_veiculo,id_viagem,tipo,lat,lng,status_reporte,expira_em)
            VALUES
                ($1,$2,$3,$4,$5,$6,'ativo',
                 CURRENT_TIMESTAMP +
                 CASE
                    WHEN $4 = 'acidente' THEN INTERVAL '6 hours'
                    WHEN $4 = 'obra' THEN INTERVAL '24 hours'
                    WHEN $4 = 'radar' THEN INTERVAL '12 hours'
                    WHEN $4 = 'perigo' THEN INTERVAL '8 hours'
                    WHEN $4 = 'risco' THEN INTERVAL '12 hours'
                    ELSE INTERVAL '8 hours'
                 END)
            RETURNING id
        `, [
            req.usuario.id,
            contexto.rows[0]?.id_veiculo || null,
            contexto.rows[0]?.id_viagem || null,
            req.body.tipo,
            req.body.lat,
            req.body.lng
        ]);

        res.json({ mensagem: `Reporte de "${req.body.tipo}" enviado!`, id: resultado.rows[0].id });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/reportes', autenticar, async (req, res) => {
    try {
        await pool.query(`
            UPDATE reportes
            SET status_reporte = 'expirado'
            WHERE status_reporte = 'ativo'
              AND expira_em IS NOT NULL
              AND expira_em < CURRENT_TIMESTAMP
        `);

        const resultado = await pool.query(`
            SELECT
                r.id, u.nome AS motorista, v.placa,
                r.tipo, r.lat, r.lng, r.data_hora,
                r.status_reporte, r.expira_em, r.resolvido_em
            FROM reportes r
            JOIN usuarios u ON u.id = r.id_motorista
            LEFT JOIN veiculos v ON v.id = r.id_veiculo
            ORDER BY
                CASE WHEN r.status_reporte = 'ativo' THEN 0 ELSE 1 END,
                r.data_hora DESC
        `);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.patch('/reportes/:id/status', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    const status = String(req.body.status || '').toLowerCase();
    if (!['ativo','resolvido','expirado'].includes(status)) {
        return res.status(400).json({ erro: 'Status inválido' });
    }

    try {
        const resultado = await pool.query(`
            UPDATE reportes
            SET status_reporte = $1,
                resolvido_em = CASE WHEN $1 = 'resolvido' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id = $2
            RETURNING *
        `, [status, req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Reporte não encontrado' });
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.delete('/reportes', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`DELETE FROM reportes`);
        res.json({
            mensagem: `${resultado.rowCount} reporte(s) removido(s)!`,
            quantidade: resultado.rowCount
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});


// ======================================================
// 🛡️ GUARDIÃO V1
// ======================================================
function guardiaoExtrairCoordenadas(geojson) {
    const c = geojson?.features?.[0]?.geometry?.coordinates;
    return Array.isArray(c) ? c : [];
}

function guardiaoAlcanceKmPorVelocidade(v) {
    v = Number(v || 0);
    if (v >= 90) return 15;
    if (v >= 70) return 12;
    if (v >= 50) return 10;
    if (v >= 25) return 7;
    return 5;
}

function guardiaoTempoMin(distanciaKm, velocidadeKmh) {
    const v = Number(velocidadeKmh || 0);
    if (!Number.isFinite(v) || v < 8) return null;
    return (Number(distanciaKm) / v) * 60;
}

function guardiaoIncompatibilidade(restricao, viagem) {
    const pesoTotal =
        viagem.peso_total !== null && viagem.peso_total !== undefined
            ? Number(viagem.peso_total)
            : Number(viagem.peso);

    const testes = [
        { tipo:'altura', veiculo:Number(viagem.altura_total), limite:Number(restricao.limite_altura), unidade:'m' },
        { tipo:'largura', veiculo:Number(viagem.largura), limite:Number(restricao.limite_largura), unidade:'m' },
        { tipo:'comprimento', veiculo:Number(viagem.comprimento), limite:Number(restricao.limite_comprimento), unidade:'m' },
        { tipo:'peso', veiculo:pesoTotal, limite:Number(restricao.limite_peso), unidade:'t' }
    ].filter(x =>
        Number.isFinite(x.veiculo) &&
        Number.isFinite(x.limite) &&
        x.veiculo > x.limite
    );

    testes.sort((a,b) =>
        ((b.veiculo-b.limite)/Math.max(b.limite,.01)) -
        ((a.veiculo-a.limite)/Math.max(a.limite,.01))
    );

    return testes[0] || null;
}

async function analisarGuardiaoViagem({ viagem, lat, lon, velocidadeKmh, usuario, req }) {
    try {
        const coords = guardiaoExtrairCoordenadas(viagem.dados_geojson);
        if (coords.length < 2) return { status:'indisponivel', motivo:'rota_sem_geometria' };

        const pos = analisarPosicaoNaRota(viagem.dados_geojson, Number(lat), Number(lon));
        if (pos.indice < 0 || pos.distanciaRotaKm === null)
            return { status:'indisponivel', motivo:'posicao_nao_localizada' };

        if (pos.distanciaRotaKm > 1.2)
            return { status:'fora_rota', distancia_rota_km:Number(pos.distanciaRotaKm.toFixed(3)) };

        const alcanceKm = guardiaoAlcanceKmPorVelocidade(velocidadeKmh);
        const margem = Math.max(.07, alcanceKm / 90);

        const rv = await pool.query(`
            SELECT * FROM restricoes_validadas
            WHERE ativa = TRUE
              AND (valida_ate IS NULL OR valida_ate > CURRENT_TIMESTAMP)
              AND lat BETWEEN $1 AND $2
              AND lng BETWEEN $3 AND $4
        `,[Number(lat)-margem,Number(lat)+margem,Number(lon)-margem,Number(lon)+margem]);

        const idxAtual=Math.max(0,Number(pos.indice||0));
        const candidatos=[];

        for (const r of rv.rows) {
            const conflito=guardiaoIncompatibilidade(r,viagem);
            if (!conflito) continue;

            let acumulada=0, menor=Infinity, distAte=null;
            for (let i=idxAtual;i<coords.length;i++) {
                if (i>idxAtual) {
                    acumulada += distanciaKmEntrePontos(
                        Number(coords[i-1][1]),Number(coords[i-1][0]),
                        Number(coords[i][1]),Number(coords[i][0])
                    );
                }
                if (acumulada > alcanceKm + 1) break;
                const d=distanciaKmEntrePontos(
                    Number(r.lat),Number(r.lng),
                    Number(coords[i][1]),Number(coords[i][0])
                );
                if (d < menor) { menor=d; distAte=acumulada; }
            }

            const corredor=Math.max(.18,Number(r.raio_metros||180)/1000+.08);
            if (distAte===null || distAte>alcanceKm || menor>corredor) continue;

            const tempo=guardiaoTempoMin(distAte,velocidadeKmh);
            const nivel=(distAte<=2 || (tempo!==null && tempo<=2.5)) ? 'critico' : 'atencao';
            const nome=r.nome||r.rodovia||'Restrição validada';
            const mensagem=
                `${nivel==='critico'?'🔴':'🟠'} ${conflito.tipo.toUpperCase()} incompatível a `+
                `${distAte.toFixed(1)} km • veículo ${conflito.veiculo.toFixed(2)} ${conflito.unidade} • `+
                `limite ${conflito.limite.toFixed(2)} ${conflito.unidade} • ${nome}`;

            candidatos.push({
                id_restricao:r.id,nivel,tipo_risco:conflito.tipo,
                distancia_km:Number(distAte.toFixed(3)),
                tempo_estimado_min:tempo===null?null:Number(tempo.toFixed(2)),
                mensagem,
                restricao:{id:r.id,nome:r.nome,tipo:r.tipo,lat:Number(r.lat),lng:Number(r.lng),
                    rodovia:r.rodovia,km:r.km,confianca:r.confianca,fonte:r.fonte},
                incompatibilidade:conflito
            });
        }

        candidatos.sort((a,b) => {
            if (a.nivel!==b.nivel) return a.nivel==='critico'?-1:1;
            return a.distancia_km-b.distancia_km;
        });

        const principal=candidatos[0]||null;
        if (!principal) {
            await pool.query(`
                UPDATE guardiao_eventos SET ativo=FALSE, atualizado_em=CURRENT_TIMESTAMP
                WHERE id_viagem=$1 AND ativo=TRUE
                  AND atualizado_em < CURRENT_TIMESTAMP - INTERVAL '3 minutes'
            `,[viagem.id]);
            return {status:'seguro',alcance_km:alcanceKm,total_riscos:0};
        }

        const existente=await pool.query(`
            SELECT id FROM guardiao_eventos
            WHERE id_viagem=$1 AND id_restricao=$2 AND tipo_risco=$3 AND ativo=TRUE
            ORDER BY atualizado_em DESC LIMIT 1
        `,[viagem.id,principal.id_restricao,principal.tipo_risco]);

        const dados={
            alcance_km:alcanceKm,
            posicao:{lat:Number(lat),lon:Number(lon)},
            velocidade_kmh:Number.isFinite(Number(velocidadeKmh))?Number(velocidadeKmh):null,
            restricao:principal.restricao,
            incompatibilidade:principal.incompatibilidade
        };

        let idEvento=null;
        if (existente.rows.length) {
            idEvento=existente.rows[0].id;
            await pool.query(`
                UPDATE guardiao_eventos
                SET nivel=$1,distancia_km=$2,tempo_estimado_min=$3,mensagem=$4,
                    dados=$5::jsonb,atualizado_em=CURRENT_TIMESTAMP
                WHERE id=$6
            `,[principal.nivel,principal.distancia_km,principal.tempo_estimado_min,
               principal.mensagem,JSON.stringify(dados),idEvento]);
        } else {
            const novo=await pool.query(`
                INSERT INTO guardiao_eventos
                (id_viagem,id_veiculo,id_restricao,nivel,tipo_risco,distancia_km,
                 tempo_estimado_min,mensagem,dados,ativo)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,TRUE)
                RETURNING id
            `,[viagem.id,viagem.id_veiculo,principal.id_restricao,principal.nivel,
               principal.tipo_risco,principal.distancia_km,principal.tempo_estimado_min,
               principal.mensagem,JSON.stringify(dados)]);
            idEvento=novo.rows[0]?.id||null;

            try {
                await registrarAuditoriaViagem({
                    idViagem:viagem.id,usuario,acao:'GUARDIAO_ALERTA',
                    statusAnterior:viagem.estado_monitoramento||'normal',
                    statusNovo:principal.nivel==='critico'?'critico':'atencao',
                    detalhes:{id_evento:idEvento,...dados,mensagem:principal.mensagem},req
                });
            } catch (_) {}
        }

        return {
            status:'alerta',id_evento:idEvento,alcance_km:alcanceKm,
            total_riscos:candidatos.length,...principal
        };
    } catch (erro) {
        console.error('❌ Guardião:',erro);
        return {status:'erro',erro:erro.message};
    }
}

function distanciaKmEntrePontos(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = v => Number(v) * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ======================================================
// LOCALIZAÇÕES
// ======================================================
app.post('/localizacao', autenticar, validar(schemas.localizacao), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const contexto = await pool.query(`
            SELECT
                u.id_veiculo,
                vg.id AS id_viagem,
                vg.status,
                vg.estado_monitoramento,
                vg.desvio_inicio_em,
                vg.rota_aprovada_geojson,
                vg.altura_total,
                vg.peso_total,
                v.comprimento,
                v.largura,
                v.peso,
                COALESCE(
                    vg.rota_aprovada_geojson,
                    re.dados_geojson,
                    r.dados_geojson
                ) AS dados_geojson
            FROM usuarios u
            LEFT JOIN LATERAL (
                SELECT *
                FROM viagens
                WHERE id_veiculo = u.id_veiculo
                  AND status = 'em_andamento'
                ORDER BY saida_real DESC NULLS LAST
                LIMIT 1
            ) vg ON TRUE
            LEFT JOIN veiculos v
                ON v.id = u.id_veiculo
            LEFT JOIN rotas r
                ON r.id = vg.id_rota
            LEFT JOIN rotas_especificas re
                ON re.id = vg.id_rota_especifica
            WHERE u.id = $1
        `, [req.usuario.id]);

        const contextoViagem = contexto.rows[0] || {};

        const idVeiculo =
            contextoViagem.id_veiculo || null;

        const idViagem =
            contextoViagem.id_viagem || null;

        await pool.query(`
            INSERT INTO localizacoes (id_motorista,lat,lon,ultima_atualizacao)
            VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
            ON CONFLICT (id_motorista)
            DO UPDATE SET
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                ultima_atualizacao = CURRENT_TIMESTAMP
        `, [req.usuario.id, req.body.lat, req.body.lon]);

        // V21: coleta real em background, sem uso decisório.
        const pontoAnterior = idViagem
            ? await pool.query(`
                SELECT lat, lon
                FROM historico_localizacoes
                WHERE id_viagem = $1
                ORDER BY registrado_em DESC
                LIMIT 1
            `, [idViagem])
            : { rows: [] };

        const inserido = await pool.query(`
            INSERT INTO historico_localizacoes
            (
                id_motorista,id_veiculo,id_viagem,lat,lon,registrado_em,
                velocidade_kmh,precisao_m,direcao_graus,altitude_m,
                timestamp_dispositivo,origem_coleta
            )
            SELECT
                $1,$2,$3,$4,$5,CURRENT_TIMESTAMP,
                $6,$7,$8,$9,$10,$11
            WHERE NOT EXISTS (
                SELECT 1
                FROM historico_localizacoes
                WHERE id_motorista = $1
                  AND registrado_em > CURRENT_TIMESTAMP - INTERVAL '30 seconds'
            )
            RETURNING id
        `, [
            req.usuario.id,idVeiculo,idViagem,req.body.lat,req.body.lon,
            req.body.velocidade_kmh ?? null,
            req.body.precisao_m ?? null,
            req.body.direcao_graus ?? null,
            req.body.altitude_m ?? null,
            req.body.timestamp_dispositivo || null,
            req.body.origem_coleta || 'gps_app'
        ]);

        if (idViagem && inserido.rowCount > 0) {
            let distanciaIncrementalKm = 0;

            if (pontoAnterior.rows.length) {
                const p = pontoAnterior.rows[0];
                distanciaIncrementalKm = distanciaKmEntrePontos(
                    Number(p.lat), Number(p.lon),
                    Number(req.body.lat), Number(req.body.lon)
                );

                if (
                    !Number.isFinite(distanciaIncrementalKm) ||
                    distanciaIncrementalKm < 0 ||
                    distanciaIncrementalKm > 5
                ) {
                    distanciaIncrementalKm = 0;
                }
            }

            const vel =
                req.body.velocidade_kmh !== null &&
                req.body.velocidade_kmh !== undefined
                    ? Number(req.body.velocidade_kmh)
                    : null;

            const precisao =
                req.body.precisao_m !== null &&
                req.body.precisao_m !== undefined
                    ? Number(req.body.precisao_m)
                    : null;

            await pool.query(`
                INSERT INTO resumo_coleta_viagem
                (
                    id_viagem,id_veiculo,id_motorista,
                    primeiro_gps_em,ultimo_gps_em,total_pontos,
                    pontos_com_velocidade,soma_velocidade_kmh,velocidade_max_kmh,
                    soma_precisao_m,pontos_com_precisao,
                    distancia_gps_bruta_km,ultima_lat,ultima_lon,atualizado_em
                )
                VALUES (
                    $1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1,
                    $4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP
                )
                ON CONFLICT (id_viagem)
                DO UPDATE SET
                    ultimo_gps_em = CURRENT_TIMESTAMP,
                    total_pontos = resumo_coleta_viagem.total_pontos + 1,
                    pontos_com_velocidade =
                        resumo_coleta_viagem.pontos_com_velocidade + EXCLUDED.pontos_com_velocidade,
                    soma_velocidade_kmh =
                        resumo_coleta_viagem.soma_velocidade_kmh + EXCLUDED.soma_velocidade_kmh,
                    velocidade_max_kmh =
                        CASE
                            WHEN EXCLUDED.velocidade_max_kmh IS NULL
                                THEN resumo_coleta_viagem.velocidade_max_kmh
                            WHEN resumo_coleta_viagem.velocidade_max_kmh IS NULL
                                THEN EXCLUDED.velocidade_max_kmh
                            ELSE GREATEST(
                                resumo_coleta_viagem.velocidade_max_kmh,
                                EXCLUDED.velocidade_max_kmh
                            )
                        END,
                    soma_precisao_m =
                        resumo_coleta_viagem.soma_precisao_m + EXCLUDED.soma_precisao_m,
                    pontos_com_precisao =
                        resumo_coleta_viagem.pontos_com_precisao + EXCLUDED.pontos_com_precisao,
                    distancia_gps_bruta_km =
                        resumo_coleta_viagem.distancia_gps_bruta_km + EXCLUDED.distancia_gps_bruta_km,
                    ultima_lat = EXCLUDED.ultima_lat,
                    ultima_lon = EXCLUDED.ultima_lon,
                    atualizado_em = CURRENT_TIMESTAMP
            `, [
                idViagem,idVeiculo,req.usuario.id,
                vel !== null ? 1 : 0,
                vel || 0,
                vel,
                precisao || 0,
                precisao !== null ? 1 : 0,
                distanciaIncrementalKm,
                Number(req.body.lat),
                Number(req.body.lon)
            ]);
        }

        let monitoramento = null;

        if (
            idViagem &&
            contextoViagem.dados_geojson
        ) {
            if (
                contextoViagem.estado_monitoramento === 'gps_offline'
            ) {
                await registrarAuditoriaViagem({
                    idViagem,
                    usuario: req.usuario,
                    acao: 'GPS_RECUPERADO',
                    statusAnterior: 'gps_offline',
                    statusNovo: 'normal',
                    detalhes: {
                        lat: req.body.lat,
                        lon: req.body.lon
                    },
                    req
                });
            }

            monitoramento =
                await atualizarEstadoDesvioTempoReal({
                    viagem: {
                        ...contextoViagem,
                        id: idViagem
                    },
                    lat: req.body.lat,
                    lon: req.body.lon,
                    usuario: req.usuario,
                    req
                });
        }

        let guardiao = null;
        if (idViagem && contextoViagem.dados_geojson && req.body.origem_coleta !== 'offline_sync') {
            guardiao = await analisarGuardiaoViagem({
                viagem:{...contextoViagem,id:idViagem,id_veiculo:idVeiculo},
                lat:req.body.lat,lon:req.body.lon,
                velocidadeKmh:req.body.velocidade_kmh,
                usuario:req.usuario,req
            });
        }

        res.json({
            mensagem: 'Localização atualizada',
            monitoramento,
            guardiao
        });
    } catch (erro) {
        console.error('❌ Localização:', erro);
        res.status(500).json({ erro: erro.message });
    }
});


app.get('/coleta-producao/viagens/:id', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro:'Acesso negado' });
    }

    try {
        const r = await pool.query(`
            SELECT
                rc.*,
                CASE WHEN rc.pontos_com_velocidade > 0
                    THEN rc.soma_velocidade_kmh / rc.pontos_com_velocidade
                    ELSE NULL
                END AS velocidade_media_gps_kmh,
                CASE WHEN rc.pontos_com_precisao > 0
                    THEN rc.soma_precisao_m / rc.pontos_com_precisao
                    ELSE NULL
                END AS precisao_media_m
            FROM resumo_coleta_viagem rc
            WHERE rc.id_viagem = $1
        `, [req.params.id]);

        res.json(r.rows[0] || null);
    } catch (erro) {
        res.status(500).json({ erro:erro.message });
    }
});

app.get('/localizacoes', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT
                u.id, u.nome,
                v.placa, v.frota, v.modelo,
                v.comprimento, v.largura, v.peso,
                l.lat, l.lon, l.ultima_atualizacao
            FROM usuarios u
            LEFT JOIN veiculos v ON v.id = u.id_veiculo
            LEFT JOIN localizacoes l ON l.id_motorista = u.id
            WHERE u.tipo = 'motorista'
            ORDER BY u.nome ASC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// ORS - POLÍGONO DE INCIDENTE
// ======================================================
function criarPoligonoCircular(lng, lat, raioMetros, pontos = 20) {
    const metrosPorGrauLat = 111320;
    const metrosPorGrauLng = Math.max(1000, 111320 * Math.cos(lat * Math.PI / 180));
    const ring = [];

    for (let i = 0; i < pontos; i++) {
        const angulo = (2 * Math.PI * i) / pontos;
        const dx = Math.cos(angulo) * raioMetros;
        const dy = Math.sin(angulo) * raioMetros;

        ring.push([
            lng + dx / metrosPorGrauLng,
            lat + dy / metrosPorGrauLat
        ]);
    }

    ring.push([...ring[0]]);
    return { type: 'Polygon', coordinates: [ring] };
}

// ======================================================
// CALCULAR ROTA
// ======================================================
app.post('/api/calcular-rota', autenticar, heavyLimiter, validar(schemas.calcularRota), async (req, res) => {
    try {
        const chave = gerarChaveRota(
            req.body.origem,
            req.body.destino,
            req.body.perfil,
            req.body.preferencia,
            req.body.altura,
            req.body.peso,
            req.body.comprimento
        );

        const cacheado = routeCache.get(chave);
        if (cacheado) return res.json(cacheado);

        const body = {
            coordinates: [
                [req.body.origem.lon, req.body.origem.lat],
                [req.body.destino.lon, req.body.destino.lat]
            ],
            preference: req.body.preferencia || 'fastest'
        };

        if (req.body.perfil === 'driving-hgv') {
            body.options = {
                profile_params: {
                    restrictions: {
                        height: req.body.altura || 4.2,
                        weight: req.body.peso || 15,
                        length: req.body.comprimento || 12,
                        width: req.body.largura || 2.6
                    }
                }
            };
        }

        const response = await axios.post(
            `https://api.openrouteservice.org/v2/directions/${req.body.perfil}/geojson`,
            body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: ORS_API_KEY
                },
                timeout: 20000
            }
        );

        routeCache.set(chave, response.data);
        res.json(response.data);
    } catch (error) {
        console.error('❌ ORS:', JSON.stringify(error.response?.data || error.message, null, 2));
        res.status(error.response?.status || 500).json({
            erro: 'Falha ao calcular rota',
            detalhe: error.response?.data || error.message
        });
    }
});

// ======================================================
// RECALCULAR DESVIO
// ======================================================
app.post('/api/recalcular-desvio', autenticar, heavyLimiter, validar(schemas.recalcularDesvio), async (req, res) => {
    try {
        const perfil = req.body.perfil || 'driving-hgv';
        const [lngIncidente, latIncidente] = req.body.pontoIncidente;
        const raio = req.body.raioBloqueio || 180;
        const zonaBloqueada = criarPoligonoCircular(lngIncidente, latIncidente, raio);

        const options = { avoid_polygons: zonaBloqueada };

        if (perfil === 'driving-hgv') {
            options.profile_params = {
                restrictions: {
                    height: req.body.altura || 4.2,
                    weight: req.body.peso || 15,
                    length: req.body.comprimento || 12,
                    width: req.body.largura || 2.6
                }
            };
        }

        const response = await axios.post(
            `https://api.openrouteservice.org/v2/directions/${perfil}/geojson`,
            {
                coordinates: [req.body.pontoSaida, req.body.pontoReentrada],
                preference: 'fastest',
                options
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: ORS_API_KEY
                },
                timeout: 20000
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('❌ Desvio ORS:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            erro: 'Falha ao recalcular desvio',
            detalhe: error.response?.data || error.message
        });
    }
});

// ======================================================
// TOMTOM
// ======================================================
app.get('/api/traffic', autenticar, validarQuery(schemas.traffic), async (req, res) => {
    try {
        const response = await axios.get(
            'https://api.tomtom.com/traffic/services/5/incidentDetails',
            {
                params: {
                    key: TOMTOM_API_KEY,
                    bbox: `${req.query.left},${req.query.bottom},${req.query.right},${req.query.top}`,
                    fields: '{incidents{type,geometry{type,coordinates},properties{iconCategory}}}'
                },
                timeout: 15000
            }
        );

        res.json(response.data);
    } catch (erro) {
        console.error('❌ TomTom:', erro.response?.data || erro.message);
        res.status(500).json({
            erro: 'Erro TomTom',
            detalhe: erro.response?.data || erro.message
        });
    }
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

// ======================================================
// V21.8 - FALHAS DE PROCESSO
// ======================================================
process.on(
    'unhandledRejection',
    motivo => {
        console.error(
            '❌ unhandledRejection:',
            motivo
        );

        registrarLogSistema({
            nivel:'error',
            origem:'unhandledRejection',
            mensagem:
                motivo?.message ||
                String(motivo),
            detalhes:
                serializarErro(motivo)
        }).catch(() => {});
    }
);

process.on(
    'uncaughtException',
    erro => {
        console.error(
            '❌ uncaughtException:',
            erro
        );

        registrarLogSistema({
            nivel:'error',
            origem:'uncaughtException',
            mensagem:
                erro?.message ||
                String(erro),
            detalhes:
                serializarErro(erro)
        })
        .catch(() => {})
        .finally(() => {
            // Processo em estado desconhecido: Render deve reiniciar.
            setTimeout(
                () => process.exit(1),
                300
            );
        });
    }
);

async function iniciarServidor() {
    console.log('========================================');
    console.log('🚛 INICIANDO GPS CAMINHÃO');
    console.log('========================================');

    const bancoOk = await testarBanco();
    if (!bancoOk) {
        console.error('❌ Servidor não iniciado porque o PostgreSQL não conectou.');
        process.exit(1);
    }

    try {
        await criarTabelas();
    } catch (erro) {
        console.error('❌ Erro ao criar/migrar tabelas:', erro);
        process.exit(1);
    }

    app.listen(PORT, '0.0.0.0', () => {
        // Primeira manutenção 2 min após boot,
        // depois em intervalo configurável.
        setTimeout(
            executarManutencaoPeriodica,
            2 * 60 * 1000
        );

        setInterval(
            executarManutencaoPeriodica,
            MANUTENCAO_INTERVALO_MS
        );

        console.log('========================================');
        console.log(`🚀 Servidor: porta ${PORT}`);
        console.log('🐘 PostgreSQL: ATIVO');
        console.log(`📧 Brevo: ${BREVO_API_KEY ? 'ATIVO' : 'NÃO CONFIGURADO'}`);
        console.log('🚚 Cadastro por placa: ATIVO');
        console.log('📍 GPS em tempo real: ATIVO');
        console.log('🚨 Reportes: ATIVO');
        console.log('🛣️ Desvio automático: ATIVO');
        console.log('========================================');
    });
}


// Última barreira de erro do Express.
app.use(async (erro, req, res, next) => {
    console.error(
        '❌ Erro não tratado na rota:',
        req.method,
        req.originalUrl,
        erro
    );

    await registrarLogSistema({
        nivel:'error',
        origem:'express',
        mensagem:
            erro?.message ||
            'Erro interno',
        detalhes:
            serializarErro(erro),
        req,
        statusHttp:
            500
    });

    if (res.headersSent) {
        return next(erro);
    }

    res.status(500).json({
        erro:
            'Erro interno do servidor',
        request_id:
            req.requestId
    });
});


iniciarServidor();
