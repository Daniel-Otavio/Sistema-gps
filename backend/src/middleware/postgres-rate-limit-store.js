class PostgresRateLimitStore {
    constructor({ pool, prefixo }) {
        this.pool = pool;
        this.prefixo = prefixo;
        this.windowMs = 15 * 60 * 1000;
    }

    init(options) {
        this.windowMs = options.windowMs;
    }

    async increment(key) {
        const chave = `${this.prefixo}:${key}`.slice(0, 300);
        const segundos = Math.max(1, Math.ceil(this.windowMs / 1000));
        const resultado = await this.pool.query(`
            INSERT INTO limites_requisicao(chave,janela_inicio,total,expira_em)
            VALUES($1,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP+($2||' seconds')::interval)
            ON CONFLICT(chave) DO UPDATE SET
                janela_inicio=CASE WHEN limites_requisicao.expira_em<=CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP ELSE limites_requisicao.janela_inicio END,
                total=CASE WHEN limites_requisicao.expira_em<=CURRENT_TIMESTAMP THEN 1 ELSE limites_requisicao.total+1 END,
                expira_em=CASE WHEN limites_requisicao.expira_em<=CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP+($2||' seconds')::interval ELSE limites_requisicao.expira_em END
            RETURNING total,expira_em
        `, [chave, segundos]);
        return { totalHits: Number(resultado.rows[0].total), resetTime: new Date(resultado.rows[0].expira_em) };
    }

    async decrement(key) {
        await this.pool.query('UPDATE limites_requisicao SET total=GREATEST(0,total-1) WHERE chave=$1', [`${this.prefixo}:${key}`.slice(0, 300)]);
    }

    async resetKey(key) {
        await this.pool.query('DELETE FROM limites_requisicao WHERE chave=$1', [`${this.prefixo}:${key}`.slice(0, 300)]);
    }

    async resetAll() {
        await this.pool.query('DELETE FROM limites_requisicao WHERE chave LIKE $1', [`${this.prefixo}:%`]);
    }
}

module.exports = { PostgresRateLimitStore };
