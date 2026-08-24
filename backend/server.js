// backend/server.js
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

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL não configurada!');
}
if (!ORS_API_KEY) {
    console.warn('⚠️ ORS_API_KEY não configurada!');
}
if (!TOMTOM_API_KEY) {
    console.warn('⚠️ TOMTOM_API_KEY não configurada!');
}
if (!JWT_SECRET) {
    console.warn('⚠️ JWT_SECRET não configurada!');
}

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
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
app.use(express.json());

// ======================================================
// CRIAR TABELAS POSTGRESQL
// ======================================================
async function criarTabelas() {
    console.log('🔄 Verificando banco PostgreSQL...');
    
    // ==================================================
    // USUÁRIOS
    // ==================================================
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('admin', 'motorista')),
            login VARCHAR(255) UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // ==================================================
    // ROTAS
    // ==================================================
    await pool.query(`
        CREATE TABLE IF NOT EXISTS rotas (
            id SERIAL PRIMARY KEY,
            nome TEXT,
            origem TEXT,
            destino TEXT,
            restricoes JSONB DEFAULT '{}'::jsonb,
            dados_geojson JSONB,
            id_motorista INTEGER,
            status VARCHAR(30) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida')),
            criada_em TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_rotas_motorista FOREIGN KEY (id_motorista) REFERENCES usuarios(id) ON DELETE SET NULL
        )
    `);
    
    // ==================================================
    // LOCALIZAÇÕES
    // ==================================================
    await pool.query(`
        CREATE TABLE IF NOT EXISTS localizacoes (
            id SERIAL PRIMARY KEY,
            id_motorista INTEGER UNIQUE NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            ultima_atualizacao TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_localizacoes_motorista FOREIGN KEY (id_motorista) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);
    
    // ==================================================
    // REPORTES
    // ==================================================
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reportes (
            id SERIAL PRIMARY KEY,
            id_motorista INTEGER NOT NULL,
            tipo VARCHAR(30) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            data_hora TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_reportes_motorista FOREIGN KEY (id_motorista) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);
    
    // ==================================================
    // ÍNDICES
    // ==================================================
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rotas_motorista ON rotas(id_motorista)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reportes_motorista ON reportes(id_motorista)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reportes_data ON reportes(data_hora DESC)`);
    
    // ==================================================
    // USUÁRIOS PADRÃO
    // ==================================================
    const senhaAdmin = bcrypt.hashSync('admin123', 10);
    const senhaMotorista = bcrypt.hashSync('motor123', 10);
    
    await pool.query(
        `INSERT INTO usuarios (nome, tipo, login, senha) VALUES ($1, $2, $3, $4) ON CONFLICT (login) DO NOTHING`,
        ['Administrador', 'admin', 'admin', senhaAdmin]
    );
    
    await pool.query(
        `INSERT INTO usuarios (nome, tipo, login, senha) VALUES ($1, $2, $3, $4) ON CONFLICT (login) DO NOTHING`,
        ['Motorista José', 'motorista', 'jose', senhaMotorista]
    );
    
    console.log('✅ PostgreSQL preparado!');
    console.log('🧑‍💼 Admin: admin / admin123');
    console.log('🚛 Motorista: jose / motor123');
}

// ======================================================
// TESTAR POSTGRESQL
// ======================================================
async function testarBanco() {
    try {
        const result = await pool.query('SELECT NOW() AS agora');
        console.log('✅ PostgreSQL conectado!');
        console.log('🕒 Banco:', result.rows[0].agora);
        return true;
    } catch (erro) {
        console.error('❌ Erro ao conectar no PostgreSQL:');
        console.error(erro.message);
        return false;
    }
}

// ======================================================
// AUTENTICAÇÃO
// ======================================================
function autenticar(req, res, next) {
    const token = req.headers['authorization'];
    
    if (!token) {
        return res.status(401).json({ erro: 'Token não fornecido' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ erro: 'Token inválido' });
        }
        req.usuario = decoded;
        next();
    });
}

// ======================================================
// RATE LIMIT
// ======================================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { erro: 'Muitas requisições.' }
});

const heavyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    message: { erro: 'Limite excedido.' }
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
        id_motorista: Joi.number().integer().positive().required()
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
        comprimento: Joi.number().positive().optional()
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

// ======================================================
// VALIDAR BODY
// ======================================================
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

// ======================================================
// VALIDAR QUERY
// ======================================================
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
// CACHE
// ======================================================
const routeCache = new NodeCache({
    stdTTL: 3600,
    checkperiod: 120
});

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
// ROTA TESTE
// ======================================================
app.get('/teste-rota', (req, res) => {
    res.json({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [-46.6333, -23.5505],
                    [-46.5000, -23.4000],
                    [-46.2000, -23.1000],
                    [-45.8000, -22.8000],
                    [-45.2000, -22.6000],
                    [-44.5000, -22.5000],
                    [-44.0000, -22.8000],
                    [-43.5000, -23.0000],
                    [-43.2075, -22.9028]
                ]
            },
            properties: {
                segments: [{
                    distance: 435000,
                    duration: 16200
                }]
            }
        }],
        origem: 'São Paulo, SP',
        destino: 'Rio de Janeiro, RJ',
        restricoes: {
            altura: 4.2,
            peso: 15,
            comprimento: 12
        }
    });
});

// ======================================================
// HOME
// ======================================================
app.get('/', (req, res) => {
    res.json({
        mensagem: '🚀 GPS Caminhão API',
        banco: 'PostgreSQL',
        status: 'online'
    });
});

// ======================================================
// HEALTH
// ======================================================
app.get('/health', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT NOW() AS agora');
        res.json({
            status: 'ok',
            banco: 'postgresql',
            database: 'conectado',
            timestamp: resultado.rows[0].agora
        });
    } catch (erro) {
        res.status(500).json({
            status: 'erro',
            database: 'desconectado',
            erro: erro.message
        });
    }
});

// ======================================================
// LOGIN
// ======================================================
app.post('/login', validar(schemas.login), async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT id, nome, tipo, login, senha FROM usuarios WHERE login = $1 LIMIT 1`,
            [req.body.login]
        );
        
        const user = resultado.rows[0];
        
        if (!user) {
            return res.status(401).json({ erro: 'Usuário não encontrado' });
        }
        
        const senhaCorreta = bcrypt.compareSync(req.body.senha, user.senha);
        
        if (!senhaCorreta) {
            return res.status(401).json({ erro: 'Senha incorreta' });
        }
        
        const token = jwt.sign(
            { id: user.id, login: user.login, tipo: user.tipo },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        res.json({
            token,
            usuario: {
                id: user.id,
                nome: user.nome,
                tipo: user.tipo
            }
        });
    } catch (erro) {
        console.error('❌ Erro login:', erro);
        res.status(500).json({ erro: 'Erro interno no login' });
    }
});

// ======================================================
// LISTAR MOTORISTAS
// ======================================================
app.get('/motoristas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(`
            SELECT id, nome, login, tipo
            FROM usuarios
            WHERE tipo = 'motorista'
            ORDER BY nome ASC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// CADASTRAR MOTORISTA
// ======================================================
app.post('/motoristas', autenticar, validar(schemas.motorista), async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const existe = await pool.query(
            `SELECT id FROM usuarios WHERE login = $1 LIMIT 1`,
            [req.body.login]
        );
        
        if (existe.rows.length > 0) {
            return res.status(400).json({ erro: 'Login já em uso' });
        }
        
        const senhaHash = bcrypt.hashSync(req.body.senha, 10);
        
        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, tipo, login, senha) VALUES ($1, 'motorista', $2, $3) RETURNING id, nome, login, tipo`,
            [req.body.nome, req.body.login, senhaHash]
        );
        
        console.log(`✅ Motorista cadastrado: ${req.body.login}`);
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error('❌ Cadastro motorista:', erro);
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// CRIAR ROTA
// ======================================================
app.post('/rotas', autenticar, validar(schemas.rota), async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(
            `INSERT INTO rotas (nome, origem, destino, restricoes, dados_geojson, id_motorista, status) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, 'pendente') RETURNING id`,
            [
                req.body.nome,
                req.body.origem,
                req.body.destino,
                JSON.stringify(req.body.restricoes || {}),
                JSON.stringify(req.body.dados_geojson),
                req.body.id_motorista
            ]
        );
        
        res.status(201).json({
            mensagem: 'Rota criada!',
            id: resultado.rows[0].id
        });
    } catch (erro) {
        console.error('❌ Erro ao criar rota:', erro);
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// LISTAR ROTAS
// ======================================================
app.get('/rotas', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(`SELECT * FROM rotas ORDER BY criada_em DESC`);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// REPORTAR
// ======================================================
app.post('/reportar', autenticar, validar(schemas.reporte), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(
            `INSERT INTO reportes (id_motorista, tipo, lat, lng) VALUES ($1, $2, $3, $4) RETURNING id`,
            [req.usuario.id, req.body.tipo, req.body.lat, req.body.lng]
        );
        
        res.json({
            mensagem: `Reporte de "${req.body.tipo}" enviado!`,
            id: resultado.rows[0].id
        });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// LISTAR REPORTES
// ======================================================
app.get('/reportes', autenticar, async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT r.id, u.nome AS motorista, r.tipo, r.lat, r.lng, r.data_hora
            FROM reportes r
            JOIN usuarios u ON u.id = r.id_motorista
            ORDER BY r.data_hora DESC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// APAGAR REPORTES
// ======================================================
app.delete('/reportes', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
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
// LOCALIZAÇÃO
// ======================================================
app.post('/localizacao', autenticar, validar(schemas.localizacao), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        await pool.query(
            `INSERT INTO localizacoes (id_motorista, lat, lon, ultima_atualizacao) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (id_motorista) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, ultima_atualizacao = CURRENT_TIMESTAMP`,
            [req.usuario.id, req.body.lat, req.body.lon]
        );
        
        res.json({ mensagem: 'Localização atualizada' });
    } catch (erro) {
        console.error('❌ Localização:', erro);
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// LOCALIZAÇÕES ADMIN
// ======================================================
app.get('/localizacoes', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'admin') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(`
            SELECT u.id, u.nome, l.lat, l.lon, l.ultima_atualizacao
            FROM usuarios u
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
// ROTA MOTORISTA
// ======================================================
app.get('/rotas/minha-rota', autenticar, async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(
            `SELECT * FROM rotas WHERE id_motorista = $1 AND status IN ('pendente', 'em_andamento') ORDER BY criada_em DESC LIMIT 1`,
            [req.usuario.id]
        );
        
        if (resultado.rows.length === 0) {
            return res.status(404).json({ mensagem: 'Nenhuma rota ativa' });
        }
        
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// STATUS DA ROTA
// ======================================================
app.patch('/rotas/:id/status', autenticar, validar(schemas.status), async (req, res) => {
    if (req.usuario.tipo !== 'motorista') {
        return res.status(403).json({ erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(
            `UPDATE rotas SET status = $1 WHERE id = $2 AND id_motorista = $3`,
            [req.body.status, req.params.id, req.usuario.id]
        );
        
        if (resultado.rowCount === 0) {
            return res.status(404).json({ erro: 'Rota não encontrada' });
        }
        
        res.json({ mensagem: 'Status atualizado' });
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

// ======================================================
// POLÍGONO DO INCIDENTE
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
    
    return {
        type: 'Polygon',
        coordinates: [ring]
    };
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
        
        if (cacheado) {
            return res.json(cacheado);
        }
        
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
                        width: 2.6
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
                    'Authorization': ORS_API_KEY
                },
                timeout: 20000
            }
        );
        
        routeCache.set(chave, response.data);
        res.json(response.data);
    } catch (error) {
        console.error('❌ ORS:', error.response?.data || error.message);
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
        
        const options = {
            avoid_polygons: zonaBloqueada
        };
        
        if (perfil === 'driving-hgv') {
            options.profile_params = {
                restrictions: {
                    height: req.body.altura || 4.2,
                    weight: req.body.peso || 15,
                    length: req.body.comprimento || 12,
                    width: 2.6
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
                    'Authorization': ORS_API_KEY
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
        console.error('❌ Erro ao criar tabelas:');
        console.error(erro);
        process.exit(1);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log('========================================');
        console.log(`🚀 Servidor: porta ${PORT}`);
        console.log('🐘 Banco: PostgreSQL');
        console.log('📍 GPS em tempo real: ATIVO');
        console.log('🚨 Reportes: ATIVO');
        console.log('🛣️ Desvio automático: ATIVO');
        console.log('========================================');
    });
}

iniciarServidor();