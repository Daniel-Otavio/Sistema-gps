'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const privacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'privacy.js'), 'utf8');
const portal = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'enterprise-portal.js'), 'utf8');

test('promoção de restrição preserva a empresa do catálogo', () => {
    assert.match(server, /catalogo\.id_empresa AS catalogo_id_empresa/);
    assert.match(server, /\$1,\$2,\$23,\$3/);
    assert.match(server, /c\.catalogo_id_empresa/);
});

test('corredor primário usa histórico recente sem restrições do caminhão', () => {
    const start = server.indexOf('async function obterCorredorRodoviarioEstimado');
    const end = server.indexOf('const cacheSugestoesDesvio', start);
    const primary = server.slice(start, end);
    assert.doesNotMatch(primary, /profile_params/);
    assert.match(primary, /gps_ingestoes/);
    assert.match(primary, /corredor_historico_neutro/);
    assert.match(primary, /confianca_corredor/);
});

test('indexação externa usa fila própria sem espera no Guardião', () => {
    assert.match(server, /async function processarFilaIndexacaoRegional/);
    assert.match(server, /enfileirarIndexacaoRegional/);
    assert.doesNotMatch(server, /Promise\.race\(\[Promise\.allSettled\(indexacoes/);
});

test('descoberta regional consulta OSM mesmo sem candidato ANTT', () => {
    assert.match(server, /async function consultarRestricoesOSMRegionais/);
    assert.match(server, /maxheight/);
    assert.match(server, /maxweight/);
    assert.match(server, /maxwidth/);
    assert.match(server, /maxlength/);
});

test('Guardião usa concorrência limitada e lock persistente por veículo', () => {
    assert.match(server, /GUARDIAO_CONCORRENCIA/);
    assert.match(server, /guardiao_veiculo_locks/);
    assert.match(server, /Promise\.all\(Array\.from/);
});

test('catálogo regional possui promoção humana privada e auditada', () => {
    const inicio = server.indexOf("app.post('/restricoes-catalogo/:id/validar'");
    const fim = server.indexOf('// Confirma somente a existência', inicio);
    const rota = server.slice(inicio, fim);
    assert.ok(inicio > 0);
    assert.match(rota, /Anexe ao menos uma evidência/);
    assert.match(rota, /catalogo\.id_empresa/);
    assert.match(rota, /id_catalogo_origem/);
    assert.match(rota, /restricao_catalogo_revisoes/);
    assert.match(rota, /status='validada'/);
});

test('privacidade empresarial valida a propriedade do titular', () => {
    assert.match(privacy, /Titular não encontrado para esta empresa/);
    assert.match(privacy, /empresa_integracao_veiculos WHERE id_empresa=\$1 AND id_veiculo=\$2/);
    assert.match(privacy, /empresa_usuarios WHERE id_empresa=\$1 AND id=\$2/);
});

test('portal empresarial usa a coluna geográfica correta nos reportes', () => {
    const inicio = portal.indexOf("router.get('/integracoes/portal/reportes'");
    const fim = portal.indexOf("router.get('/integracoes/portal/perfis-composicao'", inicio);
    const rota = portal.slice(inicio, fim);
    assert.match(rota, /rp\.lng/);
    assert.doesNotMatch(rota, /rp\.lon/);
    assert.doesNotMatch(rota, /rp\.descricao/);
});

test('saúde operacional inclui fila de indexação regional', () => {
    const observability = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'system-observability.js'), 'utf8');
    assert.match(observability, /indexacao_regional_fila/);
    assert.match(observability, /filaRegionalStatus/);
    assert.match(observability, /'indexacao_regional'/);
});

test('conclusão de privacidade depende do executor auditável', () => {
    assert.match(privacy, /privacidade\/solicitacoes\/:id\/executar/);
    assert.match(privacy, /EXECUTAR-/);
    assert.match(privacy, /processado_em/);
    assert.doesNotMatch(privacy, /\['pendente', 'em_processamento', 'concluida', 'rejeitada'\]/);
});
