const { AsyncLocalStorage } = require('async_hooks');

const contexto = new AsyncLocalStorage();
const saida = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
};
const CHAVES_SECRETAS = /(authorization|cookie|token|senha|password|secret|segredo|api.?key|jwt|database.?url)/i;

function limparTexto(valor) {
    return String(valor)
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[PROTEGIDO]')
        .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [PROTEGIDO]')
        .replace(/(api[_-]?key|token|senha|password|secret|segredo)=([^&\s]+)/gi, '$1=[PROTEGIDO]')
        .slice(0, 8000);
}

function limpar(valor, profundidade = 0, vistos = new WeakSet()) {
    if (valor == null || typeof valor === 'number' || typeof valor === 'boolean') return valor;
    if (typeof valor === 'string') return limparTexto(valor);
    if (valor instanceof Error) return { nome:valor.name, mensagem:limparTexto(valor.message), codigo:valor.code || null };
    if (typeof valor !== 'object' || profundidade >= 5) return '[OMITIDO]';
    if (vistos.has(valor)) return '[CIRCULAR]';
    vistos.add(valor);
    if (Array.isArray(valor)) return valor.slice(0, 50).map(item => limpar(item, profundidade + 1, vistos));
    return Object.fromEntries(Object.entries(valor).slice(0, 100).map(([chave, item]) => [
        chave,
        CHAVES_SECRETAS.test(chave) ? '[PROTEGIDO]' : limpar(item, profundidade + 1, vistos)
    ]));
}

function escrever(nivel, argumentos) {
    const ctx = contexto.getStore() || {};
    const requestId = ctx.request_id || ctx.req?.requestId;
    const idEmpresa = ctx.id_empresa || ctx.req?.empresaIntegracao?.id || ctx.req?.usuario?.id_empresa;
    const idUsuario = ctx.id_usuario || ctx.req?.usuario?.id;
    const primeiro = argumentos[0];
    const mensagem = typeof primeiro === 'string' ? limparTexto(primeiro) : 'evento';
    const dados = argumentos.slice(typeof primeiro === 'string' ? 1 : 0).map(item => limpar(item));
    const linha = {
        timestamp:new Date().toISOString(),
        nivel,
        mensagem,
        ...(requestId ? { request_id:requestId } : {}),
        ...(idEmpresa ? { id_empresa:idEmpresa } : {}),
        ...(idUsuario ? { id_usuario:idUsuario } : {}),
        ...(dados.length ? { dados } : {})
    };
    const destino = nivel === 'error' ? saida.error : nivel === 'warn' ? saida.warn : saida.log;
    destino(JSON.stringify(linha));
}

function instalarConsoleEstruturado() {
    console.log = (...args) => escrever('info', args);
    console.info = (...args) => escrever('info', args);
    console.warn = (...args) => escrever('warn', args);
    console.error = (...args) => escrever('error', args);
    console.debug = (...args) => escrever('debug', args);
}

function executarComContextoLog(dados, callback) {
    return contexto.run(dados || {}, callback);
}

module.exports = { instalarConsoleEstruturado, executarComContextoLog, limpar };
