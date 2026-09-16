const crypto = require('crypto');

function chaveExportacao() {
    const segredo = process.env.PRIVACY_EXPORT_SECRET;
    if (!segredo || segredo.length < 32) throw new Error('PRIVACY_EXPORT_SECRET não configurado com segurança.');
    return crypto.createHash('sha256').update(segredo).digest();
}

function criptografar(dados) {
    const original = Buffer.from(JSON.stringify(dados), 'utf8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', chaveExportacao(), iv);
    const conteudo = Buffer.concat([cipher.update(original), cipher.final()]);
    return { conteudo, iv, authTag: cipher.getAuthTag(), hash: crypto.createHash('sha256').update(original).digest('hex'), tamanho: original.length };
}

function descriptografar(registro) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', chaveExportacao(), registro.iv);
    decipher.setAuthTag(registro.auth_tag);
    return Buffer.concat([decipher.update(registro.conteudo_criptografado), decipher.final()]);
}

module.exports = { criptografar, descriptografar };
