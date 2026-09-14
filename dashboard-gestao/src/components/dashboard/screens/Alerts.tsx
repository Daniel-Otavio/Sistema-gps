import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  History,
  Activity,
  MapPin,
  Navigation,
  Radar,
  RefreshCw,
  Route,
  ShieldAlert,
  AlertTriangle,
  Truck,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { LiveMap } from "../LiveMap";
import {
  P,
  Shell,
  Note,
  Field,
  Select,
  Cards,
  useLoad,
  act,
  card,
  input,
  btn,
  muted,
} from "../panel-shared";

export function Alerts({ token, data, refreshDashboard }: P) {
  const [filter, setFilter] = useState("todos");
  const [working, setWorking] = useState<ApiValue>(null);
  const [message, setMessage] = useState("");
  const alerts = (data.alertas || []).filter(
    (a: ApiValue) =>
      filter === "todos" ||
      String(a.severidade || a.nivel || a.status || "").toLowerCase() ===
        filter,
  );
  const level = (a: ApiValue) =>
    String(a.severidade || a.nivel || a.status || "atencao").toLowerCase();
  const when = (a: ApiValue) => {
    const d = new Date(
      a.criado_em || a.data_hora || a.timestamp || a.ultimo_evento_em,
    );
    return Number.isFinite(+d)
      ? d.toLocaleString("pt-BR")
      : "Horário não informado";
  };
  const operate = async (a: ApiValue, status: string) => {
    if (!a.id || a.origem !== "modo_sombra") return;
    let resolucao = "";
    if (status === "resolvido" || status === "descartado") {
      resolucao =
        prompt(
          status === "resolvido"
            ? "Como o alerta foi resolvido?"
            : "Motivo do descarte:",
          "",
        ) || "";
      if (!resolucao) return;
    }
    setWorking(a.id);
    setMessage("");
    try {
      await act(token, `/guardiao/eventos-empresa/${a.id}/operacao`, "PATCH", {
        status,
        resolucao,
      });
      setMessage("Tratamento registrado com sucesso.");
      await refreshDashboard();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao tratar alerta");
    } finally {
      setWorking(null);
    }
  };
  return (
    <Shell
      title="Central de Alertas"
      desc="Riscos e ocorrências que exigem acompanhamento operacional."
      icon={<AlertTriangle className="h-5 w-5" />}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={refreshDashboard}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
        <div className="ml-auto flex gap-2">
          {(
            [
              ["todos", "Todos"],
              ["critico", "Críticos"],
              ["alta", "Alta"],
              ["atencao", "Atenção"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={
                (filter === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground") +
                " rounded-lg border px-3 py-2 text-xs"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {message && (
        <p className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
          {message}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {alerts.map((a: ApiValue, i: number) => {
          const l = level(a),
            critical = l === "critico" || l === "alta" || l === "iminente";
          return (
            <article
              key={`${a.origem || a.tipo}-${a.id || i}`}
              className={`${card} overflow-hidden`}
            >
              <div
                className={
                  (critical ? "bg-status-critico" : "bg-status-atencao") +
                  " h-1"
                }
              />
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={
                      (critical
                        ? "bg-status-critico/15 text-status-critico"
                        : "bg-status-atencao/15 text-status-atencao") +
                      " rounded-lg p-2"
                    }
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm">
                        {a.placa || a.veiculo_placa || "Alerta operacional"}
                      </b>
                      <span
                        className={
                          (critical
                            ? "text-status-critico"
                            : "text-status-atencao") +
                          " text-[10px] font-bold uppercase"
                        }
                      >
                        {l}
                      </span>
                      {a.status_operacional && (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] uppercase text-primary">
                          {String(a.status_operacional).replaceAll("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm">
                      {a.mensagem ||
                        a.nome ||
                        a.tipo ||
                        "Ocorrência identificada"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {when(a)}
                    </p>
                    {a.metodo_analise && (
                      <p className="mt-1 text-[10px] uppercase text-muted-foreground">
                        Análise: {String(a.metodo_analise).replaceAll("_", " ")}
                      </p>
                    )}
                    {(a.distancia_km != null ||
                      a.tempo_estimado_min != null) && (
                      <p className="mt-2 text-xs text-primary">
                        {a.distancia_km != null
                          ? `${Number(a.distancia_km).toFixed(2)} km`
                          : ""}
                        {a.tempo_estimado_min != null
                          ? ` · ${Number(a.tempo_estimado_min).toFixed(1)} min`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
                {a.origem === "modo_sombra" && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    <button
                      disabled={working === a.id}
                      onClick={() => operate(a, "em_analise")}
                      className="text-xs text-primary"
                    >
                      Assumir
                    </button>
                    <button
                      disabled={working === a.id}
                      onClick={() => operate(a, "monitorando")}
                      className="text-xs text-status-atencao"
                    >
                      Monitorar
                    </button>
                    <button
                      disabled={working === a.id}
                      onClick={() => operate(a, "resolvido")}
                      className="text-xs text-status-normal"
                    >
                      Resolver
                    </button>
                    <button
                      disabled={working === a.id}
                      onClick={() => operate(a, "descartado")}
                      className="text-xs text-muted-foreground"
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!alerts.length && (
        <div className={`${card} p-10 text-center`}>
          <CheckCircle2 className="mx-auto h-8 w-8 text-status-normal" />
          <b className="mt-3 block">Nenhum alerta neste filtro</b>
          <p className="mt-1 text-xs text-muted-foreground">
            A operação não possui ocorrências correspondentes.
          </p>
        </div>
      )}
    </Shell>
  );
}
