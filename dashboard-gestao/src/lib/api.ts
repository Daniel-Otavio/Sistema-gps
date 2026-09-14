export const API_BASE =
  import.meta.env["VITE_API_BASE"] || "https://sistema-gps-cpf7.onrender.com";
export type DashboardUser = {
  id?: string | number;
  nome?: string;
  tipo?: string;
  perfil?: string;
  empresa?: string;
  id_empresa?: string | number;
  [key: string]: ApiValue;
};
export type Session = {
  token: string;
  csrfToken?: string;
  usuario: DashboardUser;
};
export type AreaStatus = {
  estado: "carregando" | "disponivel" | "vazio" | "erro";
  mensagem?: string;
};
export type ApiData = {
  veiculos: ApiValue[];
  motoristas: ApiValue[];
  viagens: ApiValue[];
  localizacoes: ApiValue[];
  alertas: ApiValue[];
  reportes: ApiValue[];
  rotas: ApiValue[];
  status?: Record<string, AreaStatus>;
};
const KEY = "gps-caminhao-gestor-session";
export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const atual = JSON.parse(
      sessionStorage.getItem(KEY) || "null",
    ) as Session | null;
    if (atual && !atual.csrfToken) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return atual ? { ...atual, token: "" } : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) sessionStorage.setItem(KEY, JSON.stringify({ ...s, token: "" }));
  else sessionStorage.removeItem(KEY);
}
async function request<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const r = await fetch(API_BASE + path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Type": "dashboard",
      ...(token ? { Authorization: token } : {}),
      ...(!["GET", "HEAD"].includes((init.method || "GET").toUpperCase()) &&
      readSession()?.csrfToken
        ? { "X-CSRF-Token": readSession()!.csrfToken! }
        : {}),
      ...init.headers,
    },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      [b.erro, b.detalhe].filter(Boolean).join(": ") || "Erro HTTP " + r.status,
    );
  return b;
}
export async function login(
  login: string,
  senha: string,
  empresa?: string,
): Promise<Session> {
  const empresarial = Boolean(empresa?.trim());
  const d = await request<ApiValue>(
    empresarial ? "/integracoes/portal/login" : "/login",
    undefined,
    {
      method: "POST",
      body: JSON.stringify(
        empresarial
          ? { empresa: empresa!.trim(), email: login, senha }
          : { login, senha },
      ),
    },
  );
  if (!["admin", "empresa_usuario"].includes(d.usuario?.tipo))
    throw new Error("Este usuário não possui acesso ao painel.");
  const s = { token: "", csrfToken: d.csrfToken, usuario: d.usuario };
  saveSession(s);
  return s;
}
export async function loadDashboard(
  token: string,
  usuario?: DashboardUser,
): Promise<ApiData> {
  if (usuario?.tipo === "empresa_usuario") {
    const paths = [
      "/integracoes/portal/diagnostico",
      "/integracoes/portal/motoristas",
      "/integracoes/portal/viagens",
      "/integracoes/portal/alertas",
      "/integracoes/portal/reportes",
      "/integracoes/portal/rotas",
    ];
    const rs = await Promise.allSettled(
      paths.map((p) => request<ApiValue>(p, token)),
    );
    if (rs.every((r) => r.status === "rejected"))
      throw (rs[0] as PromiseRejectedResult).reason;
    const value = (i: number) =>
      rs[i]!.status === "fulfilled"
        ? (rs[i] as PromiseFulfilledResult<ApiValue>).value
        : null;
    const diagnostico = value(0) || {};
    const list = (i: number) => (Array.isArray(value(i)) ? value(i) : []);
    const nomes = [
      "localização",
      "motoristas",
      "viagens",
      "alertas",
      "reportes",
      "rotas",
    ];
    const status = Object.fromEntries(
      rs.map((r, i) => [
        nomes[i],
        r.status === "fulfilled"
          ? {
              estado:
                (Array.isArray((r as PromiseFulfilledResult<unknown>).value) &&
                  (r as PromiseFulfilledResult<unknown[]>).value.length ===
                    0) ||
                (i === 0 &&
                  Array.isArray(
                    (r as PromiseFulfilledResult<ApiValue>).value?.veiculos,
                  ) &&
                  (r as PromiseFulfilledResult<ApiValue>).value.veiculos
                    .length === 0)
                  ? "vazio"
                  : "disponivel",
            }
          : {
              estado: "erro",
              mensagem:
                (r as PromiseRejectedResult).reason?.message ||
                "Falha ao carregar",
            },
      ]),
    );
    return {
      veiculos: diagnostico.veiculos || [],
      localizacoes: diagnostico.veiculos || [],
      motoristas: list(1),
      viagens: list(2),
      alertas: list(3),
      reportes: list(4),
      rotas: list(5),
      status,
    };
  }
  const paths = [
    "/veiculos",
    "/motoristas",
    "/monitoramento/viagens",
    "/localizacoes",
    "/alertas",
    "/reportes",
    "/rotas",
  ];
  const rs = await Promise.allSettled(
    paths.map((p) => request<ApiValue[]>(p, token)),
  );
  const val = (i: number) =>
    rs[i]!.status === "fulfilled" &&
    Array.isArray((rs[i] as PromiseFulfilledResult<ApiValue[]>).value)
      ? (rs[i] as PromiseFulfilledResult<ApiValue[]>).value
      : [];
  if (rs.every((r) => r.status === "rejected"))
    throw (rs[0] as PromiseRejectedResult).reason;
  const nomes = [
    "veículos",
    "motoristas",
    "viagens",
    "localizações",
    "alertas",
    "reportes",
    "rotas",
  ];
  const status = Object.fromEntries(
    rs.map((r, i) => [
      nomes[i],
      r.status === "fulfilled"
        ? {
            estado:
              Array.isArray((r as PromiseFulfilledResult<unknown>).value) &&
              (r as PromiseFulfilledResult<unknown[]>).value.length === 0
                ? "vazio"
                : "disponivel",
          }
        : {
            estado: "erro",
            mensagem:
              (r as PromiseRejectedResult).reason?.message ||
              "Falha ao carregar",
          },
    ]),
  );
  return {
    veiculos: val(0),
    motoristas: val(1),
    viagens: val(2),
    localizacoes: val(3),
    alertas: val(4),
    reportes: val(5),
    rotas: val(6),
    status,
  };
}

export async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  return request<T>(path, token, init);
}
export async function logout(token: string): Promise<void> {
  await request("/auth/logout", token, { method: "POST" }).catch(() => {});
  saveSession(null);
}
