// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Conectar ao banco SQLite (cria o arquivo se não existir)
const dbPath = path.join(__dirname, 'database', 'gps.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err.message);
  } else {
    console.log('✅ Conectado ao banco SQLite:', dbPath);
    criarTabelas();
  }
});

// Função para criar as tabelas (se não existirem)
function criarTabelas() {
  db.serialize(() => {
    // Tabela de usuários
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT CHECK(tipo IN ('admin', 'motorista')) NOT NULL,
        login TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de rotas
    db.run(`
      CREATE TABLE IF NOT EXISTS rotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        origem TEXT,
        destino TEXT,
        restricoes TEXT,  -- JSON: {altura, peso, comprimento}
        dados_geojson TEXT,  -- GeoJSON completo da rota
        id_motorista INTEGER,
        status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'em_andamento', 'concluida')),
        criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(id_motorista) REFERENCES usuarios(id)
      )
    `);

    // Tabela de localizações em tempo real
    db.run(`
      CREATE TABLE IF NOT EXISTS localizacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_motorista INTEGER UNIQUE,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(id_motorista) REFERENCES usuarios(id)
      )
    `);

    // Inserir um admin e um motorista de teste (se não existirem)
    const senhaAdmin = bcrypt.hashSync('admin123', 10);
    const senhaMotorista = bcrypt.hashSync('motor123', 10);

    db.run(
      `INSERT OR IGNORE INTO usuarios (nome, tipo, login, senha) 
       VALUES (?, ?, ?, ?)`,
      ['Administrador', 'admin', 'admin', senhaAdmin]
    );

    db.run(
      `INSERT OR IGNORE INTO usuarios (nome, tipo, login, senha) 
       VALUES (?, ?, ?, ?)`,
      ['Motorista José', 'motorista', 'jose', senhaMotorista]
    );

    console.log('✅ Tabelas criadas/verificadas com sucesso!');
    console.log('🧑‍💼 Admin: login=admin, senha=admin123');
    console.log('🧑‍✈️ Motorista: login=jose, senha=motor123');
  });
}

// ---------- MIDDLEWARE DE AUTENTICAÇÃO ----------
function autenticar(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ erro: 'Token inválido' });
    }
    req.usuario = decoded;
    next();
  });
}

// ==============================================
// 🧪 ROTA DE TESTE (MAPA COMPLETO - SEM API EXTERNA)
// ==============================================
app.get('/teste-rota', (req, res) => {
  const rotaExemplo = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.6333, -23.5505],  // São Paulo
            [-46.5000, -23.4000],
            [-46.2000, -23.1000],
            [-45.8000, -22.8000],
            [-45.2000, -22.6000],
            [-44.5000, -22.5000],
            [-44.0000, -22.8000],
            [-43.5000, -23.0000],
            [-43.2075, -22.9028]   // Rio de Janeiro
          ]
        },
        properties: {
          segments: [
            {
              distance: 435000, // 435 km
              duration: 16200   // 4 horas e 30 minutos
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
      mensagem: "🧪 Esta é uma rota de TESTE (dados mockados). Não depende da API externa."
    }
  };

  res.json(rotaExemplo);
});

// ---------- ROTAS PÚBLICAS ----------
app.get('/', (req, res) => {
  res.json({ 
    mensagem: '🚀 API do GPS Caminhão está rodando!',
    endpoints: {
      publicos: ['POST /login', 'GET /teste-rota'],
      protegidos_admin: ['GET /motoristas', 'POST /motoristas', 'POST /rotas', 'GET /rotas', 'GET /localizacoes'],
      protegidos_motorista: ['GET /rotas/minha-rota', 'PATCH /rotas/:id/status', 'POST /localizacao']
    }
  });
});

// Rota de login
app.post('/login', (req, res) => {
  const { login, senha } = req.body;

  if (!login || !senha) {
    return res.status(400).json({ erro: 'Login e senha são obrigatórios' });
  }

  db.get(
    `SELECT * FROM usuarios WHERE login = ?`,
    [login],
    (err, user) => {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      if (!user) {
        return res.status(401).json({ erro: 'Usuário não encontrado' });
      }

      const senhaValida = bcrypt.compareSync(senha, user.senha);
      if (!senhaValida) {
        return res.status(401).json({ erro: 'Senha incorreta' });
      }

      const token = jwt.sign(
        { id: user.id, login: user.login, tipo: user.tipo },
        process.env.JWT_SECRET,
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
    }
  );
});

// ---------- ROTAS PROTEGIDAS (ADMIN) ----------
// Listar todos os motoristas
app.get('/motoristas', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  db.all(
    `SELECT id, nome, login, tipo FROM usuarios WHERE tipo = 'motorista'`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      res.json(rows);
    }
  );
});

// Cadastrar um novo motorista
app.post('/motoristas', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  const { nome, login, senha } = req.body;

  if (!nome || !login || !senha) {
    return res.status(400).json({ erro: 'Nome, login e senha são obrigatórios' });
  }

  db.get(`SELECT id FROM usuarios WHERE login = ?`, [login], (err, row) => {
    if (err) {
      return res.status(500).json({ erro: err.message });
    }
    if (row) {
      return res.status(400).json({ erro: 'Login já está em uso' });
    }

    const senhaHash = bcrypt.hashSync(senha, 10);

    db.run(
      `INSERT INTO usuarios (nome, tipo, login, senha) VALUES (?, 'motorista', ?, ?)`,
      [nome, login, senhaHash],
      function (err) {
        if (err) {
          return res.status(500).json({ erro: err.message });
        }
        res.status(201).json({
          id: this.lastID,
          nome,
          login,
          tipo: 'motorista'
        });
      }
    );
  });
});

// Criar uma nova rota
app.post('/rotas', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  const { nome, origem, destino, restricoes, dados_geojson, id_motorista } = req.body;

  if (!nome || !origem || !destino || !dados_geojson || !id_motorista) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
  }

  db.run(
    `INSERT INTO rotas (nome, origem, destino, restricoes, dados_geojson, id_motorista, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pendente')`,
    [
      nome,
      origem,
      destino,
      JSON.stringify(restricoes || {}),
      JSON.stringify(dados_geojson),
      id_motorista
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      res.status(201).json({
        mensagem: 'Rota criada com sucesso!',
        id: this.lastID
      });
    }
  );
});

// 🔹 NOVA ROTA: Listar todas as rotas (apenas admin - Debug)
app.get('/rotas', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  db.all(
    `SELECT * FROM rotas ORDER BY criada_em DESC`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      // Tenta parsear os JSONs para enviar ao Dashboard
      const rotasFormatadas = rows.map(row => {
        try {
          row.restricoes = JSON.parse(row.restricoes);
        } catch (e) { row.restricoes = {}; }
        try {
          row.dados_geojson = JSON.parse(row.dados_geojson);
        } catch (e) { row.dados_geojson = null; }
        return row;
      });
      res.json(rotasFormatadas);
    }
  );
});

// ---------- ROTAS PROTEGIDAS (MOTORISTA) ----------
// Buscar a rota ativa do motorista logado
app.get('/rotas/minha-rota', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'motorista') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  const idMotorista = req.usuario.id;

  db.get(
    `SELECT * FROM rotas 
     WHERE id_motorista = ? AND status IN ('pendente', 'em_andamento')
     ORDER BY criada_em DESC LIMIT 1`,
    [idMotorista],
    (err, row) => {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      if (!row) {
        return res.status(404).json({ mensagem: 'Nenhuma rota ativa encontrada' });
      }

      try {
        row.restricoes = JSON.parse(row.restricoes);
        row.dados_geojson = JSON.parse(row.dados_geojson);
      } catch (e) {
        return res.status(500).json({ erro: 'Erro ao parsear dados da rota' });
      }

      res.json(row);
    }
  );
});

// Atualizar status da rota (motorista)
app.patch('/rotas/:id/status', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'motorista') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  const { status } = req.body;
  const idRota = req.params.id;

  if (!['pendente', 'em_andamento', 'concluida'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido' });
  }

  db.run(
    `UPDATE rotas SET status = ? WHERE id = ? AND id_motorista = ?`,
    [status, idRota, req.usuario.id],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ erro: 'Rota não encontrada ou não pertence a este motorista' });
      }
      res.json({ mensagem: 'Status atualizado com sucesso' });
    }
  );
});

// Enviar localização atual (motorista)
app.post('/localizacao', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'motorista') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  const { lat, lon } = req.body;
  if (!lat || !lon) {
    return res.status(400).json({ erro: 'Latitude e longitude são obrigatórias' });
  }

  db.run(
    `INSERT INTO localizacoes (id_motorista, lat, lon, ultima_atualizacao)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id_motorista) DO UPDATE SET
       lat = excluded.lat,
       lon = excluded.lon,
       ultima_atualizacao = CURRENT_TIMESTAMP`,
    [req.usuario.id, lat, lon],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      res.json({ mensagem: 'Localização atualizada com sucesso' });
    }
  );
});

// Buscar localizações de todos os motoristas (admin)
app.get('/localizacoes', autenticar, (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' });
  }

  db.all(
    `SELECT 
       u.id, u.nome, 
       l.lat, l.lon, l.ultima_atualizacao
     FROM usuarios u
     LEFT JOIN localizacoes l ON u.id = l.id_motorista
     WHERE u.tipo = 'motorista'`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: err.message });
      }
      res.json(rows);
    }
  );
});

// ---------- INICIAR SERVIDOR ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});