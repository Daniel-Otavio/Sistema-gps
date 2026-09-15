const express = require('express');

function criarRotasResumoDashboard({ pool, autenticar, limiter, analisarPosicaoNaRota, registrarLogSistema }) {
    const router = express.Router();
    const acesso = [autenticar, limiter];
    const permitido = req => ['admin', 'empresa_usuario'].includes(req.usuario?.tipo);

    async function buscarLocalizacoes(idEmpresa = null) {
        const filtro = idEmpresa === null ? '' : 'JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=v.id AND ev.id_empresa=$1';
        const params = idEmpresa === null ? [] : [idEmpresa];
        return (await pool.query(`SELECT v.id,u.id AS id_motorista,u.nome,v.placa,v.frota,v.modelo,
            v.comprimento,v.largura,v.peso,l.lat,l.lon,l.ultima_atualizacao
            FROM veiculos v ${filtro}
            LEFT JOIN LATERAL (SELECT id,nome FROM usuarios WHERE tipo='motorista' AND id_veiculo=v.id ORDER BY id LIMIT 1) u ON TRUE
            LEFT JOIN LATERAL (SELECT lat,lon,ultima_atualizacao FROM localizacoes
                WHERE id_veiculo=v.id OR (id_veiculo IS NULL AND id_motorista=u.id)
                ORDER BY ultima_atualizacao DESC LIMIT 1) l ON TRUE
            WHERE v.ativo=TRUE ORDER BY v.placa`, params)).rows;
    }

    router.get('/dashboard/localizacoes', ...acesso, async (req, res, next) => {
        if (!permitido(req)) return res.status(403).json({ erro:'Acesso negado.' });
        try {
            res.json(await buscarLocalizacoes(req.usuario.tipo === 'empresa_usuario' ? req.usuario.id_empresa : null));
        } catch (erro) { next(erro); }
    });

    router.get('/dashboard/resumo', ...acesso, async (req, res, next) => {
        if (!permitido(req)) return res.status(403).json({ erro:'Acesso negado.' });
        const inicio = Date.now();
        try {
            const consultasMs = {};
            const medir = async (nome, promessa) => {
                const inicioConsulta = Date.now();
                try { return await promessa; }
                finally { consultasMs[nome] = Date.now() - inicioConsulta; }
            };
            const empresarial = req.usuario.tipo === 'empresa_usuario';
            const idEmpresa = empresarial ? req.usuario.id_empresa : null;
            const params = empresarial ? [idEmpresa] : [];
            const vinculo = empresarial ? 'JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=v.id AND ev.id_empresa=$1' : '';
            const [veiculos, motoristas, viagens, localizacoes, eventos, reportes, rotas] = await Promise.all([
                medir('veiculos', pool.query(`SELECT v.id,v.placa,v.frota,v.modelo,v.comprimento,v.largura,v.peso,
                    v.consumo_medio_km_l,v.tipo_combustivel,v.preco_combustivel_ref,v.ativo,v.created_at,
                    u.id AS id_motorista,u.nome AS motorista,u.email FROM veiculos v ${vinculo}
                    LEFT JOIN usuarios u ON u.id_veiculo=v.id AND u.tipo='motorista' ORDER BY v.placa`, params)),
                medir('motoristas', pool.query(`SELECT DISTINCT u.id,u.nome,u.login,u.email,u.tipo,u.email_verificado,u.id_veiculo,
                    v.placa,v.frota,v.modelo,v.comprimento,v.largura,v.peso FROM usuarios u
                    JOIN veiculos v ON v.id=u.id_veiculo ${vinculo}
                    WHERE u.tipo='motorista' ORDER BY u.nome`, params)),
                medir('viagens', pool.query(`SELECT vg.id,vg.id_rota,vg.id_veiculo,vg.id_motorista,vg.status,vg.carga,
                    vg.altura_total,vg.peso_total,vg.saida_prevista,vg.saida_real,vg.chegada_prevista,
                    vg.chegada_real,vg.rota_aprovada_geojson,v.placa,v.frota,v.modelo,u.nome AS motorista,
                    r.nome AS rota_nome,r.origem,r.destino,
                    COALESCE(vg.rota_aprovada_geojson,re.dados_geojson,r.dados_geojson) AS dados_geojson,
                    l.lat,l.lon,l.ultima_atualizacao FROM viagens vg JOIN veiculos v ON v.id=vg.id_veiculo
                    ${vinculo} JOIN rotas r ON r.id=vg.id_rota
                    LEFT JOIN rotas_especificas re ON re.id=vg.id_rota_especifica LEFT JOIN usuarios u ON u.id=vg.id_motorista
                    LEFT JOIN LATERAL (SELECT lat,lon,ultima_atualizacao FROM localizacoes loc
                        WHERE loc.id_veiculo=v.id OR (loc.id_veiculo IS NULL AND loc.id_motorista=u.id)
                        ORDER BY ultima_atualizacao DESC LIMIT 1) l ON TRUE
                    WHERE vg.status IN ('planejada','em_andamento') ORDER BY vg.saida_prevista NULLS LAST`, params)),
                medir('localizacoes', buscarLocalizacoes(idEmpresa)).then(rows => ({ rows, rowCount:rows.length })),
                medir('alertas', pool.query(empresarial
                    ? `SELECT g.id,'guardiao_sombra' AS tipo,CASE WHEN g.nivel IN ('iminente','critico') THEN 'alta' ELSE 'media' END AS severidade,
                        g.nivel,g.placa,g.id_veiculo,g.distancia_km,g.tempo_estimado_min,g.status_operacional,g.ultimo_evento_em,g.tipo_risco,g.dados
                        FROM guardiao_sombra_eventos g WHERE g.id_empresa=$1 ORDER BY g.ultimo_evento_em DESC LIMIT 1000`
                    : `SELECT g.id,'guardiao_sombra' AS tipo,CASE WHEN g.nivel IN ('iminente','critico') THEN 'alta' ELSE 'media' END AS severidade,
                        g.nivel,g.placa,g.id_veiculo,g.distancia_km,g.tempo_estimado_min,g.status_operacional,g.ultimo_evento_em,g.tipo_risco,g.dados,e.nome AS empresa
                        FROM guardiao_sombra_eventos g JOIN empresas_integracao e ON e.id=g.id_empresa ORDER BY g.ultimo_evento_em DESC LIMIT 1000`, params)),
                medir('reportes', pool.query(`SELECT rp.id,rp.tipo,rp.status_reporte,rp.data_hora,rp.lat,rp.lng,
                    rp.expira_em,rp.resolvido_em,v.placa,u.nome AS motorista FROM reportes rp JOIN veiculos v ON v.id=rp.id_veiculo
                    ${vinculo} LEFT JOIN usuarios u ON u.id=rp.id_motorista ORDER BY rp.data_hora DESC LIMIT 1000`, params)),
                medir('rotas', pool.query(`SELECT DISTINCT r.id,r.nome,r.origem,r.destino,r.status,r.criada_em,r.dados_geojson
                    FROM rotas r LEFT JOIN viagens vg ON vg.id_rota=r.id
                    ${empresarial ? 'LEFT JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo AND ev.id_empresa=$1 WHERE r.id_empresa=$1 OR ev.id_empresa=$1' : ''}
                    ORDER BY r.criada_em DESC LIMIT 500`, params))
            ]);
            const alertas = eventos.rows.map(g => ({ ...g,
                mensagem:`Guardião ${g.tipo_risco || 'restrição'} a ${Number(g.distancia_km || 0).toFixed(2)} km`,
                restricao:g.dados?.restricao || null, metodo_analise:g.dados?.metodo_analise || null }));
            if (!empresarial) {
                const agora = Date.now();
                for (const viagem of viagens.rows) {
                    if (viagem.status !== 'em_andamento') continue;
                    const atualizado = viagem.ultima_atualizacao ? new Date(viagem.ultima_atualizacao).getTime() : 0;
                    if (!atualizado || agora - atualizado > 5 * 60 * 1000) {
                        alertas.push({ tipo:'sem_sinal', severidade:'alta', placa:viagem.placa,
                            frota:viagem.frota, viagem_id:viagem.id, mensagem:'Sem GPS há mais de 5 minutos' });
                    }
                    if (Number.isFinite(Number(viagem.lat)) && Number.isFinite(Number(viagem.lon))) {
                        const analise = analisarPosicaoNaRota(viagem.dados_geojson, Number(viagem.lat), Number(viagem.lon));
                        if (analise.distanciaRotaKm !== null && analise.distanciaRotaKm > 0.5) {
                            alertas.push({ tipo:'fora_rota', severidade:'alta', placa:viagem.placa,
                                frota:viagem.frota, viagem_id:viagem.id,
                                mensagem:`Veículo está ${analise.distanciaRotaKm.toFixed(2)} km fora da rota` });
                        }
                    }
                    if (viagem.chegada_prevista) {
                        const atraso = Math.round((agora - new Date(viagem.chegada_prevista).getTime()) / 60000);
                        if (atraso >= 10) alertas.push({ tipo:'atraso', severidade:'media', placa:viagem.placa,
                            frota:viagem.frota, viagem_id:viagem.id, mensagem:`Atraso de ${atraso} min` });
                    }
                }
                const guardiao = await pool.query(`SELECT ge.id,ge.id_viagem,ge.nivel,ge.tipo_risco,
                    ge.distancia_km,ge.tempo_estimado_min,ge.mensagem,ge.dados,ge.atualizado_em,v.placa,v.frota
                    FROM guardiao_eventos ge JOIN viagens vg ON vg.id=ge.id_viagem JOIN veiculos v ON v.id=ge.id_veiculo
                    WHERE ge.ativo=TRUE AND vg.status='em_andamento'
                    AND ge.atualizado_em>CURRENT_TIMESTAMP-INTERVAL '30 minutes'
                    ORDER BY CASE WHEN ge.nivel='critico' THEN 0 ELSE 1 END,ge.distancia_km LIMIT 50`);
                for (const g of guardiao.rows) alertas.push({ tipo:'guardiao',
                    severidade:g.nivel === 'critico' ? 'alta' : 'media', placa:g.placa, frota:g.frota,
                    viagem_id:g.id_viagem, guardiao_evento_id:g.id, mensagem:`🛡️ ${g.mensagem}`,
                    distancia_km:g.distancia_km, tempo_estimado_min:g.tempo_estimado_min,
                    incompatibilidade:g.dados?.incompatibilidade || null, restricao:g.dados?.restricao || null });
            }
            const linhas = veiculos.rowCount + motoristas.rowCount + viagens.rowCount +
                localizacoes.rows.length + eventos.rowCount + reportes.rowCount + rotas.rowCount;
            const duracaoMs = Date.now() - inicio;
            for (const [consulta, tempoMs] of Object.entries(consultasMs)) {
                if (tempoMs >= 1000) await registrarLogSistema({ nivel:'warn', origem:'db_consulta_lenta',
                    mensagem:`Consulta lenta no resumo do dashboard: ${consulta}`,
                    detalhes:{ consulta, duracao_ms:tempoMs }, req, duracaoMs:tempoMs });
            }
            await registrarLogSistema({ nivel:duracaoMs >= 3000 ? 'warn' : 'info', origem:'dashboard_resumo',
                mensagem:'Resumo do dashboard processado', detalhes:{ linhas, empresarial, consultas_ms:consultasMs }, req, duracaoMs });
            res.json({ veiculos:veiculos.rows, motoristas:motoristas.rows, viagens:viagens.rows,
                localizacoes:localizacoes.rows, alertas, reportes:reportes.rows, rotas:rotas.rows,
                atualizado_em:new Date().toISOString() });
        } catch (erro) { next(erro); }
    });
    return router;
}

module.exports = { criarRotasResumoDashboard };
