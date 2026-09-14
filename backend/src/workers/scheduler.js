function criarAgendador({ tarefas, logger = console }) {
    const temporizadores = new Set();
    let ativo = false;

    function iniciar() {
        if (ativo) return;
        ativo = true;
        for (const tarefa of tarefas) {
            const executar = () => Promise.resolve(tarefa.executar()).catch(erro => logger.error(`Falha no worker ${tarefa.nome}:`, erro));
            const inicial = setTimeout(executar, tarefa.atrasoInicialMs || 0);
            const intervalo = setInterval(executar, tarefa.intervaloMs);
            temporizadores.add(inicial);
            temporizadores.add(intervalo);
        }
    }

    function parar() {
        ativo = false;
        for (const temporizador of temporizadores) {
            clearTimeout(temporizador);
            clearInterval(temporizador);
        }
        temporizadores.clear();
    }

    return { iniciar, parar, estaAtivo: () => ativo };
}

module.exports = { criarAgendador };
