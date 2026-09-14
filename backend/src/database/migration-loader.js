const fs = require('fs');
const path = require('path');

const PADRAO_MIGRACAO = /^(\d{3})-[a-z0-9][a-z0-9-]*\.js$/;

function carregarMigracoes(diretorio) {
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
        delete require.cache[require.resolve(caminho)];
        const migracao = require(caminho);
        if (!migracao || typeof migracao.versao !== 'string' || typeof migracao.aplicar !== 'function') {
            throw new Error(`Migração inválida: ${nome}. Exporte versao e aplicar().`);
        }
        if (versoes.has(migracao.versao)) throw new Error(`Versão de migração duplicada: ${migracao.versao}`);
        versoes.add(migracao.versao);
        return { ...migracao, arquivo: nome, numero };
    });
}

async function executarMigracoesPendentes({ client, diretorio, contexto = {}, logger = console }) {
    const migracoes = carregarMigracoes(diretorio);
    for (const migracao of migracoes) {
        const aplicada = await client.query('SELECT 1 FROM schema_migrations WHERE versao=$1', [migracao.versao]);
        if (aplicada.rows.length) {
            logger.log(`ℹ️ Migração ${migracao.versao} já estava aplicada.`);
            continue;
        }

        await client.query('BEGIN');
        try {
            await migracao.aplicar({ ...contexto, client });
            await client.query('INSERT INTO schema_migrations(versao) VALUES($1)', [migracao.versao]);
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

module.exports = { carregarMigracoes, executarMigracoesPendentes };
