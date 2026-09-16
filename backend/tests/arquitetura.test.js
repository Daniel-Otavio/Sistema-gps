const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { carregarMigracoes } = require('../src/database/migration-loader');
const { classificarPosicaoGps } = require('../src/services/gps/quality');
const { normalizarConsulta } = require('../src/services/geocoding/nominatim');
const { criarAutenticacao } = require('../src/auth/session-auth');
const { limpar } = require('../src/observability/logger');

test('descobre e ordena automaticamente as migrações numeradas', () => {
    const migracoes = carregarMigracoes(path.join(__dirname, '..', 'database', 'migrations'));
    assert.deepEqual(
        migracoes.map(item => item.numero),
        migracoes.map((_, indice) => String(indice + 1).padStart(3, '0'))
    );
    assert.equal(new Set(migracoes.map(item => item.versao)).size, migracoes.length);
    assert.ok(migracoes.every(item => /^[a-f0-9]{64}$/.test(item.checksum)));
});

test('protege migrações por manifesto com checksum normalizado', () => {
    const diretorio = path.join(__dirname, '..', 'database', 'migrations');
    const manifesto = JSON.parse(fs.readFileSync(path.join(diretorio, 'migration-checksums.json'), 'utf8'));
    const migracoes = carregarMigracoes(diretorio);
    const arquivosMigracao = Object.keys(manifesto).filter(nome => /^\d{3}-.*\.js$/.test(nome));
    assert.equal(arquivosMigracao.length, migracoes.length);
    assert.deepEqual(arquivosMigracao.sort(), migracoes.map(item => item.arquivo).sort());
    assert.match(manifesto['snapshots/001-schema.js'], /^[a-f0-9]{64}$/);
    assert.ok(migracoes.every(item => manifesto[item.arquivo] === item.checksum));
    const loader = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'migration-loader.js'), 'utf8');
    assert.match(loader, /replace\(\/\\r\\n\?\/g, '\\n'\)/);
});

test('retenção cobre workers e controles de notificação', () => {
    const retention = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'privacy', 'retention.js'), 'utf8');
    assert.match(retention, /worker_heartbeats/);
    assert.match(retention, /notificacao_destino_locks/);
    assert.match(retention, /notificacao_circuitos/);
    assert.match(retention, /WORKER_HEARTBEAT_RETENTION_DAYS/);
    assert.match(retention, /NOTIFICATION_CIRCUIT_RETENTION_DAYS/);
    assert.match(retention, /guardiao_fila/);
    assert.match(retention, /privacidade_exportacao_fila/);
});

test('API somente enfileira GPS e não dispara Guardião diretamente', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const gps = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'gps.js'), 'utf8');
    assert.doesNotMatch(servidor, /setTimeout\(processarFilaGuardiao/);
    assert.doesNotMatch(gps, /setTimeout\(processarFilaGuardiao/);
});

test('esquema inicial fica fora do servidor e protegido como snapshot', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const snapshot = fs.readFileSync(path.join(__dirname, '..', 'database', 'snapshots', '001-schema.js'), 'utf8');
    assert.doesNotMatch(servidor, /CREATE TABLE IF NOT EXISTS usuarios/);
    assert.match(snapshot, /CREATE TABLE IF NOT EXISTS usuarios/);
});

test('servidor não devolve erro.message diretamente nas respostas 500 antigas', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.doesNotMatch(servidor, /status\(500\)\.json\(\{\s*erro\s*:\s*erro\.message\s*\}\)/);
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

test('resumo automático do dashboard minimiza dados pessoais e cadastrais', () => {
    const resumo = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'dashboard-summary.js'), 'utf8');
    for (const campo of ['u.email', 'u.login', 'email_verificado', 'consumo_medio_km_l', 'preco_combustivel_ref', 'v.comprimento', 'v.largura', 'v.peso']) {
        assert.equal(resumo.includes(campo), false, `campo excessivo no resumo: ${campo}`);
    }
    assert.equal(resumo.includes('g.dados\n'), false);
    assert.match(resumo, /motoristas:\[\]/);
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

test('logger remove credenciais e endereços de banco', () => {
    const seguro = limpar({
        authorization: 'Bearer token-super-secreto',
        senha: 'minha-senha',
        mensagem: 'falhou postgresql://usuario:senha@host:5432/banco'
    });
    assert.equal(seguro.authorization, '[PROTEGIDO]');
    assert.equal(seguro.senha, '[PROTEGIDO]');
    assert.equal(seguro.mensagem.includes('usuario:senha'), false);
});

test('contrato OpenAPI cobre integração empresarial principal', () => {
    const contrato = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8');
    assert.match(contrato, /openapi: 3\.1\.0/);
    assert.match(contrato, /\/integracoes\/gps\/localizacao:/);
    assert.match(contrato, /X-Guardiao-Signature/);
    assert.match(contrato, /\/dashboard\/resumo:/);
});

test('saúde operacional publica SLA e filas sem expor SQL', () => {
    const rota = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'system-observability.js'), 'utf8');
    assert.match(rota, /sla_guardiao/);
    assert.match(rota, /dentro_sla_percentual/);
    assert.match(rota, /reprocessar-falhas/);
});

test('respostas 5xx são sanitizadas antes de chegar ao navegador', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(servidor, /res\.statusCode >= 500/);
    assert.match(servidor, /codigo:'ERRO_INTERNO'/);
    assert.match(servidor, /request_id:req\.requestId/);
});

test('resumo envia geometria somente para viagem em andamento', () => {
    const resumo = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'dashboard-summary.js'), 'utf8');
    assert.match(resumo, /CASE WHEN vg\.status='em_andamento'/);
    const consultaRotas = resumo.slice(resumo.indexOf("medir('rotas'"), resumo.indexOf(']);', resumo.indexOf("medir('rotas'")));
    assert.doesNotMatch(consultaRotas, /dados_geojson/);
});

test('migração inicial usa o cliente transacional do executor', () => {
    const migracao = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '001-esquema-consolidado.js'), 'utf8');
    assert.match(migracao, /criarTabelas\(client\)/);
});

test('saúde e reprocessamento incluem exportações de privacidade', () => {
    const observability = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'system-observability.js'), 'utf8');
    assert.match(observability, /privacidade_exportacao_fila/);
    assert.match(observability, /exportacoes_privacidade/);
});

test('workers possuem heartbeat e notificações usam concorrência segura', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const observability = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'system-observability.js'), 'utf8');
    const worker = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'notifications', 'outbox-worker.js'), 'utf8');
    assert.match(servidor, /heartbeatWorkers\.envolver/);
    assert.match(observability, /worker_heartbeats/);
    assert.match(worker, /NOTIFICATION_CONCURRENCY/);
    assert.match(worker, /notificacao_destino_locks/);
    assert.match(worker, /notificacao_circuitos/);
    assert.match(worker, /Promise\.all/);
});

test('webhook fixa o IP validado e bloqueia redirecionamentos', () => {
    const seguranca = fs.readFileSync(path.join(__dirname, '..', 'src', 'security', 'outbound-url.js'), 'utf8');
    const worker = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'notifications', 'outbox-worker.js'), 'utf8');
    assert.match(seguranca, /new https\.Agent/);
    assert.match(seguranca, /resolverComTimeout/);
    assert.match(worker, /maxRedirects:0/);
    assert.match(worker, /httpsAgent:destino\.httpsAgent/);
});

test('worker valida migrações antes de iniciar processadores', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const worker = servidor.slice(servidor.indexOf('async function iniciarWorker()'), servidor.indexOf('// Última barreira', servidor.indexOf('async function iniciarWorker()')));
    assert.ok(worker.indexOf('await verificarVersaoBanco()') < worker.indexOf('iniciarProcessadores()'));
});

test('login não revela estado antes de validar a senha', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const login = servidor.slice(servidor.indexOf("app.post('/login'"), servidor.indexOf("app.post('/cadastro", servidor.indexOf("app.post('/login'")));
    assert.ok(login.indexOf('bcrypt.compareSync') < login.indexOf("!user.ativo ||"));
    assert.doesNotMatch(login, /Confirme seu e-mail antes de acessar/);
    assert.doesNotMatch(login, /veículo vinculado.+bloqueado/);
});

test('composição usa toneladas com limite operacional e retenção é incremental', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const retention = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'privacy', 'retention.js'), 'utf8');
    assert.match(servidor, /limitesComposicao = \{ altura: 8, largura: 5, comprimento: 40, peso: 150 \}/);
    assert.match(servidor, /retencao_privacidade[\s\S]{0,180}intervaloMs: 60 \* 60 \* 1000/);
    assert.match(retention, /maxLotes=100/);
    assert.match(retention, /RETENTION_TABLE_BUDGET_MS/);
    assert.match(retention, /r\.pendencias=/);
});

test('resumo isola falhas parciais e conta somente alertas críticos', () => {
    const resumo = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'dashboard-summary.js'), 'utf8');
    assert.match(resumo, /catch \(erro\) \{[\s\S]*falhas\[nome\] = true/);
    assert.match(resumo, /statusArea/);
    assert.match(resumo, /nivel IN \('iminente','critico'\)/);
    assert.match(resumo, /medir\('alertas_guardiao'/);
});

test('MFA administrativo usa desafio de uso único com expiração e limite', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const migracao = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '018-admin-mfa.js'), 'utf8');
    assert.match(servidor, /ADMIN_MFA_REQUIRED/);
    assert.match(servidor, /auth\/mfa\/verificar/);
    assert.match(servidor, /createHmac\('sha256'/);
    assert.match(servidor, /tentativas>=5/);
    assert.match(migracao, /admin_mfa_desafios/);
    assert.match(migracao, /usado_em/);
});

test('portal empresarial não devolve erro técnico bruto de notificação', () => {
    const portal = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'enterprise-portal.js'), 'utf8');
    const notificacoes = portal.slice(portal.indexOf("portal/notificacoes"), portal.indexOf("portal/alertas/:id"));
    assert.doesNotMatch(notificacoes, /,ultimo_erro,/);
    assert.match(notificacoes, /erro_categoria/);
});

test('aplicativo móvel usa cofre seguro e possui logout com limpeza local', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'app-motorista', 'index.html'), 'utf8');
    const main = fs.readFileSync(path.join(__dirname, '..', '..', 'app-motorista', 'main.js'), 'utf8');
    assert.match(main, /safeStorage\.encryptString/);
    assert.match(html, /window\.electronAPI/);
    assert.match(main, /nodeIntegration: false/);
    assert.match(main, /contextIsolation: true/);
    assert.match(html, /auth\/logout/);
    assert.match(html, /dbLimpar\(STORE_GPS\)/);
    assert.doesNotMatch(html, /dbSalvar\(STORE_CACHE,\s*\{\s*chave:\s*CACHE_SESSAO,\s*token:/);
    assert.match(html, /senha\.length < 12/);
});