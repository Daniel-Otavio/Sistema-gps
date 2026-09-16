const dns = require('node:dns').promises;
const net = require('node:net');

function ipv4Privado(ip) {
    const partes = ip.split('.').map(Number);
    if (partes.length !== 4 || partes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = partes;
    return a === 0 || a === 10 || a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function enderecoPrivado(endereco) {
    const ip = String(endereco || '').toLowerCase().split('%')[0];
    if (net.isIP(ip) === 4) return ipv4Privado(ip);
    if (net.isIP(ip) !== 6) return true;
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip)) return true;
    if (ip.startsWith('::ffff:')) return ipv4Privado(ip.slice(7));
    return false;
}

async function validarUrlWebhook(valor) {
    let url;
    try { url = new URL(String(valor || '')); }
    catch { throw Object.assign(new Error('URL de webhook inválida.'), { status: 400 }); }
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw Object.assign(new Error('O webhook precisa usar HTTPS e não pode conter credenciais.'), { status: 400 });
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
        throw Object.assign(new Error('O webhook não pode apontar para endereço interno.'), { status: 400 });
    }
    const enderecos = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true })
        .catch(() => { throw Object.assign(new Error('Não foi possível validar o endereço do webhook.'), { status: 400 }); });
    if (!enderecos.length || enderecos.some(item => enderecoPrivado(item.address))) {
        throw Object.assign(new Error('O webhook não pode apontar para rede privada, local ou reservada.'), { status: 400 });
    }
    return url.toString();
}

module.exports = { validarUrlWebhook, enderecoPrivado };
