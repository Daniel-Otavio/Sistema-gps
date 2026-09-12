module.exports = {
    versao: '001_esquema_consolidado_2026_09',
    async aplicar({ criarTabelas }) {
        await criarTabelas();
    }
};
