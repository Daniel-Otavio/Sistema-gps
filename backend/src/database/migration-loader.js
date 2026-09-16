const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PADRAO_MIGRACAO = /^(\d{3})-[a-z0-9][a-z0-9-]*\.js$/;

function carregarMigracoes(diretorio) {
    const manifestoCaminho = path.join(diretorio, 'migration-checksums.json');
    if (!fs.existsSync(manifestoCaminho)) throw new Error('Manifesto de checksums das migrações não encontrado.');
    const manifesto = JSON.parse(fs.readFileSync(manifestoCaminho, 'utf8'));
    const snapshotRelativo = 'snapshots/001-schema.js';
    const snapshotCaminho = path.join(diretorio, '..', snapshotRelativo);
    if (!fs.existsSync(snapshotCaminho)) throw new Error('Snapshot imutável do esquema inicial não encontrado.');
    const snapshotNormalizado = fs.readFileSync(snapshotCaminho, 'utf8').replace(/\r\n?/g, '\n');
    const snapshotChecksum = crypto.createHash('sha256').update(snapshotNormalizado, 'utf8').digest('hex');
    if (manifesto[snapshotRelativo] !== snapshotChecksum) {
        throw new Error('Snapshot do esquema inicial foi alterado. Restaure o arquivo e crie uma nova migração.');
    }
    const arquivos = fs.readdirSync(diretorio, { withFileTypes: true })
        .filter(item => item.isFile() && item.name.endsWith('.js'))
        .map(item => item.name);

    const invalidos = arquivos.filter(nome => !PADRAO_MIGRACAO.test(nome));
    if (invalidos.length) {
        throw new Error(`Migrações com nome inválido: ${invalidos.join(', ')}. Use 005-nome-da-migracao.js.`);
    }

    const numeros = new Set();
    const versoes = new Set();
    return arquivos.sort().map(nome => {
        const numero = PADRAO_MIGRACAO.exec(nome)[1];
        if (numeros.has(numero)) throw new Error(`Número de migração duplicado: ${numero}`);
        numeros.add(numero);

        const caminho = path.join(diretorio, nome);
        const conteudoNormalizado = fs.readFileSync(caminho, 'utf8').replace(/\r\n?/g, '\n');
        const checksum = crypto.createHash('sha256').update(conteudoNormalizado, 'utf8').digest('hex');
        if (!manifesto[nome]) throw new Error(`Migração sem checksum no manifesto: ${nome}.`);
        if (manifesto[nome] !== checksum) throw new Error(`Conteúdo da migração diverge do manifesto: ${nome}. Restaure o arquivo ou crie uma nova migração.`);
        delete require.cache[require.resolve(caminho)];
        const migracao = require(caminho);
        if (!migracao || typeof migracao.versao !== 'string' || typeof migracao.aplicar !== 'function') {
            throw new Error(`Migração inválida: ${nome}. Exporte versao e aplicar().`);
        }
        if (versoes.has(migracao.versao)) throw new Error(`Versão de migração duplicada: ${migracao.versao}`);
        versoes.add(migracao.versao);
        return { ...migracao, arquivo: nome, numero, checksum };
    });
}

async function verificarMigracoesAplicadas({ client, diretorio }) {
    const migracoes = carregarMigracoes(diretorio);
    const tabela = await client.query(`SELECT to_regclass('public.schema_migrations') AS tabela`);
    if (!tabela.rows[0]?.tabela) throw new Error('Banco sem controle de migrações. Execute npm run migrate antes de iniciar a API.');
    const aplicadas = await client.query('SELECT versao,checksum_sha256 FROM schema_migrations');
    const mapa = new Map(aplicadas.rows.map(item => [item.versao, String(item.checksum_sha256 || '').trim()]));
    const pendentes = migracoes.filter(item => !mapa.has(item.versao));
    if (pendentes.length) throw new Error(`Banco desatualizado. Migrações pendentes: ${pendentes.map(item => item.arquivo).join(', ')}.`);
    const divergente = migracoes.find(item => mapa.get(item.versao) !== item.checksum);
    if (divergente) throw new Error(`Checksum incompatível no banco para ${divergente.arquivo}. Execute a migração e não altere arquivos aplicados.`);
    return { total: migracoes.length, pendentes: 0 };
}

async function executarMigracoesPendentes({ client, diretorio, contexto = {}, logger = console }) {
    const migracoes = carregarMigracoes(diretorio);
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64)');
    for (const migracao of migracoes) {
        const aplicada = await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE versao=$1', [migracao.versao]);
        if (aplicada.rows.length) {
            const checksumRegistrado = String(aplicada.rows[0].checksum_sha256 || '').trim();
            if (!checksumRegistrado) {
                await client.query('UPDATE schema_migrations SET checksum_sha256=$1 WHERE versao=$2 AND checksum_sha256 IS NULL', [migracao.checksum, migracao.versao]);
            } else if (checksumRegistrado !== migracao.checksum) {
                throw new Error(`Migração aplicada foi alterada: ${migracao.arquivo}. Restaure o arquivo original e crie uma nova migração.`);
            }
            logger.log(`ℹ️ Migração ${migracao.versao} já estava aplicada.`);
            continue;
        }

        await client.query('BEGIN');
        try {
            await migracao.aplicar({ ...contexto, client });
            await client.query('INSERT INTO schema_migrations(versao,checksum_sha256) VALUES($1,$2)', [migracao.versao, migracao.checksum]);
            await client.query('COMMIT');
            logger.log(`✅ Migração ${migracao.versao} aplicada (${migracao.arquivo}).`);
        } catch (erro) {
            await client.query('ROLLBACK').catch(() => {});
            erro.message = `Falha na migração ${migracao.arquivo}: ${erro.message}`;
            throw erro;
        }
    }
    return migracoes;
}

module.exports = { carregarMigracoes, executarMigracoesPendentes, verificarMigracoesAplicadas };
