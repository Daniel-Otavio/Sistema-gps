import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

type Health = {
  timestamp: string;
  status: string;
  tempo_resposta_ms: number;
  servicos: Record<
    string,
    { status: string; ultima_posicao?: string; ultima_analise?: string }
  >;
  metricas: Record<string, ApiValue>;
  empresas: ApiValue[];
  eventos: ApiValue[];
};
const card = "rounded-xl border border-border bg-card";
const date = (v?: string) =>
  v ? new Date(v).toLocaleString("pt-BR") : "Sem registro";
const statusLabel = (v: string) =>
  (
    ({
      operacional: "Operacional",
      atencao: "Atenção",
      offline: "Offline",
      erro: "Erro",
      sem_dados: "Sem dados",
      nunca_conectou: "Nunca conectou",
    }) as Record<string, string>
  )[v] || v;
const tone = (v: string) =>
  v === "operacional"
    ? "text-status-normal bg-status-normal/10 border-status-normal/25"
    : v === "atencao" || v === "sem_dados" || v === "nunca_conectou"
      ? "text-status-atencao bg-status-atencao/10 border-status-atencao/25"
      : "text-status-critico bg-status-critico/10 border-status-critico/25";

export function SystemHealthPanel({ token }: { token: string }) {
  const [data, setData] = useState<Health | null>(null),
    [notifications, setNotifications] = useState<ApiValue>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("todos");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [health, outbox] = await Promise.all([
        apiRequest<Health>("/admin/saude-sistema", token),
        apiRequest<ApiValue>("/notificacoes/diagnostico", token),
      ]);
      setData(health);
      setNotifications(outbox);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar saúde");
    } finally {
      setBusy(false);
    }
  }, [token]);
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);
  const events = useMemo(
    () =>
      data?.eventos?.filter(
        (e) =>
          filter === "todos" ||
          (filter === "problemas"
            ? ["error", "warn"].includes(e.nivel)
            : e.origem === filter),
      ) || [],
    [data, filter],
  );
  const services = [
    {
      id: "api",
      name: "API",
      icon: Server,
      detail: `Resposta do diagnóstico: ${data?.tempo_resposta_ms ?? "-"} ms`,
    },
    {
      id: "banco",
      name: "Banco de dados",
      icon: Database,
      detail: "Conexão e consultas PostgreSQL",
    },
    {
      id: "telemetria",
      name: "Telemetria",
      icon: Radio,
      detail: `Última posição: ${date(data?.servicos?.["telemetria"]?.ultima_posicao)}`,
    },
    {
      id: "guardiao",
      name: "Guardião",
      icon: ShieldCheck,
      detail: `Última análise: ${date(data?.servicos?.["guardiao"]?.ultima_analise)}`,
    },
  ];
  return (
    <main className="flex-1 overflow-y-auto p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-primary/15 p-3 text-primary">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Saúde do Sistema</h2>
          <p className="text-xs text-muted-foreground">
            Operação, integrações e processamento em tempo real.
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>
      {error && (
        <div className="mb-4 rounded-xl border border-status-critico/30 bg-status-critico/10 p-4 text-sm text-status-critico">
          A consulta falhou: {error}. Possível causa: API indisponível, sessão
          expirada ou banco sem conexão.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {services.map((s) => {
          const st = data?.servicos?.[s.id]?.status || "sem_dados",
            Icon = s.icon;
          return (
            <section key={s.id} className={`${card} p-4`}>
              <div className="flex items-start">
                <span className="rounded-lg bg-surface-2 p-2">
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={`ml-auto rounded-full border px-2 py-1 text-[10px] font-bold ${tone(st)}`}
                >
                  {statusLabel(st)}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{s.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
            </section>
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Posições · 15 min", data?.metricas?.["requisicoes_15m"] || 0],
          ["Sucessos", data?.metricas?.["sucessos_15m"] || 0],
          ["Falhas", data?.metricas?.["falhas_15m"] || 0],
          [
            "Latência média",
            `${data?.metricas?.["latencia_media_ms"] || 0} ms`,
          ],
          ["Latência P95", `${data?.metricas?.["latencia_p95_ms"] || 0} ms`],
        ].map(([a, b]) => (
          <div key={String(a)} className={`${card} p-4`}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {a}
            </p>
            <b className="mt-2 block text-2xl">{b}</b>
          </div>
        ))}
      </div>
      <section className={`${card} mt-4`}>
        <div className="flex items-center border-b border-border p-4">
          <div>
            <b>Entrega de notificações</b>
            <p className="text-xs text-muted-foreground">
              Painel {notifications?.canais?.painel ? "ativo" : "inativo"} ·
              webhook{" "}
              {notifications?.canais?.webhook ? "ativo" : "não configurado"} ·
              e-mail{" "}
              {notifications?.canais?.email ? "ativo" : "não configurado"}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            {(notifications?.resumo || []).map((x: ApiValue) => (
              <span
                key={x.status}
                className={`rounded-full border px-2 py-1 text-[10px] ${x.status === "falhou" ? tone("erro") : tone("operacional")}`}
              >
                {x.status}: {x.total}
              </span>
            ))}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {(notifications?.recentes || []).slice(0, 20).map((n: ApiValue) => (
            <div
              key={n.id}
              className="flex items-center gap-3 border-b border-border/70 p-3 text-xs"
            >
              <div>
                <b>{n.tipo}</b>
                <p className="text-muted-foreground">
                  {n.canal} · {date(n.criado_em)} · {n.tentativas} tentativa(s)
                </p>
                {n.ultimo_erro && (
                  <p className="text-status-critico">{n.ultimo_erro}</p>
                )}
              </div>
              <span className="ml-auto uppercase">{n.status}</span>
              {n.status === "falhou" && (
                <button
                  className="rounded-lg border border-primary px-3 py-2 text-primary"
                  onClick={async () => {
                    await apiRequest(`/notificacoes/${n.id}/reenviar`, token, {
                      method: "POST",
                    });
                    load();
                  }}
                >
                  Reenviar
                </button>
              )}
            </div>
          ))}
          {!notifications?.recentes?.length && (
            <p className="p-4 text-xs text-muted-foreground">
              Nenhuma notificação registrada.
            </p>
          )}
        </div>
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className={card}>
          <div className="border-b border-border p-4">
            <b>Empresas e conexões</b>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            {data?.empresas?.map((e) => (
              <div
                key={e.id}
                className="border-b border-border/70 p-4 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <b className="text-sm">{e.nome}</b>
                  <span
                    className={`ml-auto rounded-full border px-2 py-1 text-[10px] ${tone(e.status_operacional)}`}
                  >
                    {statusLabel(e.status_operacional)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.veiculos} veículos · último envio {date(e.ultimo_uso_em)}
                </p>
                {e.ultimo_erro && (
                  <p className="mt-2 text-xs text-status-critico">
                    {e.ultimo_erro}
                  </p>
                )}
              </div>
            ))}
            {!data?.empresas?.length && (
              <p className="p-5 text-sm text-muted-foreground">
                Nenhuma empresa integrada.
              </p>
            )}
          </div>
        </section>
        <section className={card}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <div>
              <b>Vida do sistema</b>
              <p className="text-xs text-muted-foreground">
                Processamentos, alertas e falhas mais recentes.
              </p>
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="ml-auto rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
            >
              <option value="todos">Todos</option>
              <option value="problemas">Somente problemas</option>
              <option value="gps_empresa">GPS empresarial</option>
              <option value="guardiao">Guardião</option>
            </select>
          </div>
          <div className="max-h-[540px] overflow-y-auto">
            {events.map((e, i) => {
              const bad = e.nivel === "error",
                warn = e.nivel === "warn",
                Icon = bad ? XCircle : warn ? AlertTriangle : CheckCircle2;
              return (
                <div
                  key={`${e.horario}-${i}`}
                  className="flex gap-3 border-b border-border/70 p-4 last:border-0"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${bad ? "text-status-critico" : warn ? "text-status-atencao" : "text-status-normal"}`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-xs uppercase">{e.origem}</b>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {date(e.horario)}
                      </span>
                      {e.duracao_ms != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {e.duracao_ms} ms
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm">{e.mensagem}</p>
                    {e.causa && (
                      <p className="mt-1 text-xs text-status-atencao">
                        Possível causa: {e.causa}
                      </p>
                    )}
                    {e.request_id && (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        ID: {e.request_id}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {!events.length && (
              <p className="p-5 text-sm text-muted-foreground">
                Nenhum evento neste filtro.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
