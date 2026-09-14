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

const toRadians = (value: number) => (value * Math.PI) / 180;

export function Restrictions({ token, data }: P) {
  const restrictions = useLoad(token, "/restricoes-validadas"),
    events = useLoad(token, "/guardiao/eventos"),
    locations = useLoad(token, "/localizacoes", data.localizacoes),
    companies = useLoad(token, "/integracoes/empresas"),
    profiles = useLoad(token, "/guardiao/perfis-composicao"),
    mobilePilot = useLoad(token, "/piloto-mobile/sessoes?limite=100"),
    [vehicleId, setVehicleId] = useState(""),
    [height, setHeight] = useState("4.20"),
    [motion, setMotion] = useState<ApiValue>(null),
    [lastUpdate, setLastUpdate] = useState(new Date()),
    [companyName, setCompanyName] = useState(""),
    [companyPlates, setCompanyPlates] = useState(""),
    [createdKey, setCreatedKey] = useState(""),
    [diagnostic, setDiagnostic] = useState<ApiValue>(null),
    [diagnosticCompany, setDiagnosticCompany] = useState<ApiValue>(null),
    [companyUsers, setCompanyUsers] = useState<ApiValue[]>([]),
    [access, setAccess] = useState<ApiValue>({
      id_empresa: "",
      nome: "",
      email: "",
      senha: "",
      perfil: "somente_leitura",
    }),
    [shadowReport, setShadowReport] = useState<ApiValue>(null),
    [composition, setComposition] = useState<ApiValue>({
      nome: "",
      placa: "",
      carreta: "",
      carga: "",
      altura: "",
      largura: "",
      comprimento: "",
      peso: "",
      eixos: "",
    });
  const previous = useRef<ApiValue>(null);
  const vehicles = locations.items.filter(
    (x: ApiValue) =>
      Number.isFinite(+x.lat) && Number.isFinite(+(x.lon ?? x.lng)),
  );
  const vehicle =
    vehicles.find((x: ApiValue) => String(x.id) === vehicleId) || vehicles[0];
  const vehicleKey = vehicle ? String(vehicle.id) : "";
  const distance = useCallback((a: ApiValue, b: ApiValue) => {
    const dLat = toRadians(+b.lat - +a.lat),
      dLon = toRadians(+(b.lon ?? b.lng) - +(a.lon ?? a.lng));
    const q =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(+a.lat)) *
        Math.cos(toRadians(+b.lat)) *
        Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }, []);
  const bearing = useCallback((a: ApiValue, b: ApiValue) => {
    const p1 = toRadians(+a.lat),
      p2 = toRadians(+b.lat),
      dl = toRadians(+(b.lon ?? b.lng) - +(a.lon ?? a.lng));
    return (
      ((Math.atan2(
        Math.sin(dl) * Math.cos(p2),
        Math.cos(p1) * Math.sin(p2) -
          Math.sin(p1) * Math.cos(p2) * Math.cos(dl),
      ) *
        180) /
        Math.PI +
        360) %
      360
    );
  }, []);
  const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

  useEffect(() => {
    if (!vehicle) return;
    const current = {
      id: vehicle.id,
      lat: +vehicle.lat,
      lon: +(vehicle.lon ?? vehicle.lng),
      at: new Date(vehicle.ultima_atualizacao || Date.now()).getTime(),
    };
    const old = previous.current;
    if (old?.id === current.id && old.at < current.at) {
      const km = distance(old, current),
        hours = (current.at - old.at) / 3600000;
      if (km >= 0.003)
        setMotion({
          heading: bearing(old, current),
          speed: hours > 0 ? Math.min(160, km / hours) : 0,
        });
    }
    if (!old || old.id !== current.id || old.at < current.at)
      previous.current = current;
  }, [vehicle, bearing, distance]);

  useEffect(() => {
    if (!vehicleId && vehicle) setVehicleId(String(vehicle.id));
  }, [vehicleId, vehicle]);

  const reloadLocations = locations.load;
  const reloadEvents = events.load;
  const reloadRestrictions = restrictions.load;
  useEffect(() => {
    const id = window.setInterval(() => {
      reloadLocations();
      reloadEvents();
      reloadRestrictions();
      setLastUpdate(new Date());
    }, 5000);
    return () => window.clearInterval(id);
  }, [reloadLocations, reloadEvents, reloadRestrictions]);

  const speed = Number(motion?.speed || 0);
  const range =
    speed >= 90
      ? 15
      : speed >= 70
        ? 12
        : speed >= 50
          ? 10
          : speed >= 25
            ? 7
            : 5;
  const dimensions = {
    altura: +height,
    largura: +vehicle?.largura,
    comprimento: +vehicle?.comprimento,
    peso: +vehicle?.peso,
  } as ApiValue;
  const localRisks =
    vehicle && motion
      ? restrictions.items
          .filter(
            (x: ApiValue) =>
              x.ativa &&
              Number.isFinite(+x.lat) &&
              Number.isFinite(+(x.lng ?? x.lon)),
          )
          .map((x: ApiValue) => {
            const km = distance(vehicle, { lat: x.lat, lon: x.lng ?? x.lon });
            const direction = bearing(vehicle, {
              lat: x.lat,
              lon: x.lng ?? x.lon,
            });
            if (km > range || angle(direction, motion.heading) > 38)
              return null;
            const tests = [
              ["altura", x.limite_altura, "m"],
              ["largura", x.limite_largura, "m"],
              ["comprimento", x.limite_comprimento, "m"],
              ["peso", x.limite_peso, "t"],
            ]
              .map(([tipo, limite, unidade]) => ({
                tipo,
                limite: +limite,
                veiculo: dimensions[tipo as string],
                unidade,
              }))
              .filter(
                (v: ApiValue) =>
                  Number.isFinite(v.limite) &&
                  Number.isFinite(v.veiculo) &&
                  v.veiculo > v.limite,
              );
            const conflict: ApiValue = tests[0];
            return {
              id: `local-${x.id}`,
              nivel: conflict && km <= 2 ? "critico" : "atencao",
              distancia_km: km,
              tempo_estimado_min: speed >= 8 ? (km / speed) * 60 : null,
              tipo_risco: conflict?.tipo || x.tipo,
              restricao: x,
              dados: {
                restricao: x,
                incompatibilidade: conflict,
                alcance_km: range,
              },
            };
          })
          .filter(Boolean)
          .sort((a: ApiValue, b: ApiValue) => a.distancia_km - b.distancia_km)
      : [];
  const serverRisks = events.items.filter(
    (x: ApiValue) => !vehicle || x.placa === vehicle.placa,
  );
  const risks = [...localRisks, ...serverRisks].filter(
    (x: ApiValue, i, all) =>
      all.findIndex(
        (y: ApiValue) =>
          String(y.id_restricao || y.restricao?.id || y.id) ===
          String(x.id_restricao || x.restricao?.id || x.id),
      ) === i,
  );
  const critical = risks.filter((x: ApiValue) => x.nivel === "critico");
  const gpsAt = vehicle?.ultima_atualizacao
    ? new Date(vehicle.ultima_atualizacao)
    : null;
  const gpsAge =
    gpsAt && Number.isFinite(+gpsAt)
      ? Math.max(0, Math.round((Date.now() - +gpsAt) / 1000))
      : null;
  const status = !vehicle
    ? "SEM GPS"
    : !motion
      ? "CALIBRANDO DIREÇÃO"
      : critical.length
        ? "RISCO CRÍTICO"
        : risks.length
          ? "ATENÇÃO À FRENTE"
          : "CORREDOR SEGURO";

  return (
    <Shell
      title="Supervisor Guardião"
      desc="Radar independente de rota baseado no movimento real do veículo."
      icon={<Radar className="h-5 w-5" />}
      actions={
        <span className="flex items-center gap-2 rounded-full border border-status-normal/25 bg-status-normal/10 px-3 py-2 text-xs text-status-normal">
          <span className="h-2 w-2 animate-pulse rounded-full bg-status-normal" />{" "}
          AO VIVO · 5s
        </span>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <RadarMetric
          label="SUPERVISÃO"
          value={status}
          tone={
            critical.length ? "critical" : risks.length ? "warning" : "safe"
          }
        />
        <RadarMetric
          label="ALCANCE À FRENTE"
          value={`${range} km`}
          sub="ajustado pela velocidade"
        />
        <RadarMetric
          label="VELOCIDADE ESTIMADA"
          value={motion ? `${Math.round(speed)} km/h` : "—"}
          sub={
            motion
              ? `direção ${Math.round(motion.heading)}°`
              : "aguardando deslocamento"
          }
        />
        <RadarMetric
          label="RISCOS NO CORREDOR"
          value={String(risks.length)}
          sub={`${critical.length} crítico(s)`}
        />
        <RadarMetric
          label="ÚLTIMO GPS"
          value={gpsAge === null ? "—" : `${gpsAge}s`}
          sub={lastUpdate.toLocaleTimeString("pt-BR")}
        />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_380px]">
        <LiveMap items={vehicle ? [vehicle] : []} risks={risks} />
        <aside className={card + " flex h-[520px] flex-col overflow-hidden"}>
          <div className="border-b border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" />
              <b>Veículo supervisionado</b>
            </div>
            <select
              className={input}
              value={vehicleKey}
              onChange={(e) => {
                setVehicleId(e.target.value);
                previous.current = null;
                setMotion(null);
              }}
            >
              {vehicles.map((x: ApiValue) => (
                <option key={x.id} value={x.id}>
                  {x.placa || x.nome}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-xs text-muted-foreground">
              Altura operacional carregada (m)
              <input
                className={input + " mt-1"}
                type="number"
                step="0.01"
                min="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </label>
            {vehicle && (
              <p className="mt-2 text-xs text-muted-foreground">
                {vehicle.modelo || vehicle.nome} · {vehicle.comprimento || "—"}m
                × {vehicle.largura || "—"}m · {vehicle.peso || "—"}t
              </p>
            )}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-guardian" />
              <b className="text-xs">ANÁLISE À FRENTE</b>
            </div>
            {!motion && (
              <div className="rounded-lg border border-primary/20 bg-primary/[.06] p-4 text-center">
                <Radar className="mx-auto h-8 w-8 animate-pulse text-primary" />
                <b className="mt-2 block text-sm">Aprendendo a direção</b>
                <p className={muted}>
                  O radar inicia assim que chegar uma nova posição com
                  deslocamento.
                </p>
              </div>
            )}
            {motion && !risks.length && (
              <div className="rounded-lg bg-status-normal/10 p-5 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-status-normal" />
                <b className="mt-2 block text-sm">Via livre à frente</b>
                <p className={muted}>
                  Pontes e restrições continuam sendo verificadas a cada
                  atualização.
                </p>
              </div>
            )}
            {risks.map((risk: ApiValue) => (
              <RiskCard key={risk.id} risk={risk} />
            ))}
          </div>
        </aside>
      </div>
      <section className={card + " p-4"}>
        <div className="flex items-center">
          <div>
            <b className="text-sm">Como funciona o radar livre</b>
            <p className={muted}>
              Compara posições sucessivas, identifica a direção do deslocamento
              e cria um corredor de 76° à frente. Não exige rota ou destino
              previamente cadastrado.
            </p>
            <p className="mt-2 text-xs text-status-atencao">
              O Guardião auxilia a operação e não substitui a sinalização viária
              nem a decisão segura do condutor.
            </p>
          </div>
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            {restrictions.items.filter((x: ApiValue) => x.ativa).length}{" "}
            restrições ativas
          </span>
        </div>
      </section>
      <section className={card + " mt-4 p-4"}>
        <div className="mb-4">
          <b className="text-sm">Integração GPS empresarial</b>
          <p className={muted}>
            Gere uma chave e vincule as placas autorizadas. O motorista
            permanece apenas como referência do condutor.
          </p>
        </div>
        <form
          className="grid gap-3 lg:grid-cols-[1fr_1.4fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await act(token, "/integracoes/empresas", "POST", {
              nome: companyName,
              placas: companyPlates.split(/[,;\s]+/).filter(Boolean),
              escopos: ["telemetria:escrever", "diagnostico:ler"],
              expira_em: new Date(Date.now() + 90 * 86400000).toISOString(),
            });
            setCreatedKey(result.chave || "");
            setCompanyName("");
            setCompanyPlates("");
            companies.load();
          }}
        >
          <input
            required
            className={input}
            placeholder="Nome da empresa"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <input
            required
            className={input}
            placeholder="Placas separadas por vírgula: ABC1D23, DEF4G56"
            value={companyPlates}
            onChange={(e) => setCompanyPlates(e.target.value)}
          />
          <button className={btn}>Gerar chave</button>
        </form>
        {createdKey && (
          <div className="mt-3 rounded-lg border border-status-atencao/30 bg-status-atencao/[.07] p-3">
            <b className="text-xs text-status-atencao">
              COPIE AGORA — A CHAVE SERÁ EXIBIDA UMA ÚNICA VEZ
            </b>
            <code className="mt-2 block break-all rounded bg-black/25 p-3 text-xs">
              {createdKey}
            </code>
          </div>
        )}
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {companies.items.map((company: ApiValue) => (
            <article
              key={company.id}
              className="rounded-lg border border-border bg-surface-2 p-3"
            >
              <div className="flex items-center">
                <b className="text-sm">{company.nome}</b>
                <span
                  className={
                    "ml-auto rounded-full px-2 py-1 text-[10px] " +
                    (company.ativo
                      ? "bg-status-normal/10 text-status-normal"
                      : "bg-status-offline/10 text-status-offline")
                  }
                >
                  {company.ativo ? "ATIVA" : "DESATIVADA"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {company.veiculos?.map((v: ApiValue) => v.placa).join(", ") ||
                  "Nenhuma placa"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {company.chaves?.length || 1} chave(s) · último uso{" "}
                {company.ultimo_uso_em
                  ? new Date(company.ultimo_uso_em).toLocaleString("pt-BR")
                  : "nunca"}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  className="text-xs text-primary"
                  onClick={async () => {
                    const r = await act(
                      token,
                      `/integracoes/empresas/${company.id}/chaves/rotacionar`,
                      "POST",
                      {
                        nome: `Rotação ${new Date().toLocaleDateString("pt-BR")}`,
                        escopos: ["telemetria:escrever", "diagnostico:ler"],
                        expira_em: new Date(
                          Date.now() + 90 * 86400000,
                        ).toISOString(),
                      },
                    );
                    setCreatedKey(r.chave || "");
                    companies.load();
                  }}
                >
                  Rotacionar chave
                </button>
                <button
                  className="text-xs text-primary"
                  onClick={async () => {
                    setDiagnosticCompany(company);
                    setDiagnostic(
                      await apiRequest<ApiValue>(
                        `/integracoes/empresas/${company.id}/diagnostico`,
                        token,
                      ),
                    );
                  }}
                >
                  Diagnóstico
                </button>
                <button
                  className="text-xs text-status-atencao"
                  onClick={async () => {
                    await act(
                      token,
                      "/integracoes/empresas/" + company.id,
                      "PATCH",
                      { ativo: !company.ativo },
                    );
                    companies.load();
                  }}
                >
                  {company.ativo ? "Desativar chave" : "Reativar chave"}
                </button>
              </div>
              <div className="mt-3 space-y-1 border-t border-border pt-2">
                {company.chaves?.map((key: ApiValue) => (
                  <div
                    key={key.id}
                    className="flex text-[10px] text-muted-foreground"
                  >
                    <span>
                      {key.nome} · {key.prefixo}••••
                    </span>
                    <span className="ml-auto">
                      {key.ativo
                        ? key.expira_em
                          ? `expira ${new Date(key.expira_em).toLocaleDateString("pt-BR")}`
                          : "sem validade"
                        : "revogada"}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
        {diagnostic && (
          <section className="mt-4 rounded-xl border border-primary/25 bg-primary/[.04] p-4">
            <div className="flex items-center">
              <div>
                <b>Diagnóstico · {diagnosticCompany?.nome}</b>
                <p className={muted}>
                  Disponibilidade, posições e falhas das últimas 24 horas.
                </p>
              </div>
              <button
                className="ml-auto text-xs text-primary"
                onClick={() => setDiagnostic(null)}
              >
                Fechar
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <RadarMetric
                label="ESTADO"
                value={String(
                  diagnostic.empresa?.estado_atual || "—",
                ).toUpperCase()}
                tone={
                  diagnostic.empresa?.estado_atual === "online"
                    ? "safe"
                    : "warning"
                }
              />
              <RadarMetric
                label="POSIÇÕES 24H"
                value={diagnostic.resumo?.recebidas_24h ?? 0}
              />
              <RadarMetric
                label="FALHAS 24H"
                value={diagnostic.resumo?.falhas_24h ?? 0}
                tone={
                  Number(diagnostic.resumo?.falhas_24h) > 0 ? "warning" : "safe"
                }
              />
              <RadarMetric
                label="LATÊNCIA MÉDIA"
                value={`${diagnostic.resumo?.latencia_media_ms ?? 0} ms`}
              />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {diagnostic.veiculos?.map((v: ApiValue) => (
                <div key={v.id} className="rounded-lg bg-surface-2 p-3">
                  <div className="flex">
                    <b className="text-xs">{v.placa}</b>
                    <span
                      className={`ml-auto text-[10px] ${v.status === "online" ? "text-status-normal" : "text-status-atencao"}`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className={muted}>
                    {v.ultima_atualizacao
                      ? `Última posição ${new Date(v.ultima_atualizacao).toLocaleString("pt-BR")}`
                      : "Nenhuma posição recebida"}
                  </p>
                </div>
              ))}
            </div>
            {diagnostic.erros?.length > 0 && (
              <div className="mt-3">
                <b className="text-xs">FALHAS RECENTES</b>
                {diagnostic.erros.slice(0, 6).map((e: ApiValue, i: number) => (
                  <p
                    key={i}
                    className="mt-1 rounded bg-status-critico/[.06] p-2 text-xs text-status-critico"
                  >
                    {new Date(e.recebido_em).toLocaleString("pt-BR")} ·{" "}
                    {e.placa || "sem placa"} · {e.erro_mensagem} · ID{" "}
                    {e.request_id}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}
        <section className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
          <div>
            <b className="text-sm">Acessos empresariais</b>
            <p className={muted}>
              Perfis isolados por empresa. Cada conta enxerga somente os dados
              da própria organização.
            </p>
          </div>
          <form
            className="mt-3 grid gap-2 lg:grid-cols-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const created = await act(
                token,
                `/integracoes/empresas/${access.id_empresa}/usuarios`,
                "POST",
                access,
              );
              setCompanyUsers((old) => [
                created,
                ...old.filter((x: ApiValue) => x.id !== created.id),
              ]);
              setAccess({ ...access, nome: "", email: "", senha: "" });
            }}
          >
            <select
              required
              className={input}
              value={access.id_empresa}
              onChange={async (e) => {
                const id = e.target.value;
                setAccess({ ...access, id_empresa: id });
                setCompanyUsers(
                  id
                    ? await apiRequest<ApiValue[]>(
                        `/integracoes/empresas/${id}/usuarios`,
                        token,
                      )
                    : [],
                );
              }}
            >
              <option value="">Empresa</option>
              {companies.items.map((c: ApiValue) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <input
              required
              className={input}
              placeholder="Nome"
              value={access.nome}
              onChange={(e) => setAccess({ ...access, nome: e.target.value })}
            />
            <input
              required
              type="email"
              className={input}
              placeholder="E-mail"
              value={access.email}
              onChange={(e) => setAccess({ ...access, email: e.target.value })}
            />
            <input
              required
              minLength={8}
              type="password"
              className={input}
              placeholder="Senha inicial (8+)"
              value={access.senha}
              onChange={(e) => setAccess({ ...access, senha: e.target.value })}
            />
            <div className="flex gap-2">
              <select
                className={input}
                value={access.perfil}
                onChange={(e) =>
                  setAccess({ ...access, perfil: e.target.value })
                }
              >
                <option value="administrador">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="analista">Analista</option>
                <option value="somente_leitura">Somente leitura</option>
              </select>
              <button className={btn}>Salvar</button>
            </div>
          </form>
          {companyUsers.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {companyUsers.map((u: ApiValue) => (
                <div key={u.id} className="rounded-lg border border-border p-3">
                  <b className="text-xs">{u.nome}</b>
                  <p className={muted}>{u.email}</p>
                  <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
                    {String(u.perfil).replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className={card + " p-4 xl:col-span-2"}>
          <div className="flex items-center gap-3">
            <div>
              <b className="text-sm">Piloto móvel · modo sombra</b>
              <p className={muted}>
                Acompanha o GPS do celular, bateria, rede e continuidade da
                sessão sem enviar comandos ao motorista.
              </p>
            </div>
            <button
              onClick={mobilePilot.load}
              className="ml-auto rounded-lg border border-border p-2"
              title="Atualizar sessões"
            >
              <RefreshCw
                className={`h-4 w-4 ${mobilePilot.loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          {mobilePilot.error && (
            <p className="mt-3 rounded-lg bg-status-critico/10 p-3 text-xs text-status-critico">
              {mobilePilot.error}
            </p>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mobilePilot.items.slice(0, 12).map((s: ApiValue) => {
              const online = s.estado_atual === "online",
                warning = [
                  "instavel",
                  "sem_sinal",
                  "gps_desligado",
                  "interrompida",
                ].includes(s.estado_atual);
              const cp = s.composicao || {};
              return (
                <article
                  key={s.id}
                  className="rounded-lg border border-border bg-surface-2 p-3"
                >
                  <div className="flex items-start gap-2">
                    <div>
                      <b className="text-sm">{s.placa}</b>
                      <p className={muted}>
                        {s.motorista || "Motorista"} ·{" "}
                        {s.empresa || "Sem empresa vinculada"}
                      </p>
                    </div>
                    <span
                      className={
                        (online
                          ? "bg-status-normal/10 text-status-normal"
                          : warning
                            ? "bg-status-atencao/10 text-status-atencao"
                            : "bg-surface-2 text-muted-foreground") +
                        " ml-auto rounded-full px-2 py-1 text-[10px] font-semibold uppercase"
                      }
                    >
                      {String(s.estado_atual || s.status).replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-3 text-xs">
                    {cp.tipo || "Composição não informada"}
                    {cp.altura ? ` · ${cp.altura} m` : ""}
                    {cp.peso ? ` · ${cp.peso} t` : ""}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Bateria: {s.bateria_percentual ?? "—"}%
                      {s.carregando ? " · carregando" : ""}
                    </span>
                    <span>Rede: {s.tipo_rede || "—"}</span>
                    <span>
                      GPS:{" "}
                      {s.gps_ativo === false
                        ? "desligado"
                        : s.gps_ativo === true
                          ? "ativo"
                          : "—"}
                    </span>
                    <span>
                      Segundo plano:{" "}
                      {s.app_segundo_plano === true
                        ? "sim"
                        : s.app_segundo_plano === false
                          ? "não"
                          : "—"}
                    </span>
                    <span>
                      Precisão:{" "}
                      {s.ultima_precisao_m != null
                        ? `±${Number(s.ultima_precisao_m).toFixed(0)} m`
                        : "—"}
                    </span>
                    <span>
                      Velocidade:{" "}
                      {s.ultima_velocidade_kmh != null
                        ? `${Number(s.ultima_velocidade_kmh).toFixed(0)} km/h`
                        : "—"}
                    </span>
                    <span>Frequência: {s.posicoes_por_minuto ?? 0}/min</span>
                    <span>
                      Sem comunicação: {s.segundos_sem_comunicacao ?? 0}s
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Última comunicação:{" "}
                    {s.ultima_comunicacao_em
                      ? new Date(s.ultima_comunicacao_em).toLocaleString(
                          "pt-BR",
                        )
                      : "—"}{" "}
                    · {s.total_posicoes || 0} posições · {s.total_riscos || 0}{" "}
                    riscos observados
                  </p>
                </article>
              );
            })}
          </div>
          {!mobilePilot.loading && !mobilePilot.items.length && (
            <div className="mt-3 rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
              Nenhuma sessão móvel registrada. Elas aparecerão aqui quando o
              Android iniciar o piloto.
            </div>
          )}
        </section>
        <section className={card + " p-4"}>
          <div className="mb-3">
            <b className="text-sm">Perfis de composição</b>
            <p className={muted}>
              A composição ativa substitui as medidas básicas do veículo na
              análise.
            </p>
          </div>
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await act(
                token,
                "/guardiao/perfis-composicao",
                "POST",
                composition,
              );
              setComposition({
                nome: "",
                placa: "",
                carreta: "",
                carga: "",
                altura: "",
                largura: "",
                comprimento: "",
                peso: "",
                eixos: "",
              });
              profiles.load();
            }}
          >
            <input
              required
              className={input}
              placeholder="Nome da composição"
              value={composition.nome}
              onChange={(e) =>
                setComposition({ ...composition, nome: e.target.value })
              }
            />
            <select
              required
              className={input}
              value={composition.placa}
              onChange={(e) =>
                setComposition({ ...composition, placa: e.target.value })
              }
            >
              <option value="">Selecione a placa</option>
              {data.veiculos.map((v: ApiValue) => (
                <option key={v.id} value={v.placa}>
                  {v.placa}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="Carreta/implemento"
              value={composition.carreta}
              onChange={(e) =>
                setComposition({ ...composition, carreta: e.target.value })
              }
            />
            <input
              className={input}
              placeholder="Descrição da carga"
              value={composition.carga}
              onChange={(e) =>
                setComposition({ ...composition, carga: e.target.value })
              }
            />
            {(
              [
                ["altura", "Altura total (m)"],
                ["largura", "Largura (m)"],
                ["comprimento", "Comprimento total (m)"],
                ["peso", "Peso total (t)"],
                ["eixos", "Quantidade de eixos"],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                required={key !== "eixos"}
                type="number"
                min={key === "eixos" ? 1 : 0.1}
                step={key === "eixos" ? 1 : 0.01}
                className={input}
                placeholder={label}
                value={composition[key]}
                onChange={(e) =>
                  setComposition({ ...composition, [key]: e.target.value })
                }
              />
            ))}
            <button className={btn + " col-span-2"}>
              Salvar e ativar composição
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {profiles.items.slice(0, 6).map((p: ApiValue) => (
              <div
                key={p.id}
                className="flex items-center rounded-lg bg-surface-2 p-3"
              >
                <div>
                  <b className="text-xs">
                    {p.placa} · {p.nome}
                  </b>
                  <p className={muted}>
                    {p.altura}m × {p.largura}m · {p.comprimento}m · {p.peso}t ·{" "}
                    {p.eixos || "—"} eixos
                  </p>
                </div>
                <span
                  className={
                    "ml-auto text-[10px] " +
                    (p.ativo ? "text-status-normal" : "text-muted-foreground")
                  }
                >
                  {p.ativo ? "ATIVA" : "INATIVA"}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className={card + " p-4"}>
          <div className="flex items-center">
            <div>
              <b className="text-sm">Relatório do modo sombra</b>
              <p className={muted}>
                Riscos observados sem interação com o motorista.
              </p>
            </div>
            <button
              className={btn + " ml-auto"}
              onClick={async () =>
                setShadowReport(
                  await apiRequest<ApiValue>(
                    "/guardiao/modo-sombra/relatorio?dias=30",
                    token,
                  ),
                )
              }
            >
              Atualizar
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(
              [
                ["eventos", "Eventos"],
                ["veiculos", "Veículos expostos"],
                ["iminentes", "Iminentes"],
                ["criticos", "Críticos"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-lg bg-surface-2 p-3">
                <p className={muted}>{label}</p>
                <strong className="mt-1 block text-xl">
                  {shadowReport?.resumo?.[key] ?? "—"}
                </strong>
              </div>
            ))}
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {shadowReport?.eventos?.slice(0, 12).map((e: ApiValue) => (
              <div key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex">
                  <b className="text-xs">
                    {e.placa} · {e.nivel}
                  </b>
                  <span className="ml-auto text-xs">
                    {Number(e.distancia_km).toFixed(1)} km
                  </span>
                </div>
                <p className={muted}>
                  {e.empresa} · {e.tipo_risco || "estrutura"} ·{" "}
                  {new Date(e.ultimo_evento_em).toLocaleString("pt-BR")}
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    className="text-[10px] text-status-normal"
                    onClick={async () => {
                      await act(
                        token,
                        `/guardiao/eventos-empresa/${e.id}/feedback`,
                        "PATCH",
                        { classificacao: "confirmado" },
                      );
                      setShadowReport(
                        await apiRequest<ApiValue>(
                          "/guardiao/modo-sombra/relatorio?dias=30",
                          token,
                        ),
                      );
                    }}
                  >
                    Confirmar risco
                  </button>
                  <button
                    className="text-[10px] text-status-atencao"
                    onClick={async () => {
                      await act(
                        token,
                        `/guardiao/eventos-empresa/${e.id}/feedback`,
                        "PATCH",
                        { classificacao: "falso_positivo" },
                      );
                      setShadowReport(
                        await apiRequest<ApiValue>(
                          "/guardiao/modo-sombra/relatorio?dias=30",
                          token,
                        ),
                      );
                    }}
                  >
                    Falso positivo
                  </button>
                  <button
                    className="text-[10px] text-muted-foreground"
                    onClick={async () => {
                      await act(
                        token,
                        `/guardiao/eventos-empresa/${e.id}/feedback`,
                        "PATCH",
                        { classificacao: "ignorado" },
                      );
                      setShadowReport(
                        await apiRequest<ApiValue>(
                          "/guardiao/modo-sombra/relatorio?dias=30",
                          token,
                        ),
                      );
                    }}
                  >
                    Marcar ignorado
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>{" "}
    </Shell>
  );
}
function RadarMetric({ label, value, sub, tone }: ApiValue) {
  const color =
    tone === "critical"
      ? "text-status-critico"
      : tone === "warning"
        ? "text-status-atencao"
        : tone === "safe"
          ? "text-status-normal"
          : "text-foreground";
  return (
    <div className={card + " p-4"}>
      <p className={muted}>{label}</p>
      <strong className={"mt-2 block truncate text-base " + color}>
        {value}
      </strong>
      {sub && <small className={muted}>{sub}</small>}
    </div>
  );
}
function RiskCard({ risk }: ApiValue) {
  const r = risk.dados?.restricao || risk.restricao || {},
    c = risk.dados?.incompatibilidade || {};
  return (
    <article
      className={
        "rounded-lg border p-3 " +
        (risk.nivel === "critico"
          ? "border-status-critico/40 bg-status-critico/[.07]"
          : "border-status-atencao/35 bg-status-atencao/[.06]")
      }
    >
      <div className="flex items-center gap-2">
        <ShieldAlert
          className={
            "h-4 w-4 " +
            (risk.nivel === "critico"
              ? "text-status-critico"
              : "text-status-atencao")
          }
        />
        <b className="text-xs uppercase">{risk.nivel}</b>
        <strong className="ml-auto">
          {Number(risk.distancia_km || 0).toFixed(1)} km
        </strong>
      </div>
      <p className="mt-2 text-sm font-semibold">
        {r.nome || r.rodovia || risk.tipo_risco || "Estrutura à frente"}
      </p>
      <p className={muted}>
        {risk.tempo_estimado_min
          ? `${Math.max(1, Math.round(risk.tempo_estimado_min))} min até o ponto`
          : "tempo sendo calculado"}
      </p>
      {c.tipo && (
        <p className="mt-2 rounded bg-black/15 p-2 text-xs">
          {c.tipo}: veículo {c.veiculo}
          {c.unidade} · limite {c.limite}
          {c.unidade}
        </p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {r.status_confiabilidade === "possivel_risco"
          ? "Possível risco"
          : r.status_confiabilidade === "em_revisao"
            ? "Em revisão"
            : "Restrição confirmada"}{" "}
        · Confiança {r.confianca ?? "—"}% · fonte {r.fonte || "base validada"}
        {r.fonte_atualizada_em || r.atualizada_em
          ? ` · atualizada ${new Date(r.fonte_atualizada_em || r.atualizada_em).toLocaleDateString("pt-BR")}`
          : ""}
      </p>
    </article>
  );
}
