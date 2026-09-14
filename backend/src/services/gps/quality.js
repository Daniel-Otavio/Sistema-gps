function classificarPosicaoGps({ atual, anterior, calcularDistanciaKm }) {
    const motivos = [];
    let classificacao = 'valida_tempo_real';
    let apta = true;
    const timestamp = atual.timestamp ? new Date(atual.timestamp) : null;
    const tempo = timestamp?.getTime();
    const agora = Date.now();

    if (!timestamp || !Number.isFinite(tempo)) {
        motivos.push('horario_invalido');
        classificacao = 'horario_invalido';
        apta = false;
    } else {
        const idade = (agora - tempo) / 1000;
        if (idade > 120) {
            motivos.push('atrasada');
            classificacao = 'atrasada';
            apta = false;
        }
        if (idade < -300) {
            motivos.push('relogio_adiantado');
            classificacao = 'horario_invalido';
            apta = false;
        }
        if (anterior?.timestamp_dispositivo && tempo <= new Date(anterior.timestamp_dispositivo).getTime()) {
            motivos.push('fora_de_ordem');
            classificacao = 'fora_de_ordem';
            apta = false;
        }
    }

    if (Number(atual.precisao) > 100) {
        motivos.push('precisao_insuficiente');
        classificacao = 'precisao_insuficiente';
        apta = false;
    }

    if (anterior && typeof calcularDistanciaKm === 'function') {
        const km = calcularDistanciaKm(anterior.lat, anterior.lon, atual.lat, atual.lon);
        const horas = tempo && anterior.timestamp_dispositivo
            ? (tempo - new Date(anterior.timestamp_dispositivo).getTime()) / 3600000
            : 0;
        if (km > 5 && (horas <= 0 || km / horas > 180)) {
            motivos.push('salto_impossivel');
            classificacao = 'salto_impossivel';
            apta = false;
        }
    }

    if (atual.offline) {
        motivos.push('armazenada_offline');
        if (apta) classificacao = 'valida_historico';
        apta = false;
    }

    return { classificacao, motivos, apta_historico: true, apta_tempo_real: apta };
}

module.exports = { classificarPosicaoGps };
