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

export function Trips({ token, data, refreshDashboard }: P) {
  const q = useLoad(token, "/monitoramento/viagens", data.viagens),
    r = useLoad(token, "/rotas"),
    v = useLoad(token, "/veiculos", data.veiculos);
  const [f, setF] = useState<ApiValue>({
      id_rota: "",
      id_veiculo: "",
      carga: "",
      altura_total: "",
      peso_total: "",
      saida_prevista: "",
    }),
    [msg, setMsg] = useState("");
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("gps:map:trips:selected-route");
      if (id) setF((current: ApiValue) => ({ ...current, id_rota: id }));
    } catch {
      // Armazenamento pode estar indisponível em modo privado restrito.
    }
  }, []);
  useEffect(() => {
    try {
      if (f.id_rota)
        sessionStorage.setItem(
          "gps:map:trips:selected-route",
          String(f.id_rota),
        );
      else sessionStorage.removeItem("gps:map:trips:selected-route");
    } catch {
      // A seleção continua funcionando somente em memória.
    }
  }, [f.id_rota]);
  const selectedRoute = r.items.find(
    (route: ApiValue) => String(route.id) === String(f.id_rota),
  );
  async function command(id: ApiValue, k: string) {
    let body: ApiValue = {};
    if (k === "aprovar")
      body = { observacao: prompt("Observação:", "Rota conferida.") || "" };
    if (k === "bloquear-aprovacao") {
      const motivo = prompt("Motivo:", "");
      if (!motivo) return;
      body = { motivo };
    }
    if (k === "reabrir-aprovacao")
      body = { motivo: prompt("Motivo:", "Revisão do gestor.") || "" };
    await act(token, "/viagens/" + id + "/" + k, "POST", body);
    q.load();
    refreshDashboard();
  }
  return (
    <Shell
      title="Viagens e Guardião"
      desc="Criação, aprovação e monitoramento."
      icon={<Route className="h-5 w-5" />}
    >
      <div className="mb-4">
        <LiveMap
          items={data.localizacoes}
          geojson={selectedRoute?.dados_geojson || null}
          cacheKey="viagens"
        />
        <div className="mt-2 flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-xs">
          {selectedRoute ? (
            <>
              <span className="mr-2 h-2 w-2 rounded-full bg-sky-400" />
              <b>{selectedRoute.nome}</b>
              <span className="ml-2 text-muted-foreground">
                {selectedRoute.origem || "Origem"} →{" "}
                {selectedRoute.destino || "Destino"}
              </span>
              <span className="ml-auto text-sky-400">Rota exibida no mapa</span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Selecione uma rota no formulário para visualizar o trajeto no
              mapa.
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <form
          className={card + " grid grid-cols-2 content-start gap-3 p-5"}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await act(token, "/viagens", "POST", {
                ...f,
                id_rota: +f.id_rota,
                id_veiculo: +f.id_veiculo,
                altura_total: +f.altura_total,
                peso_total: +f.peso_total || undefined,
                saida_prevista: f.saida_prevista
                  ? new Date(f.saida_prevista).toISOString()
                  : null,
              });
              setMsg("Viagem criada.");
              q.load();
            } catch (x) {
              setMsg(x instanceof Error ? x.message : "Erro");
            }
          }}
        >
          <div className="col-span-2">
            <Select
              label="Rota"
              value={f.id_rota}
              set={(x: ApiValue) => setF({ ...f, id_rota: x })}
              items={r.items}
              text={(x: ApiValue) => x.nome}
            />
          </div>
          <div className="col-span-2">
            <Select
              label="Veículo"
              value={f.id_veiculo}
              set={(x: ApiValue) => setF({ ...f, id_veiculo: x })}
              items={v.items.filter((x) => x.ativo)}
              text={(x: ApiValue) => x.placa}
            />
          </div>
          {["carga", "altura_total", "peso_total", "saida_prevista"].map(
            (k) => (
              <Field
                key={k}
                label={k.replaceAll("_", " ")}
                type={
                  k === "saida_prevista"
                    ? "datetime-local"
                    : k === "carga"
                      ? "text"
                      : "number"
                }
                value={f[k]}
                set={(x: ApiValue) => setF({ ...f, [k]: x })}
              />
            ),
          )}
          <button className={btn + " col-span-2 w-full"}>Criar viagem</button>
          <p className="col-span-2 text-xs text-primary">{msg}</p>
        </form>
        <Cards
          items={q.items}
          title={(x: ApiValue) => x.placa || "Viagem " + x.id}
          detail={(x: ApiValue) =>
            (x.origem || "-") + " → " + (x.destino || "-") + " · " + x.status
          }
          actions={(x: ApiValue) =>
            ["aprovar", "bloquear-aprovacao", "reabrir-aprovacao"]
              .map((k) => (
                <button
                  key={k}
                  className="text-xs text-primary"
                  onClick={() => command(x.id, k)}
                >
                  {k === "aprovar"
                    ? "Aprovar"
                    : k === "bloquear-aprovacao"
                      ? "Bloquear"
                      : "Reabrir"}
                </button>
              ))
              .concat(
                <button
                  key="scan"
                  className="text-xs text-guardian"
                  onClick={async () => {
                    const z = await act(
                      token,
                      "/viagens/" + x.id + "/scan-restricoes",
                      "POST",
                      {},
                    );
                    setMsg(
                      "Scanner: " + (z.candidatos_na_rota || 0) + " candidatos",
                    );
                  }}
                >
                  Analisar restrições
                </button>,
              )
          }
        />
      </div>
    </Shell>
  );
}
