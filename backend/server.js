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

    rota: Joi.object({
        nome: Joi.string().min(1).required(),
        origem: Joi.string().required(),
        destino: Joi.string().required(),
        restricoes: Joi.object().optional(),
        dados_geojson: Joi.object().required(),
        id_motorista: Joi.number().integer().positive().optional(),
        id_veiculo: Joi.number().integer().positive().optional(),
        carga: Joi.string().allow('').max(300).optional(),
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

    if (!req.body.id_motorista && !req.body.id_veiculo) {
        return res.status(400).json({ erro: 'Informe o motorista ou o veículo da rota' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const resultado = await client.query(`
            INSERT INTO rotas
                (nome,origem,destino,restricoes,dados_geojson,id_motorista,id_veiculo,status)
            VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,'pendente')
            RETURNING id
        `, [
            req.body.nome,
            req.body.origem,
            req.body.destino,
            JSON.stringify(req.body.restricoes || {}),
            JSON.stringify(req.body.dados_geojson),
            req.body.id_motorista || null,
            req.body.id_veiculo || null
        ]);

        const idRota = resultado.rows[0].id;
        let idViagem = null;

        if (req.body.id_veiculo) {
            const motoristaAtual = await client.query(`
                SELECT id FROM usuarios
                WHERE tipo = 'motorista' AND id_veiculo = $1
                LIMIT 1
            `, [req.body.id_veiculo]);

            const duracaoSeg =
                Number(req.body.dados_geojson?.features?.[0]?.properties?.segments?.[0]?.duration) || 0;

            const saidaPrevista = req.body.saida_prevista ? new Date(req.body.saida_prevista) : new Date();
            const chegadaPrevista = new Date(saidaPrevista.getTime() + duracaoSeg * 1000);

            const viagem = await client.query(`
                INSERT INTO viagens
                    (id_rota,id_veiculo,id_motorista,carga,altura_total,peso_total,status,
                     saida_prevista,chegada_prevista)
                VALUES ($1,$2,$3,$4,$5,$6,'planejada',$7,$8)
                RETURNING id
            `, [
                idRota,
                req.body.id_veiculo,
                motoristaAtual.rows[0]?.id || null,
                req.body.carga || null,
                Number(req.body.restricoes?.altura) || null,
                Number(req.body.restricoes?.peso) || null,
                saidaPrevista,
                chegadaPrevista
            ]);

            idViagem = viagem.rows[0].id;
        }

        await client.query('COMMIT');

        res.status(201).json({
            mensagem: 'Rota e viagem criadas!',
            id: idRota,
            viagem_id: idViagem
        });
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error('❌ Criar rota/viagem:', erro);
        res.status(500).json({ erro: erro.message });
    } finally {
        client.release();
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

app.get('/rotas/minha-rota', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const usuario = await pool.query(`SELECT id,id_veiculo FROM usuarios WHERE id = $1 LIMIT 1`, [req.usuario.id]);
        const user = usuario.rows[0];
        let resultado;

        if (user?.id_veiculo) {
            resultado = await pool.query(`
                SELECT
                    r.*,
                    vg.id AS viagem_id,
                    vg.status AS viagem_status,
                    vg.carga,
                    vg.saida_prevista,
                    vg.saida_real,
                    vg.chegada_prevista,
                    vg.chegada_real
                FROM rotas r
                LEFT JOIN viagens vg
                    ON vg.id_rota = r.id
                   AND vg.status IN ('planejada','em_andamento')
                WHERE r.id_veiculo = $1
                  AND r.status IN ('pendente','em_andamento')
                ORDER BY r.criada_em DESC
                LIMIT 1
            `, [user.id_veiculo]);
        } else {
            resultado = await pool.query(`
                SELECT r.*, NULL::INTEGER AS viagem_id
                FROM rotas r
                WHERE r.id_motorista = $1
                  AND r.status IN ('pendente','em_andamento')
                ORDER BY r.criada_em DESC
                LIMIT 1
            `, [req.usuario.id]);
        }

        if (!resultado.rows.length) return res.status(404).json({ mensagem: 'Nenhuma rota ativa' });
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
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
    if (req.usuario.tipo !== 'motorista') return res.status(403).json({ erro: 'Acesso negado' });

    try {
        const resultado = await pool.query(`
            UPDATE viagens vg
            SET status = 'concluida',
                chegada_real = CURRENT_TIMESTAMP
            FROM usuarios u
            WHERE vg.id = $2
              AND u.id = $1
              AND u.id_veiculo = vg.id_veiculo
              AND vg.status = 'em_andamento'
            RETURNING vg.*
        `, [req.usuario.id, req.params.id]);

        if (!resultado.rows.length) return res.status(404).json({ erro: 'Viagem em andamento não encontrada' });

        await pool.query(`UPDATE rotas SET status = 'concluida' WHERE id = $1`, [resultado.rows[0].id_rota]);

        res.json({ mensagem: 'Viagem concluída', viagem: resultado.rows[0] });
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
            INSERT INTO reportes (id_motorista,id_veiculo,id_viagem,tipo,lat,lng)
            VALUES ($1,$2,$3,$4,$5,$6)
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
        const resultado = await pool.query(`
            SELECT
                r.id,
                u.nome AS motorista,
                v.placa,
                r.tipo,
                r.lat,
                r.lng,
                r.data_hora
            FROM reportes r
            JOIN usuarios u ON u.id = r.id_motorista
            LEFT JOIN veiculos v ON v.id = u.id_veiculo
            ORDER BY r.data_hora DESC
        `);
        res.json(resultado.rows);
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
