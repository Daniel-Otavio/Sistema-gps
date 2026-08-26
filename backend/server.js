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


    // Possíveis restrições encontradas automaticamente no trajeto.
    // IMPORTANTE: registros "descoberta" NÃO bloqueiam nem alteram a rota.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS restricoes_candidatas (
            id BIGSERIAL PRIMARY KEY,
            id_viagem INTEGER NOT NULL,
            id_rota INTEGER NOT NULL,
            id_rota_especifica INTEGER,
            id_veiculo INTEGER NOT NULL,

            fonte VARCHAR(40) NOT NULL DEFAULT 'osm',
            fonte_id VARCHAR(120) NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            nome TEXT,

            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            distancia_rota_km DOUBLE PRECISION,

            limite_altura DOUBLE PRECISION,
            limite_largura DOUBLE PRECISION,
            limite_comprimento DOUBLE PRECISION,
            limite_peso DOUBLE PRECISION,
            limite_eixo DOUBLE PRECISION,

            compatibilidade VARCHAR(30) NOT NULL DEFAULT 'verificar'
                CHECK (compatibilidade IN ('compativel','possivelmente_incompativel','verificar')),

            risco VARCHAR(20) NOT NULL DEFAULT 'medio'
                CHECK (risco IN ('baixo','medio','alto')),

            confianca INTEGER NOT NULL DEFAULT 30,
            status_validacao VARCHAR(20) NOT NULL DEFAULT 'descoberta'
                CHECK (status_validacao IN ('descoberta','confirmada','validada','rejeitada')),

            tags JSONB DEFAULT '{}'::jsonb,
            observacao TEXT,
            validado_por INTEGER,
            validado_em TIMESTAMPTZ,

            primeira_deteccao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            ultima_deteccao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT fk_restricao_viagem
                FOREIGN KEY (id_viagem) REFERENCES viagens(id) ON DELETE CASCADE,
            CONSTRAINT fk_restricao_rota
                FOREIGN KEY (id_rota) REFERENCES rotas(id) ON DELETE CASCADE,
            CONSTRAINT fk_restricao_rota_especifica
                FOREIGN KEY (id_rota_especifica) REFERENCES rotas_especificas(id) ON DELETE SET NULL,
            CONSTRAINT fk_restricao_veiculo
                FOREIGN KEY (id_veiculo) REFERENCES veiculos(id) ON DELETE CASCADE,
            CONSTRAINT fk_restricao_validador
                FOREIGN KEY (validado_por) REFERENCES usuarios(id) ON DELETE SET NULL,

            UNIQUE (id_viagem, fonte, fonte_id)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_restricoes_candidatas_viagem
        ON restricoes_candidatas(id_viagem, status_validacao)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_restricoes_candidatas_status
        ON restricoes_candidatas(status_validacao, risco)
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
        peso: Joi.number().positive().required()
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
        lon: Joi.number().min(-180).max(180).required()
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


app.get('/health', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT NOW() AS agora');
        res.json({
            status: 'ok',
            banco: 'postgresql',
            database: 'conectado',
            brevo: BREVO_API_KEY ? 'configurado' : 'não configurado',
            timestamp: resultado.rows[0].agora
        });
    } catch (erro) {
        res.status(500).json({ status: 'erro', database: 'desconectado', erro: erro.message });
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
                (placa,frota,modelo,comprimento,largura,peso)
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *
        `, [
            placa,
            req.body.frota || null,
            req.body.modelo || null,
            req.body.comprimento,
            req.body.largura,
            req.body.peso
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
                peso = $6
            WHERE id = $7
            RETURNING *
        `, [
            placa,
            req.body.frota || null,
            req.body.modelo || null,
            req.body.comprimento,
            req.body.largura,
            req.body.peso,
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
    peso
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
                }
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
// SCANNER DE INFRAESTRUTURA - ANTT (FONTE OFICIAL)
// ======================================================
const ANTT_CKAN_BASE = 'https://dados.antt.gov.br';
const ANTT_PACKAGE_SHOW =
    `${ANTT_CKAN_BASE}/api/3/action/package_show`;

const ANTT_DATASETS = {
    pontes: 'pontes-similares',
    altura: 'deteccao-de-altura'
};

// Cache local do backend: evita baixar milhares de registros
// a cada viagem.
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
        ) {
            return registro[chave];
        }
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

function textoANTT(valor) {
    return valor === null || valor === undefined
        ? ''
        : String(valor).trim();
}

async function consultarDatasetANTT(slug) {
    const cacheKey = `antt_dataset_${slug}`;
    const cache = anttDatasetCache.get(cacheKey);

    if (cache) return cache;

    const pacoteResp = await axios.get(
        ANTT_PACKAGE_SHOW,
        {
            params: { id: slug },
            headers: {
                'User-Agent': 'GPS-Caminhao-ANTT/1.0'
            },
            timeout: 30000
        }
    );

    const pacote = pacoteResp.data;

    if (!pacote?.success || !pacote?.result) {
        throw new Error(
            `Catálogo ANTT não retornou o dataset ${slug}`
        );
    }

    const recursos =
        Array.isArray(pacote.result.resources)
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
            function peso(r) {
                const formato = String(r.format || '').toUpperCase();
                const url = String(r.url || '').toLowerCase();

                if (formato === 'JSON') return 0;
                if (formato === 'CSV') return 1;
                if (url.endsWith('.json')) return 2;
                if (url.endsWith('.csv')) return 3;

                return 99;
            }

            return peso(a) - peso(b);
        });

    if (!candidatos.length) {
        throw new Error(
            `Nenhum recurso JSON/CSV localizado no dataset ANTT ${slug}`
        );
    }

    const recurso = candidatos[0];

    const resp = await axios.get(
        recurso.url,
        {
            headers: {
                'User-Agent': 'GPS-Caminhao-ANTT/1.0'
            },
            timeout: 90000,
            responseType: 'text',
            maxContentLength: 20 * 1024 * 1024
        }
    );

    let registros = [];

    const formato =
        String(recurso.format || '').toUpperCase();

    const urlLower =
        String(recurso.url || '').toLowerCase();

    if (
        formato === 'JSON' ||
        urlLower.includes('.json')
    ) {
        let dados = resp.data;

        if (typeof dados === 'string') {
            dados = JSON.parse(dados);
        }

        function coletarListas(obj, listas = []) {
            if (Array.isArray(obj)) {
                if (
                    obj.length &&
                    obj.every(x => x && typeof x === 'object' && !Array.isArray(x))
                ) {
                    listas.push(obj);
                }

                for (const item of obj) {
                    coletarListas(item, listas);
                }

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
                const props = {
                    ...(feature.properties || {})
                };

                const coords =
                    feature?.geometry?.coordinates;

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

            if (listas.length) {
                listas.sort((a, b) => b.length - a.length);
                registros = listas[0];
            }
        }

    } else {
        // Parser CSV simples, suficiente para os recursos ANTT.
        const texto = String(resp.data || '')
            .replace(/^\uFEFF/, '');

        const linhas = texto
            .split(/\r?\n/)
            .filter(Boolean);

        if (linhas.length >= 2) {
            const primeira = linhas[0];
            const sep =
                (primeira.match(/;/g) || []).length >
                (primeira.match(/,/g) || []).length
                    ? ';'
                    : ',';

            function parseLinhaCSV(linha) {
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

            const cab = parseLinhaCSV(linhas[0]);

            registros = linhas.slice(1).map(linha => {
                const vals = parseLinhaCSV(linha);
                const obj = {};

                cab.forEach((k, i) => {
                    obj[k] = vals[i] ?? '';
                });

                return obj;
            });
        }
    }

    if (!registros.length) {
        throw new Error(
            `Recurso ANTT ${slug} baixado, mas sem registros reconhecidos`
        );
    }

    const resultado = {
        slug,
        titulo: pacote.result.title,
        recurso: recurso.name,
        url: recurso.url,
        registros
    };

    anttDatasetCache.set(cacheKey, resultado);

    console.log(
        `✅ ANTT ${slug}: ${registros.length} registro(s) carregados`
    );

    return resultado;
}

function prepararPonteANTT(original) {
    const r = normalizarRegistroANTT(original);

    const tipo = primeiroANTT(
        r,
        'ds_tipo_ponte_similares',
        'tipo_de_ponte_e_similares',
        'tipo_de_ponte',
        'tipo'
    );

    const nome = primeiroANTT(
        r,
        'no_ponte_similares',
        'nome_de_ponte_e_similares',
        'nome_de_ponte',
        'nome'
    );

    const rodovia = primeiroANTT(
        r,
        'no_rodovia_entrada',
        'rodovia_uf_entrada',
        'rodovia',
        'br'
    );

    let uf = primeiroANTT(r, 'uf');

    if (!uf && rodovia) {
        const m =
            String(rodovia)
                .toUpperCase()
                .match(/\/([A-Z]{2})/);

        if (m) uf = m[1];
    }

    return {
        categoria: 'PONTE_SIMILAR',
        tipo: textoANTT(tipo),
        nome: textoANTT(nome),
        concessionaria: textoANTT(
            primeiroANTT(
                r,
                'no_concessionaria',
                'concessionaria'
            )
        ),
        rodovia: textoANTT(rodovia),
        uf: textoANTT(uf),
        km: textoANTT(
            primeiroANTT(
                r,
                'nu_km_inicial_entrada',
                'km_m_entrada',
                'km_entrada',
                'km_m',
                'km'
            )
        ),
        municipio: textoANTT(
            primeiroANTT(
                r,
                'municipio',
                'município'
            )
        ),
        sentido: textoANTT(
            primeiroANTT(
                r,
                'ds_sentido_entrada',
                'sentido_entrada',
                'sentido'
            )
        ),
        situacao: textoANTT(
            primeiroANTT(
                r,
                'situacao',
                'situação'
            )
        ),
        latitude: numeroANTT(
            primeiroANTT(
                r,
                'cg_latitude_inicial_entrada',
                'latitude_entrada',
                'latitude',
                'lat'
            )
        ),
        longitude: numeroANTT(
            primeiroANTT(
                r,
                'cg_longitude_inicial_entrada',
                'longitude_entrada',
                'longitude',
                'lon',
                'lng'
            )
        ),
        original
    };
}

function prepararDeteccaoAlturaANTT(original) {
    const r = normalizarRegistroANTT(original);

    const tipo = textoANTT(
        primeiroANTT(
            r,
            'tipo_de_equipamento',
            'tipo_equipamento',
            'tipo'
        )
    );

    return {
        categoria: 'DETECCAO_ALTURA',
        tipo,
        nome: tipo,
        concessionaria: textoANTT(
            primeiroANTT(r, 'concessionaria')
        ),
        rodovia: textoANTT(
            primeiroANTT(r, 'rodovia', 'br')
        ),
        uf: textoANTT(
            primeiroANTT(r, 'uf', 'estado')
        ),
        km: textoANTT(
            primeiroANTT(r, 'km_m', 'km')
        ),
        municipio: textoANTT(
            primeiroANTT(
                r,
                'municipio',
                'município'
            )
        ),
        sentido: textoANTT(
            primeiroANTT(r, 'sentido')
        ),
        situacao: textoANTT(
            primeiroANTT(
                r,
                'situacao',
                'situação'
            )
        ),
        latitude: numeroANTT(
            primeiroANTT(r, 'latitude', 'lat')
        ),
        longitude: numeroANTT(
            primeiroANTT(
                r,
                'longitude',
                'lon',
                'lng'
            )
        ),
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
            consultarDatasetANTT(
                ANTT_DATASETS.pontes
            ),
            consultarDatasetANTT(
                ANTT_DATASETS.altura
            )
        ]);

    const pontes =
        pontesDataset.registros
            .map(prepararPonteANTT)
            .filter(r =>
                Number.isFinite(r.latitude) &&
                Number.isFinite(r.longitude)
            );

    // O conjunto inclui estação meteorológica.
    // Mantemos apenas registros cujo tipo mencione altura.
    const deteccaoAltura =
        alturaDataset.registros
            .map(prepararDeteccaoAlturaANTT)
            .filter(r =>
                Number.isFinite(r.latitude) &&
                Number.isFinite(r.longitude) &&
                semAcentoANTT(r.tipo)
                    .toLowerCase()
                    .includes('altura')
            );

    return {
        pontes,
        deteccaoAltura,
        datasets: {
            pontes: {
                titulo: pontesDataset.titulo,
                recurso: pontesDataset.recurso
            },
            altura: {
                titulo: alturaDataset.titulo,
                recurso: alturaDataset.recurso
            }
        }
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
            return res.status(404).json({
                mensagem: 'Motorista sem veículo vinculado'
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
            return res.status(404).json({
                mensagem: 'Nenhuma viagem ativa para este veículo'
            });
        }

        res.json(resultado.rows[0]);

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
                comprimento, largura, peso, ativo
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
            rotaReutilizada = true;

            await client.query(`
                UPDATE rotas_especificas
                SET ultima_utilizacao = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [rotaEspecifica.id]);

            console.log(
                `♻️ Rota específica reutilizada: base=${req.body.id_rota} assinatura=${assinatura}`
            );

        } else {
            // 2. Não existe rota validada: calcula uma específica no ORS.
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
                        ultima_utilizacao = CURRENT_TIMESTAMP

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

                await client2.query('COMMIT');

                return res.status(201).json({
                    mensagem: 'Viagem criada com nova rota específica',
                    viagem: viagem.rows[0],
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

        await client.query('COMMIT');

        res.status(201).json({
            mensagem: 'Viagem criada usando rota específica já validada',
            viagem: viagem.rows[0],
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
            RETURNING vg.*
        `, [req.usuario.id, req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Viagem não encontrada para este veículo' });

        await pool.query(`
            UPDATE rotas SET status = 'em_andamento'
            WHERE id = $1
        `, [resultado.rows[0].id_rota]);

        res.json({ mensagem: 'Viagem iniciada', viagem: resultado.rows[0] });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

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
                re.reutilizavel
            FROM viagens vg
            LEFT JOIN rotas_especificas re
                ON re.id = vg.id_rota_especifica
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
            SELECT lat, lon, registrado_em
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

        await client.query(`
            UPDATE viagens
            SET
                status = 'concluida',
                chegada_real = CURRENT_TIMESTAMP,
                max_desvio_km = $1,
                desvio_longo = $2,
                rota_validada = $3
            WHERE id = $4
        `, [
            validacao.maxDesvioKm,
            validacao.desvioLongo,
            rotaPodeSerValidada,
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
            }
        });

    } catch (erro) {
        try { await client.query('ROLLBACK'); } catch(e) {}
        console.error('❌ Concluir/validar viagem:', erro);
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
    }
});

app.get('/monitoramento/resumo', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT vg.*, r.dados_geojson, l.lat, l.lon, l.ultima_atualizacao
            FROM viagens vg
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = vg.id_motorista
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

        res.json(alertas);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/monitoramento/viagens', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            SELECT
                vg.*,
                v.placa, v.frota, v.modelo,
                u.nome AS motorista,
                r.nome AS rota_nome, r.origem, r.destino, r.dados_geojson,
                l.lat, l.lon, l.ultima_atualizacao
            FROM viagens vg
            JOIN veiculos v ON v.id = vg.id_veiculo
            JOIN rotas r ON r.id = vg.id_rota
            LEFT JOIN usuarios u ON u.id = vg.id_motorista
            LEFT JOIN localizacoes l ON l.id_motorista = u.id
            WHERE vg.status IN ('planejada','em_andamento')
            ORDER BY vg.saida_prevista ASC NULLS LAST, vg.criada_em DESC
        `);

        const agora = new Date();

        const dados = resultado.rows.map(row => {
            let desvioKm = null;
            let progresso = 0;
            let eta = row.chegada_prevista ? new Date(row.chegada_prevista) : null;
            let atrasoMin = 0;

            if (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
                const analise = analisarPosicaoNaRota(row.dados_geojson, Number(row.lat), Number(row.lon));
                desvioKm = analise.distanciaRotaKm;
                progresso = analise.progresso;

                const duracaoTotal =
                    Number(row.dados_geojson?.features?.[0]?.properties?.segments?.[0]?.duration) || 0;

                if (row.status === 'em_andamento' && duracaoTotal > 0) {
                    const restanteSeg = duracaoTotal * (1 - progresso);
                    eta = new Date(agora.getTime() + restanteSeg * 1000);

                    if (row.chegada_prevista) {
                        atrasoMin = Math.max(
                            0,
                            Math.round((eta.getTime() - new Date(row.chegada_prevista).getTime()) / 60000)
                        );
                    }
                }
            }

            return {
                ...row,
                dados_geojson: undefined,
                desvio_km: desvioKm,
                fora_da_rota: desvioKm !== null && desvioKm > 0.5,
                progresso_percentual: Math.round(progresso * 100),
                eta_atual: eta,
                atraso_minutos: atrasoMin,
                atrasada: atrasoMin >= 10
            };
        });

        res.json(dados);
    } catch (erro) {
        console.error('❌ Monitoramento:', erro);
        res.status(500).json({ erro: erro.message });
    }
});


// ======================================================
// VERIFICAÇÃO DE RESTRIÇÕES DO TRAJETO
// ======================================================

// Faz a varredura da rota específica da viagem.
// NUNCA altera o roteamento automaticamente.
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
            return res.status(404).json({
                erro: 'Viagem não encontrada'
            });
        }

        const viagem = result.rows[0];

        if (!viagem.dados_geojson) {
            return res.status(400).json({
                erro: 'Viagem sem geometria de rota'
            });
        }

        const infraestrutura =
            await carregarInfraestruturaANTT();

        const registros = [
            ...infraestrutura.pontes,
            ...infraestrutura.deteccaoAltura
        ];

        const salvos = [];
        let ignoradosDistancia = 0;

        for (const reg of registros) {
            const analiseRota =
                analisarPosicaoNaRota(
                    viagem.dados_geojson,
                    reg.latitude,
                    reg.longitude
                );

            // Somente pontos próximos da rota real.
            if (
                analiseRota.distanciaRotaKm === null ||
                analiseRota.distanciaRotaKm > 1.0
            ) {
                ignoradosDistancia++;
                continue;
            }

            const isPonte =
                reg.categoria === 'PONTE_SIMILAR';

            const tipoTexto =
                semAcentoANTT(
                    reg.tipo || ''
                ).toLowerCase();

            let tipo = 'infraestrutura_antt';

            if (isPonte) {
                if (tipoTexto.includes('viaduto')) {
                    tipo = 'ponte_viaduto';
                } else if (tipoTexto.includes('ponte')) {
                    tipo = 'ponte_viaduto';
                } else if (
                    tipoTexto.includes('passagem inferior')
                ) {
                    tipo = 'passagem_inferior';
                } else {
                    tipo = 'obra_arte_especial';
                }
            } else {
                tipo = 'equipamento_deteccao_altura';
            }

            /*
             * REGRA DE SEGURANÇA:
             * ANTT confirma a existência/localização da infraestrutura,
             * mas estes datasets NÃO significam automaticamente que há
             * um limite de altura para o caminhão.
             *
             * Portanto:
             * - compatibilidade = verificar
             * - não marcamos "incompatível"
             * - não geramos desvio
             */
            const confianca =
                isPonte ? 90 : 92;

            const risco =
                isPonte ? 'baixo' : 'baixo';

            const observacao =
                isPonte
                    ? (
                        'Estrutura encontrada em base oficial da ANTT. ' +
                        'A existência/localização tem alta confiança, ' +
                        'mas a base de pontes/similares não confirma, por si só, ' +
                        'a altura livre nem uma restrição dimensional. ' +
                        'Exige verificação antes de qualquer bloqueio de rota.'
                    )
                    : (
                        'Equipamento de detecção de altura encontrado em base oficial da ANTT. ' +
                        'Isto indica a presença do equipamento, NÃO um limite máximo de altura. ' +
                        'Não bloqueia nem altera a rota.'
                    );

            const fonteId =
                `${reg.categoria}/${hashFonteANTT(reg)}`;

            const nome =
                reg.nome ||
                [
                    reg.tipo,
                    reg.rodovia,
                    reg.km
                        ? `km ${reg.km}`
                        : ''
                ]
                .filter(Boolean)
                .join(' - ') ||
                null;

            const tags = {
                categoria_antt: reg.categoria,
                tipo_antt: reg.tipo,
                concessionaria: reg.concessionaria,
                rodovia: reg.rodovia,
                uf: reg.uf,
                km: reg.km,
                municipio: reg.municipio,
                sentido: reg.sentido,
                situacao: reg.situacao,
                origem_dado: 'Portal de Dados Abertos ANTT',
                dados_originais: reg.original
            };

            const salvo = await pool.query(`
                INSERT INTO restricoes_candidatas
                (
                    id_viagem,
                    id_rota,
                    id_rota_especifica,
                    id_veiculo,
                    fonte,
                    fonte_id,
                    tipo,
                    nome,
                    lat,
                    lng,
                    distancia_rota_km,
                    limite_altura,
                    limite_largura,
                    limite_comprimento,
                    limite_peso,
                    limite_eixo,
                    compatibilidade,
                    risco,
                    confianca,
                    tags,
                    observacao,
                    ultima_deteccao
                )
                VALUES
                (
                    $1,$2,$3,$4,
                    'antt',$5,$6,$7,
                    $8,$9,$10,
                    NULL,NULL,NULL,NULL,NULL,
                    'verificar',$11,$12,$13::jsonb,$14,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (id_viagem, fonte, fonte_id)
                DO UPDATE SET
                    tipo = EXCLUDED.tipo,
                    nome = EXCLUDED.nome,
                    lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng,
                    distancia_rota_km = EXCLUDED.distancia_rota_km,
                    compatibilidade = EXCLUDED.compatibilidade,
                    risco = EXCLUDED.risco,
                    confianca = EXCLUDED.confianca,
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
                nome,
                reg.latitude,
                reg.longitude,
                Number(
                    analiseRota.distanciaRotaKm.toFixed(3)
                ),
                risco,
                confianca,
                JSON.stringify(tags),
                observacao
            ]);

            salvos.push(salvo.rows[0]);
        }

        res.json({
            mensagem:
                'Varredura ANTT concluída. Os registros são candidatos oficiais para verificação e NÃO alteram a rota automaticamente.',
            fonte: 'ANTT - Portal de Dados Abertos',
            viagem: {
                id: viagem.id,
                placa: viagem.placa,
                rota: viagem.rota_nome,
                origem: viagem.origem,
                destino: viagem.destino
            },
            datasets: infraestrutura.datasets,
            pontes_antt_total:
                infraestrutura.pontes.length,
            detectores_altura_antt_total:
                infraestrutura.deteccaoAltura.length,
            candidatos_na_rota:
                salvos.length,
            pontes_similares_na_rota:
                salvos.filter(
                    x =>
                        x.tipo === 'ponte_viaduto' ||
                        x.tipo === 'passagem_inferior' ||
                        x.tipo === 'obra_arte_especial'
                ).length,
            equipamentos_altura_na_rota:
                salvos.filter(
                    x =>
                        x.tipo === 'equipamento_deteccao_altura'
                ).length,
            ignorados_fora_corredor:
                ignoradosDistancia,
            aviso:
                'Detecção de altura da ANTT representa equipamento, não altura máxima permitida. Pontes/similares representam infraestrutura, não necessariamente restrição dimensional.'
        });

    } catch (erro) {
        console.error(
            '❌ Scanner ANTT:',
            erro.response?.data || erro.message
        );

        res.status(502).json({
            erro:
                'Não foi possível concluir a varredura ANTT',
            detalhe:
                erro.response?.data?.error ||
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
                r.nome AS rota_nome
            FROM restricoes_candidatas rc
            JOIN veiculos v ON v.id = rc.id_veiculo
            JOIN rotas r ON r.id = rc.id_rota
            WHERE rc.id_viagem = $1
            ORDER BY
                CASE rc.status_validacao
                    WHEN 'validada' THEN 0
                    WHEN 'confirmada' THEN 1
                    WHEN 'descoberta' THEN 2
                    ELSE 3
                END,
                CASE rc.risco
                    WHEN 'alto' THEN 0
                    WHEN 'medio' THEN 1
                    ELSE 2
                END,
                rc.distancia_rota_km ASC,
                rc.id ASC
        `, [req.params.id]);

        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.patch('/restricoes-candidatas/:id/status', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const status = String(req.body?.status || '');
    const permitidos = ['descoberta','confirmada','validada','rejeitada'];

    if (!permitidos.includes(status)) {
        return res.status(400).json({ erro: 'Status de validação inválido' });
    }

    const observacao =
        req.body?.observacao !== undefined
            ? String(req.body.observacao || '').slice(0, 1000)
            : null;

    try {
        const resultado = await pool.query(`
            UPDATE restricoes_candidatas
            SET
                status_validacao = $1,
                observacao = COALESCE($2, observacao),
                validado_por =
                    CASE
                        WHEN $1 IN ('confirmada','validada','rejeitada')
                            THEN $3
                        ELSE NULL
                    END,
                validado_em =
                    CASE
                        WHEN $1 IN ('confirmada','validada','rejeitada')
                            THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END
            WHERE id = $4
            RETURNING *
        `, [
            status,
            observacao,
            req.usuario.id,
            req.params.id
        ]);

        if (!resultado.rows.length) {
            return res.status(404).json({ erro: 'Candidato não encontrado' });
        }

        res.json({
            mensagem:
                status === 'validada'
                    ? 'Restrição validada. Ela está apta para uso futuro no motor de segurança, mas este endpoint não recalcula a rota.'
                    : 'Status atualizado.',
            restricao: resultado.rows[0]
        });

    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.get('/restricoes-candidatas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }

    const status = String(req.query.status || 'pendentes');

    try {
        let where = '';

        if (status === 'pendentes') {
            where = `WHERE rc.status_validacao IN ('descoberta','confirmada')`;
        } else if (['validada','rejeitada','descoberta','confirmada'].includes(status)) {
            where = `WHERE rc.status_validacao = '${status}'`;
        }

        const resultado = await pool.query(`
            SELECT
                rc.*,
                v.placa,
                r.nome AS rota_nome,
                r.origem,
                r.destino
            FROM restricoes_candidatas rc
            JOIN veiculos v ON v.id = rc.id_veiculo
            JOIN rotas r ON r.id = rc.id_rota
            ${where}
            ORDER BY
                CASE rc.risco
                    WHEN 'alto' THEN 0
                    WHEN 'medio' THEN 1
                    ELSE 2
                END,
                rc.ultima_deteccao DESC
            LIMIT 500
        `);

        res.json(resultado.rows);
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
                (
                    SELECT vg.id
                    FROM viagens vg
                    WHERE vg.id_veiculo = u.id_veiculo
                      AND vg.status = 'em_andamento'
                    ORDER BY vg.saida_real DESC NULLS LAST
                    LIMIT 1
                ) AS id_viagem
            FROM usuarios u
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
// LOCALIZAÇÕES
// ======================================================
app.post('/localizacao', autenticar, validar(schemas.localizacao), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const contexto = await pool.query(`
            SELECT
                u.id_veiculo,
                (
                    SELECT vg.id
                    FROM viagens vg
                    WHERE vg.id_veiculo = u.id_veiculo
                      AND vg.status = 'em_andamento'
                    ORDER BY vg.saida_real DESC NULLS LAST
                    LIMIT 1
                ) AS id_viagem
            FROM usuarios u
            WHERE u.id = $1
        `, [req.usuario.id]);

        const idVeiculo = contexto.rows[0]?.id_veiculo || null;
        const idViagem = contexto.rows[0]?.id_viagem || null;

        await pool.query(`
            INSERT INTO localizacoes (id_motorista,lat,lon,ultima_atualizacao)
            VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
            ON CONFLICT (id_motorista)
            DO UPDATE SET
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                ultima_atualizacao = CURRENT_TIMESTAMP
        `, [req.usuario.id, req.body.lat, req.body.lon]);

        // Grava histórico no máximo a cada 30 segundos por motorista.
        await pool.query(`
            INSERT INTO historico_localizacoes
                (id_motorista,id_veiculo,id_viagem,lat,lon,registrado_em)
            SELECT $1,$2,$3,$4,$5,CURRENT_TIMESTAMP
            WHERE NOT EXISTS (
                SELECT 1
                FROM historico_localizacoes
                WHERE id_motorista = $1
                  AND registrado_em > CURRENT_TIMESTAMP - INTERVAL '30 seconds'
            )
        `, [req.usuario.id, idVeiculo, idViagem, req.body.lat, req.body.lon]);

        res.json({ mensagem: 'Localização atualizada' });
    } catch (erro) {
        console.error('❌ Localização:', erro);
        res.status(500).json({ erro: erro.message });
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

iniciarServidor();
