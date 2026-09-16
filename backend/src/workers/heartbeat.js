const crypto = require('node:crypto');

function criarHeartbeatWorkers({ pool }) {
    const instancia = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'local'}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const versao = String(process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || 'desenvolvimento').slice(0, 120);

    async function registrar(nome, estado, erro = null) {
        await pool.query(`INSERT INTO worker_heartbeats(nome,instancia,versao,estado,ultima_atividade_em,ultimo_sucesso_em,ultimo_erro_em,ultimo_erro)
            VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CASE WHEN $4='operacional' THEN CURRENT_TIMESTAMP END,CASE WHEN $4='erro' THEN CURRENT_TIMESTAMP END,$5)
            ON CONFLICT(nome,instancia) DO UPDATE SET versao=EXCLUDED.versao,estado=EXCLUDED.estado,
                ultima_atividade_em=CURRENT_TIMESTAMP,
                ultimo_sucesso_em=CASE WHEN EXCLUDED.estado='operacional' THEN CURRENT_TIMESTAMP ELSE worker_heartbeats.ultimo_sucesso_em END,
                ultimo_erro_em=CASE WHEN EXCLUDED.estado='erro' THEN CURRENT_TIMESTAMP ELSE worker_heartbeats.ultimo_erro_em END,
                ultimo_erro=CASE WHEN EXCLUDED.estado='erro' THEN EXCLUDED.ultimo_erro WHEN EXCLUDED.estado='operacional' THEN NULL ELSE worker_heartbeats.ultimo_erro END`,
        [nome, instancia, versao, estado, erro ? String(erro.message || erro).slice(0, 1000) : null]);
    }

    function envolver(nome, executar) {
        return async () => {
            await registrar(nome, 'executando').catch(() => {});
            try {
                const resultado = await executar();
                await registrar(nome, 'operacional').catch(() => {});
                return resultado;
            } catch (erro) {
                await registrar(nome, 'erro', erro).catch(() => {});
                throw erro;
            }
        };
    }

    async function encerrar() {
        await pool.query(`UPDATE worker_heartbeats SET estado='encerrado',ultima_atividade_em=CURRENT_TIMESTAMP WHERE instancia=$1`, [instancia]);
    }

    return { instancia, envolver, encerrar };
}

module.exports = { criarHeartbeatWorkers };
