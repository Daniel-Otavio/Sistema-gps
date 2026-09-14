import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api";

export type P = {
  section: string;
  token: string;
  data: ApiValue;
  refreshDashboard: () => Promise<void>;
  usuario?: {
    id?: string | number;
    nome?: string;
    tipo?: string;
    perfil?: string;
    empresa?: string;
    id_empresa?: string | number;
    [key: string]: ApiValue;
  };
};
export const card = "rounded-xl border border-border bg-card shadow-card",
  input =
    "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary",
  btn =
    "rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50",
  muted = "text-xs text-muted-foreground";
export function useLoad(token: string, path: string, seed: ApiValue[] = []) {
  const [items, setItems] = useState(seed),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const x = await apiRequest<ApiValue>(path, token);
      setItems(Array.isArray(x) ? x : []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [path, token]);
  useEffect(() => {
    load();
  }, [load]);
  return { items, loading, error, load };
}
export const act = (
  token: string,
  path: string,
  method = "GET",
  body?: ApiValue,
) =>
  apiRequest<ApiValue>(path, token, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
export function Shell({ title, desc, icon, actions, children }: ApiValue) {
  return (
    <main className="flex-1 overflow-y-auto p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="rounded-lg bg-primary/15 p-2 text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className={muted}>{desc}</p>
        </div>
        <div className="ml-auto">{actions}</div>
      </div>
      {children}
    </main>
  );
}
export function Note({ q }: ApiValue) {
  return q.error ? (
    <p className="mb-4 rounded-lg bg-status-critico/10 p-3 text-sm text-status-critico">
      {q.error}
    </p>
  ) : q.loading ? (
    <p className="mb-4 text-sm text-muted-foreground">
      <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
      Carregando...
    </p>
  ) : null;
}
export function Field({ label, value, set, type = "text" }: ApiValue) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        required
        className={input + " mt-1"}
        type={type}
        step={type === "number" ? "ApiValue" : undefined}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
export function Select({ label, value, set, items, text }: ApiValue) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <select
        required
        className={input + " mt-1"}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">Selecione</option>
        {items.map((x: ApiValue) => (
          <option key={x.id} value={x.id}>
            {text(x)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Cards({ items, title, detail, actions }: ApiValue) {
  return (
    <div className="grid content-start auto-rows-max gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
      {items.map((x: ApiValue, i: number) => (
        <article
          className="group self-start rounded-lg border border-border/80 bg-gradient-to-br from-card to-surface-2/55 p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
          key={x.id || i}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-primary/70 transition-colors group-hover:bg-primary" />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold tracking-[0.01em]">
                {title(x)}
              </b>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                {detail(x)}
              </p>
            </div>
          </div>
          {actions && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5 [&>button]:rounded-md [&>button]:bg-white/[0.035] [&>button]:px-2.5 [&>button]:py-1.5 [&>button]:font-medium [&>button]:transition-colors [&>button]:hover:bg-white/[0.075]">
              {actions(x)}
            </div>
          )}
        </article>
      ))}
      {!items.length && (
        <p className="text-sm text-muted-foreground">Nenhum registro.</p>
      )}
    </div>
  );
}
