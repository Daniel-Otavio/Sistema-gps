const { executarMigracoes, pool } = require('../server');

executarMigracoes()
    .then(() => pool.end())
    .catch(async erro => {
        console.error('❌ Migração interrompida:', erro.message);
        await pool.end().catch(() => {});
        process.exitCode = 1;
    });
