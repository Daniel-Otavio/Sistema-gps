import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Truck,
  MapPin,
  FileText,
} from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { OperationalPanel } from "@/components/dashboard/OperationalPanel";
import { LiveMap } from "@/components/dashboard/LiveMap";
import {
  login,
  verifyAdminMfa,
  MfaRequiredError,
  logout,
  loadDashboard,
  loadDashboardLocations,
  readSession,
  type ApiData,
  type Session,
} from "@/lib/api";
export const Route = createFileRoute("/")({ component: DashboardPage });
const empty: ApiData = {
  veiculos: [],
  motoristas: [],
  viagens: [],
  localizacoes: [],
  alertas: [],
  reportes: [],
  rotas: [],
};
const recent = (x: ApiValue) => {
  const d = new Date(x.ultima_atualizacao);
  return Number.isFinite(+d) && Date.now() - +d <= 60000;
};
const time = (x: ApiValue) => {
  const d = new Date(
    x.criado_em || x.data_hora || x.timestamp || x.ultima_atualizacao,
  );
  return Number.isFinite(+d)
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "-";
};
function DashboardPage() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [active, setActive] = useState("dashboard");
  const [data, setData] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [routeDraft, setRouteDraft] = useState<ApiValue>(null);
  const refresh = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      setData(await loadDashboard(session.token, session.usuario));
      setLoaded(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }, [session]);
  useEffect(() => {
    refresh();
    if (!session) return;
    const generalId = setInterval(refresh, 60000);
    const locationId = setInterval(async () => {
      try {
        const localizacoes = await loadDashboardLocations(session.token);
        setData((current) => ({
          ...current,
          localizacoes,
          viagens: current.viagens.map((viagem) => {
            const posicao = localizacoes.find(
              (item) =>
                String(item.id) === String(viagem.id_veiculo) ||
                String(item.placa) === String(viagem.placa),
            );
            return posicao
              ? {
                  ...viagem,
                  lat: posicao.lat,
                  lon: posicao.lon,
                  ultima_atualizacao: posicao.ultima_atualizacao,
                }
              : viagem;
          }),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao atualizar posições");
      }
    }, 10000);
    return () => {
      clearInterval(generalId);
      clearInterval(locationId);
    };
  }, [session, refresh]);
  const live = data.localizacoes.filter(recent);
  const running = data.viagens.filter((v) => v.status === "em_andamento");
  const critical = data.alertas.filter(
    (a) => a.severidade === "alta" || a.tipo === "guardiao",
  );
  const falhasParciais = Object.entries(data.status || {}).filter(
    ([, s]) => s.estado === "erro",
  );
  const activeRouteGeoJson = useMemo(() => {
    const features: ApiValue[] = [];
    for (const trip of running) {
      const savedRoute = data.rotas.find(
        (route: ApiValue) => String(route.id) === String(trip.id_rota),
      );
      let shape =
        trip.dados_geojson ||
        trip.rota_aprovada_geojson ||
        savedRoute?.dados_geojson;
      for (let pass = 0; pass < 2 && typeof shape === "string"; pass++) {
        try {
          shape = JSON.parse(shape);
        } catch {
          shape = null;
        }
      }
      const properties = {
        viagem_id: trip.id,
        placa: trip.placa || trip.veiculo_placa,
        rota_nome: trip.rota_nome || savedRoute?.nome,
      };
      if (shape?.type === "FeatureCollection")
        for (const feature of shape.features || [])
          features.push({
            ...feature,
            properties: { ...(feature.properties || {}), ...properties },
          });
      else if (shape?.type === "Feature")
        features.push({
          ...shape,
          properties: { ...(shape.properties || {}), ...properties },
        });
      else if (["LineString", "MultiLineString"].includes(shape?.type))
        features.push({ type: "Feature", geometry: shape, properties });
    }
    return features.length ? { type: "FeatureCollection", features } : null;
  }, [running, data.rotas]);
  const [cachedActiveRoute, setCachedActiveRoute] = useState<ApiValue>(null);
  useEffect(() => {
    if (!activeRouteGeoJson) return;
    setCachedActiveRoute(activeRouteGeoJson);
  }, [activeRouteGeoJson]);
  useEffect(() => {
    if (!loaded || running.length || activeRouteGeoJson) return;
    setCachedActiveRoute(null);
  }, [loaded, running.length, activeRouteGeoJson]);
  const runningVehicles = useMemo(
    () =>
      running
        .filter((v) => Number.isFinite(+v.lat) && Number.isFinite(+v.lon))
        .map((v) => ({
          ...v,
          nome: v.placa || v.veiculo_placa,
          em_viagem: true,
        })),
    [running],
  );
  const metrics = useMemo(
    () =>
      [
        {
          id: "v",
          label: "VEICULOS ATIVOS",
          value: String(live.length),
          sub: "de " + (data.totais?.veiculos ?? data.veiculos.length),
          progress:
            (data.totais?.veiculos ?? data.veiculos.length)
              ? (live.length /
                  (data.totais?.veiculos ?? data.veiculos.length)) *
                100
              : 0,
          tone: "primary",
          icon: "truck",
        },
        {
          id: "t",
          label: "VIAGENS EM ANDAMENTO",
          value: String(data.totais?.viagens_em_andamento ?? running.length),
          sub: "operacao atual",
          progress: running.length ? 72 : 0,
          tone: "normal",
          icon: "route",
        },
        {
          id: "a",
          label: "ALERTAS CRITICOS",
          value: String(data.totais?.alertas_ativos ?? critical.length),
          sub: "requerem atencao",
          progress: Math.min(100, critical.length * 15),
          tone: "guardiao",
          icon: "alert",
        },
        {
          id: "r",
          label: "ROTAS CONCLUIDAS",
          value: String(
            data.viagens.filter((v) => v.status === "concluida").length,
          ),
          sub: "historico retornado",
          progress: 55,
          tone: "alerta",
          icon: "network",
        },
        {
          id: "p",
          label: "REPORTES ATIVOS",
          value: String(
            data.totais?.reportes_ativos ??
              data.reportes.filter(
                (r) => (r.status_reporte || "ativo") === "ativo",
              ).length,
          ),
          sub: "ocorrencias abertas",
          progress: 40,
          tone: "turquoise",
          icon: "gauge",
        },
      ] as ApiValue[],
    [data, live.length, running.length, critical.length],
  );
  if (!session)
    return (
      <Login
        onLogin={async (u, p, e) => setSession(await login(u, p, e))}
        onMfa={async (d, c) => setSession(await verifyAdminMfa(d, c))}
      />
    );
  const open = (tab: string) => setActive(tab);
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        onNavigate={open}
        alertCount={critical.length}
        activeId={active}
        usuario={session.usuario}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[70px] items-center gap-4 border-b border-border px-6">
          <div>
            <h1 className="text-lg font-semibold">
              {(
                {
                  dashboard: "Dashboard",
                  rotas: "Rotas",
                  frota: "Localização da frota",
                  localizacao: "Localização da frota",
                  veiculos: "Cadastro de veículos",
                  viagens: "Viagens e Guardião",
                  historico: "Histórico",
                  reportes: "Reportes",
                  restricoes: "Restrições de rotas",
                  auditoria: "Caixa-preta",
                  validadas: "Passaporte Digital",
                } as Record<string, string>
              )[active] || "Painel operacional"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {session.usuario.nome || "Administrador"} ·{" "}
              {session.usuario.empresa || "Administração geral"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {error && (
              <span className="text-xs text-status-critico">{error}</span>
            )}
            <button
              onClick={refresh}
              className="rounded-md border border-border p-2"
              title="Atualizar"
            >
              <RefreshCw
                className={"h-4 w-4 " + (busy ? "animate-spin" : "")}
              />
            </button>
            <button
              onClick={async () => {
                await logout(session.token);
                setSession(null);
                setData(empty);
              }}
              className="rounded-md border border-border p-2"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        {active === "dashboard" ? (
          <main className="flex-1 overflow-y-auto p-5">
            {falhasParciais.length > 0 && (
              <div className="mb-4 rounded-xl border border-status-atencao/40 bg-status-atencao/10 p-3 text-xs text-status-atencao">
                <b>Dados parcialmente indisponíveis:</b>{" "}
                {falhasParciais
                  .map(([nome, s]) => `${nome} (${s.mensagem})`)
                  .join(" · ")}
                . Os números dessas áreas não representam zero.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
              {metrics.map((m) => (
                <MetricCard key={m.id} metric={m} />
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="min-h-[420px] overflow-hidden rounded-xl">
                <LiveMap
                  items={
                    runningVehicles.length ? runningVehicles : data.localizacoes
                  }
                  geojson={activeRouteGeoJson || cachedActiveRoute}
                  cacheKey="dashboard"
                />
              </div>
              <section className="rounded-xl border border-border bg-card">
                <div className="flex items-center p-4">
                  <b className="text-xs">ALERTAS ATIVOS</b>
                  <span className="ml-2 rounded-full bg-status-critico px-2 text-xs">
                    {data.alertas.length}
                  </span>
                  <button
                    onClick={() => open("alertas")}
                    className="ml-auto text-xs text-primary"
                  >
                    Ver todos
                  </button>
                </div>
                <div className="space-y-2 px-3 pb-3">
                  {data.alertas.slice(0, 6).map((a, i) => (
                    <div
                      key={a.id || i}
                      className="rounded-lg border border-status-atencao/30 bg-status-atencao/[.06] p-3"
                    >
                      <div className="flex gap-2">
                        <span>
                          {a.tipo === "guardiao" ? (
                            <ShieldAlert className="h-4 w-4 text-guardian" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-status-atencao" />
                          )}
                        </span>
                        <div>
                          <b className="text-xs">
                            {a.placa || "Alerta operacional"}
                          </b>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {a.mensagem || a.tipo || a.status_operacional}
                          </p>
                          <small>{time(a)}</small>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!data.alertas.length && (
                    <p className="p-4 text-xs text-muted-foreground">
                      Sem alertas ativos.
                    </p>
                  )}
                </div>
              </section>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <List
                title={"VEÍCULOS EM ANDAMENTO (" + running.length + ")"}
                icon={<Truck />}
                rows={running.map((v) => ({
                  a: v.placa || v.veiculo_placa || "Veículo",
                  b: (v.origem || "-") + " → " + (v.destino || "-"),
                }))}
                onClick={() => open("viagens")}
              />
              <List
                title="ÚLTIMOS REPORTES"
                icon={<FileText />}
                rows={data.reportes.slice(0, 6).map((r) => ({
                  a: r.motorista || r.placa || "Reporte",
                  b: r.tipo + " · " + (r.status_reporte || "ativo"),
                }))}
                onClick={() => open("reportes")}
              />
              <List
                title="VEÍCULOS E CONDUTORES"
                icon={<MapPin />}
                rows={data.localizacoes.slice(0, 6).map((v) => ({
                  a: v.placa || "Veículo",
                  b: v.nome || v.status || "Nenhum motorista vinculado",
                }))}
                onClick={() => open("localizacao")}
              />
            </div>
          </main>
        ) : (
          <OperationalPanel
            section={active}
            token={session.token}
            data={data}
            refreshDashboard={refresh}
            usuario={session.usuario}
            routeDraft={routeDraft}
            onRouteDraftChange={setRouteDraft}
          />
        )}
      </div>
    </div>
  );
}
function Login({
  onLogin,
  onMfa,
}: {
  onLogin: (u: string, p: string, e?: string) => Promise<void>;
  onMfa: (desafio: string, codigo: string) => Promise<void>;
}) {
  const [u, su] = useState("");
  const [p, sp] = useState("");
  const [e, se] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [modoEmpresa, setModoEmpresa] = useState(false);
  const [desafioMfa, setDesafioMfa] = useState("");
  const [codigoMfa, setCodigoMfa] = useState("");
  const [b, sb] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          sb(true);
          se("");
          try {
            if (desafioMfa) await onMfa(desafioMfa, codigoMfa);
            else await onLogin(u, p, modoEmpresa ? empresa : undefined);
          } catch (y) {
            if (y instanceof MfaRequiredError) {
              setDesafioMfa(y.desafioId);
              setCodigoMfa("");
              se(y.message);
            } else se(y instanceof Error ? y.message : "Falha no login");
          } finally {
            sb(false);
          }
        }}
        className="w-[360px] rounded-xl border border-border bg-card p-7"
      >
        <ShieldAlert className="h-10 w-10 text-primary" />
        <h1 className="mt-3 text-xl font-bold">GPS Caminhao Gestor</h1>
        <div className="mt-5 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-xs">
          <button
            type="button"
            onClick={() => setModoEmpresa(false)}
            className={
              (modoEmpresa ? "" : "bg-primary text-white") + " rounded-md p-2"
            }
          >
            Gestor geral
          </button>
          <button
            type="button"
            onClick={() => setModoEmpresa(true)}
            className={
              (modoEmpresa ? "bg-primary text-white" : "") + " rounded-md p-2"
            }
          >
            Empresa
          </button>
        </div>
        {modoEmpresa && (
          <input
            required
            autoFocus
            value={empresa}
            onChange={(x) => setEmpresa(x.target.value)}
            placeholder="Nome ou código da empresa"
            className="mt-3 w-full rounded border border-border bg-surface-2 p-3"
          />
        )}
        <input
          required
          autoFocus={!modoEmpresa}
          value={u}
          onChange={(x) => su(x.target.value)}
          placeholder={modoEmpresa ? "E-mail" : "Usuário ou e-mail"}
          className="mt-3 w-full rounded border border-border bg-surface-2 p-3"
        />
        {!desafioMfa ? (
          <input
            required
            type="password"
            value={p}
            onChange={(x) => sp(x.target.value)}
            placeholder="Senha"
            className="mt-3 w-full rounded border border-border bg-surface-2 p-3"
          />
        ) : (
          <input
            required
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={codigoMfa}
            onChange={(x) => setCodigoMfa(x.target.value.replace(/\D/g, ""))}
            placeholder="Código de segurança de 6 dígitos"
            className="mt-3 w-full rounded border border-border bg-surface-2 p-3"
          />
        )}
        {e && <p className="mt-3 text-xs text-status-critico">{e}</p>}
        <button className="mt-4 w-full rounded bg-primary p-3 font-semibold">
          {b ? "Verificando..." : desafioMfa ? "Confirmar código" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
function List({
  title,
  icon,
  rows,
  onClick,
}: {
  title: string;
  icon: ApiValue;
  rows: { a: ApiValue; b: ApiValue }[];
  onClick: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-4 text-xs font-bold">
        {icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        {title}
        <button onClick={onClick} className="ml-auto text-primary">
          Abrir
        </button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="border-t border-border p-3">
          <b className="text-xs">{r.a}</b>
          <p className="text-xs text-muted-foreground">{r.b}</p>
        </div>
      ))}
      {!rows.length && (
        <p className="border-t border-border p-4 text-xs text-muted-foreground">
          Nenhum registro.
        </p>
      )}
    </section>
  );
}
