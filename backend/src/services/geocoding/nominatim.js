const crypto = require('crypto');
const axios = require('axios');

let filaNominatim = Promise.resolve();
let proximaConsultaEm = 0;

async function respeitarIntervaloNominatim() {
    const vez = filaNominatim.then(async () => {
        const espera = Math.max(0, proximaConsultaEm - Date.now());
        if (espera) await new Promise(resolve => setTimeout(resolve, espera));
        proximaConsultaEm = Date.now() + 1100;
    });
    filaNominatim = vez.catch(() => {});
    await vez;
}

function normalizarConsulta(valor) {
    return String(valor || '').trim().replace(/\s+/g, ' ').slice(0, 250);
}

function hashConsulta(consulta) {
    return crypto.createHash('sha256').update(consulta.toLocaleLowerCase('pt-BR')).digest('hex');
}

async function geocodificar({ pool, consulta }) {
    const normalizada = normalizarConsulta(consulta);
    if (normalizada.length < 3) {
        const erro = new Error('Informe pelo menos 3 caracteres para pesquisar.');
        erro.status = 400;
        throw erro;
    }

    const hash = hashConsulta(normalizada);
    const cache = await pool.query(`
        SELECT latitude,longitude,nome_exibicao,encontrado
        FROM geocodificacao_cache
        WHERE consulta_hash=$1 AND expira_em>CURRENT_TIMESTAMP
    `, [hash]);
    if (cache.rows.length) {
        const item = cache.rows[0];
        return item.encontrado
            ? { lat: Number(item.latitude), lon: Number(item.longitude), nome: item.nome_exibicao, cache: true }
            : null;
    }

    await respeitarIntervaloNominatim();
    const contato = String(process.env.GEOCODING_CONTACT_EMAIL || '').trim();
    const resposta = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { format: 'jsonv2', limit: 1, addressdetails: 0, q: normalizada },
        headers: {
            'User-Agent': `Sistema-GPS/1.0${contato ? ` (${contato})` : ''}`,
            Accept: 'application/json'
        },
        timeout: 7000,
        maxContentLength: 256 * 1024
    });
    const primeiro = Array.isArray(resposta.data) ? resposta.data[0] : null;
    const lat = Number(primeiro?.lat);
    const lon = Number(primeiro?.lon);
    const encontrado = Number.isFinite(lat) && Number.isFinite(lon);
    const nome = encontrado ? String(primeiro.display_name || normalizada).slice(0, 500) : null;

    await pool.query(`
        INSERT INTO geocodificacao_cache
            (consulta_hash,consulta_normalizada,latitude,longitude,nome_exibicao,encontrado,expira_em)
        VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP+INTERVAL '30 days')
        ON CONFLICT(consulta_hash) DO UPDATE SET
            latitude=EXCLUDED.latitude,
            longitude=EXCLUDED.longitude,
            nome_exibicao=EXCLUDED.nome_exibicao,
            encontrado=EXCLUDED.encontrado,
            criado_em=CURRENT_TIMESTAMP,
            expira_em=EXCLUDED.expira_em
    `, [hash, normalizada, encontrado ? lat : null, encontrado ? lon : null, nome, encontrado]);

    return encontrado ? { lat, lon, nome, cache: false } : null;
}

module.exports = { geocodificar, normalizarConsulta };
