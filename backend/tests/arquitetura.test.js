const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { carregarMigracoes } = require('../src/database/migration-loader');
const { classificarPosicaoGps } = require('../src/services/gps/quality');
const { normalizarConsulta } = require('../src/services/geocoding/nominatim');
const { criarAutenticacao } = require('../src/auth/session-auth');

test('descobre e ordena automaticamente as migrações numeradas', () => {
    const migracoes = carregarMigracoes(path.join(__dirname, '..', 'database', 'migrations'));
    assert.deepEqual(migracoes.map(item => item.numero), ['001', '002', '003', '004', '005', '006', '007']);
    assert.equal(new Set(migracoes.map(item => item.versao)).size, migracoes.length);
});

test('classifica posição recente e precisa para tempo real', () => {
    const resultado = classificarPosicaoGps({
        atual: { lat: -19.39, lon: -40.06, timestamp: new Date().toISOString(), precisao: 12 },
        anterior: null,
        calcularDistanciaKm: () => 0
    });
    assert.equal(resultado.apta_tempo_real, true);
    assert.equal(resultado.classificacao, 'valida_tempo_real');
});

test('preserva posição atrasada somente no histórico', () => {
    const resultado = classificarPosicaoGps({
        atual: { lat: -19.39, lon: -40.06, timestamp: new Date(Date.now() - 180000).toISOString(), precisao: 10 },
        anterior: null,
        calcularDistanciaKm: () => 0
    });
    assert.equal(resultado.apta_historico, true);
    assert.equal(resultado.apta_tempo_real, false);
    assert.ok(resultado.motivos.includes('atrasada'));
});

test('normaliza e limita a pesquisa de geocodificação', () => {
    assert.equal(normalizarConsulta('  Av.   Brasil, Linhares  '), 'Av. Brasil, Linhares');
    assert.equal(normalizarConsulta('x'.repeat(400)).length, 250);
});

test('não publica o endpoint demonstrativo de rota', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.equal(servidor.includes("app.get('/teste-rota'"), false);
});

test('dashboard não consulta Nominatim diretamente', () => {
    const tela = fs.readFileSync(path.join(__dirname, '..', '..', 'dashboard-gestao', 'src', 'components', 'dashboard', 'screens', 'Routes.tsx'), 'utf8');
    assert.equal(tela.includes('nominatim.openstreetmap.org'), false);
    assert.equal(tela.includes('/api/geocodificar'), true);
});

test('sessão web usa cookie HttpOnly e exige CSRF em alterações', async () => {
    const pool = { query: async () => ({ rows: [{ ativo: true, token_version: 1 }] }) };
    const auth = criarAutenticacao({ pool, jwtSecret: 'segredo-de-teste-com-tamanho-suficiente' });
    const cookies = [];
    const reqLogin = { headers: { 'x-client-type': 'dashboard' } };
    const resLogin = { cookie: (nome, valor, opcoes) => cookies.push({ nome, valor, opcoes }) };
    const token = await auth.emitirTokenSessao({ id: 1, tipo: 'admin', token_version: 1 }, '5m');
    const csrf = auth.estabelecerSessaoWeb(reqLogin, resLogin, token);
    assert.equal(cookies.find(c => c.nome === 'gps_session').opcoes.httpOnly, true);
    assert.equal(typeof csrf, 'string');

    let status = 200;
    let body;
    const reqSemCsrf = { method: 'POST', path: '/veiculos', headers: { cookie: `gps_session=${token}; gps_csrf=${csrf}` } };
    const resSemCsrf = { status: codigo => { status = codigo; return resSemCsrf; }, json: valor => { body = valor; } };
    auth.protegerCsrf(reqSemCsrf, resSemCsrf, () => assert.fail('CSRF ausente não pode prosseguir'));
    assert.equal(status, 403);
    assert.match(body.erro, /CSRF/);
});
