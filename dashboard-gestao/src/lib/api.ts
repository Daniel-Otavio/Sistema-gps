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
  void usuario;
  return request<ApiData>("/dashboard/resumo", token);
}

export async function loadDashboardLocations(
  token: string,
): Promise<ApiValue[]> {
  return request<ApiValue[]>("/dashboard/localizacoes", token);
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
