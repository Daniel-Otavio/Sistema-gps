// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const axios = require('axios');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());

// ======================================================
// BANCO SQLITE
// ======================================================
const dbPath = path.join(__dirname, 'database', 'gps.db');
const db = require('better-sqlite3')(dbPath);

// ======================================================
// CHAVES DE API
// ======================================================
const ORS_API_KEY = process.env.ORS_API_KEY;
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!ORS_API_KEY || !TOMTOM_API_KEY || !JWT_SECRET) {
    console.warn('⚠️ Variáveis de ambiente não configuradas corretamente');
}

// ======================================================
// CRIAR TABELAS
// ======================================================
function criarTabelas() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            tipo TEXT CHECK(tipo IN ('admin', 'motorista')) NOT NULL,
            login TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS rotas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            origem TEXT,
            destino TEXT,
            restricoes TEXT,
            dados_geojson TEXT,
            id_motorista INTEGER,
            status TEXT DEFAULT 'pendente'
                CHECK(status IN ('pendente', 'em_andamento', 'concluida')),
            criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(id_motorista) REFERENCES usuarios(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS localizacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_motorista INTEGER UNIQUE,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(id_motorista) REFERENCES usuarios(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS reportes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_motorista INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(id_motorista) REFERENCES usuarios(id)
        )
    `);

    // ==================================================
    // USUÁRIOS PADRÃO
    // ==================================================
    const senhaAdmin = bcrypt.hashSync('admin123', 10);
    const senhaMotorista = bcrypt.hashSync('motor123', 10);
    const insertUser = db.prepare(`
        INSERT OR IGNORE INTO usuarios
        (nome, tipo, login, senha)
        VALUES (?, ?, ?, ?)
    `);

    insertUser.run(
        'Administrador',
        'admin',
        'admin',
        senhaAdmin
    );

    insertUser.run(
        'Motorista José',
        'motorista',
        'jose',
        senhaMotorista
    );

    console.log('✅ Tabelas criadas/verificadas com sucesso!');
    console.log('🧑‍💼 Admin: login=admin, senha=admin123');
    console.log('🧑‍✈️ Motorista: login=jose, senha=motor123');
}

criarTabelas();

// ======================================================
// AUTENTICAÇÃO
// ======================================================
function autenticar(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({
            erro: 'Token não fornecido'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({
                erro: 'Token inválido'
            });
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
    max: 100,
    message: {
        erro: 'Muitas requisições.'
    }
});

const heavyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    message: {
        erro: 'Limite excedido.'
    }
});

app.use(globalLimiter);

// ======================================================
// VALIDAÇÕES JOI
// ======================================================
const schemas = {
    login: Joi.object({
        login: Joi.string().required(),
        senha: Joi.string().required()
    }),
    motorista: Joi.object({
        nome: Joi.string().min(3).required(),
        login: Joi.string().min(3).required(),
        senha: Joi.string().min(4).required()
    }),
    rota: Joi.object({
        nome: Joi.string()
            .min(1)
            .required(),
        origem: Joi.string()
            .required(),
        destino: Joi.string()
            .required(),
        restricoes: Joi.object()
            .optional(),
        dados_geojson: Joi.object()
            .required(),
        id_motorista: Joi.number()
            .integer()
            .positive()
            .required()
    }),
    calcularRota: Joi.object({
        origem: Joi.object({
            lat: Joi.number()
                .min(-90)
                .max(90)
                .required(),
            lon: Joi.number()
                .min(-180)
                .max(180)
                .required()
        }).required(),
        destino: Joi.object({
            lat: Joi.number()
                .min(-90)
                .max(90)
                .required(),
            lon: Joi.number()
                .min(-180)
                .max(180)
                .required()
        }).required(),
        altura: Joi.number()
            .positive()
            .optional(),
        peso: Joi.number()
            .positive()
            .optional(),
        comprimento: Joi.number()
            .positive()
            .optional(),
        perfil: Joi.string()
            .valid('driving-car', 'driving-hgv')
            .required(),
        preferencia: Joi.string()
            .valid('fastest', 'shortest', 'recommended')
            .optional()
    }),
    // ==================================================
    // 🔥 RECÁLCULO COM PONTO DO INCIDENTE
    // ==================================================
    recalcularDesvio: Joi.object({
        pontoSaida: Joi.array()
            .items(Joi.number())
            .length(2)
            .required(),
        pontoIncidente: Joi.array()
            .items(Joi.number())
            .length(2)
            .required(),
        pontoReentrada: Joi.array()
            .items(Joi.number())
            .length(2)
            .required(),
        raioBloqueio: Joi.number()
            .min(50)
            .max(1000)
            .optional(),
        perfil: Joi.string()
            .valid('driving-car', 'driving-hgv')
            .optional(),
        altura: Joi.number()
            .positive()
            .optional(),
        peso: Joi.number()
            .positive()
            .optional(),
        comprimento: Joi.number()
            .positive()
            .optional()
    }),
    localizacao: Joi.object({
        lat: Joi.number()
            .min(-90)
            .max(90)
            .required(),
        lon: Joi.number()
            .min(-180)
            .max(180)
            .required()
    }),
    status: Joi.object({
        status: Joi.string()
            .valid(
                'pendente',
                'em_andamento',
                'concluida'
            )
            .required()
    }),
    traffic: Joi.object({
        top: Joi.number()
            .min(-90)
            .max(90)
            .required(),
        bottom: Joi.number()
            .min(-90)
            .max(90)
            .required(),
        left: Joi.number()
            .min(-180)
            .max(180)
            .required(),
        right: Joi.number()
            .min(-180)
            .max(180)
            .required()
    }),
    reporte: Joi.object({
        lat: Joi.number()
            .min(-90)
            .max(90)
            .required(),
        lng: Joi.number()
            .min(-180)
            .max(180)
            .required(),
        tipo: Joi.string()
            .valid(
                'radar',
                'acidente',
                'obra',
                'perigo',
                'risco'
            )
            .required()
    })
};

// ======================================================
// MIDDLEWARE VALIDAÇÃO BODY
// ======================================================
function validar(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(
            req.body,
            {
                abortEarly: false
            }
        );

        if (error) {
            return res.status(400).json({
                erro: 'Dados inválidos',
                detalhes: error.details
                    .map(d => d.message)
                    .join(', ')
            });
        }

        req.body = value;
        next();
    };
}

// ======================================================
// VALIDAÇÃO QUERY
// ======================================================
function validarQuery(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(
            req.query,
            {
                abortEarly: false
            }
        );

        if (error) {
            return res.status(400).json({
                erro: 'Parâmetros inválidos',
                detalhes: error.details
                    .map(d => d.message)
                    .join(', ')
            });
        }

        req.query = value;
        next();
    };
}

// ======================================================
// CACHE DE ROTAS
// ======================================================
const routeCache = new NodeCache({
    stdTTL: 3600,
    checkperiod: 120
});

function gerarChaveRota(
    origem,
    destino,
    perfil,
    preferencia,
    altura,
    peso,
    comprimento
) {
    return JSON.stringify({
        origem,
        destino,
        perfil,
        preferencia:
            preferencia || 'fastest',
        altura:
            altura || 0,
        peso:
            peso || 0,
        comprimento:
            comprimento || 0
    });
}

// ======================================================
// ROTA DE TESTE
// ======================================================
app.get('/teste-rota', (req, res) => {
    res.json({
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
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
                    segments: [
                        {
                            distance: 435000,
                            duration: 16200
                        }
                    ]
                }
            }
        ],
        info: {
            origem: "São Paulo, SP",
            destino: "Rio de Janeiro, RJ",
            restricoes: {
                altura: 4.2,
                peso: 15,
                comprimento: 12
            },
            mensagem: "🧪 Rota de TESTE"
        }
    });
});

// ======================================================
// HOME
// ======================================================
app.get('/', (req, res) => {
    res.json({
        mensagem:
            '🚀 API do GPS Caminhão está rodando!',
        endpoints: {
            publicos: [
                'POST /login',
                'GET /teste-rota'
            ],
            protegidos_admin: [
                'GET /motoristas',
                'POST /rotas',
                'GET /rotas',
                'GET /localizacoes',
                'DELETE /reportes'
            ],
            protegidos_motorista: [
                'GET /rotas/minha-rota',
                'PATCH /rotas/:id/status',
                'POST /localizacao',
                'POST /reportar'
            ],
            compartilhados: [
                'GET /reportes',
                'GET /api/traffic',
                'POST /api/recalcular-desvio'
            ]
        }
    });
});

// ======================================================
// HEALTH
// ======================================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp:
            new Date().toISOString()
    });
});

// ======================================================
// LOGIN
// ======================================================
app.post(
    '/login',
    validar(schemas.login),
    (req, res) => {
        try {
            const user = db
                .prepare(`
                    SELECT *
                    FROM usuarios
                    WHERE login = ?
                `)
                .get(req.body.login);

            if (!user) {
                return res.status(401).json({
                    erro: 'Usuário não encontrado'
                });
            }

            if (
                !bcrypt.compareSync(
                    req.body.senha,
                    user.senha
                )
            ) {
                return res.status(401).json({
                    erro: 'Senha incorreta'
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    login: user.login,
                    tipo: user.tipo
                },
                JWT_SECRET,
                {
                    expiresIn: '8h'
                }
            );

            res.json({
                token,
                usuario: {
                    id: user.id,
                    nome: user.nome,
                    tipo: user.tipo
                }
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// MOTORISTAS
// ======================================================
app.get(
    '/motoristas',
    autenticar,
    (req, res) => {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            res.json(
                db.prepare(`
                    SELECT
                        id,
                        nome,
                        login,
                        tipo
                    FROM usuarios
                    WHERE tipo = 'motorista'
                `).all()
            );
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// CRIAR MOTORISTA
// ======================================================
app.post(
    '/motoristas',
    autenticar,
    validar(schemas.motorista),
    (req, res) => {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const existe = db
                .prepare(`
                    SELECT id
                    FROM usuarios
                    WHERE login = ?
                `)
                .get(req.body.login);

            if (existe) {
                return res.status(400).json({
                    erro: 'Login já em uso'
                });
            }

            const senha =
                bcrypt.hashSync(
                    req.body.senha,
                    10
                );

            const info = db
                .prepare(`
                    INSERT INTO usuarios
                    (
                        nome,
                        tipo,
                        login,
                        senha
                    )
                    VALUES
                    (?, 'motorista', ?, ?)
                `)
                .run(
                    req.body.nome,
                    req.body.login,
                    senha
                );

            res.status(201).json({
                id: info.lastInsertRowid,
                nome: req.body.nome,
                login: req.body.login,
                tipo: 'motorista'
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// CRIAR ROTA
// ======================================================
app.post(
    '/rotas',
    autenticar,
    validar(schemas.rota),
    (req, res) => {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const info = db.prepare(`
                INSERT INTO rotas
                (
                    nome,
                    origem,
                    destino,
                    restricoes,
                    dados_geojson,
                    id_motorista,
                    status
                )
                VALUES
                (?, ?, ?, ?, ?, ?, 'pendente')
            `).run(
                req.body.nome,
                req.body.origem,
                req.body.destino,
                JSON.stringify(
                    req.body.restricoes || {}
                ),
                JSON.stringify(
                    req.body.dados_geojson
                ),
                req.body.id_motorista
            );

            res.status(201).json({
                mensagem:
                    'Rota criada!',
                id:
                    info.lastInsertRowid
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// LISTAR ROTAS
// ======================================================
app.get(
    '/rotas',
    autenticar,
    (req, res) => {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const rows = db.prepare(`
                SELECT *
                FROM rotas
                ORDER BY criada_em DESC
            `).all();

            res.json(
                rows.map(r => ({
                    ...r,
                    restricoes:
                        JSON.parse(
                            r.restricoes || '{}'
                        ),
                    dados_geojson:
                        JSON.parse(
                            r.dados_geojson || 'null'
                        )
                }))
            );
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// DELETAR REPORTES
// ======================================================
app.delete(
    '/reportes',
    autenticar,
    (req, res) => {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const result = db
                .prepare(`
                    DELETE FROM reportes
                `)
                .run();

            console.log(
                `🗑️ ${result.changes} reporte(s) deletado(s)`
            );

            res.json({
                mensagem:
                    `${result.changes} reporte(s) removido(s) com sucesso!`,
                quantidade:
                    result.changes
            });
        } catch (err) {
            console.error(
                'Erro ao deletar reportes:',
                err
            );
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// CRIAR REPORTE
// ======================================================
app.post(
    '/reportar',
    autenticar,
    validar(schemas.reporte),
    (req, res) => {
        if (
            req.usuario.tipo !==
            'motorista'
        ) {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            db.prepare(`
                INSERT INTO reportes
                (
                    id_motorista,
                    tipo,
                    lat,
                    lng
                )
                VALUES
                (?, ?, ?, ?)
            `).run(
                req.usuario.id,
                req.body.tipo,
                req.body.lat,
                req.body.lng
            );

            res.json({
                mensagem:
                    `Reporte de "${req.body.tipo}" enviado!`
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// LISTAR REPORTES
// ======================================================
app.get(
    '/reportes',
    autenticar,
    (req, res) => {
        try {
            const rows = db.prepare(`
                SELECT
                    r.id,
                    u.nome as motorista,
                    r.tipo,
                    r.lat,
                    r.lng,
                    r.data_hora
                FROM reportes r
                JOIN usuarios u
                    ON r.id_motorista = u.id
                ORDER BY
                    r.data_hora DESC
            `).all();

            res.json(rows);
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
//  CRIAR ZONA DE BLOQUEIO AO REDOR DO INCIDENTE
// ======================================================
function criarPoligonoCircular(
    lng,
    lat,
    raioMetros,
    pontos = 16
) {
    /*
        Converte aproximadamente metros para graus.
        Para pequenas áreas de bloqueio
        (100m, 200m, 300m etc.)
        essa aproximação funciona bem.
     */
    const metrosPorGrauLat = 111320;
    const metrosPorGrauLng =
        Math.max(
            1000,
            111320 *
            Math.cos(
                lat * Math.PI / 180
            )
        );

    const ring = [];

    for (
        let i = 0;
        i < pontos;
        i++
    ) {
        const ang =
            (2 * Math.PI * i) /
            pontos;

        const dx =
            Math.cos(ang) *
            raioMetros;

        const dy =
            Math.sin(ang) *
            raioMetros;

        ring.push([
            lng +
            dx /
            metrosPorGrauLng,
            lat +
            dy /
            metrosPorGrauLat
        ]);
    }

    // Fecha o polígono
    ring.push([
        ...ring[0]
    ]);

    return {
        type: 'Polygon',
        coordinates: [
            ring
        ]
    };
}

// ======================================================
// CALCULAR ROTA NORMAL
// ======================================================
app.post(
    '/api/calcular-rota',
    autenticar,
    heavyLimiter,
    validar(
        schemas.calcularRota
    ),
    async (req, res) => {
        try {
            const chave =
                gerarChaveRota(
                    req.body.origem,
                    req.body.destino,
                    req.body.perfil,
                    req.body.preferencia,
                    req.body.altura,
                    req.body.peso,
                    req.body.comprimento
                );

            const cacheado =
                routeCache.get(chave);

            if (cacheado) {
                console.log(
                    '📦 Rota encontrada no cache'
                );
                return res.json(
                    cacheado
                );
            }

            const body = {
                coordinates: [
                    [
                        req.body.origem.lon,
                        req.body.origem.lat
                    ],
                    [
                        req.body.destino.lon,
                        req.body.destino.lat
                    ]
                ],
                preference:
                    req.body.preferencia ||
                    'fastest'
            };

            // ==========================================
            // RESTRIÇÕES DE CAMINHÃO
            // ==========================================
            if (
                req.body.perfil ===
                'driving-hgv'
            ) {
                body.options = {
                    profile_params: {
                        restrictions: {
                            height:
                                req.body.altura ||
                                4.2,
                            weight:
                                req.body.peso ||
                                15,
                            length:
                                req.body.comprimento ||
                                12,
                            width:
                                2.6
                        }
                    }
                };
            }

            console.log(
                '🗺️ Calculando rota ORS...'
            );

            const response =
                await axios.post(
                    `https://api.openrouteservice.org/v2/directions/${req.body.perfil}/geojson`,
                    body,
                    {
                        headers: {
                            'Content-Type':
                                'application/json',
                            'Authorization':
                                ORS_API_KEY
                        },
                        timeout:
                            15000
                    }
                );

            routeCache.set(
                chave,
                response.data
            );

            res.json(
                response.data
            );
        } catch (error) {
            console.error(
                '❌ Erro ORS:',
                error.response?.data ||
                error.message
            );

            res.status(
                error.response?.status ||
                500
            ).json({
                erro:
                    'Falha ao calcular rota',
                detalhe:
                    error.response?.data ||
                    error.message
            });
        }
    }
);

// ======================================================
// 🔥🔥🔥 RECALCULAR DESVIO REAL
// ======================================================
app.post(
    '/api/recalcular-desvio',
    autenticar,
    heavyLimiter,
    validar(
        schemas.recalcularDesvio
    ),
    async (req, res) => {
        try {
            // ==========================================
            // PERFIL
            // ==========================================
            const perfil =
                req.body.perfil ||
                'driving-hgv';

            // ==========================================
            // LOCAL DO INCIDENTE
            // ==========================================
            const [
                lngIncidente,
                latIncidente
            ] =
                req.body.pontoIncidente;

            // ==========================================
            // RAIO DE BLOQUEIO
            // ==========================================
            const raioBloqueio =
                req.body.raioBloqueio ||
                180;

            console.log(
                '=========================================='
            );
            console.log(
                '🚨 RECÁLCULO DE DESVIO'
            );
            console.log(
                ` Incidente: ${latIncidente}, ${lngIncidente}`
            );
            console.log(
                `🚧 Raio bloqueado: ${raioBloqueio} metros`
            );
            console.log(
                `🚛 Perfil: ${perfil}`
            );

            // ==========================================
            // CRIAR POLÍGONO BLOQUEADO
            // ==========================================
            const zonaBloqueada =
                criarPoligonoCircular(
                    lngIncidente,
                    latIncidente,
                    raioBloqueio,
                    20
                );

            // ==========================================
            // OPTIONS DO ORS
            // ==========================================
            const options = {
                avoid_polygons:
                    zonaBloqueada
            };

            // ==========================================
            // RESTRIÇÕES DO CAMINHÃO
            // ==========================================
            if (
                perfil ===
                'driving-hgv'
            ) {
                options.profile_params = {
                    restrictions: {
                        height:
                            req.body.altura ||
                            4.2,
                        weight:
                            req.body.peso ||
                            15,
                        length:
                            req.body.comprimento ||
                            12,
                        width:
                            2.6
                    }
                };
            }

            // ==========================================
            // BODY ENVIADO AO OPENROUTESERVICE
            // ==========================================
            const body = {
                coordinates: [
                    req.body.pontoSaida,
                    req.body.pontoReentrada
                ],
                preference:
                    'fastest',
                options:
                    options
            };

            console.log(
                ' Solicitando rota alternativa ao ORS...'
            );

            // ==========================================
            // OPENROUTESERVICE
            // ==========================================
            const response =
                await axios.post(
                    `https://api.openrouteservice.org/v2/directions/${perfil}/geojson`,
                    body,
                    {
                        headers: {
                            'Content-Type':
                                'application/json',
                            'Authorization':
                                ORS_API_KEY
                        },
                        timeout:
                            15000
                    }
                );

            // ==========================================
            // VALIDAR RESPOSTA
            // ==========================================
            if (
                !response.data ||
                !response.data.features ||
                !response.data.features.length
            ) {
                throw new Error(
                    'ORS não retornou uma rota alternativa'
                );
            }

            const coordsNovaRota =
                response.data
                    .features[0]
                    .geometry
                    .coordinates;

            console.log(
                `✅ Nova rota recebida: ${coordsNovaRota.length} pontos`
            );
            console.log(
                '=========================================='
            );

            // ==========================================
            // RETORNAR NOVA ROTA
            // ==========================================
            res.json(
                response.data
            );
        } catch (error) {
            console.error(
                ' ERRO NO RECÁLCULO:'
            );
            console.error(
                error.response?.data ||
                error.message
            );

            res.status(
                error.response?.status ||
                500
            ).json({
                erro:
                    'Falha ao recalcular desvio',
                detalhe:
                    error.response?.data ||
                    error.message
            });
        }
    }
);

// ======================================================
// TOMTOM TRAFFIC
// ======================================================
app.get(
    '/api/traffic',
    autenticar,
    validarQuery(
        schemas.traffic
    ),
    async (req, res) => {
        try {
            const response =
                await axios.get(
                    'https://api.tomtom.com/traffic/services/5/incidentDetails',
                    {
                        params: {
                            key:
                                TOMTOM_API_KEY,
                            bbox:
                                `${req.query.left},${req.query.bottom},${req.query.right},${req.query.top}`,
                            fields:
                                '{incidents{type,geometry{type,coordinates},properties{iconCategory}}}'
                        },
                        timeout:
                            10000
                    }
                );

            res.json(
                response.data
            );
        } catch (erro) {
            console.error(
                '❌ Erro TomTom:',
                erro.response?.data ||
                erro.message
            );

            res.status(500).json({
                erro:
                    `Erro TomTom: ${
                        erro.response?.data ||
                        erro.message
                    }`
            });
        }
    }
);

// ======================================================
// ROTA DO MOTORISTA
// ======================================================
app.get(
    '/rotas/minha-rota',
    autenticar,
    (req, res) => {
        if (
            req.usuario.tipo !==
            'motorista'
        ) {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const row = db.prepare(`
                SELECT *
                FROM rotas
                WHERE
                    id_motorista = ?
                AND status IN
                    ('pendente', 'em_andamento')
                ORDER BY
                    criada_em DESC
                LIMIT 1
            `).get(
                req.usuario.id
            );

            if (!row) {
                return res.status(404).json({
                    mensagem:
                        'Nenhuma rota ativa'
                });
            }

            res.json({
                ...row,
                restricoes:
                    JSON.parse(
                        row.restricoes ||
                        '{}'
                    ),
                dados_geojson:
                    JSON.parse(
                        row.dados_geojson ||
                        'null'
                    )
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// ATUALIZAR STATUS DA ROTA
// ======================================================
app.patch(
    '/rotas/:id/status',
    autenticar,
    validar(
        schemas.status
    ),
    (req, res) => {
        if (
            req.usuario.tipo !==
            'motorista'
        ) {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const info = db.prepare(`
                UPDATE rotas
                SET status = ?
                WHERE
                    id = ?
                AND
                    id_motorista = ?
            `).run(
                req.body.status,
                req.params.id,
                req.usuario.id
            );

            if (
                info.changes === 0
            ) {
                return res.status(404).json({
                    erro:
                        'Rota não encontrada'
                });
            }

            res.json({
                mensagem:
                    'Status atualizado'
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// LOCALIZAÇÃO DO MOTORISTA
// ======================================================
app.post(
    '/localizacao',
    autenticar,
    validar(
        schemas.localizacao
    ),
    (req, res) => {
        if (
            req.usuario.tipo !==
            'motorista'
        ) {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            db.prepare(`
                INSERT INTO localizacoes
                (
                    id_motorista,
                    lat,
                    lon,
                    ultima_atualizacao
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT(id_motorista)
                DO UPDATE SET
                    lat =
                        excluded.lat,
                    lon =
                        excluded.lon,
                    ultima_atualizacao =
                        CURRENT_TIMESTAMP
            `).run(
                req.usuario.id,
                req.body.lat,
                req.body.lon
            );

            res.json({
                mensagem:
                    'Localização atualizada'
            });
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// LOCALIZAÇÕES PARA ADMIN
// ======================================================
app.get(
    '/localizacoes',
    autenticar,
    (req, res) => {
        if (
            req.usuario.tipo !==
            'admin'
        ) {
            return res.status(403).json({
                erro: 'Acesso negado'
            });
        }

        try {
            const dados = db.prepare(`
                SELECT
                    u.id,
                    u.nome,
                    l.lat,
                    l.lon,
                    l.ultima_atualizacao
                FROM usuarios u
                LEFT JOIN localizacoes l
                    ON
                    u.id =
                    l.id_motorista
                WHERE
                    u.tipo =
                    'motorista'
            `).all();

            res.json(
                dados
            );
        } catch (err) {
            res.status(500).json({
                erro: err.message
            });
        }
    }
);

// ======================================================
// INICIAR SERVIDOR
// ======================================================
app.listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            `🚀 Servidor rodando em http://localhost:${PORT}`
        );
        console.log(
            '🚛 Sistema GPS Caminhão iniciado'
        );
        console.log(
            '🚨 Sistema de desvio por reportes ATIVO'
        );
    }
);