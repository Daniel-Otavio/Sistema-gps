const crypto = require('crypto');
const { criptografar } = require('./export-crypto');

const workerId = `privacy-export-${process.pid}-${crypto.randomUUID()}`;
const MAX_TENTATIVAS = 6;

async function carregarPacote(client, solicitacao) {
    const empresa = Number(solicitacao.id_empresa);
    const id = Number(solicitacao.titular_id);
    if (solicitacao.titular_tipo === 'veiculo') {
        const [cadastro, posicoes, viagens, alertas] = await Promise.all([
            client.query(`SELECT v.id,v.placa,v.frota,v.modelo,v.comprimento,v.largura,v.peso,v.ativo,v.created_at FROM veiculos v JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=v.id WHERE ev.id_empresa=$1 AND v.id=$2`, [empresa, id]),
            client.query(`SELECT lat,lon,velocidade_kmh,direcao_graus,precisao_m,timestamp_dispositivo,recebido_em,classificacao FROM gps_ingestoes WHERE id_empresa=$1 AND id_veiculo=$2 ORDER BY recebido_em DESC LIMIT 10000`, [empresa, id]),
            client.query(`SELECT vg.id,vg.status,vg.carga,vg.altura_total,vg.peso_total,vg.saida_real,vg.chegada_real FROM viagens vg JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo WHERE ev.id_empresa=$1 AND vg.id_veiculo=$2 ORDER BY vg.id DESC`, [empresa, id]),
            client.query(`SELECT id,nivel,tipo_risco,status_operacional,primeiro_evento_em,ultimo_evento_em,resolvido_em FROM guardiao_sombra_eventos WHERE id_empresa=$1 AND id_veiculo=$2 ORDER BY id DESC`, [empresa, id])
        ]);
        if (!cadastro.rowCount) throw new Error('Titular não pertence mais à empresa.');
        return { cadastro: cadastro.rows[0], posicoes: posicoes.rows, viagens: viagens.rows, alertas: alertas.rows };
    }
    if (solicitacao.titular_tipo === 'usuario') {
        const usuario = await client.query(`SELECT id,nome,email,perfil,ativo,created_at FROM empresa_usuarios WHERE id_empresa=$1 AND id=$2`, [empresa, id]);
        if (!usuario.rowCount) throw new Error('Titular não pertence mais à empresa.');
        return { usuario: usuario.rows[0] };
    }
    const [motorista, viagens, reportes] = await Promise.all([
        client.query(`SELECT u.id,u.nome,u.login,u.email,u.ativo,u.created_at FROM usuarios u WHERE u.id=$2 AND u.tipo='motorista' AND(EXISTS(SELECT 1 FROM empresa_integracao_veiculos ev WHERE ev.id_empresa=$1 AND ev.id_veiculo=u.id_veiculo)OR EXISTS(SELECT 1 FROM viagens vg JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo AND ev.id_empresa=$1 WHERE vg.id_motorista=u.id))`, [empresa, id]),
        client.query(`SELECT vg.id,vg.status,vg.saida_real,vg.chegada_real,v.placa FROM viagens vg JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo AND ev.id_empresa=$1 JOIN veiculos v ON v.id=vg.id_veiculo WHERE vg.id_motorista=$2 ORDER BY vg.id DESC`, [empresa, id]),
        client.query(`SELECT rp.id,rp.tipo,rp.lat,rp.lng,rp.data_hora,rp.status_reporte FROM reportes rp JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=rp.id_veiculo AND ev.id_empresa=$1 WHERE rp.id_motorista=$2 ORDER BY rp.id DESC`, [empresa, id])
    ]);
    if (!motorista.rowCount) throw new Error('Titular não pertence mais à empresa.');
    return { motorista: motorista.rows[0], viagens: viagens.rows, reportes: reportes.rows };
}

async function reservar(pool) {
    const r = await pool.query(`WITH item AS (
        SELECT id FROM privacidade_exportacao_fila
        WHERE (status='pendente' AND proxima_tentativa_em<=CURRENT_TIMESTAMP)
           OR (status='processando' AND reservado_em<CURRENT_TIMESTAMP-INTERVAL '10 minutes')
        ORDER BY criado_em FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE privacidade_exportacao_fila f SET status='processando',reservado_em=CURRENT_TIMESTAMP,
        iniciado_em=CURRENT_TIMESTAMP,worker_id=$1,tentativas=tentativas+1
        FROM item WHERE f.id=item.id RETURNING f.id,f.id_solicitacao,f.tentativas`, [workerId]);
    return r.rows[0] || null;
}

async function processarFilaExportacaoPrivacidade({ pool }) {
    const item = await reservar(pool);
    if (!item) return 0;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const solicitacao = (await client.query(`SELECT id,id_empresa,tipo,titular_tipo,titular_id,status FROM privacidade_solicitacoes WHERE id=$1 FOR UPDATE`, [item.id_solicitacao])).rows[0];
        if (!solicitacao || solicitacao.tipo !== 'exportacao' || solicitacao.status === 'rejeitada') throw new Error('Solicitação indisponível para exportação.');
        const pacote = await carregarPacote(client, solicitacao);
        const protegido = criptografar(pacote);
        const exportacaoId = crypto.randomUUID();
        const horas = Math.max(1, Math.min(168, Number(process.env.PRIVACY_EXPORT_EXPIRATION_HOURS) || 24));
        await client.query(`DELETE FROM privacidade_exportacoes WHERE id_solicitacao=$1 AND baixado_em IS NULL`, [solicitacao.id]);
        await client.query(`INSERT INTO privacidade_exportacoes(id,id_solicitacao,id_empresa,conteudo_criptografado,iv,auth_tag,hash_sha256,tamanho_bytes,expira_em) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP+($9||' hours')::interval)`, [exportacaoId, solicitacao.id, solicitacao.id_empresa, protegido.conteudo, protegido.iv, protegido.authTag, protegido.hash, protegido.tamanho, horas]);
        const resultado = { tipo: 'exportacao', titular_tipo: solicitacao.titular_tipo, executado_em: new Date().toISOString(), registros: { itens: Object.values(pacote).reduce((n, v) => n + (Array.isArray(v) ? v.length : v ? 1 : 0), 0), limite_posicoes: 10000 }, exportacao: { id: exportacaoId, hash_sha256: protegido.hash, tamanho_bytes: protegido.tamanho, expira_em_horas: horas } };
        await client.query(`UPDATE privacidade_solicitacoes SET status='concluida',resultado=$1::jsonb,processado_em=CURRENT_TIMESTAMP,concluido_em=CURRENT_TIMESTAMP,erro_processamento=NULL WHERE id=$2`, [JSON.stringify(resultado), solicitacao.id]);
        await client.query(`UPDATE privacidade_exportacao_fila SET status='concluido',processado_em=CURRENT_TIMESTAMP,reservado_em=NULL,worker_id=NULL,ultimo_erro=NULL WHERE id=$1`, [item.id]);
        await client.query('COMMIT');
        return 1;
    } catch (erro) {
        await client.query('ROLLBACK').catch(() => {});
        const final = Number(item.tentativas) >= MAX_TENTATIVAS;
        await pool.query(`UPDATE privacidade_exportacao_fila SET status=$2,reservado_em=NULL,worker_id=NULL,ultimo_erro=$3,processado_em=CASE WHEN $2='falhou' THEN CURRENT_TIMESTAMP ELSE NULL END,proxima_tentativa_em=CURRENT_TIMESTAMP+(LEAST(3600,POWER(2,$4)*15)||' seconds')::interval WHERE id=$1`, [item.id, final ? 'falhou' : 'pendente', String(erro.message || erro).slice(0, 1000), Number(item.tentativas)]);
        if (final) await pool.query(`UPDATE privacidade_solicitacoes SET status='pendente',erro_processamento=$1 WHERE id=$2`, ['A exportação falhou após várias tentativas. Solicite reprocessamento.', item.id_solicitacao]);
        return 0;
    } finally {
        client.release();
    }
}

async function liberarReservasExportacaoPrivacidade({ pool }) {
    return pool.query(`UPDATE privacidade_exportacao_fila SET status='pendente',reservado_em=NULL,worker_id=NULL,proxima_tentativa_em=CURRENT_TIMESTAMP WHERE status='processando' AND worker_id=$1`, [workerId]);
}

module.exports = { processarFilaExportacaoPrivacidade, liberarReservasExportacaoPrivacidade, reservarExportacaoPrivacidade: reservar };
