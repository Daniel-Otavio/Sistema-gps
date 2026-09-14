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

export function Routes({ token, data }: P) {
  const q = useLoad(token, "/rotas");
  const [f, setF] = useState<ApiValue>({
      nome: "",
      origem: "",
      destino: "",
      tipo: "caminhao",
      preferencia: "fastest",
    }),
    [route, setRoute] = useState<ApiValue>(null),
    [msg, setMsg] = useState("");
  async function calculate(e: ApiValue) {
    e.preventDefault();
    try {
      setMsg("Localizando endereços...");
      const geo = async (v: string) => {
        return apiRequest<ApiValue>(
          "/api/geocodificar?q=" + encodeURIComponent(v),
          token,
        );
      };
      const [a, b] = await Promise.all([geo(f.origem), geo(f.destino)]);
      if (!a || !b) throw new Error("Origem ou destino não encontrado.");
      const heavy = f.tipo === "caminhao";
      const body: ApiValue = {
        origem: { lat: +a.lat, lon: +a.lon },
        destino: { lat: +b.lat, lon: +b.lon },
        perfil: heavy ? "driving-hgv" : "driving-car",
        preferencia: f.preferencia,
      };
      if (heavy)
        Object.assign(body, {
          altura: 4.2,
          peso: 15,
          comprimento: 12,
          largura: 2.6,
        });
      setRoute(await act(token, "/api/calcular-rota", "POST", body));
      setMsg("Rota calculada. Confira e salve.");
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Erro ao calcular");
    }
  }
  async function save() {
    try {
      await act(token, "/rotas", "POST", {
        nome: f.nome,
        origem: f.origem,
        destino: f.destino,
        restricoes: { altura_referencia: f.tipo === "caminhao" ? 4.2 : null },
        dados_geojson: route,
      });
      setRoute(null);
      setMsg("Rota salva na biblioteca.");
      q.load();
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Erro ao salvar");
    }
  }
  return (
    <Shell
      title="Rotas"
      desc="Calcule trajetos e mantenha a biblioteca operacional."
      icon={<Route className="h-5 w-5" />}
    >
      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={calculate} className={card + " h-fit space-y-3 p-5"}>
          <Field
            label="Nome da rota"
            value={f.nome}
            set={(x: ApiValue) => setF({ ...f, nome: x })}
          />
          <Field
            label="Origem"
            value={f.origem}
            set={(x: ApiValue) => setF({ ...f, origem: x })}
          />
          <Field
            label="Destino"
            value={f.destino}
            set={(x: ApiValue) => setF({ ...f, destino: x })}
          />
          <label className="block text-xs text-muted-foreground">
            Tipo
            <select
              className={input + " mt-1"}
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}
            >
              <option value="caminhao">Caminhão</option>
              <option value="carro">Carro</option>
            </select>
          </label>
          <button className={btn + " w-full"}>Calcular rota</button>
          {route && (
            <button
              type="button"
              onClick={save}
              className="w-full rounded-lg bg-status-normal p-2.5 text-sm font-semibold"
            >
              Salvar na biblioteca
            </button>
          )}
          <p className="text-xs text-primary">{msg}</p>
        </form>
        <div>
          <LiveMap items={data.localizacoes || []} geojson={route} />
          <div className="mt-3">
            <Cards
              items={q.items}
              title={(x: ApiValue) => x.nome}
              detail={(x: ApiValue) => x.origem + " → " + x.destino}
              actions={(x: ApiValue) => (
                <button
                  className="text-xs text-primary"
                  onClick={() => {
                    let shape = x.dados_geojson;
                    try {
                      if (typeof shape === "string") shape = JSON.parse(shape);
                    } catch {
                      shape = null;
                    }
                    setRoute(shape);
                    setMsg("Exibindo " + x.nome);
                  }}
                >
                  Visualizar rota
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
