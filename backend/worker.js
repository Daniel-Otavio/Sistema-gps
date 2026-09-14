require('dotenv').config();

const {
    iniciarWorker,
    encerrarAplicacao,
    instalarTratadoresDeProcesso
} = require('./server');

instalarTratadoresDeProcesso();
iniciarWorker().catch(async erro => {
    console.error('❌ Worker não iniciado:', erro.message);
    await encerrarAplicacao('falha_ao_iniciar_worker', 1);
});
