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

export function RestrictionCatalog({ token }: P) {
  const q = useLoad(token, "/restricoes-validadas"),
    trips = useLoad(token, "/monitoramento/viagens"),
    [filter, setFilter] = useState("todas"),
    [triageFilter, setTriageFilter] = useState("atencao"),
    [tripId, setTripId] = useState(""),
    [candidates, setCandidates] = useState<ApiValue[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<ApiValue>(null),
    [validation, setValidation] = useState<ApiValue>({
      limite_altura: "",
      limite_largura: "",
      limite_comprimento: "",
      limite_peso: "",
      limite_eixo: "",
      evidencia_url: "",
      observacao: "",
      valida_dias: "180",
    });
  const trip = trips.items.find((x: ApiValue) => String(x.id) === tripId),
    items = q.items.filter(
      (x: ApiValue) =>
        filter === "todas" ||
        String(x.tipo || "")
          .toLowerCase()
          .includes(filter),
    );
  let route: ApiValue = trip?.rota_aprovada_geojson || trip?.dados_geojson;
  try {
    if (typeof route === "string") route = JSON.parse(route);
  } catch {
    route = null;
  }
  const loadCandidates = async (id = tripId) => {
    if (!id) {
      setCandidates([]);
      return;
    }
    setCandidates(
      await apiRequest<ApiValue[]>(
        `/viagens/${id}/restricoes-candidatas`,
        token,
      ),
    );
  };
  const scan = async () => {
    if (!tripId) return setMessage("Selecione uma viagem para analisar.");
    setBusy(true);
    setMessage("Cruzando infraestrutura ANTT e OpenStreetMap...");
    try {
      const r = await act(
        token,
        `/viagens/${tripId}/scan-restricoes`,
        "POST",
        {},
      );
      await loadCandidates();
      const t = r.triagem || {},
        aviso =
          Array.isArray(r.avisos) && r.avisos.length
            ? ` · Aviso: ${r.avisos.join("; ")}`
            : "";
      setMessage(
        `${r.candidatos_na_rota || 0} no corredor de 80 m · ${t.alta_prioridade || 0} alta prioridade · ${t.divergencia_fontes || 0} divergências · ${t.possivel_risco || 0} possíveis riscos · ${t.inventario || 0} inventário · ${r.fora_do_corredor || 0} fora do corredor descartados${aviso}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na varredura ANTT");
    } finally {
      setBusy(false);
    }
  };
  const candidateAction = async (
    x: ApiValue,
    kind: "confirmar" | "rejeitar",
  ) => {
    await act(token, `/restricoes-candidatas/${x.id}/${kind}`, "PATCH", {});
    await loadCandidates();
    setMessage(
      kind === "confirmar"
        ? "Existência confirmada; falta validar limites para afetar o roteamento."
        : "Candidato rejeitado.",
    );
  };
  const validate = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await act(
        token,
        `/restricoes-candidatas/${editing.id}/validar-global`,
        "POST",
        Object.fromEntries(
          Object.entries(validation).map(([k, v]) => [
            k,
            String(v).trim() === ""
              ? null
              : ["observacao", "evidencia_url"].includes(k)
                ? v
                : Number(v),
          ]),
        ),
      );
      setEditing(null);
      await Promise.all([loadCandidates(), q.load()]);
      setMessage("Restrição validada e adicionada à base global de segurança.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao validar");
    } finally {
      setBusy(false);
    }
  };
  const setTemporary = async (x: ApiValue) => {
    const start = prompt(
      "Início da restrição (AAAA-MM-DD HH:mm):",
      x.vigencia_inicio
        ? String(x.vigencia_inicio).slice(0, 16).replace("T", " ")
        : new Date().toISOString().slice(0, 16).replace("T", " "),
    );
    if (!start) return;
    const end = prompt(
      "Fim da restrição (AAAA-MM-DD HH:mm):",
      x.valida_ate ? String(x.valida_ate).slice(0, 16).replace("T", " ") : "",
    );
    if (!end) return;
    try {
      await act(token, `/restricoes-validadas/${x.id}`, "PATCH", {
        natureza: "temporaria",
        vigencia_inicio: new Date(start.replace(" ", "T")).toISOString(),
        valida_ate: new Date(end.replace(" ", "T")).toISOString(),
      });
      await q.load();
      setMessage(
        "Restrição temporária programada. Ela só participará das análises durante a vigência.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Falha ao programar restrição",
      );
    }
  };
  const limit = (x: ApiValue) =>
    x.limite_altura != null
      ? `${x.limite_altura} m de altura`
      : x.limite_largura != null
        ? `${x.limite_largura} m de largura`
        : x.limite_peso != null
          ? `${x.limite_peso} t de peso`
          : "Limite ainda não confirmado";
  const category = (x: ApiValue) =>
      x.tags?.classificacao_triagem || "inventario",
    order: ApiValue = {
      alta_prioridade: 0,
      divergencia_fontes: 1,
      possivel_risco: 2,
      inventario: 3,
    };
  const shownCandidates = [...candidates]
    .filter(
      (x: ApiValue) =>
        triageFilter === "todas" ||
        (triageFilter === "atencao"
          ? category(x) !== "inventario"
          : category(x) === triageFilter),
    )
    .sort(
      (a: ApiValue, b: ApiValue) =>
        (order[category(a)] ?? 9) - (order[category(b)] ?? 9),
    );
  const categoryLabel: ApiValue = {
    alta_prioridade: "Alta prioridade",
    divergencia_fontes: "Divergência entre fontes",
    possivel_risco: "Possível risco",
    inventario: "Inventário",
  };
  return (
    <Shell
      title="Restrições de Rotas"
      desc="Varredura de viagens com infraestrutura oficial da ANTT e validação operacional."
      icon={<Navigation className="h-5 w-5" />}
    >
      <section className={`${card} mb-4 p-4`}>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="text-xs text-muted-foreground">
            Viagem ou rota para analisar
            <select
              className={`${input} mt-1`}
              value={tripId}
              onChange={async (e) => {
                setTripId(e.target.value);
                setMessage("");
                await loadCandidates(e.target.value);
              }}
            >
              <option value="">Selecione uma viagem</option>
              {trips.items.map((x: ApiValue) => (
                <option key={x.id} value={x.id}>
                  {x.placa || x.veiculo_placa || `Viagem ${x.id}`} ·{" "}
                  {x.origem || "-"} → {x.destino || "-"} · {x.status}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!tripId || busy}
            onClick={scan}
            className={`${btn} self-end flex items-center justify-center gap-2`}
          >
            <Radar className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
            {busy ? "Analisando ANTT..." : "Executar varredura ANTT"}
          </button>
        </div>
        {message && (
          <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
            {message}
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          A varredura identifica estruturas próximas da geometria da rota. Dados
          da ANTT geram candidatos; somente uma validação humana com
          limite/evidência confirmados passa a interferir no roteamento.
        </p>
      </section>
      {tripId && (
        <div className="mb-4 overflow-hidden rounded-xl">
          <LiveMap
            items={candidates.map((x: ApiValue) => ({
              ...x,
              nome: x.nome || x.tipo,
              lon: x.lng,
            }))}
            geojson={route}
          />
        </div>
      )}
      {candidates.length > 0 && (
        <section className="mb-5">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <h3 className="font-semibold">Triagem para validação humana</h3>
              <p className="text-xs text-muted-foreground">
                Nenhuma classificação confirma a restrição ou bloqueia a rota
                automaticamente.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {(
                [
                  ["atencao", "Requer atenção"],
                  ["alta_prioridade", "Alta prioridade"],
                  ["divergencia_fontes", "Divergências"],
                  ["possivel_risco", "Possíveis riscos"],
                  ["inventario", "Inventário"],
                  ["todas", "Todos"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTriageFilter(id)}
                  className={
                    (triageFilter === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground") +
                    " rounded-lg border px-3 py-2 text-xs"
                  }
                >
                  {label} (
                  {id === "todas"
                    ? candidates.length
                    : candidates.filter((x: ApiValue) =>
                        id === "atencao"
                          ? category(x) !== "inventario"
                          : category(x) === id,
                      ).length}
                  )
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shownCandidates.map((x: ApiValue) => (
              <article key={x.id} className={`${card} p-4`}>
                <div className="flex gap-3">
                  <span className="rounded-lg bg-guardian/10 p-2 text-guardian">
                    <Radar className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <b className="text-sm">{x.nome || x.tipo}</b>
                      <span className="rounded-full bg-status-atencao/10 px-2 py-1 text-[10px] uppercase text-status-atencao">
                        {categoryLabel[category(x)]}
                      </span>
                      <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] uppercase text-muted-foreground">
                        Validação humana obrigatória
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-primary">
                      {Math.round(Number(x.distancia_rota_km || 0) * 1000)} m da
                      rota · confiança {x.confianca || "-"}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[x.tags?.rodovia, x.tags?.km, x.tags?.sentido]
                        .filter(Boolean)
                        .join(" · ") || "Coordenadas oficiais ANTT"}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Fontes consultadas:{" "}
                      {(x.tags?.fontes_consultadas || ["ANTT"]).join(" + ")} ·{" "}
                      {x.tags?.correspondencias_osm?.length || 0}{" "}
                      correspondência(s) próxima(s)
                    </p>
                    {x.tags?.incompatibilidades?.length > 0 && (
                      <p className="mt-2 text-xs text-status-critico">
                        Possível incompatibilidade com o veículo/viagem.
                        Confirme o limite e a evidência antes de utilizar.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
                  {x.status_validacao === "descoberta" && (
                    <button
                      onClick={() => candidateAction(x, "confirmar")}
                      className="text-xs text-primary"
                    >
                      Confirmar existência
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(x);
                      setValidation({
                        ...validation,
                        limite_altura: x.limite_altura || "",
                        limite_largura: x.limite_largura || "",
                        limite_comprimento: x.limite_comprimento || "",
                        limite_peso: x.limite_peso || "",
                        limite_eixo: x.limite_eixo || "",
                      });
                    }}
                    className="text-xs text-status-normal"
                  >
                    Validar para roteamento
                  </button>
                  {x.status_validacao !== "rejeitada" && (
                    <button
                      onClick={() => candidateAction(x, "rejeitar")}
                      className="text-xs text-status-critico"
                    >
                      Rejeitar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {shownCandidates.length === 0 && (
            <div className={`${card} p-5 text-sm text-muted-foreground`}>
              Nenhum candidato nesta categoria.
            </div>
          )}
        </section>
      )}
      {editing && (
        <section className={`${card} mb-5 p-5`}>
          <div className="flex items-center">
            <div>
              <h3 className="font-semibold">Validar restrição</h3>
              <p className="text-xs text-muted-foreground">
                {editing.nome || editing.tipo} · informe somente valores
                confirmados.
              </p>
            </div>
            <button
              onClick={() => setEditing(null)}
              className="ml-auto text-xs text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(
              [
                ["limite_altura", "Altura (m)"],
                ["limite_largura", "Largura (m)"],
                ["limite_comprimento", "Comprimento (m)"],
                ["limite_peso", "Peso (t)"],
                ["limite_eixo", "Peso por eixo (t)"],
                ["valida_dias", "Validade (dias)"],
              ] as const
            ).map(([k, l]) => (
              <Field
                key={k}
                label={l}
                type="number"
                value={validation[k]}
                set={(v: ApiValue) => setValidation({ ...validation, [k]: v })}
              />
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label="URL da evidência"
              value={validation.evidencia_url}
              set={(v: ApiValue) =>
                setValidation({ ...validation, evidencia_url: v })
              }
            />
            <Field
              label="Observação técnica"
              value={validation.observacao}
              set={(v: ApiValue) =>
                setValidation({ ...validation, observacao: v })
              }
            />
          </div>
          <button disabled={busy} onClick={validate} className={`${btn} mt-4`}>
            Confirmar e adicionar à base global
          </button>
        </section>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <b className="mr-2 self-center text-sm">Base global validada</b>
        {(
          [
            ["todas", "Todas"],
            ["altura", "Altura"],
            ["largura", "Largura"],
            ["peso", "Peso"],
            ["ponte", "Pontes"],
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
        <button
          onClick={q.load}
          className="ml-auto rounded-lg border border-border p-2"
        >
          <RefreshCw className={`h-4 w-4 ${q.loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((x: ApiValue) => (
          <article key={x.id} className={`${card} p-4`}>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-status-atencao/10 p-2 text-status-atencao">
                <Navigation className="h-4 w-4" />
              </span>
              <div>
                <div className="flex flex-wrap gap-2">
                  <b className="text-sm">{x.nome || x.tipo || "Restrição"}</b>
                  <span
                    className={
                      (x.natureza === "temporaria"
                        ? "bg-status-atencao/10 text-status-atencao"
                        : "bg-surface-2 text-muted-foreground") +
                      " rounded-full px-2 py-1 text-[10px] uppercase"
                    }
                  >
                    {x.natureza || "definitiva"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-primary">{limit(x)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[x.rodovia, x.km, x.sentido].filter(Boolean).join(" · ") ||
                    "Localização por coordenadas"}
                </p>
                <p className="mt-2 text-[10px] uppercase text-muted-foreground">
                  Fonte: {x.fonte || "não informada"} · Confiança:{" "}
                  {x.confianca ?? "-"}%
                </p>
                {x.natureza === "temporaria" && (
                  <p className="mt-2 text-xs text-status-atencao">
                    Vigência:{" "}
                    {x.vigencia_inicio
                      ? new Date(x.vigencia_inicio).toLocaleString("pt-BR")
                      : "imediata"}{" "}
                    até{" "}
                    {x.valida_ate
                      ? new Date(x.valida_ate).toLocaleString("pt-BR")
                      : "sem término"}
                  </p>
                )}
                <button
                  onClick={() => setTemporary(x)}
                  className="mt-3 text-xs text-primary"
                >
                  Programar restrição temporária
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}
