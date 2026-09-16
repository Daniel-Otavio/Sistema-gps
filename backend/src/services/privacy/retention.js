function inteiroAmbiente(nome,padrao,minimo=1,maximo=3650){const valor=Number(process.env[nome]);return Number.isInteger(valor)?Math.max(minimo,Math.min(maximo,valor)):padrao;}
async function excluirEmLotes(pool,tabela,condicao,parametros,tamanho,maxLotes=20){let total=0;for(let i=0;i<maxLotes;i++){const r=await pool.query(`DELETE FROM ${tabela} WHERE ctid IN(SELECT ctid FROM ${tabela} WHERE ${condicao} LIMIT ${Number(tamanho)})`,parametros);total+=r.rowCount;if(r.rowCount<tamanho)break;await new Promise(resolve=>setImmediate(resolve));}return total;}
async function executarRetencao({pool,logger=console}){
 const lote=inteiroAmbiente('RETENTION_BATCH_SIZE',3000,100,10000),gps=inteiroAmbiente('GPS_RAW_RETENTION_DAYS',180),payloadDias=inteiroAmbiente('GPS_PAYLOAD_RETENTION_DAYS',30),logs=inteiroAmbiente('LOG_RETENTION_DAYS',90,7),integracao=inteiroAmbiente('INTEGRATION_LOG_RETENTION_DAYS',90,7),alertas=inteiroAmbiente('ALERT_RETENTION_DAYS',365,30),analises=inteiroAmbiente('GUARDIAN_ANALYSIS_RETENTION_DAYS',180,30),regional=inteiroAmbiente('REGIONAL_QUEUE_RETENTION_DAYS',90,7),descartados=inteiroAmbiente('DISCARDED_CATALOG_RETENTION_DAYS',730,180),r={};
 r.payloadsGpsMinimizados=(await pool.query(`UPDATE gps_ingestoes SET payload=jsonb_build_object('removido_por_retencao',TRUE,'removido_em',CURRENT_TIMESTAMP) WHERE ctid IN(SELECT g.ctid FROM gps_ingestoes g WHERE g.recebido_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.payload_gps_dias FROM politicas_retencao p WHERE p.id_empresa=g.id_empresa),$1)||' days')::interval AND NOT(g.payload?'removido_por_retencao') LIMIT $2)`,[payloadDias,lote])).rowCount;
 r.ingestoesGpsExpiradas=await excluirEmLotes(pool,'gps_ingestoes',`recebido_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.gps_bruto_dias FROM politicas_retencao p WHERE p.id_empresa=gps_ingestoes.id_empresa),$1)||' days')::interval`,[gps],lote);
 r.logsRemovidos=await excluirEmLotes(pool,'logs_sistema',`criado_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.logs_dias FROM politicas_retencao p WHERE p.id_empresa=logs_sistema.id_empresa),$1)||' days')::interval`,[logs],lote);
 r.integracoesRemovidas=await excluirEmLotes(pool,'integracao_requisicoes',`recebido_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.integracao_logs_dias FROM politicas_retencao p WHERE p.id_empresa=integracao_requisicoes.id_empresa),$1)||' days')::interval`,[integracao],lote);
 r.alertasEncerradosRemovidos=await excluirEmLotes(pool,'guardiao_sombra_eventos',`NOT ativo AND ultimo_evento_em<CURRENT_TIMESTAMP-(COALESCE((SELECT p.alertas_dias FROM politicas_retencao p WHERE p.id_empresa=guardiao_sombra_eventos.id_empresa),$1)||' days')::interval`,[alertas],lote);
 r.analisesGuardiaoRemovidas=await excluirEmLotes(pool,'guardiao_analises',`analisado_em<CURRENT_TIMESTAMP-($1||' days')::interval`,[analises],lote);
 r.filaRegionalRemovida=await excluirEmLotes(pool,'indexacao_regional_fila',`status IN('concluido','falhou') AND atualizado_em<CURRENT_TIMESTAMP-($1||' days')::interval`,[regional],lote);
 r.coberturasRegionaisRemovidas=await excluirEmLotes(pool,'restricao_catalogo_cobertura',`atualizada_em<CURRENT_TIMESTAMP-($1||' days')::interval`,[Math.max(180,regional)],lote);
 r.catalogosDescartadosRemovidos=await excluirEmLotes(pool,'restricoes_risco_catalogo',`status='descartada' AND atualizado_em<CURRENT_TIMESTAMP-($1||' days')::interval`,[descartados],lote);
 r.locksGuardiaoExpirados=await excluirEmLotes(pool,'guardiao_veiculo_locks',`expira_em<CURRENT_TIMESTAMP-INTERVAL '10 minutes'`,[],lote);
 r.sessoesExpiradasRemovidas=await excluirEmLotes(pool,'auth_sessoes',`expira_em<CURRENT_TIMESTAMP-INTERVAL '7 days'`,[],lote);
 r.notificacoesRemovidas=await excluirEmLotes(pool,'notificacoes_outbox',`status IN('enviado','falhou') AND criado_em<CURRENT_TIMESTAMP-INTERVAL '180 days'`,[],lote);
 r.limitesExpiradosRemovidos=await excluirEmLotes(pool,'limites_requisicao',`expira_em<CURRENT_TIMESTAMP-INTERVAL '1 day'`,[],lote);
 r.geocodificacoesExpiradasRemovidas=await excluirEmLotes(pool,'geocodificacao_cache',`expira_em<CURRENT_TIMESTAMP`,[],lote);
 r.exportacoesPrivacidadeRemovidas=await excluirEmLotes(pool,'privacidade_exportacoes',`expira_em<CURRENT_TIMESTAMP`,[],lote);
 (logger.info||logger.log).call(logger,{evento:'retencao_aplicada',resultados:r});return r;
}
module.exports={executarRetencao};
