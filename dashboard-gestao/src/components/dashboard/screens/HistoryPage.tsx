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

export function HistoryPage({ token }: P) {
  const q = useLoad(token, "/historico/viagens");
  const [detail, setDetail] = useState<ApiValue>(null),
    [message, setMessage] = useState("");
  const view = async (x: ApiValue) => {
    setMessage("");
    try {
      setDetail(
        await apiRequest<ApiValue>(`/viagens/${x.id}/trajeto-realizado`, token),
      );
    } catch (e) {
      setDetail(null);
      setMessage(e instanceof Error ? e.message : "Trajeto indisponível");
    }
  };
  const combined = (() => {
    if (!detail) return null;
    const features: ApiValue[] = [];
    const add = (shape: ApiValue, tipo: string) => {
      let s = shape;
      try {
        if (typeof s === "string") s = JSON.parse(s);
      } catch {
        return;
      }
      if (s?.type === "FeatureCollection")
        for (const f of s.features || [])
          features.push({
            ...f,
            properties: { ...(f.properties || {}), tipo },
          });
      else if (s?.type === "Feature")
        features.push({ ...s, properties: { ...(s.properties || {}), tipo } });
      else if (s?.type)
        features.push({ type: "Feature", properties: { tipo }, geometry: s });
    };
    add(detail.rota_planejada_geojson, "rota_planejada");
    add(detail.tratado_geojson, "trajeto_realizado");
    return { type: "FeatureCollection", features };
  })();
  const createRoute = async () => {
    if (!detail) return;
    const nome = prompt(
      "Nome da nova rota:",
      `${detail.rota_nome || "Rota"} · trajeto realizado`,
    );
    if (!nome) return;
    try {
      const r = await act(
        token,
        `/viagens/${detail.id_viagem}/trajeto-realizado/criar-rota`,
        "POST",
        { nome },
      );
      setMessage(r.mensagem);
      setDetail({ ...detail, id_rota_gerada: r.rota?.id });
      q.load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao criar rota");
    }
  };
  return (
    <Shell
      title="Histórico"
      desc="Histórico geral das viagens."
      icon={<History className="h-5 w-5" />}
    >
      <Note q={q} />
      {message && (
        <p className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
          {message}
        </p>
      )}
      {detail && (
        <section className="mb-5 print-trip-report">
          <LiveMap geojson={combined} />
          <div className={`${card} mt-3 p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <b>
                  {detail.placa} · {detail.rota_nome}
                </b>
                <p className={muted}>
                  {detail.motorista || "Motorista não informado"}
                </p>
              </div>
              <div className="ml-auto flex gap-3 text-xs">
                <span className="text-sky-400">— Planejada</span>
                <span className="text-status-normal">— Realizada</span>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                [
                  "Distância",
                  `${Number(detail.metricas?.distancia_km || 0).toFixed(2)} km`,
                ],
                ["Duração", `${detail.metricas?.duracao_min || 0} min`],
                ["Parado", `${detail.metricas?.tempo_parado_min || 0} min`],
                ["Pontos", detail.metricas?.total_pontos_validos || 0],
                ["Falhas GPS", detail.metricas?.gaps_sem_gps || 0],
              ].map(([a, b]) => (
                <div key={String(a)} className="rounded-lg bg-surface-2 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {a}
                  </p>
                  <b className="mt-1 block text-sm">{b}</b>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button
                disabled={Boolean(detail.id_rota_gerada)}
                onClick={createRoute}
                className={btn}
              >
                {detail.id_rota_gerada
                  ? "Rota já criada"
                  : "Transformar trajeto em rota"}
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-border px-4 py-2.5 text-sm"
              >
                Exportar PDF
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              A nova rota será criada como pendente e precisará passar pela
              varredura e aprovação humana.
            </p>
          </div>
        </section>
      )}
      <Cards
        items={q.items}
        title={(x: ApiValue) => x.placa || "Viagem " + x.id}
        detail={(x: ApiValue) =>
          (x.origem || "-") +
          " → " +
          (x.destino || "-") +
          " · " +
          (x.status || "")
        }
        actions={(x: ApiValue) =>
          x.possui_trajeto_realizado ? (
            <button className="text-xs text-primary" onClick={() => view(x)}>
              Visualizar trajeto
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Aguardando conclusão com GPS
            </span>
          )
        }
      />
    </Shell>
  );
}
