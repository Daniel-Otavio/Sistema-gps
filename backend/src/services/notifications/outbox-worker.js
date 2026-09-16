const axios = require('axios');
const crypto = require('node:crypto');

function escaparHtml(valor) {
    return String(valor ?? '-').replace(/[&<>"']/g, caractere => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[caractere]);
}

function criarProcessadorNotificacoes({ pool, workerId, validarWebhook, alertWebhookUrl, alertEmailTo, brevoApiKey, emailRemetente, emailNome }) {
    const concorrencia = Math.max(1, Math.min(5, Number(process.env.NOTIFICATION_CONCURRENCY) || 4));
    let processando = false;
    const chaveDestino = valor => crypto.createHash('sha256').update(String(valor)).digest('hex');

    async function adquirirLock(chave) {
        const r = await pool.query(`INSERT INTO notificacao_destino_locks(chave,worker_id,expira_em)
            VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '30 seconds')
            ON CONFLICT(chave) DO UPDATE SET worker_id=EXCLUDED.worker_id,reservado_em=CURRENT_TIMESTAMP,expira_em=EXCLUDED.expira_em
            WHERE notificacao_destino_locks.expira_em<CURRENT_TIMESTAMP OR notificacao_destino_locks.worker_id=EXCLUDED.worker_id
            RETURNING chave`, [chave, workerId]);
        return Boolean(r.rowCount);
    }
    async function liberarLock(chave) {
        await pool.query(`DELETE FROM notificacao_destino_locks WHERE chave=$1 AND worker_id=$2`, [chave, workerId]).catch(() => {});
    }
    async function verificarCircuito(chave) {
        const r = await pool.query(`SELECT aberto_ate FROM notificacao_circuitos WHERE chave=$1 AND aberto_ate>CURRENT_TIMESTAMP`, [chave]);
        if (r.rowCount) throw Object.assign(new Error('Circuit breaker do webhook temporariamente aberto.'), { circuitoAberto:true });
    }
    async function circuitoSucesso(chave) {
        await pool.query(`INSERT INTO notificacao_circuitos(chave,falhas_consecutivas,ultimo_sucesso_em) VALUES($1,0,CURRENT_TIMESTAMP)
            ON CONFLICT(chave) DO UPDATE SET falhas_consecutivas=0,aberto_ate=NULL,ultimo_sucesso_em=CURRENT_TIMESTAMP,ultimo_erro=NULL,atualizado_em=CURRENT_TIMESTAMP`, [chave]);
    }
    async function circuitoFalha(chave, erro) {
        await pool.query(`INSERT INTO notificacao_circuitos(chave,falhas_consecutivas,ultima_falha_em,ultimo_erro)
            VALUES($1,1,CURRENT_TIMESTAMP,$2) ON CONFLICT(chave) DO UPDATE SET
            falhas_consecutivas=notificacao_circuitos.falhas_consecutivas+1,
            aberto_ate=CASE WHEN notificacao_circuitos.falhas_consecutivas+1>=3 THEN CURRENT_TIMESTAMP+INTERVAL '5 minutes' ELSE notificacao_circuitos.aberto_ate END,
            ultima_falha_em=CURRENT_TIMESTAMP,ultimo_erro=EXCLUDED.ultimo_erro,atualizado_em=CURRENT_TIMESTAMP`, [chave, String(erro.message || erro).slice(0, 1000)]);
    }

    async function processarItem(item) {
        let lock = null;
        let circuito = null;
        try {
            if (item.destinatario === 'webhook') {
                const cfg = item.id_empresa ? (await pool.query(`SELECT webhook_url,webhook_segredo FROM empresa_notificacao_config WHERE id_empresa=$1 AND webhook_ativo=TRUE`, [item.id_empresa])).rows[0] : null;
                const url = cfg?.webhook_url || alertWebhookUrl;
                const segredo = cfg?.webhook_segredo;
                if (!url) throw new Error('Webhook não configurado');
                circuito = chaveDestino(`webhook:${url}`);
                lock = chaveDestino(`empresa:${item.id_empresa || 'global'}:webhook:${url}`);
                if (!await adquirirLock(lock)) {
                    await pool.query(`UPDATE notificacoes_outbox SET status='pendente',tentativas=GREATEST(0,tentativas-1),proxima_tentativa_em=CURRENT_TIMESTAMP+INTERVAL '5 seconds',reservado_em=NULL,worker_id=NULL WHERE id=$1 AND worker_id=$2`, [item.id, workerId]);
                    return;
                }
                await verificarCircuito(circuito);
                const destino = await validarWebhook(url);
                const timestamp = Math.floor(Date.now() / 1000);
                const conteudo = JSON.stringify(item.payload);
                const canonico = `${timestamp}.${item.entrega_id}.${item.tentativas}.${conteudo}`;
                const assinatura = segredo ? crypto.createHmac('sha256', segredo).update(canonico).digest('hex') : null;
                await axios.post(destino.url, item.payload, { headers:{ 'X-Guardiao-Delivery':item.entrega_id, 'X-Guardiao-Timestamp':String(timestamp), 'X-Guardiao-Attempt':String(item.tentativas), ...(assinatura ? { 'X-Guardiao-Signature':`sha256=${assinatura}` } : {}) }, timeout:8000, maxRedirects:0, httpsAgent:destino.httpsAgent });
                await circuitoSucesso(circuito);
                await pool.query(`UPDATE notificacoes_outbox SET assinatura_hmac=$1,assinatura_timestamp=$2 WHERE id=$3 AND worker_id=$4`, [assinatura, timestamp, item.id, workerId]);
            } else if (item.destinatario !== 'painel') {
                if (!brevoApiKey || !emailRemetente) throw new Error('Canal de e-mail não configurado');
                lock = chaveDestino(`email:${String(item.destinatario).toLowerCase()}`);
                if (!await adquirirLock(lock)) {
                    await pool.query(`UPDATE notificacoes_outbox SET status='pendente',tentativas=GREATEST(0,tentativas-1),proxima_tentativa_em=CURRENT_TIMESTAMP+INTERVAL '5 seconds',reservado_em=NULL,worker_id=NULL WHERE id=$1 AND worker_id=$2`, [item.id, workerId]);
                    return;
                }
                await axios.post('https://api.brevo.com/v3/smtp/email', { sender:{ name:emailNome, email:emailRemetente }, to:[{ email:item.destinatario }], subject:`Alerta Guardião · ${item.payload?.placa || 'veículo'}`, htmlContent:`<h2>Alerta Guardião</h2><p>Veículo: <strong>${escaparHtml(item.payload?.placa)}</strong></p><p>Nível: ${escaparHtml(item.payload?.nivel)}</p><p>Distância: ${escaparHtml(item.payload?.distancia_km)} km</p>` }, { headers:{ 'api-key':brevoApiKey, 'Content-Type':'application/json' }, timeout:10000 });
            }
            await pool.query(`UPDATE notificacoes_outbox SET status='enviado',enviado_em=CURRENT_TIMESTAMP,ultimo_erro=NULL,reservado_em=NULL,worker_id=NULL WHERE id=$1 AND worker_id=$2`, [item.id, workerId]);
        } catch (erro) {
            if (circuito && !erro.circuitoAberto) await circuitoFalha(circuito, erro).catch(() => {});
            const tentativas = Number(item.tentativas || 0);
            const final = tentativas >= 8;
            await pool.query(`UPDATE notificacoes_outbox SET status=$1,ultimo_erro=$2,proxima_tentativa_em=CURRENT_TIMESTAMP+($3||' seconds')::interval,reservado_em=NULL,worker_id=NULL WHERE id=$4 AND worker_id=$5`, [final ? 'falhou' : 'pendente', String(erro.message || erro).slice(0, 1000), Math.min(3600, Math.pow(2, tentativas) * 15), item.id, workerId]);
        } finally {
            if (lock) await liberarLock(lock);
        }
    }

    return async function processarNotificacoesOutbox() {
        if (processando) return 0;
        processando = true;
        try {
            const fila = await pool.query(`WITH candidatos AS(SELECT id FROM notificacoes_outbox WHERE((status='pendente' AND proxima_tentativa_em<=CURRENT_TIMESTAMP)OR(status='tentando' AND reservado_em<CURRENT_TIMESTAMP-INTERVAL '5 minutes'))ORDER BY criado_em LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE notificacoes_outbox n SET status='tentando',tentativas=n.tentativas+1,reservado_em=CURRENT_TIMESTAMP,worker_id=$1 FROM candidatos c WHERE n.id=c.id RETURNING n.*`, [workerId]);
            let indice = 0;
            await Promise.all(Array.from({ length:Math.min(concorrencia, fila.rows.length) }, async () => {
                while (indice < fila.rows.length) await processarItem(fila.rows[indice++]);
            }));
            return fila.rowCount;
        } finally { processando = false; }
    };
}

module.exports = { criarProcessadorNotificacoes };
