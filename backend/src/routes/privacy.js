const express = require('express');
const { descriptografar } = require('../services/privacy/export-crypto');

function criarRotasPrivacidade({
    pool,
    autenticar,
    autorizarPerfilEmpresa,
    gpsRetencaoPadrao,
    registrarLogSistema
}) {
    const router = express.Router();
    const perfisLeitura = ['administrador', 'supervisor', 'analista', 'somente_leitura'];

    router.get('/integracoes/empresas/:id/retencao', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const r = await pool.query(`SELECT id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_em FROM politicas_retencao WHERE id_empresa=$1`, [req.params.id]);
        return res.json(r.rows[0] || { id_empresa: Number(req.params.id), gps_bruto_dias: gpsRetencaoPadrao, payload_gps_dias: 30, logs_dias: 90, integracao_logs_dias: 90, alertas_dias: 365 });
    });

    router.put('/integracoes/empresas/:id/retencao', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const campos = ['gps_bruto_dias', 'payload_gps_dias', 'logs_dias', 'integracao_logs_dias', 'alertas_dias'];
        const valores = campos.map(c => Number(req.body?.[c]));
        if (valores.some((v, i) => !Number.isInteger(v) || v < (i < 2 ? 1 : i === 4 ? 30 : 7) || v > 3650)) {
            return res.status(400).json({ erro: 'Prazos de retenção inválidos.' });
        }
        const r = await pool.query(`
            INSERT INTO politicas_retencao(id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_por)
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(id_empresa) DO UPDATE SET
                gps_bruto_dias=EXCLUDED.gps_bruto_dias,
                payload_gps_dias=EXCLUDED.payload_gps_dias,
                logs_dias=EXCLUDED.logs_dias,
                integracao_logs_dias=EXCLUDED.integracao_logs_dias,
                alertas_dias=EXCLUDED.alertas_dias,
                atualizado_por=EXCLUDED.atualizado_por,
                atualizado_em=CURRENT_TIMESTAMP
            RETURNING id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_em
        `, [req.params.id, ...valores, req.usuario.id]);
        return res.json(r.rows[0]);
    });

    router.get('/privacidade/solicitacoes', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const idEmpresa = req.query.id_empresa ? Number(req.query.id_empresa) : null;
        const r = await pool.query(`
            SELECT id,id_empresa,tipo,titular_tipo,titular_id,status,justificativa,solicitado_por,solicitado_em,concluido_em
            FROM privacidade_solicitacoes
            WHERE($1::INTEGER IS NULL OR id_empresa=$1)
            ORDER BY solicitado_em DESC LIMIT 500
        `, [idEmpresa]);
        return res.json(r.rows);
    });

    router.patch('/privacidade/solicitacoes/:id', autenticar, async (req, res) => {
        if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado' });
        const status = String(req.body?.status || '');
        if (!['pendente', 'em_processamento', 'rejeitada'].includes(status)) {
            return res.status(400).json({ erro: 'Status de solicitação inválido.' });
        }
        const justificativa = req.body?.justificativa ? String(req.body.justificativa).slice(0, 2000) : null;
        const r = await pool.query(`
            UPDATE privacidade_solicitacoes
            SET status=$1,justificativa=COALESCE($2,justificativa),
                concluido_em=CASE WHEN $1 IN('concluida','rejeitada') THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id=$3
            RETURNING id,id_empresa,tipo,titular_tipo,titular_id,status,justificativa,solicitado_por,solicitado_em,concluido_em
        `, [status, justificativa, req.params.id]);
        if (!r.rows.length) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
        await registrarLogSistema({ nivel: 'info', origem: 'privacidade', mensagem: `Solicitação de privacidade atualizada para ${status}`, detalhes: { id_solicitacao: r.rows[0].id, id_empresa: r.rows[0].id_empresa }, req });
        return res.json(r.rows[0]);
    });

    router.post('/privacidade/solicitacoes/:id/executar', autenticar, async (req,res)=>{
        if(req.usuario.tipo!=='admin')return res.status(403).json({erro:'Acesso negado'});
        const client=await pool.connect();
        try{await client.query('BEGIN');const solicitacao=(await client.query(`SELECT id,id_empresa,tipo,titular_tipo,titular_id,status FROM privacidade_solicitacoes WHERE id=$1 FOR UPDATE`,[req.params.id])).rows[0];
            if(!solicitacao){await client.query('ROLLBACK');return res.status(404).json({erro:'Solicitação não encontrada.'});}
            if(solicitacao.status==='concluida'){await client.query('ROLLBACK');return res.status(409).json({erro:'Solicitação já executada.'});}
            if(solicitacao.status==='rejeitada'){await client.query('ROLLBACK');return res.status(409).json({erro:'Solicitação rejeitada não pode ser executada.'});}
            if(solicitacao.tipo!=='exportacao'&&String(req.body?.confirmacao)!==`EXECUTAR-${solicitacao.id}`){await client.query('ROLLBACK');return res.status(422).json({erro:`Confirme a operação irreversível com EXECUTAR-${solicitacao.id}.`});}
            const id=Number(solicitacao.titular_id),empresa=Number(solicitacao.id_empresa);let resultado={tipo:solicitacao.tipo,titular_tipo:solicitacao.titular_tipo,executado_em:new Date().toISOString(),registros:{}};let pacote=null;
            const verificacoes={veiculo:`SELECT v.placa FROM empresa_integracao_veiculos ev JOIN veiculos v ON v.id=ev.id_veiculo WHERE ev.id_empresa=$1 AND ev.id_veiculo=$2`,usuario:`SELECT NULL::text AS placa FROM empresa_usuarios WHERE id_empresa=$1 AND id=$2`,motorista:`SELECT NULL::text AS placa FROM usuarios u WHERE u.id=$2 AND u.tipo='motorista' AND(EXISTS(SELECT 1 FROM viagens vg JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo AND ev.id_empresa=$1 WHERE vg.id_motorista=u.id)OR EXISTS(SELECT 1 FROM empresa_integracao_veiculos ev WHERE ev.id_empresa=$1 AND ev.id_veiculo=u.id_veiculo))`};
            const titular=(await client.query(verificacoes[solicitacao.titular_tipo],[empresa,id])).rows[0];if(!titular)throw new Error('Titular não pertence mais à empresa; solicitação não executada.');const placaOriginal=titular.placa||null;
            if(solicitacao.tipo==='exportacao'){
                await client.query(`INSERT INTO privacidade_exportacao_fila(id_solicitacao,status,tentativas,proxima_tentativa_em,reservado_em,iniciado_em,processado_em,worker_id,ultimo_erro) VALUES($1,'pendente',0,CURRENT_TIMESTAMP,NULL,NULL,NULL,NULL,NULL) ON CONFLICT(id_solicitacao) DO UPDATE SET status='pendente',tentativas=0,proxima_tentativa_em=CURRENT_TIMESTAMP,reservado_em=NULL,iniciado_em=NULL,processado_em=NULL,worker_id=NULL,ultimo_erro=NULL`,[solicitacao.id]);
                await client.query(`UPDATE privacidade_solicitacoes SET status='em_processamento',processado_por=$1,erro_processamento=NULL WHERE id=$2`,[req.usuario.id,solicitacao.id]);
                await client.query('COMMIT');
                await registrarLogSistema({nivel:'info',origem:'privacidade',mensagem:'Exportação de privacidade colocada na fila',detalhes:{id_solicitacao:solicitacao.id,id_empresa:empresa},req});
                return res.status(202).json({solicitacao_id:solicitacao.id,status:'em_processamento',mensagem:'Exportação protegida em processamento.'});
            }else{
                if(solicitacao.titular_tipo==='usuario'){const r=await client.query(`UPDATE empresa_usuarios SET nome=$1,email=$2,senha_hash=NULL,ativo=FALSE,token_version=token_version+1 WHERE id_empresa=$3 AND id=$4`,[`Usuário anonimizado #${id}`,`anonimo+${empresa}-${id}@invalid.local`,empresa,id]);resultado.registros.usuariosAnonimizados=r.rowCount;}
                else if(solicitacao.titular_tipo==='motorista'){const r=await client.query(`UPDATE usuarios SET nome=$1,login=$2,email=NULL,senha=$3,ativo=FALSE,token_version=token_version+1,id_veiculo=NULL WHERE id=$4 AND tipo='motorista' AND(EXISTS(SELECT 1 FROM viagens vg JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo AND ev.id_empresa=$5 WHERE vg.id_motorista=usuarios.id)OR EXISTS(SELECT 1 FROM empresa_integracao_veiculos ev WHERE ev.id_empresa=$5 AND ev.id_veiculo=usuarios.id_veiculo))`,[`Motorista anonimizado #${id}`,`anonimo-${empresa}-${id}`,`conta-desativada-${Date.now()}`,id,empresa]);resultado.registros.motoristasAnonimizados=r.rowCount;}
                else{const r=await client.query(`UPDATE veiculos v SET placa=$1,frota=NULL,modelo=NULL,ativo=FALSE WHERE v.id=$2 AND EXISTS(SELECT 1 FROM empresa_integracao_veiculos ev WHERE ev.id_empresa=$3 AND ev.id_veiculo=v.id)`,[`ANON${id}`.slice(0,10),id,empresa]);resultado.registros.veiculosAnonimizados=r.rowCount;}
                if(solicitacao.tipo==='exclusao'&&solicitacao.titular_tipo==='veiculo'){
                    resultado.registros.notificacoes=(await client.query(`DELETE FROM notificacoes_outbox WHERE referencia_tipo IN('guardiao_evento','alerta_guardiao') AND referencia_id IN(SELECT id::text FROM guardiao_sombra_eventos WHERE id_empresa=$1 AND id_veiculo=$2)`,[empresa,id])).rowCount;
                    for(const tabela of ['guardiao_analises','gps_ingestoes','guardiao_sombra_eventos']){const r=await client.query(`DELETE FROM ${tabela} WHERE id_empresa=$1 AND id_veiculo=$2`,[empresa,id]);resultado.registros[tabela]=r.rowCount;}
                    resultado.registros.trajetos_realizados=(await client.query(`UPDATE trajetos_realizados SET bruto_geojson=NULL,tratado_geojson=NULL,metricas=jsonb_build_object('anonimizado_por_privacidade',TRUE),id_veiculo=NULL WHERE id_empresa=$1 AND id_veiculo=$2`,[empresa,id])).rowCount;
                    resultado.registros.reportes=(await client.query(`DELETE FROM reportes WHERE id_veiculo=$1 AND EXISTS(SELECT 1 FROM empresa_integracao_veiculos WHERE id_empresa=$2 AND id_veiculo=$1)`,[id,empresa])).rowCount;
                    const h=await client.query(`DELETE FROM historico_localizacoes WHERE id_veiculo=$1`,[id]);resultado.registros.historico_localizacoes=h.rowCount;const l=await client.query(`DELETE FROM localizacoes WHERE id_veiculo=$1`,[id]);resultado.registros.localizacoes=l.rowCount;
                    resultado.registros.logsIntegracaoMinimizados=placaOriginal?(await client.query(`UPDATE integracao_requisicoes SET placa=NULL,payload_resumo=jsonb_build_object('anonimizado_por_privacidade',TRUE) WHERE id_empresa=$1 AND placa=$2`,[empresa,placaOriginal])).rowCount:0;
                    resultado.registros.viagensMinimizadas=(await client.query(`UPDATE viagens SET carga=NULL WHERE id_veiculo=$1 AND EXISTS(SELECT 1 FROM empresa_integracao_veiculos WHERE id_empresa=$2 AND id_veiculo=$1)`,[id,empresa])).rowCount;
                    resultado.preservados_por_auditoria=['viagens sem coordenadas brutas','logs técnicos minimizados','auditoria empresarial'];
                }
            }
            const afetados=Object.values(resultado.registros||{}).filter(v=>Number.isFinite(Number(v))).reduce((n,v)=>n+Number(v),0);if(!afetados)throw new Error('Nenhum registro foi tratado; solicitação não concluída.');
            await client.query(`UPDATE privacidade_solicitacoes SET status='concluida',resultado=$1::jsonb,processado_por=$2,processado_em=CURRENT_TIMESTAMP,concluido_em=CURRENT_TIMESTAMP,erro_processamento=NULL WHERE id=$3`,[JSON.stringify(resultado),req.usuario.id,solicitacao.id]);
            await client.query('COMMIT');await registrarLogSistema({nivel:'info',origem:'privacidade',mensagem:'Solicitação de privacidade executada',detalhes:{id_solicitacao:solicitacao.id,id_empresa:empresa,tipo:solicitacao.tipo,resultado},req});return res.json({solicitacao_id:solicitacao.id,status:'concluida',resultado,...(pacote?{exportacao:pacote}:{})});
        }catch(erro){await client.query('ROLLBACK').catch(()=>{});await pool.query(`UPDATE privacidade_solicitacoes SET status='pendente',erro_processamento=$1 WHERE id=$2`,[String(erro.message||erro).slice(0,1000),req.params.id]).catch(()=>{});return res.status(500).json({erro:'Não foi possível executar a solicitação.',request_id:req.requestId});}finally{client.release();}
    });

    router.get('/privacidade/exportacoes/:id/download',autenticar,async(req,res)=>{
        if(req.usuario.tipo!=='admin')return res.status(403).json({erro:'Acesso negado'});
        const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query(`SELECT id,conteudo_criptografado,iv,auth_tag,hash_sha256,tamanho_bytes FROM privacidade_exportacoes WHERE id=$1 AND expira_em>CURRENT_TIMESTAMP AND baixado_em IS NULL FOR UPDATE`,[req.params.id]);
            if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Exportação inexistente, expirada ou já baixada.'});}const arquivo=descriptografar(r.rows[0]);
            await client.query(`UPDATE privacidade_exportacoes SET baixado_em=CURRENT_TIMESTAMP,baixado_por=$1 WHERE id=$2`,[req.usuario.id,req.params.id]);await client.query('COMMIT');
            res.set({'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="privacidade-${req.params.id}.json"`,'X-Content-SHA256':r.rows[0].hash_sha256,'Cache-Control':'no-store'});return res.send(arquivo);
        }catch(erro){await client.query('ROLLBACK').catch(()=>{});return res.status(500).json({erro:'Não foi possível baixar a exportação.',request_id:req.requestId});}finally{client.release();}
    });

    router.get('/integracoes/portal/privacidade/politica', autenticar, autorizarPerfilEmpresa(perfisLeitura), async (req, res) => {
        const r = await pool.query(`SELECT id_empresa,gps_bruto_dias,payload_gps_dias,logs_dias,integracao_logs_dias,alertas_dias,atualizado_em FROM politicas_retencao WHERE id_empresa=$1`, [req.usuario.id_empresa]);
        return res.json(r.rows[0] || { id_empresa: req.usuario.id_empresa, gps_bruto_dias: gpsRetencaoPadrao, payload_gps_dias: 30, logs_dias: 90, integracao_logs_dias: 90, alertas_dias: 365 });
    });

    router.get('/integracoes/portal/privacidade/solicitacoes', autenticar, autorizarPerfilEmpresa(perfisLeitura), async (req, res) => {
        const r = await pool.query(`
            SELECT id,tipo,titular_tipo,titular_id,status,justificativa,solicitado_em,concluido_em
            FROM privacidade_solicitacoes WHERE id_empresa=$1
            ORDER BY solicitado_em DESC LIMIT 200
        `, [req.usuario.id_empresa]);
        return res.json(r.rows);
    });

    router.post('/integracoes/portal/privacidade/solicitacoes', autenticar, autorizarPerfilEmpresa(['administrador', 'supervisor']), async (req, res) => {
        const tipo = String(req.body?.tipo || '');
        const titularTipo = String(req.body?.titular_tipo || '');
        const titularId = Number(req.body?.titular_id);
        if (!['exportacao', 'anonimizacao', 'exclusao'].includes(tipo) || !['motorista', 'usuario', 'veiculo'].includes(titularTipo) || !Number.isInteger(titularId) || titularId <= 0) {
            return res.status(400).json({ erro: 'Solicitação de privacidade inválida.' });
        }
        let pertence = false;
        if (titularTipo === 'veiculo') {
            pertence = Boolean((await pool.query(`SELECT 1 FROM empresa_integracao_veiculos WHERE id_empresa=$1 AND id_veiculo=$2 LIMIT 1`, [req.usuario.id_empresa, titularId])).rowCount);
        } else if (titularTipo === 'usuario') {
            pertence = Boolean((await pool.query(`SELECT 1 FROM empresa_usuarios WHERE id_empresa=$1 AND id=$2 LIMIT 1`, [req.usuario.id_empresa, titularId])).rowCount);
        } else {
            pertence = Boolean((await pool.query(`SELECT 1 FROM usuarios u WHERE u.id=$2 AND u.tipo='motorista' AND(
                EXISTS(SELECT 1 FROM empresa_integracao_veiculos ev WHERE ev.id_empresa=$1 AND ev.id_veiculo=u.id_veiculo)
                OR EXISTS(SELECT 1 FROM viagens vg JOIN empresa_integracao_veiculos ev ON ev.id_veiculo=vg.id_veiculo AND ev.id_empresa=$1 WHERE vg.id_motorista=u.id)
            ) LIMIT 1`, [req.usuario.id_empresa, titularId])).rowCount);
        }
        if (!pertence) return res.status(404).json({ erro: 'Titular não encontrado para esta empresa.' });
        const r = await pool.query(`
            INSERT INTO privacidade_solicitacoes(id_empresa,tipo,titular_tipo,titular_id,justificativa,solicitado_por)
            VALUES($1,$2,$3,$4,$5,$6)
            RETURNING id,tipo,titular_tipo,titular_id,status,justificativa,solicitado_em
        `, [req.usuario.id_empresa, tipo, titularTipo, titularId, String(req.body?.justificativa || '').slice(0, 2000), req.usuario.id]);
        return res.status(201).json(r.rows[0]);
    });

    return router;
}

module.exports = { criarRotasPrivacidade };
