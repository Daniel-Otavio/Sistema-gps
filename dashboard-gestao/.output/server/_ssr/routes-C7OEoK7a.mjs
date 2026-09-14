import { r as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime, r as require_react } from "../_libs/react+tanstack__react-query.mjs";
import { A as Activity, C as CircleX, D as Ban, E as ChevronDown, O as BadgeCheck, S as Clock3, T as ChevronUp, _ as History, a as ShieldAlert, b as FileText, c as Route, d as Radar, f as Network, g as LayoutDashboard, h as LogOut, i as ShieldCheck, k as Archive, l as RefreshCw, m as MapPin, n as Truck, o as Settings, p as Navigation, r as TriangleAlert, s as Server, t as UserCog, u as Radio, v as HeartPulse, w as CircleCheck, x as Database, y as Gauge } from "../_libs/lucide-react.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-C7OEoK7a.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var logo_shield_default = "/assets/logo-shield-BKD2o-91.png";
var operacao = [
	{
		id: "rotas",
		label: "Rotas",
		icon: Route
	},
	{
		id: "frota",
		label: "Frota",
		icon: Truck,
		children: [{
			id: "cadastro",
			label: "Cadastro"
		}, {
			id: "viagens",
			label: "Viagens"
		}]
	},
	{
		id: "localizacao",
		label: "Localização",
		icon: MapPin,
		badge: {
			text: "Ao vivo",
			tone: "live"
		}
	},
	{
		id: "reportes",
		label: "Reportes",
		icon: FileText
	},
	{
		id: "restricao",
		label: "Restrição de Rotas",
		icon: Ban
	},
	{
		id: "guardiao",
		label: "Guardião",
		icon: ShieldAlert,
		badge: {
			text: "NOVO",
			tone: "new"
		}
	}
];
var inteligencia = [
	{
		id: "alertas",
		label: "Central de Alertas",
		icon: TriangleAlert,
		badge: {
			text: "0",
			tone: "danger"
		}
	},
	{
		id: "caixa-preta",
		label: "Caixa-preta",
		icon: Archive
	},
	{
		id: "passaporte",
		label: "Passaporte Digital",
		icon: BadgeCheck
	}
];
var configuracoes = [
	{
		id: "saude",
		label: "Saúde do Sistema",
		icon: HeartPulse
	},
	{
		id: "usuarios",
		label: "Usuários",
		icon: UserCog
	},
	{
		id: "config",
		label: "Configurações",
		icon: Settings
	}
];
function BadgePill({ badge }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("ml-auto rounded-full px-2 py-[2px] text-[10px] font-semibold leading-none", badge.tone === "live" && "bg-status-normal/15 text-status-normal", badge.tone === "new" && "bg-guardian/20 text-guardian", badge.tone === "danger" && "bg-status-critico/20 text-status-critico"),
		children: badge.text
	});
}
function SectionLabel({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-5 pb-2 pt-5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/70",
		children
	});
}
function Sidebar({ onNavigate, alertCount = 0, activeId, usuario }) {
	const [active, setActive] = (0, import_react.useState)("dashboard");
	const [openFrota, setOpenFrota] = (0, import_react.useState)(true);
	const empresarial = usuario?.tipo === "empresa_usuario";
	const permitidosEmpresa = /* @__PURE__ */ new Set([
		"rotas",
		"frota",
		"localizacao",
		"reportes",
		"restricao",
		"guardiao",
		"alertas",
		"caixa-preta"
	]);
	const renderItem = (item) => {
		const Icon = item.icon;
		const isActive = (activeId ?? active) === item.id;
		const visibleChildren = empresarial ? item.children?.filter((child) => child.id === "viagens") : item.children;
		const expandable = !!visibleChildren?.length;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			onClick: () => {
				setActive(item.id);
				if (!expandable) onNavigate?.(item.id === "restricao" ? "restricoes" : item.id === "caixa-preta" ? "auditoria" : item.id === "passaporte" ? "validadas" : item.id === "usuarios" || item.id === "config" ? "dashboard" : item.id);
				if (expandable) setOpenFrota((v) => !v);
			},
			className: cn("flex w-full items-center gap-3 px-5 py-[9px] text-[13px] transition-colors", isActive ? "bg-sidebar-accent text-foreground" : "text-slate-300 hover:bg-sidebar-accent/60 hover:text-foreground"),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-[15px] w-[15px] shrink-0 text-slate-400" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "truncate",
					children: item.label
				}),
				item.badge && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BadgePill, { badge: item.id === "alertas" ? {
					...item.badge,
					text: String(alertCount)
				} : item.badge }),
				expandable && (openFrota ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronUp, { className: "ml-auto h-[14px] w-[14px] text-slate-500" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "ml-auto h-[14px] w-[14px] text-slate-500" }))
			]
		}), expandable && openFrota && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: visibleChildren.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			onClick: () => {
				setActive(c.id);
				onNavigate?.(c.id === "cadastro" ? "veiculos" : c.id);
			},
			className: cn("block w-full px-5 py-[7px] pl-[52px] text-left text-[12.5px] transition-colors", (activeId ?? active) === (c.id === "cadastro" ? "veiculos" : c.id) ? "text-primary" : "text-slate-400 hover:text-foreground"),
			children: c.label
		}, c.id)) })] }, item.id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "flex h-screen w-[230px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-[10px] px-4 py-[18px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: logo_shield_default,
					alt: "Logotipo GPS Caminhão",
					className: "h-9 w-9",
					width: 72,
					height: 72
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "leading-none",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[15px] font-extrabold tracking-tight text-foreground",
						children: "GPS CAMINHÃO"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-[3px] text-[10px] font-bold tracking-[0.18em] text-brand",
						children: "GESTOR"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: () => {
					setActive("dashboard");
					onNavigate?.("dashboard");
				},
				className: cn("mx-3 flex items-center gap-3 rounded-md px-3 py-[10px] text-[13px] font-medium transition-colors", (activeId ?? active) === "dashboard" ? "bg-primary/15 text-primary" : "text-slate-300 hover:bg-sidebar-accent"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LayoutDashboard, { className: "h-[16px] w-[16px]" }), "Dashboard"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionLabel, { children: "OPERAÇÃO" }),
			(empresarial ? operacao.filter((item) => permitidosEmpresa.has(item.id)) : operacao).map(renderItem),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionLabel, { children: "INTELIGÊNCIA" }),
			(empresarial ? inteligencia.filter((item) => permitidosEmpresa.has(item.id)) : inteligencia).map(renderItem),
			!empresarial && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionLabel, { children: "CONFIGURAÇÕES" }),
			!empresarial && configuracoes.map(renderItem),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-6" })
		]
	});
}
var icons = {
	truck: Truck,
	route: Route,
	alert: TriangleAlert,
	network: Network,
	gauge: Gauge
};
var tones = {
	primary: {
		icon: "bg-primary/15 text-primary",
		bar: "bg-primary"
	},
	normal: {
		icon: "bg-status-normal/15 text-status-normal",
		bar: "bg-status-normal"
	},
	guardiao: {
		icon: "bg-guardian/15 text-guardian",
		bar: "bg-guardian"
	},
	alerta: {
		icon: "bg-status-alerta/15 text-status-alerta",
		bar: "bg-status-alerta"
	},
	turquoise: {
		icon: "bg-turquoise/15 text-turquoise",
		bar: "bg-turquoise"
	}
};
function MetricCard({ metric }) {
	const Icon = icons[metric.icon];
	const tone = tones[metric.tone];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-[10px] border border-border bg-card px-4 py-[15px] shadow-card transition-colors hover:border-white/15",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: cn("flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg", tone.icon),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-[19px] w-[19px]" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "truncate text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground",
						children: metric.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-[6px] text-[27px] font-bold leading-none text-foreground",
						children: [metric.value, metric.unit && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "ml-1 text-[15px] font-semibold",
							children: metric.unit
						})]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-[10px] text-[11.5px] text-muted-foreground",
				children: metric.sub
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-[9px] h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("h-full rounded-full", tone.bar),
					style: { width: `${metric.progress}%` }
				})
			})
		]
	});
}
var API_BASE = {
	"BASE_URL": "/",
	"DEV": false,
	"MODE": "production",
	"PROD": true,
	"SSR": true,
	"TSS_DEV_SERVER": "false",
	"TSS_DEV_SSR_STYLES_BASEPATH": "/",
	"TSS_DEV_SSR_STYLES_ENABLED": "true",
	"TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": "false",
	"TSS_INLINE_CSS_ENABLED": "false",
	"TSS_ROUTER_BASEPATH": "",
	"TSS_SERVER_FN_BASE": "/_serverFn/"
}["VITE_API_BASE"] || "https://sistema-gps-cpf7.onrender.com";
var KEY = "gps-caminhao-gestor-session";
function readSession() {
	if (typeof window === "undefined") return null;
	try {
		const atual = JSON.parse(sessionStorage.getItem(KEY) || "null");
		if (atual && !atual.csrfToken) {
			sessionStorage.removeItem(KEY);
			return null;
		}
		return atual ? {
			...atual,
			token: ""
		} : null;
	} catch {
		return null;
	}
}
function saveSession(s) {
	if (typeof window === "undefined") return;
	if (s) sessionStorage.setItem(KEY, JSON.stringify({
		...s,
		token: ""
	}));
	else sessionStorage.removeItem(KEY);
}
async function request(path, token, init = {}) {
	const r = await fetch(API_BASE + path, {
		...init,
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			"X-Client-Type": "dashboard",
			...token ? { Authorization: token } : {},
			...!["GET", "HEAD"].includes((init.method || "GET").toUpperCase()) && readSession()?.csrfToken ? { "X-CSRF-Token": readSession().csrfToken } : {},
			...init.headers
		}
	});
	const b = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error([b.erro, b.detalhe].filter(Boolean).join(": ") || "Erro HTTP " + r.status);
	return b;
}
async function login(login, senha, empresa) {
	const empresarial = Boolean(empresa?.trim());
	const d = await request(empresarial ? "/integracoes/portal/login" : "/login", void 0, {
		method: "POST",
		body: JSON.stringify(empresarial ? {
			empresa: empresa.trim(),
			email: login,
			senha
		} : {
			login,
			senha
		})
	});
	if (!["admin", "empresa_usuario"].includes(d.usuario?.tipo)) throw new Error("Este usuário não possui acesso ao painel.");
	const s = {
		token: "",
		csrfToken: d.csrfToken,
		usuario: d.usuario
	};
	saveSession(s);
	return s;
}
async function loadDashboard(token, usuario) {
	if (usuario?.tipo === "empresa_usuario") {
		const rs = await Promise.allSettled([
			"/integracoes/portal/diagnostico",
			"/integracoes/portal/motoristas",
			"/integracoes/portal/viagens",
			"/integracoes/portal/alertas",
			"/integracoes/portal/reportes",
			"/integracoes/portal/rotas"
		].map((p) => request(p, token)));
		if (rs.every((r) => r.status === "rejected")) throw rs[0].reason;
		const value = (i) => rs[i].status === "fulfilled" ? rs[i].value : null;
		const diagnostico = value(0) || {};
		const list = (i) => Array.isArray(value(i)) ? value(i) : [];
		const nomes = [
			"localização",
			"motoristas",
			"viagens",
			"alertas",
			"reportes",
			"rotas"
		];
		const status = Object.fromEntries(rs.map((r, i) => [nomes[i], r.status === "fulfilled" ? { estado: Array.isArray(r.value) && r.value.length === 0 || i === 0 && Array.isArray(r.value?.veiculos) && r.value.veiculos.length === 0 ? "vazio" : "disponivel" } : {
			estado: "erro",
			mensagem: r.reason?.message || "Falha ao carregar"
		}]));
		return {
			veiculos: diagnostico.veiculos || [],
			localizacoes: diagnostico.veiculos || [],
			motoristas: list(1),
			viagens: list(2),
			alertas: list(3),
			reportes: list(4),
			rotas: list(5),
			status
		};
	}
	const rs = await Promise.allSettled([
		"/veiculos",
		"/motoristas",
		"/monitoramento/viagens",
		"/localizacoes",
		"/alertas",
		"/reportes",
		"/rotas"
	].map((p) => request(p, token)));
	const val = (i) => rs[i].status === "fulfilled" && Array.isArray(rs[i].value) ? rs[i].value : [];
	if (rs.every((r) => r.status === "rejected")) throw rs[0].reason;
	const nomes = [
		"veículos",
		"motoristas",
		"viagens",
		"localizações",
		"alertas",
		"reportes",
		"rotas"
	];
	const status = Object.fromEntries(rs.map((r, i) => [nomes[i], r.status === "fulfilled" ? { estado: Array.isArray(r.value) && r.value.length === 0 ? "vazio" : "disponivel" } : {
		estado: "erro",
		mensagem: r.reason?.message || "Falha ao carregar"
	}]));
	return {
		veiculos: val(0),
		motoristas: val(1),
		viagens: val(2),
		localizacoes: val(3),
		alertas: val(4),
		reportes: val(5),
		rotas: val(6),
		status
	};
}
async function apiRequest(path, token, init = {}) {
	return request(path, token, init);
}
async function logout(token) {
	await request("/auth/logout", token, { method: "POST" }).catch(() => {});
	saveSession(null);
}
var card$1 = "rounded-xl border border-border bg-card";
var date = (v) => v ? new Date(v).toLocaleString("pt-BR") : "Sem registro";
var statusLabel = (v) => ({
	operacional: "Operacional",
	atencao: "Atenção",
	offline: "Offline",
	erro: "Erro",
	sem_dados: "Sem dados",
	nunca_conectou: "Nunca conectou"
})[v] || v;
var tone = (v) => v === "operacional" ? "text-status-normal bg-status-normal/10 border-status-normal/25" : v === "atencao" || v === "sem_dados" || v === "nunca_conectou" ? "text-status-atencao bg-status-atencao/10 border-status-atencao/25" : "text-status-critico bg-status-critico/10 border-status-critico/25";
function SystemHealthPanel({ token }) {
	const [data, setData] = (0, import_react.useState)(null), [notifications, setNotifications] = (0, import_react.useState)(null), [error, setError] = (0, import_react.useState)(""), [busy, setBusy] = (0, import_react.useState)(false), [filter, setFilter] = (0, import_react.useState)("todos");
	const load = (0, import_react.useCallback)(async () => {
		setBusy(true);
		try {
			const [health, outbox] = await Promise.all([apiRequest("/admin/saude-sistema", token), apiRequest("/notificacoes/diagnostico", token)]);
			setData(health);
			setNotifications(outbox);
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Falha ao consultar saúde");
		} finally {
			setBusy(false);
		}
	}, [token]);
	(0, import_react.useEffect)(() => {
		load();
		const id = setInterval(load, 15e3);
		return () => clearInterval(id);
	}, [load]);
	const events = (0, import_react.useMemo)(() => data?.eventos?.filter((e) => filter === "todos" || (filter === "problemas" ? ["error", "warn"].includes(e.nivel) : e.origem === filter)) || [], [data, filter]);
	const services = [
		{
			id: "api",
			name: "API",
			icon: Server,
			detail: `Resposta do diagnóstico: ${data?.tempo_resposta_ms ?? "-"} ms`
		},
		{
			id: "banco",
			name: "Banco de dados",
			icon: Database,
			detail: "Conexão e consultas PostgreSQL"
		},
		{
			id: "telemetria",
			name: "Telemetria",
			icon: Radio,
			detail: `Última posição: ${date(data?.servicos?.["telemetria"]?.ultima_posicao)}`
		},
		{
			id: "guardiao",
			name: "Guardião",
			icon: ShieldCheck,
			detail: `Última análise: ${date(data?.servicos?.["guardiao"]?.ultima_analise)}`
		}
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex-1 overflow-y-auto p-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-5 flex items-center gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-xl bg-primary/15 p-3 text-primary",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: "h-5 w-5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-xl font-bold",
						children: "Saúde do Sistema"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted-foreground",
						children: "Operação, integrações e processamento em tempo real."
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: load,
						className: "ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: `h-4 w-4 ${busy ? "animate-spin" : ""}` }), "Atualizar"]
					})
				]
			}),
			error && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 rounded-xl border border-status-critico/30 bg-status-critico/10 p-4 text-sm text-status-critico",
				children: [
					"A consulta falhou: ",
					error,
					". Possível causa: API indisponível, sessão expirada ou banco sem conexão."
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
				children: services.map((s) => {
					const st = data?.servicos?.[s.id]?.status || "sem_dados", Icon = s.icon;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: `${card$1} p-4`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-lg bg-surface-2 p-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-5 w-5" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `ml-auto rounded-full border px-2 py-1 text-[10px] font-bold ${tone(st)}`,
									children: statusLabel(st)
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "mt-4 font-semibold",
								children: s.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-xs text-muted-foreground",
								children: s.detail
							})
						]
					}, s.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5",
				children: [
					["Posições · 15 min", data?.metricas?.["requisicoes_15m"] || 0],
					["Sucessos", data?.metricas?.["sucessos_15m"] || 0],
					["Falhas", data?.metricas?.["falhas_15m"] || 0],
					["Latência média", `${data?.metricas?.["latencia_media_ms"] || 0} ms`],
					["Latência P95", `${data?.metricas?.["latencia_p95_ms"] || 0} ms`]
				].map(([a, b]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `${card$1} p-4`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-wide text-muted-foreground",
						children: a
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
						className: "mt-2 block text-2xl",
						children: b
					})]
				}, String(a)))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: `${card$1} mt-4`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center border-b border-border p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Entrega de notificações" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-muted-foreground",
						children: [
							"Painel ",
							notifications?.canais?.painel ? "ativo" : "inativo",
							" · webhook",
							" ",
							notifications?.canais?.webhook ? "ativo" : "não configurado",
							" · e-mail",
							" ",
							notifications?.canais?.email ? "ativo" : "não configurado"
						]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "ml-auto flex gap-2",
						children: (notifications?.resumo || []).map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: `rounded-full border px-2 py-1 text-[10px] ${x.status === "falhou" ? tone("erro") : tone("operacional")}`,
							children: [
								x.status,
								": ",
								x.total
							]
						}, x.status))
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "max-h-64 overflow-y-auto",
					children: [(notifications?.recentes || []).slice(0, 20).map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3 border-b border-border/70 p-3 text-xs",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: n.tipo }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-muted-foreground",
									children: [
										n.canal,
										" · ",
										date(n.criado_em),
										" · ",
										n.tentativas,
										" tentativa(s)"
									]
								}),
								n.ultimo_erro && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-status-critico",
									children: n.ultimo_erro
								})
							] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "ml-auto uppercase",
								children: n.status
							}),
							n.status === "falhou" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: "rounded-lg border border-primary px-3 py-2 text-primary",
								onClick: async () => {
									await apiRequest(`/notificacoes/${n.id}/reenviar`, token, { method: "POST" });
									load();
								},
								children: "Reenviar"
							})
						]
					}, n.id)), !notifications?.recentes?.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "p-4 text-xs text-muted-foreground",
						children: "Nenhuma notificação registrada."
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 grid gap-4 xl:grid-cols-[360px_1fr]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: card$1,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "border-b border-border p-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Empresas e conexões" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "max-h-[540px] overflow-y-auto",
						children: [data?.empresas?.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "border-b border-border/70 p-4 last:border-0",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
										className: "text-sm",
										children: e.nome
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `ml-auto rounded-full border px-2 py-1 text-[10px] ${tone(e.status_operacional)}`,
										children: statusLabel(e.status_operacional)
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-xs text-muted-foreground",
									children: [
										e.veiculos,
										" veículos · último envio ",
										date(e.ultimo_uso_em)
									]
								}),
								e.ultimo_erro && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-xs text-status-critico",
									children: e.ultimo_erro
								})
							]
						}, e.id)), !data?.empresas?.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "p-5 text-sm text-muted-foreground",
							children: "Nenhuma empresa integrada."
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: card$1,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2 border-b border-border p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Vida do sistema" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: "Processamentos, alertas e falhas mais recentes."
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: filter,
							onChange: (e) => setFilter(e.target.value),
							className: "ml-auto rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "todos",
									children: "Todos"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "problemas",
									children: "Somente problemas"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "gps_empresa",
									children: "GPS empresarial"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "guardiao",
									children: "Guardião"
								})
							]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "max-h-[540px] overflow-y-auto",
						children: [events.map((e, i) => {
							const bad = e.nivel === "error", warn = e.nivel === "warn";
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-3 border-b border-border/70 p-4 last:border-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(bad ? CircleX : warn ? TriangleAlert : CircleCheck, { className: `mt-0.5 h-4 w-4 shrink-0 ${bad ? "text-status-critico" : warn ? "text-status-atencao" : "text-status-normal"}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap items-center gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
													className: "text-xs uppercase",
													children: e.origem
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "flex items-center gap-1 text-[10px] text-muted-foreground",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock3, { className: "h-3 w-3" }), date(e.horario)]
												}),
												e.duracao_ms != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "text-[10px] text-muted-foreground",
													children: [e.duracao_ms, " ms"]
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 break-words text-sm",
											children: e.mensagem
										}),
										e.causa && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-1 text-xs text-status-atencao",
											children: ["Possível causa: ", e.causa]
										}),
										e.request_id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-1 font-mono text-[10px] text-muted-foreground",
											children: ["ID: ", e.request_id]
										})
									]
								})]
							}, `${e.horario}-${i}`);
						}), !events.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "p-5 text-sm text-muted-foreground",
							children: "Nenhum evento neste filtro."
						})]
					})]
				})]
			})
		]
	});
}
var card = "rounded-xl border border-border bg-card shadow-card";
var input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary";
var btn = "rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
var muted = "text-xs text-muted-foreground";
function useLoad(token, path, seed = []) {
	const [items, setItems] = (0, import_react.useState)(seed), [loading, setLoading] = (0, import_react.useState)(false), [error, setError] = (0, import_react.useState)("");
	const load = (0, import_react.useCallback)(async () => {
		setLoading(true);
		try {
			const x = await apiRequest(path, token);
			setItems(Array.isArray(x) ? x : []);
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro");
		} finally {
			setLoading(false);
		}
	}, [path, token]);
	(0, import_react.useEffect)(() => {
		load();
	}, [load]);
	return {
		items,
		loading,
		error,
		load
	};
}
var act = (token, path, method = "GET", body) => apiRequest(path, token, {
	method,
	...body === void 0 ? {} : { body: JSON.stringify(body) }
});
function Shell({ title, desc, icon, actions, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex-1 overflow-y-auto p-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-5 flex items-start gap-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-lg bg-primary/15 p-2 text-primary",
					children: icon
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-xl font-bold",
					children: title
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: muted,
					children: desc
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "ml-auto",
					children: actions
				})
			]
		}), children]
	});
}
function Note({ q }) {
	return q.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "mb-4 rounded-lg bg-status-critico/10 p-3 text-sm text-status-critico",
		children: q.error
	}) : q.loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "mb-4 text-sm text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "mr-2 inline h-4 w-4 animate-spin" }), "Carregando..."]
	}) : null;
}
function Field({ label, value, set, type = "text" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "text-xs text-muted-foreground",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			required: true,
			className: "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary mt-1",
			type,
			step: type === "number" ? "ApiValue" : void 0,
			value,
			onChange: (e) => set(e.target.value)
		})]
	});
}
function Select({ label, value, set, items, text }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block text-xs text-muted-foreground",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			required: true,
			className: "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary mt-1",
			value,
			onChange: (e) => set(e.target.value),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: "Selecione"
			}), items.map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: x.id,
				children: text(x)
			}, x.id))]
		})]
	});
}
function Cards({ items, title, detail, actions }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid content-start auto-rows-max gap-2.5 sm:grid-cols-2 2xl:grid-cols-3",
		children: [items.map((x, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
			className: "group self-start rounded-lg border border-border/80 bg-gradient-to-br from-card to-surface-2/55 p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start gap-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mt-0.5 h-8 w-1 shrink-0 rounded-full bg-primary/70 transition-colors group-hover:bg-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
						className: "block truncate text-[13px] font-semibold tracking-[0.01em]",
						children: title(x)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground",
						children: detail(x)
					})]
				})]
			}), actions && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5 [&>button]:rounded-md [&>button]:bg-white/[0.035] [&>button]:px-2.5 [&>button]:py-1.5 [&>button]:font-medium [&>button]:transition-colors [&>button]:hover:bg-white/[0.075]",
				children: actions(x)
			})]
		}, x.id || i)), !items.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted-foreground",
			children: "Nenhum registro."
		})]
	});
}
function Vehicles({ token, refreshDashboard }) {
	const q = useLoad(token, "/veiculos"), blank = {
		placa: "",
		frota: "",
		modelo: "",
		comprimento: 12,
		largura: 2.6,
		peso: 15,
		consumo_medio_km_l: 2.5,
		preco_combustivel_ref: "",
		tipo_combustivel: "diesel"
	};
	const [f, setF] = (0, import_react.useState)(blank), [edit, setEdit] = (0, import_react.useState)(null), [msg, setMsg] = (0, import_react.useState)("");
	async function save(e) {
		e.preventDefault();
		try {
			await act(token, edit ? "/veiculos/" + edit.id : "/veiculos", edit ? "PUT" : "POST", {
				...f,
				placa: f.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""),
				comprimento: +f.comprimento,
				largura: +f.largura,
				peso: +f.peso,
				consumo_medio_km_l: +f.consumo_medio_km_l || null,
				preco_combustivel_ref: +f.preco_combustivel_ref || null
			});
			setF(blank);
			setEdit(null);
			setMsg("Veículo salvo.");
			q.load();
			refreshDashboard();
		} catch (x) {
			setMsg(x instanceof Error ? x.message : "Erro");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Cadastro de veículos",
		desc: "Dimensões, consumo e disponibilidade da frota.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Truck, { className: "h-5 w-5" }),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Note, { q }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 xl:grid-cols-[400px_1fr]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: save,
				className: card + " grid grid-cols-2 gap-3 p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Placa",
						value: f.placa,
						set: (v) => setF({
							...f,
							placa: v
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Frota",
						value: f.frota,
						set: (v) => setF({
							...f,
							frota: v
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "col-span-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Modelo",
							value: f.modelo,
							set: (v) => setF({
								...f,
								modelo: v
							})
						})
					}),
					[
						"comprimento",
						"largura",
						"peso",
						"consumo_medio_km_l",
						"preco_combustivel_ref"
					].map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: k.replaceAll("_", " "),
						type: "number",
						value: f[k],
						set: (v) => setF({
							...f,
							[k]: v
						})
					}, k)),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						className: btn + " col-span-2",
						children: [edit ? "Atualizar" : "Cadastrar", " veículo"]
					}),
					msg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "col-span-2 text-xs text-primary",
						children: msg
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
				items: q.items,
				title: (v) => v.placa,
				detail: (v) => (v.modelo || "Sem modelo") + " · " + v.comprimento + "m × " + v.largura + "m · " + v.peso + "t",
				actions: (v) => [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-xs text-primary",
					onClick: () => {
						setEdit(v);
						setF({
							...blank,
							...v
						});
					},
					children: "Editar"
				}, "e"), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-xs text-status-atencao",
					onClick: async () => {
						await act(token, "/veiculos/" + v.id + "/status", "PATCH", { ativo: !v.ativo });
						q.load();
					},
					children: v.ativo ? "Desativar" : "Ativar"
				}, "s")]
			})]
		})]
	});
}
function LiveMap({ items = [], geojson, risks = [] }) {
	const host = (0, import_react.useRef)(null), mapRef = (0, import_react.useRef)(null), layerRef = (0, import_react.useRef)(null), hasInitialFitRef = (0, import_react.useRef)(false), routeViewRef = (0, import_react.useRef)("");
	(0, import_react.useEffect)(() => {
		let alive = true;
		(async () => {
			if (!host.current || mapRef.current) return;
			const L = await import("../_libs/leaflet.mjs").then((n) => /* @__PURE__ */ __toESM(n.t()));
			if (!alive || !host.current) return;
			const map = L.map(host.current, {
				zoomControl: false,
				attributionControl: true,
				maxZoom: 18,
				zoomSnap: 1
			}).setView([-19.394, -40.064], 13);
			L.control.zoom({ position: "topright" }).addTo(map);
			L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
				maxNativeZoom: 18,
				maxZoom: 18,
				attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics and the GIS User Community",
				className: "operational-map__satellite"
			}).addTo(map);
			L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
				maxNativeZoom: 18,
				maxZoom: 18,
				pane: "overlayPane",
				attribution: "Labels © Esri",
				className: "operational-map__labels"
			}).addTo(map);
			mapRef.current = map;
			layerRef.current = L.layerGroup().addTo(map);
			setTimeout(() => map.invalidateSize(), 50);
		})();
		return () => {
			alive = false;
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, []);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		(async () => {
			const map = mapRef.current, group = layerRef.current;
			if (!map || !group) return;
			const L = await import("../_libs/leaflet.mjs").then((n) => /* @__PURE__ */ __toESM(n.t()));
			if (cancelled) return;
			group.clearLayers();
			const bounds = [];
			for (const x of items) {
				const lat = +x.lat, lon = +(x.lon ?? x.lng);
				if (!isFinite(lat) || !isFinite(lon)) continue;
				const updatedAt = new Date(x.ultima_atualizacao || 0);
				const online = Number.isFinite(+updatedAt) && Date.now() - +updatedAt <= 300 * 1e3;
				L.circleMarker([lat, lon], {
					radius: 8,
					color: "#e2e8f0",
					weight: 2,
					fillColor: online ? "#22c55e" : "#f59e0b",
					fillOpacity: 1
				}).bindTooltip(`${String(x.placa || x.nome || "Veículo")}<br>${x.rota_nome || (x.origem && x.destino ? `${x.origem} → ${x.destino}` : "Posição atual")}<br>${online ? "GPS online" : "Última posição conhecida"}`, { direction: "top" }).addTo(group);
				bounds.push([lat, lon]);
			}
			for (const risk of risks) {
				const restriction = risk.dados?.restricao || risk.restricao || risk;
				const lat = Number(restriction.lat);
				const lon = Number(restriction.lng ?? restriction.lon);
				if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
				const critical = risk.nivel === "critico";
				const color = critical ? "#ef4444" : "#f59e0b";
				L.circle([lat, lon], {
					radius: Number(restriction.raio_metros || 180),
					color,
					weight: 1,
					fillColor: color,
					fillOpacity: .14
				}).addTo(group);
				L.circleMarker([lat, lon], {
					radius: critical ? 10 : 8,
					color: "#fff",
					weight: 2,
					fillColor: color,
					fillOpacity: 1
				}).bindTooltip(String(restriction.nome || restriction.rodovia || "Restrição à frente"), { direction: "top" }).addTo(group);
			}
			let shape = geojson;
			for (let pass = 0; pass < 2 && typeof shape === "string"; pass++) try {
				shape = JSON.parse(shape);
			} catch {
				shape = null;
			}
			if (["LineString", "MultiLineString"].includes(shape?.type)) shape = {
				type: "FeatureCollection",
				features: [{
					type: "Feature",
					properties: {},
					geometry: shape
				}]
			};
			else if (shape?.type === "Feature") shape = {
				type: "FeatureCollection",
				features: [shape]
			};
			if (shape?.features?.length) {
				const b = L.geoJSON(shape, {
					style: (feature) => {
						const tipo = feature?.properties?.tipo;
						return {
							color: tipo === "trajeto_realizado" ? "#22c55e" : tipo === "gps_bruto" ? "#94a3b8" : "#38bdf8",
							weight: tipo === "gps_bruto" ? 3 : 5,
							opacity: tipo === "gps_bruto" ? .55 : .95,
							dashArray: tipo === "gps_bruto" ? "6 7" : void 0,
							lineCap: "round",
							lineJoin: "round"
						};
					},
					onEachFeature: (feature, layer) => {
						const label = feature?.properties?.rota_nome || feature?.properties?.placa;
						if (label) layer.bindTooltip(`${label}${feature?.properties?.placa ? ` · ${feature.properties.placa}` : ""}`, { sticky: true });
					}
				}).addTo(group).getBounds();
				if (b.isValid()) {
					const routeView = JSON.stringify(shape);
					if (routeViewRef.current !== routeView) {
						map.fitBounds(b, { padding: [45, 45] });
						routeViewRef.current = routeView;
						hasInitialFitRef.current = true;
					}
					for (const feature of shape.features || []) {
						const geometry = feature?.geometry;
						let coordinates = geometry?.coordinates || [];
						if (geometry?.type === "MultiLineString") coordinates = coordinates.flat();
						const first = coordinates[0], last = coordinates[coordinates.length - 1];
						if (!Array.isArray(first) || !Array.isArray(last)) continue;
						L.circleMarker([first[1], first[0]], {
							radius: 7,
							color: "#fff",
							weight: 2,
							fillColor: "#22c55e",
							fillOpacity: 1
						}).bindTooltip(`Início · ${feature?.properties?.placa || feature?.properties?.rota_nome || "rota"}`, { direction: "top" }).addTo(group);
						L.circleMarker([last[1], last[0]], {
							radius: 7,
							color: "#fff",
							weight: 2,
							fillColor: "#ef4444",
							fillOpacity: 1
						}).bindTooltip(`Destino · ${feature?.properties?.placa || feature?.properties?.rota_nome || "rota"}`, { direction: "top" }).addTo(group);
					}
				}
			} else {
				routeViewRef.current = "";
				if (bounds.length && !hasInitialFitRef.current) {
					map.fitBounds(bounds, {
						padding: [45, 45],
						maxZoom: 15
					});
					hasInitialFitRef.current = true;
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		items,
		geojson,
		risks
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl border border-border bg-card shadow-card operational-map relative h-[520px] min-h-[520px] overflow-hidden",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: host,
				className: "absolute inset-0 z-0"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 shadow-xl backdrop-blur",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
					className: "text-xs",
					children: "Mapa operacional"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[10px] text-slate-400",
					children: "Cidades, bairros, rodovias e ruas"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "pointer-events-none absolute bottom-4 left-1/2 z-[500] flex -translate-x-1/2 gap-3 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-[10px] shadow-xl backdrop-blur",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-status-normal",
						children: "● Veículo / início"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sky-400",
						children: "━ Rota"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-status-critico",
						children: "● Destino"
					})
				]
			})
		]
	});
}
function Fleet({ token, data }) {
	const l = useLoad(token, "/localizacoes", data.localizacoes);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, {
		title: "Localização da frota",
		desc: "Veículos e condutores atuais em tempo real.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "h-5 w-5" }),
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			className: btn,
			onClick: () => {
				l.load();
			},
			children: "Atualizar"
		}),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.7fr)]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "min-w-0",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, { items: l.items })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: card + " min-w-0 overflow-hidden",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center border-b border-border p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-bold",
						children: "Veículos monitorados"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: muted,
						children: "Placa e motorista atual"
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "ml-auto rounded-full bg-primary/10 px-2 py-1 text-xs text-primary",
						children: l.items.length
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "max-h-[455px] space-y-2 overflow-y-auto p-3",
					children: [l.items.map((x) => {
						const updated = new Date(x.ultima_atualizacao || 0);
						const online = Number.isFinite(+updated) && Date.now() - +updated <= 300 * 1e3;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-lg border border-border/80 bg-gradient-to-br from-card to-surface-2/55 p-3 transition-colors hover:border-primary/35",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Truck, { className: "h-4 w-4 text-primary" })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "ml-3 min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
											className: "block text-sm",
											children: x.placa
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: muted,
											children: x.modelo || x.frota || "Veículo cadastrado"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: (online ? "bg-status-normal/10 text-status-normal" : "bg-status-atencao/10 text-status-atencao") + " ml-auto rounded-full px-2 py-1 text-[10px]",
										children: online ? "ONLINE" : x.ultima_atualizacao ? "SEM SINAL" : "SEM GPS"
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 border-t border-border/60 pt-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[10px] uppercase tracking-wide text-muted-foreground",
										children: "Motorista atual"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-xs font-medium",
										children: x.nome || "Nenhum motorista vinculado"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[10px] text-muted-foreground",
										children: x.ultima_atualizacao ? `Última posição: ${updated.toLocaleString("pt-BR")}` : "Ainda não enviou posição"
									})
								]
							})]
						}, x.id);
					}), !l.items.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "p-4 text-center text-xs text-muted-foreground",
						children: "Nenhum veículo monitorado."
					})]
				})]
			})]
		})
	});
}
function Alerts({ token, data, refreshDashboard }) {
	const [filter, setFilter] = (0, import_react.useState)("todos");
	const [working, setWorking] = (0, import_react.useState)(null);
	const [message, setMessage] = (0, import_react.useState)("");
	const alerts = (data.alertas || []).filter((a) => filter === "todos" || String(a.severidade || a.nivel || a.status || "").toLowerCase() === filter);
	const level = (a) => String(a.severidade || a.nivel || a.status || "atencao").toLowerCase();
	const when = (a) => {
		const d = new Date(a.criado_em || a.data_hora || a.timestamp || a.ultimo_evento_em);
		return Number.isFinite(+d) ? d.toLocaleString("pt-BR") : "Horário não informado";
	};
	const operate = async (a, status) => {
		if (!a.id || a.origem !== "modo_sombra") return;
		let resolucao = "";
		if (status === "resolvido" || status === "descartado") {
			resolucao = prompt(status === "resolvido" ? "Como o alerta foi resolvido?" : "Motivo do descarte:", "") || "";
			if (!resolucao) return;
		}
		setWorking(a.id);
		setMessage("");
		try {
			await act(token, `/guardiao/eventos-empresa/${a.id}/operacao`, "PATCH", {
				status,
				resolucao
			});
			setMessage("Tratamento registrado com sucesso.");
			await refreshDashboard();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "Falha ao tratar alerta");
		} finally {
			setWorking(null);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Central de Alertas",
		desc: "Riscos e ocorrências que exigem acompanhamento operacional.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-5 w-5" }),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: refreshDashboard,
					className: "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4" }), "Atualizar"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "ml-auto flex gap-2",
					children: [
						["todos", "Todos"],
						["critico", "Críticos"],
						["alta", "Alta"],
						["atencao", "Atenção"]
					].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => setFilter(id),
						className: (filter === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground") + " rounded-lg border px-3 py-2 text-xs",
						children: label
					}, id))
				})]
			}),
			message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary",
				children: message
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-3 lg:grid-cols-2 xl:grid-cols-3",
				children: alerts.map((a, i) => {
					const l = level(a), critical = l === "critico" || l === "alta" || l === "iminente";
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: `${card} overflow-hidden`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: (critical ? "bg-status-critico" : "bg-status-atencao") + " h-1" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: (critical ? "bg-status-critico/15 text-status-critico" : "bg-status-atencao/15 text-status-atencao") + " rounded-lg p-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-4 w-4" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap items-center gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
													className: "text-sm",
													children: a.placa || a.veiculo_placa || "Alerta operacional"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: (critical ? "text-status-critico" : "text-status-atencao") + " text-[10px] font-bold uppercase",
													children: l
												}),
												a.status_operacional && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full bg-primary/10 px-2 py-1 text-[10px] uppercase text-primary",
													children: String(a.status_operacional).replaceAll("_", " ")
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-2 text-sm",
											children: a.mensagem || a.nome || a.tipo || "Ocorrência identificada"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-2 text-xs text-muted-foreground",
											children: when(a)
										}),
										a.metodo_analise && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-1 text-[10px] uppercase text-muted-foreground",
											children: ["Análise: ", String(a.metodo_analise).replaceAll("_", " ")]
										}),
										(a.distancia_km != null || a.tempo_estimado_min != null) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 text-xs text-primary",
											children: [a.distancia_km != null ? `${Number(a.distancia_km).toFixed(2)} km` : "", a.tempo_estimado_min != null ? ` · ${Number(a.tempo_estimado_min).toFixed(1)} min` : ""]
										})
									]
								})]
							}), a.origem === "modo_sombra" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-wrap gap-2 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										disabled: working === a.id,
										onClick: () => operate(a, "em_analise"),
										className: "text-xs text-primary",
										children: "Assumir"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										disabled: working === a.id,
										onClick: () => operate(a, "monitorando"),
										className: "text-xs text-status-atencao",
										children: "Monitorar"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										disabled: working === a.id,
										onClick: () => operate(a, "resolvido"),
										className: "text-xs text-status-normal",
										children: "Resolver"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										disabled: working === a.id,
										onClick: () => operate(a, "descartado"),
										className: "text-xs text-muted-foreground",
										children: "Descartar"
									})
								]
							})]
						})]
					}, `${a.origem || a.tipo}-${a.id || i}`);
				})
			}),
			!alerts.length && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: `rounded-xl border border-border bg-card shadow-card p-10 text-center`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "mx-auto h-8 w-8 text-status-normal" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
						className: "mt-3 block",
						children: "Nenhum alerta neste filtro"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "A operação não possui ocorrências correspondentes."
					})
				]
			})
		]
	});
}
function Trips({ token, data, refreshDashboard }) {
	const q = useLoad(token, "/monitoramento/viagens", data.viagens), r = useLoad(token, "/rotas"), v = useLoad(token, "/veiculos", data.veiculos);
	const [f, setF] = (0, import_react.useState)({
		id_rota: "",
		id_veiculo: "",
		carga: "",
		altura_total: "",
		peso_total: "",
		saida_prevista: ""
	}), [msg, setMsg] = (0, import_react.useState)("");
	const selectedRoute = r.items.find((route) => String(route.id) === String(f.id_rota));
	async function command(id, k) {
		let body = {};
		if (k === "aprovar") body = { observacao: prompt("Observação:", "Rota conferida.") || "" };
		if (k === "bloquear-aprovacao") {
			const motivo = prompt("Motivo:", "");
			if (!motivo) return;
			body = { motivo };
		}
		if (k === "reabrir-aprovacao") body = { motivo: prompt("Motivo:", "Revisão do gestor.") || "" };
		await act(token, "/viagens/" + id + "/" + k, "POST", body);
		q.load();
		refreshDashboard();
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Viagens e Guardião",
		desc: "Criação, aprovação e monitoramento.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Route, { className: "h-5 w-5" }),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, {
				items: data.localizacoes,
				geojson: selectedRoute?.dados_geojson || null
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-xs",
				children: selectedRoute ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mr-2 h-2 w-2 rounded-full bg-sky-400" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: selectedRoute.nome }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "ml-2 text-muted-foreground",
						children: [
							selectedRoute.origem || "Origem",
							" →",
							" ",
							selectedRoute.destino || "Destino"
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "ml-auto text-sky-400",
						children: "Rota exibida no mapa"
					})
				] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-muted-foreground",
					children: "Selecione uma rota no formulário para visualizar o trajeto no mapa."
				})
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 xl:grid-cols-[400px_1fr]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: card + " grid grid-cols-2 content-start gap-3 p-5",
				onSubmit: async (e) => {
					e.preventDefault();
					try {
						await act(token, "/viagens", "POST", {
							...f,
							id_rota: +f.id_rota,
							id_veiculo: +f.id_veiculo,
							altura_total: +f.altura_total,
							peso_total: +f.peso_total || void 0,
							saida_prevista: f.saida_prevista ? new Date(f.saida_prevista).toISOString() : null
						});
						setMsg("Viagem criada.");
						q.load();
					} catch (x) {
						setMsg(x instanceof Error ? x.message : "Erro");
					}
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "col-span-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
							label: "Rota",
							value: f.id_rota,
							set: (x) => setF({
								...f,
								id_rota: x
							}),
							items: r.items,
							text: (x) => x.nome
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "col-span-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
							label: "Veículo",
							value: f.id_veiculo,
							set: (x) => setF({
								...f,
								id_veiculo: x
							}),
							items: v.items.filter((x) => x.ativo),
							text: (x) => x.placa
						})
					}),
					[
						"carga",
						"altura_total",
						"peso_total",
						"saida_prevista"
					].map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: k.replaceAll("_", " "),
						type: k === "saida_prevista" ? "datetime-local" : k === "carga" ? "text" : "number",
						value: f[k],
						set: (x) => setF({
							...f,
							[k]: x
						})
					}, k)),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: btn + " col-span-2 w-full",
						children: "Criar viagem"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "col-span-2 text-xs text-primary",
						children: msg
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
				items: q.items,
				title: (x) => x.placa || "Viagem " + x.id,
				detail: (x) => (x.origem || "-") + " → " + (x.destino || "-") + " · " + x.status,
				actions: (x) => [
					"aprovar",
					"bloquear-aprovacao",
					"reabrir-aprovacao"
				].map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-xs text-primary",
					onClick: () => command(x.id, k),
					children: k === "aprovar" ? "Aprovar" : k === "bloquear-aprovacao" ? "Bloquear" : "Reabrir"
				}, k)).concat(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-xs text-guardian",
					onClick: async () => {
						const z = await act(token, "/viagens/" + x.id + "/scan-restricoes", "POST", {});
						setMsg("Scanner: " + (z.candidatos_na_rota || 0) + " candidatos");
					},
					children: "Analisar restrições"
				}, "scan"))
			})]
		})]
	});
}
function Reports({ token }) {
	const q = useLoad(token, "/reportes"), [f, setF] = (0, import_react.useState)("ativo");
	const items = q.items.filter((x) => f === "todos" || (x.status_reporte || "ativo") === f);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Reportes",
		desc: "Ocorrências enviadas pelos motoristas.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "h-5 w-5" }),
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					className: input,
					value: f,
					onChange: (e) => setF(e.target.value),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "todos",
							children: "Todos"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "ativo",
							children: "Ativos"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "resolvido",
							children: "Resolvidos"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "expirado",
							children: "Expirados"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: btn,
					onClick: q.load,
					children: "Atualizar"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "rounded-lg border border-status-critico/40 px-3 text-xs text-status-critico",
					onClick: async () => {
						if (confirm("Apagar todos os reportes?")) {
							await act(token, "/reportes", "DELETE");
							q.load();
						}
					},
					children: "Limpar"
				})
			]
		}),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Note, { q }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
			items,
			title: (x) => x.motorista || x.placa || "Reporte",
			detail: (x) => x.tipo + " · " + (x.status_reporte || "ativo"),
			actions: (x) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "text-xs text-primary",
				onClick: async () => {
					await act(token, "/reportes/" + x.id + "/status", "PATCH", { status: (x.status_reporte || "ativo") === "ativo" ? "resolvido" : "ativo" });
					q.load();
				},
				children: "Alterar status"
			})
		})]
	});
}
function HistoryPage({ token }) {
	const q = useLoad(token, "/historico/viagens");
	const [detail, setDetail] = (0, import_react.useState)(null), [message, setMessage] = (0, import_react.useState)("");
	const view = async (x) => {
		setMessage("");
		try {
			setDetail(await apiRequest(`/viagens/${x.id}/trajeto-realizado`, token));
		} catch (e) {
			setDetail(null);
			setMessage(e instanceof Error ? e.message : "Trajeto indisponível");
		}
	};
	const combined = (() => {
		if (!detail) return null;
		const features = [];
		const add = (shape, tipo) => {
			let s = shape;
			try {
				if (typeof s === "string") s = JSON.parse(s);
			} catch {
				return;
			}
			if (s?.type === "FeatureCollection") for (const f of s.features || []) features.push({
				...f,
				properties: {
					...f.properties || {},
					tipo
				}
			});
			else if (s?.type === "Feature") features.push({
				...s,
				properties: {
					...s.properties || {},
					tipo
				}
			});
			else if (s?.type) features.push({
				type: "Feature",
				properties: { tipo },
				geometry: s
			});
		};
		add(detail.rota_planejada_geojson, "rota_planejada");
		add(detail.tratado_geojson, "trajeto_realizado");
		return {
			type: "FeatureCollection",
			features
		};
	})();
	const createRoute = async () => {
		if (!detail) return;
		const nome = prompt("Nome da nova rota:", `${detail.rota_nome || "Rota"} · trajeto realizado`);
		if (!nome) return;
		try {
			const r = await act(token, `/viagens/${detail.id_viagem}/trajeto-realizado/criar-rota`, "POST", { nome });
			setMessage(r.mensagem);
			setDetail({
				...detail,
				id_rota_gerada: r.rota?.id
			});
			q.load();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "Falha ao criar rota");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Histórico",
		desc: "Histórico geral das viagens.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(History, { className: "h-5 w-5" }),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Note, { q }),
			message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary",
				children: message
			}),
			detail && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mb-5 print-trip-report",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, { geojson: combined }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `rounded-xl border border-border bg-card shadow-card mt-3 p-4`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
								detail.placa,
								" · ",
								detail.rota_nome
							] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs text-muted-foreground",
								children: detail.motorista || "Motorista não informado"
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "ml-auto flex gap-3 text-xs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-sky-400",
									children: "— Planejada"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-status-normal",
									children: "— Realizada"
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5",
							children: [
								["Distância", `${Number(detail.metricas?.distancia_km || 0).toFixed(2)} km`],
								["Duração", `${detail.metricas?.duracao_min || 0} min`],
								["Parado", `${detail.metricas?.tempo_parado_min || 0} min`],
								["Pontos", detail.metricas?.total_pontos_validos || 0],
								["Falhas GPS", detail.metricas?.gaps_sem_gps || 0]
							].map(([a, b]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg bg-surface-2 p-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[10px] uppercase text-muted-foreground",
									children: a
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "mt-1 block text-sm",
									children: b
								})]
							}, String(a)))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex flex-wrap gap-2 print:hidden",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								disabled: Boolean(detail.id_rota_gerada),
								onClick: createRoute,
								className: "rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50",
								children: detail.id_rota_gerada ? "Rota já criada" : "Transformar trajeto em rota"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => window.print(),
								className: "rounded-lg border border-border px-4 py-2.5 text-sm",
								children: "Exportar PDF"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-[11px] text-muted-foreground",
							children: "A nova rota será criada como pendente e precisará passar pela varredura e aprovação humana."
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
				items: q.items,
				title: (x) => x.placa || "Viagem " + x.id,
				detail: (x) => (x.origem || "-") + " → " + (x.destino || "-") + " · " + (x.status || ""),
				actions: (x) => x.possui_trajeto_realizado ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-xs text-primary",
					onClick: () => view(x),
					children: "Visualizar trajeto"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs text-muted-foreground",
					children: "Aguardando conclusão com GPS"
				})
			})
		]
	});
}
function Audit({ token }) {
	const q = useLoad(token, "/auditoria/viagens");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Caixa-preta",
		desc: "Linha do tempo operacional.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(History, { className: "h-5 w-5" }),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Note, { q }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
			items: q.items,
			title: (x) => x.acao || "Evento",
			detail: (x) => (x.placa || "-") + " · " + (x.observacao || x.criado_em || "")
		})]
	});
}
function Validated({ token }) {
	const q = useLoad(token, "/rotas-especificas");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, {
		title: "Passaporte Digital",
		desc: "Rotas específicas validadas.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "h-5 w-5" }),
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			className: btn,
			onClick: async () => {
				await act(token, "/rotas-especificas/verificar-reportes", "POST");
				q.load();
			},
			children: "Verificar reportes"
		}),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
			items: q.items,
			title: (x) => x.nome || x.rota_nome || "Rota " + x.id,
			detail: (x) => (x.origem || "-") + " → " + (x.destino || "-"),
			actions: (x) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "text-xs text-primary",
				onClick: async () => {
					await act(token, "/rotas-especificas/" + x.id + "/bloqueio", "PATCH", {
						bloqueada: !x.bloqueada,
						motivo: "Ação do gestor"
					});
					q.load();
				},
				children: x.bloqueada ? "Desbloquear" : "Bloquear"
			})
		})
	});
}
function Routes({ token, data }) {
	const q = useLoad(token, "/rotas");
	const [f, setF] = (0, import_react.useState)({
		nome: "",
		origem: "",
		destino: "",
		tipo: "caminhao",
		preferencia: "fastest"
	}), [route, setRoute] = (0, import_react.useState)(null), [msg, setMsg] = (0, import_react.useState)("");
	async function calculate(e) {
		e.preventDefault();
		try {
			setMsg("Localizando endereços...");
			const geo = async (v) => {
				return apiRequest("/api/geocodificar?q=" + encodeURIComponent(v), token);
			};
			const [a, b] = await Promise.all([geo(f.origem), geo(f.destino)]);
			if (!a || !b) throw new Error("Origem ou destino não encontrado.");
			const heavy = f.tipo === "caminhao";
			const body = {
				origem: {
					lat: +a.lat,
					lon: +a.lon
				},
				destino: {
					lat: +b.lat,
					lon: +b.lon
				},
				perfil: heavy ? "driving-hgv" : "driving-car",
				preferencia: f.preferencia
			};
			if (heavy) Object.assign(body, {
				altura: 4.2,
				peso: 15,
				comprimento: 12,
				largura: 2.6
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
				dados_geojson: route
			});
			setRoute(null);
			setMsg("Rota salva na biblioteca.");
			q.load();
		} catch (x) {
			setMsg(x instanceof Error ? x.message : "Erro ao salvar");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, {
		title: "Rotas",
		desc: "Calcule trajetos e mantenha a biblioteca operacional.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Route, { className: "h-5 w-5" }),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: calculate,
				className: card + " h-fit space-y-3 p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Nome da rota",
						value: f.nome,
						set: (x) => setF({
							...f,
							nome: x
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Origem",
						value: f.origem,
						set: (x) => setF({
							...f,
							origem: x
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Destino",
						value: f.destino,
						set: (x) => setF({
							...f,
							destino: x
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-xs text-muted-foreground",
						children: ["Tipo", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: input + " mt-1",
							value: f.tipo,
							onChange: (e) => setF({
								...f,
								tipo: e.target.value
							}),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "caminhao",
								children: "Caminhão"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "carro",
								children: "Carro"
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: btn + " w-full",
						children: "Calcular rota"
					}),
					route && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: save,
						className: "w-full rounded-lg bg-status-normal p-2.5 text-sm font-semibold",
						children: "Salvar na biblioteca"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-primary",
						children: msg
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, {
				items: data.localizacoes || [],
				geojson: route
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
					items: q.items,
					title: (x) => x.nome,
					detail: (x) => x.origem + " → " + x.destino,
					actions: (x) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "text-xs text-primary",
						onClick: () => {
							let shape = x.dados_geojson;
							try {
								if (typeof shape === "string") shape = JSON.parse(shape);
							} catch {
								shape = null;
							}
							setRoute(shape);
							setMsg("Exibindo " + x.nome);
						},
						children: "Visualizar rota"
					})
				})
			})] })]
		})
	});
}
function RestrictionCatalog({ token }) {
	const q = useLoad(token, "/restricoes-validadas"), trips = useLoad(token, "/monitoramento/viagens"), [filter, setFilter] = (0, import_react.useState)("todas"), [triageFilter, setTriageFilter] = (0, import_react.useState)("atencao"), [tripId, setTripId] = (0, import_react.useState)(""), [candidates, setCandidates] = (0, import_react.useState)([]), [busy, setBusy] = (0, import_react.useState)(false), [message, setMessage] = (0, import_react.useState)(""), [editing, setEditing] = (0, import_react.useState)(null), [validation, setValidation] = (0, import_react.useState)({
		limite_altura: "",
		limite_largura: "",
		limite_comprimento: "",
		limite_peso: "",
		limite_eixo: "",
		evidencia_url: "",
		observacao: "",
		valida_dias: "180"
	});
	const trip = trips.items.find((x) => String(x.id) === tripId), items = q.items.filter((x) => filter === "todas" || String(x.tipo || "").toLowerCase().includes(filter));
	let route = trip?.rota_aprovada_geojson || trip?.dados_geojson;
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
		setCandidates(await apiRequest(`/viagens/${id}/restricoes-candidatas`, token));
	};
	const scan = async () => {
		if (!tripId) return setMessage("Selecione uma viagem para analisar.");
		setBusy(true);
		setMessage("Cruzando infraestrutura ANTT e OpenStreetMap...");
		try {
			const r = await act(token, `/viagens/${tripId}/scan-restricoes`, "POST", {});
			await loadCandidates();
			const t = r.triagem || {}, aviso = Array.isArray(r.avisos) && r.avisos.length ? ` · Aviso: ${r.avisos.join("; ")}` : "";
			setMessage(`${r.candidatos_na_rota || 0} no corredor de 80 m · ${t.alta_prioridade || 0} alta prioridade · ${t.divergencia_fontes || 0} divergências · ${t.possivel_risco || 0} possíveis riscos · ${t.inventario || 0} inventário · ${r.fora_do_corredor || 0} fora do corredor descartados${aviso}`);
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "Falha na varredura ANTT");
		} finally {
			setBusy(false);
		}
	};
	const candidateAction = async (x, kind) => {
		await act(token, `/restricoes-candidatas/${x.id}/${kind}`, "PATCH", {});
		await loadCandidates();
		setMessage(kind === "confirmar" ? "Existência confirmada; falta validar limites para afetar o roteamento." : "Candidato rejeitado.");
	};
	const validate = async () => {
		if (!editing) return;
		setBusy(true);
		try {
			await act(token, `/restricoes-candidatas/${editing.id}/validar-global`, "POST", Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, String(v).trim() === "" ? null : ["observacao", "evidencia_url"].includes(k) ? v : Number(v)])));
			setEditing(null);
			await Promise.all([loadCandidates(), q.load()]);
			setMessage("Restrição validada e adicionada à base global de segurança.");
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "Falha ao validar");
		} finally {
			setBusy(false);
		}
	};
	const setTemporary = async (x) => {
		const start = prompt("Início da restrição (AAAA-MM-DD HH:mm):", x.vigencia_inicio ? String(x.vigencia_inicio).slice(0, 16).replace("T", " ") : (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " "));
		if (!start) return;
		const end = prompt("Fim da restrição (AAAA-MM-DD HH:mm):", x.valida_ate ? String(x.valida_ate).slice(0, 16).replace("T", " ") : "");
		if (!end) return;
		try {
			await act(token, `/restricoes-validadas/${x.id}`, "PATCH", {
				natureza: "temporaria",
				vigencia_inicio: new Date(start.replace(" ", "T")).toISOString(),
				valida_ate: new Date(end.replace(" ", "T")).toISOString()
			});
			await q.load();
			setMessage("Restrição temporária programada. Ela só participará das análises durante a vigência.");
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "Falha ao programar restrição");
		}
	};
	const limit = (x) => x.limite_altura != null ? `${x.limite_altura} m de altura` : x.limite_largura != null ? `${x.limite_largura} m de largura` : x.limite_peso != null ? `${x.limite_peso} t de peso` : "Limite ainda não confirmado";
	const category = (x) => x.tags?.classificacao_triagem || "inventario", order = {
		alta_prioridade: 0,
		divergencia_fontes: 1,
		possivel_risco: 2,
		inventario: 3
	};
	const shownCandidates = [...candidates].filter((x) => triageFilter === "todas" || (triageFilter === "atencao" ? category(x) !== "inventario" : category(x) === triageFilter)).sort((a, b) => (order[category(a)] ?? 9) - (order[category(b)] ?? 9));
	const categoryLabel = {
		alta_prioridade: "Alta prioridade",
		divergencia_fontes: "Divergência entre fontes",
		possivel_risco: "Possível risco",
		inventario: "Inventário"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Restrições de Rotas",
		desc: "Varredura de viagens com infraestrutura oficial da ANTT e validação operacional.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigation, { className: "h-5 w-5" }),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: `${card} mb-4 p-4`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3 lg:grid-cols-[1fr_auto]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "text-xs text-muted-foreground",
							children: ["Viagem ou rota para analisar", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
								className: `${input} mt-1`,
								value: tripId,
								onChange: async (e) => {
									setTripId(e.target.value);
									setMessage("");
									await loadCandidates(e.target.value);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "",
									children: "Selecione uma viagem"
								}), trips.items.map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
									value: x.id,
									children: [
										x.placa || x.veiculo_placa || `Viagem ${x.id}`,
										" ·",
										" ",
										x.origem || "-",
										" → ",
										x.destino || "-",
										" · ",
										x.status
									]
								}, x.id))]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							disabled: !tripId || busy,
							onClick: scan,
							className: `${btn} self-end flex items-center justify-center gap-2`,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, { className: `h-4 w-4 ${busy ? "animate-pulse" : ""}` }), busy ? "Analisando ANTT..." : "Executar varredura ANTT"]
						})]
					}),
					message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary",
						children: message
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-[11px] text-muted-foreground",
						children: "A varredura identifica estruturas próximas da geometria da rota. Dados da ANTT geram candidatos; somente uma validação humana com limite/evidência confirmados passa a interferir no roteamento."
					})
				]
			}),
			tripId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-4 overflow-hidden rounded-xl",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, {
					items: candidates.map((x) => ({
						...x,
						nome: x.nome || x.tipo,
						lon: x.lng
					})),
					geojson: route
				})
			}),
			candidates.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mb-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex flex-wrap items-end gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-semibold",
							children: "Triagem para validação humana"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: "Nenhuma classificação confirma a restrição ou bloqueia a rota automaticamente."
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "ml-auto flex flex-wrap gap-2",
							children: [
								["atencao", "Requer atenção"],
								["alta_prioridade", "Alta prioridade"],
								["divergencia_fontes", "Divergências"],
								["possivel_risco", "Possíveis riscos"],
								["inventario", "Inventário"],
								["todas", "Todos"]
							].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setTriageFilter(id),
								className: (triageFilter === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground") + " rounded-lg border px-3 py-2 text-xs",
								children: [
									label,
									" (",
									id === "todas" ? candidates.length : candidates.filter((x) => id === "atencao" ? category(x) !== "inventario" : category(x) === id).length,
									")"
								]
							}, id))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid gap-3 md:grid-cols-2 xl:grid-cols-3",
						children: shownCandidates.map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: `rounded-xl border border-border bg-card shadow-card p-4`,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-lg bg-guardian/10 p-2 text-guardian",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, { className: "h-4 w-4" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex flex-wrap gap-2",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
													className: "text-sm",
													children: x.nome || x.tipo
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full bg-status-atencao/10 px-2 py-1 text-[10px] uppercase text-status-atencao",
													children: categoryLabel[category(x)]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full bg-surface-2 px-2 py-1 text-[10px] uppercase text-muted-foreground",
													children: "Validação humana obrigatória"
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 text-xs text-primary",
											children: [
												Math.round(Number(x.distancia_rota_km || 0) * 1e3),
												" m da rota · confiança ",
												x.confianca || "-",
												"%"
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 text-xs text-muted-foreground",
											children: [
												x.tags?.rodovia,
												x.tags?.km,
												x.tags?.sentido
											].filter(Boolean).join(" · ") || "Coordenadas oficiais ANTT"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "mt-2 text-[10px] uppercase tracking-wide text-muted-foreground",
											children: [
												"Fontes consultadas:",
												" ",
												(x.tags?.fontes_consultadas || ["ANTT"]).join(" + "),
												" ·",
												" ",
												x.tags?.correspondencias_osm?.length || 0,
												" ",
												"correspondência(s) próxima(s)"
											]
										}),
										x.tags?.incompatibilidades?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-2 text-xs text-status-critico",
											children: "Possível incompatibilidade com o veículo/viagem. Confirme o limite e a evidência antes de utilizar."
										})
									]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-wrap gap-3 border-t border-border pt-3",
								children: [
									x.status_validacao === "descoberta" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => candidateAction(x, "confirmar"),
										className: "text-xs text-primary",
										children: "Confirmar existência"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => {
											setEditing(x);
											setValidation({
												...validation,
												limite_altura: x.limite_altura || "",
												limite_largura: x.limite_largura || "",
												limite_comprimento: x.limite_comprimento || "",
												limite_peso: x.limite_peso || "",
												limite_eixo: x.limite_eixo || ""
											});
										},
										className: "text-xs text-status-normal",
										children: "Validar para roteamento"
									}),
									x.status_validacao !== "rejeitada" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => candidateAction(x, "rejeitar"),
										className: "text-xs text-status-critico",
										children: "Rejeitar"
									})
								]
							})]
						}, x.id))
					}),
					shownCandidates.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `rounded-xl border border-border bg-card shadow-card p-5 text-sm text-muted-foreground`,
						children: "Nenhum candidato nesta categoria."
					})
				]
			}),
			editing && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: `rounded-xl border border-border bg-card shadow-card mb-5 p-5`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-semibold",
							children: "Validar restrição"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs text-muted-foreground",
							children: [editing.nome || editing.tipo, " · informe somente valores confirmados."]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => setEditing(null),
							className: "ml-auto text-xs text-muted-foreground",
							children: "Cancelar"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 grid gap-3 md:grid-cols-3",
						children: [
							["limite_altura", "Altura (m)"],
							["limite_largura", "Largura (m)"],
							["limite_comprimento", "Comprimento (m)"],
							["limite_peso", "Peso (t)"],
							["limite_eixo", "Peso por eixo (t)"],
							["valida_dias", "Validade (dias)"]
						].map(([k, l]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: l,
							type: "number",
							value: validation[k],
							set: (v) => setValidation({
								...validation,
								[k]: v
							})
						}, k))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 grid gap-3 md:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "URL da evidência",
							value: validation.evidencia_url,
							set: (v) => setValidation({
								...validation,
								evidencia_url: v
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Observação técnica",
							value: validation.observacao,
							set: (v) => setValidation({
								...validation,
								observacao: v
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						disabled: busy,
						onClick: validate,
						className: `rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 mt-4`,
						children: "Confirmar e adicionar à base global"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
						className: "mr-2 self-center text-sm",
						children: "Base global validada"
					}),
					[
						["todas", "Todas"],
						["altura", "Altura"],
						["largura", "Largura"],
						["peso", "Peso"],
						["ponte", "Pontes"]
					].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => setFilter(id),
						className: (filter === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground") + " rounded-lg border px-3 py-2 text-xs",
						children: label
					}, id)),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: q.load,
						className: "ml-auto rounded-lg border border-border p-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: `h-4 w-4 ${q.loading ? "animate-spin" : ""}` })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-3 md:grid-cols-2 xl:grid-cols-3",
				children: items.map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("article", {
					className: `${card} p-4`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded-lg bg-status-atencao/10 p-2 text-status-atencao",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigation, { className: "h-4 w-4" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "text-sm",
									children: x.nome || x.tipo || "Restrição"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: (x.natureza === "temporaria" ? "bg-status-atencao/10 text-status-atencao" : "bg-surface-2 text-muted-foreground") + " rounded-full px-2 py-1 text-[10px] uppercase",
									children: x.natureza || "definitiva"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-xs text-primary",
								children: limit(x)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-xs text-muted-foreground",
								children: [
									x.rodovia,
									x.km,
									x.sentido
								].filter(Boolean).join(" · ") || "Localização por coordenadas"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 text-[10px] uppercase text-muted-foreground",
								children: [
									"Fonte: ",
									x.fonte || "não informada",
									" · Confiança:",
									" ",
									x.confianca ?? "-",
									"%"
								]
							}),
							x.natureza === "temporaria" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 text-xs text-status-atencao",
								children: [
									"Vigência:",
									" ",
									x.vigencia_inicio ? new Date(x.vigencia_inicio).toLocaleString("pt-BR") : "imediata",
									" ",
									"até",
									" ",
									x.valida_ate ? new Date(x.valida_ate).toLocaleString("pt-BR") : "sem término"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => setTemporary(x),
								className: "mt-3 text-xs text-primary",
								children: "Programar restrição temporária"
							})
						] })]
					})
				}, x.id))
			})
		]
	});
}
var toRadians = (value) => value * Math.PI / 180;
function Restrictions({ token, data }) {
	const restrictions = useLoad(token, "/restricoes-validadas"), events = useLoad(token, "/guardiao/eventos"), locations = useLoad(token, "/localizacoes", data.localizacoes), companies = useLoad(token, "/integracoes/empresas"), profiles = useLoad(token, "/guardiao/perfis-composicao"), mobilePilot = useLoad(token, "/piloto-mobile/sessoes?limite=100"), [vehicleId, setVehicleId] = (0, import_react.useState)(""), [height, setHeight] = (0, import_react.useState)("4.20"), [motion, setMotion] = (0, import_react.useState)(null), [lastUpdate, setLastUpdate] = (0, import_react.useState)(/* @__PURE__ */ new Date()), [companyName, setCompanyName] = (0, import_react.useState)(""), [companyPlates, setCompanyPlates] = (0, import_react.useState)(""), [createdKey, setCreatedKey] = (0, import_react.useState)(""), [diagnostic, setDiagnostic] = (0, import_react.useState)(null), [diagnosticCompany, setDiagnosticCompany] = (0, import_react.useState)(null), [companyUsers, setCompanyUsers] = (0, import_react.useState)([]), [access, setAccess] = (0, import_react.useState)({
		id_empresa: "",
		nome: "",
		email: "",
		senha: "",
		perfil: "somente_leitura"
	}), [shadowReport, setShadowReport] = (0, import_react.useState)(null), [composition, setComposition] = (0, import_react.useState)({
		nome: "",
		placa: "",
		carreta: "",
		carga: "",
		altura: "",
		largura: "",
		comprimento: "",
		peso: "",
		eixos: ""
	});
	const previous = (0, import_react.useRef)(null);
	const vehicles = locations.items.filter((x) => Number.isFinite(+x.lat) && Number.isFinite(+(x.lon ?? x.lng)));
	const vehicle = vehicles.find((x) => String(x.id) === vehicleId) || vehicles[0];
	const vehicleKey = vehicle ? String(vehicle.id) : "";
	const distance = (0, import_react.useCallback)((a, b) => {
		const dLat = toRadians(+b.lat - +a.lat), dLon = toRadians(+(b.lon ?? b.lng) - +(a.lon ?? a.lng));
		const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(+a.lat)) * Math.cos(toRadians(+b.lat)) * Math.sin(dLon / 2) ** 2;
		return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
	}, []);
	const bearing = (0, import_react.useCallback)((a, b) => {
		const p1 = toRadians(+a.lat), p2 = toRadians(+b.lat), dl = toRadians(+(b.lon ?? b.lng) - +(a.lon ?? a.lng));
		return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
	}, []);
	const angle = (a, b) => Math.abs((a - b + 540) % 360 - 180);
	(0, import_react.useEffect)(() => {
		if (!vehicle) return;
		const current = {
			id: vehicle.id,
			lat: +vehicle.lat,
			lon: +(vehicle.lon ?? vehicle.lng),
			at: new Date(vehicle.ultima_atualizacao || Date.now()).getTime()
		};
		const old = previous.current;
		if (old?.id === current.id && old.at < current.at) {
			const km = distance(old, current), hours = (current.at - old.at) / 36e5;
			if (km >= .003) setMotion({
				heading: bearing(old, current),
				speed: hours > 0 ? Math.min(160, km / hours) : 0
			});
		}
		if (!old || old.id !== current.id || old.at < current.at) previous.current = current;
	}, [
		vehicle,
		bearing,
		distance
	]);
	(0, import_react.useEffect)(() => {
		if (!vehicleId && vehicle) setVehicleId(String(vehicle.id));
	}, [vehicleId, vehicle]);
	const reloadLocations = locations.load;
	const reloadEvents = events.load;
	const reloadRestrictions = restrictions.load;
	(0, import_react.useEffect)(() => {
		const id = window.setInterval(() => {
			reloadLocations();
			reloadEvents();
			reloadRestrictions();
			setLastUpdate(/* @__PURE__ */ new Date());
		}, 5e3);
		return () => window.clearInterval(id);
	}, [
		reloadLocations,
		reloadEvents,
		reloadRestrictions
	]);
	const speed = Number(motion?.speed || 0);
	const range = speed >= 90 ? 15 : speed >= 70 ? 12 : speed >= 50 ? 10 : speed >= 25 ? 7 : 5;
	const dimensions = {
		altura: +height,
		largura: +vehicle?.largura,
		comprimento: +vehicle?.comprimento,
		peso: +vehicle?.peso
	};
	const localRisks = vehicle && motion ? restrictions.items.filter((x) => x.ativa && Number.isFinite(+x.lat) && Number.isFinite(+(x.lng ?? x.lon))).map((x) => {
		const km = distance(vehicle, {
			lat: x.lat,
			lon: x.lng ?? x.lon
		});
		const direction = bearing(vehicle, {
			lat: x.lat,
			lon: x.lng ?? x.lon
		});
		if (km > range || angle(direction, motion.heading) > 38) return null;
		const conflict = [
			[
				"altura",
				x.limite_altura,
				"m"
			],
			[
				"largura",
				x.limite_largura,
				"m"
			],
			[
				"comprimento",
				x.limite_comprimento,
				"m"
			],
			[
				"peso",
				x.limite_peso,
				"t"
			]
		].map(([tipo, limite, unidade]) => ({
			tipo,
			limite: +limite,
			veiculo: dimensions[tipo],
			unidade
		})).filter((v) => Number.isFinite(v.limite) && Number.isFinite(v.veiculo) && v.veiculo > v.limite)[0];
		return {
			id: `local-${x.id}`,
			nivel: conflict && km <= 2 ? "critico" : "atencao",
			distancia_km: km,
			tempo_estimado_min: speed >= 8 ? km / speed * 60 : null,
			tipo_risco: conflict?.tipo || x.tipo,
			restricao: x,
			dados: {
				restricao: x,
				incompatibilidade: conflict,
				alcance_km: range
			}
		};
	}).filter(Boolean).sort((a, b) => a.distancia_km - b.distancia_km) : [];
	const serverRisks = events.items.filter((x) => !vehicle || x.placa === vehicle.placa);
	const risks = [...localRisks, ...serverRisks].filter((x, i, all) => all.findIndex((y) => String(y.id_restricao || y.restricao?.id || y.id) === String(x.id_restricao || x.restricao?.id || x.id)) === i);
	const critical = risks.filter((x) => x.nivel === "critico");
	const gpsAt = vehicle?.ultima_atualizacao ? new Date(vehicle.ultima_atualizacao) : null;
	const gpsAge = gpsAt && Number.isFinite(+gpsAt) ? Math.max(0, Math.round((Date.now() - +gpsAt) / 1e3)) : null;
	const status = !vehicle ? "SEM GPS" : !motion ? "CALIBRANDO DIREÇÃO" : critical.length ? "RISCO CRÍTICO" : risks.length ? "ATENÇÃO À FRENTE" : "CORREDOR SEGURO";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: "Supervisor Guardião",
		desc: "Radar independente de rota baseado no movimento real do veículo.",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, { className: "h-5 w-5" }),
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center gap-2 rounded-full border border-status-normal/25 bg-status-normal/10 px-3 py-2 text-xs text-status-normal",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-2 w-2 animate-pulse rounded-full bg-status-normal" }),
				" ",
				"AO VIVO · 5s"
			]
		}),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
						label: "SUPERVISÃO",
						value: status,
						tone: critical.length ? "critical" : risks.length ? "warning" : "safe"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
						label: "ALCANCE À FRENTE",
						value: `${range} km`,
						sub: "ajustado pela velocidade"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
						label: "VELOCIDADE ESTIMADA",
						value: motion ? `${Math.round(speed)} km/h` : "—",
						sub: motion ? `direção ${Math.round(motion.heading)}°` : "aguardando deslocamento"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
						label: "RISCOS NO CORREDOR",
						value: String(risks.length),
						sub: `${critical.length} crítico(s)`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
						label: "ÚLTIMO GPS",
						value: gpsAge === null ? "—" : `${gpsAge}s`,
						sub: lastUpdate.toLocaleTimeString("pt-BR")
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_380px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, {
					items: vehicle ? [vehicle] : [],
					risks
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: card + " flex h-[520px] flex-col overflow-hidden",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "border-b border-border p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-3 flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigation, { className: "h-4 w-4 text-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Veículo supervisionado" })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: input,
								value: vehicleKey,
								onChange: (e) => {
									setVehicleId(e.target.value);
									previous.current = null;
									setMotion(null);
								},
								children: vehicles.map((x) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: x.id,
									children: x.placa || x.nome
								}, x.id))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "mt-3 block text-xs text-muted-foreground",
								children: ["Altura operacional carregada (m)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: input + " mt-1",
									type: "number",
									step: "0.01",
									min: "0.1",
									value: height,
									onChange: (e) => setHeight(e.target.value)
								})]
							}),
							vehicle && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 text-xs text-muted-foreground",
								children: [
									vehicle.modelo || vehicle.nome,
									" · ",
									vehicle.comprimento || "—",
									"m × ",
									vehicle.largura || "—",
									"m · ",
									vehicle.peso || "—",
									"t"
								]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex-1 space-y-2 overflow-y-auto p-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: "h-4 w-4 text-guardian" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "text-xs",
									children: "ANÁLISE À FRENTE"
								})]
							}),
							!motion && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg border border-primary/20 bg-primary/[.06] p-4 text-center",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radar, { className: "mx-auto h-8 w-8 animate-pulse text-primary" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
										className: "mt-2 block text-sm",
										children: "Aprendendo a direção"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-muted-foreground",
										children: "O radar inicia assim que chegar uma nova posição com deslocamento."
									})
								]
							}),
							motion && !risks.length && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg bg-status-normal/10 p-5 text-center",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "mx-auto h-8 w-8 text-status-normal" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
										className: "mt-2 block text-sm",
										children: "Via livre à frente"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-muted-foreground",
										children: "Pontes e restrições continuam sendo verificadas a cada atualização."
									})
								]
							}),
							risks.map((risk) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RiskCard, { risk }, risk.id))
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: card + " p-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
							className: "text-sm",
							children: "Como funciona o radar livre"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: muted,
							children: "Compara posições sucessivas, identifica a direção do deslocamento e cria um corredor de 76° à frente. Não exige rota ou destino previamente cadastrado."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-xs text-status-atencao",
							children: "O Guardião auxilia a operação e não substitui a sinalização viária nem a decisão segura do condutor."
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs text-primary",
						children: [
							restrictions.items.filter((x) => x.ativa).length,
							" ",
							"restrições ativas"
						]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: card + " mt-4 p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
							className: "text-sm",
							children: "Integração GPS empresarial"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: muted,
							children: "Gere uma chave e vincule as placas autorizadas. O motorista permanece apenas como referência do condutor."
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "grid gap-3 lg:grid-cols-[1fr_1.4fr_auto]",
						onSubmit: async (e) => {
							e.preventDefault();
							const result = await act(token, "/integracoes/empresas", "POST", {
								nome: companyName,
								placas: companyPlates.split(/[,;\s]+/).filter(Boolean),
								escopos: ["telemetria:escrever", "diagnostico:ler"],
								expira_em: new Date(Date.now() + 90 * 864e5).toISOString()
							});
							setCreatedKey(result.chave || "");
							setCompanyName("");
							setCompanyPlates("");
							companies.load();
						},
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								required: true,
								className: input,
								placeholder: "Nome da empresa",
								value: companyName,
								onChange: (e) => setCompanyName(e.target.value)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								required: true,
								className: input,
								placeholder: "Placas separadas por vírgula: ABC1D23, DEF4G56",
								value: companyPlates,
								onChange: (e) => setCompanyPlates(e.target.value)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								className: btn,
								children: "Gerar chave"
							})
						]
					}),
					createdKey && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 rounded-lg border border-status-atencao/30 bg-status-atencao/[.07] p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
							className: "text-xs text-status-atencao",
							children: "COPIE AGORA — A CHAVE SERÁ EXIBIDA UMA ÚNICA VEZ"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
							className: "mt-2 block break-all rounded bg-black/25 p-3 text-xs",
							children: createdKey
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3",
						children: companies.items.map((company) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "rounded-lg border border-border bg-surface-2 p-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
										className: "text-sm",
										children: company.nome
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-auto rounded-full px-2 py-1 text-[10px] " + (company.ativo ? "bg-status-normal/10 text-status-normal" : "bg-status-offline/10 text-status-offline"),
										children: company.ativo ? "ATIVA" : "DESATIVADA"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-xs text-muted-foreground",
									children: company.veiculos?.map((v) => v.placa).join(", ") || "Nenhuma placa"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 text-[10px] text-muted-foreground",
									children: [
										company.chaves?.length || 1,
										" chave(s) · último uso",
										" ",
										company.ultimo_uso_em ? new Date(company.ultimo_uso_em).toLocaleString("pt-BR") : "nunca"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-3 flex flex-wrap gap-3",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: "text-xs text-primary",
											onClick: async () => {
												const r = await act(token, `/integracoes/empresas/${company.id}/chaves/rotacionar`, "POST", {
													nome: `Rotação ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")}`,
													escopos: ["telemetria:escrever", "diagnostico:ler"],
													expira_em: new Date(Date.now() + 90 * 864e5).toISOString()
												});
												setCreatedKey(r.chave || "");
												companies.load();
											},
											children: "Rotacionar chave"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: "text-xs text-primary",
											onClick: async () => {
												setDiagnosticCompany(company);
												setDiagnostic(await apiRequest(`/integracoes/empresas/${company.id}/diagnostico`, token));
											},
											children: "Diagnóstico"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: "text-xs text-status-atencao",
											onClick: async () => {
												await act(token, "/integracoes/empresas/" + company.id, "PATCH", { ativo: !company.ativo });
												companies.load();
											},
											children: company.ativo ? "Desativar chave" : "Reativar chave"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-3 space-y-1 border-t border-border pt-2",
									children: company.chaves?.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex text-[10px] text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
											key.nome,
											" · ",
											key.prefixo,
											"••••"
										] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "ml-auto",
											children: key.ativo ? key.expira_em ? `expira ${new Date(key.expira_em).toLocaleDateString("pt-BR")}` : "sem validade" : "revogada"
										})]
									}, key.id))
								})
							]
						}, company.id))
					}),
					diagnostic && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "mt-4 rounded-xl border border-primary/25 bg-primary/[.04] p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: ["Diagnóstico · ", diagnosticCompany?.nome] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-muted-foreground",
									children: "Disponibilidade, posições e falhas das últimas 24 horas."
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "ml-auto text-xs text-primary",
									onClick: () => setDiagnostic(null),
									children: "Fechar"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 grid gap-2 sm:grid-cols-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
										label: "ESTADO",
										value: String(diagnostic.empresa?.estado_atual || "—").toUpperCase(),
										tone: diagnostic.empresa?.estado_atual === "online" ? "safe" : "warning"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
										label: "POSIÇÕES 24H",
										value: diagnostic.resumo?.recebidas_24h ?? 0
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
										label: "FALHAS 24H",
										value: diagnostic.resumo?.falhas_24h ?? 0,
										tone: Number(diagnostic.resumo?.falhas_24h) > 0 ? "warning" : "safe"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadarMetric, {
										label: "LATÊNCIA MÉDIA",
										value: `${diagnostic.resumo?.latencia_media_ms ?? 0} ms`
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3",
								children: diagnostic.veiculos?.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-lg bg-surface-2 p-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
											className: "text-xs",
											children: v.placa
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `ml-auto text-[10px] ${v.status === "online" ? "text-status-normal" : "text-status-atencao"}`,
											children: v.status
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-muted-foreground",
										children: v.ultima_atualizacao ? `Última posição ${new Date(v.ultima_atualizacao).toLocaleString("pt-BR")}` : "Nenhuma posição recebida"
									})]
								}, v.id))
							}),
							diagnostic.erros?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "text-xs",
									children: "FALHAS RECENTES"
								}), diagnostic.erros.slice(0, 6).map((e, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "mt-1 rounded bg-status-critico/[.06] p-2 text-xs text-status-critico",
									children: [
										new Date(e.recebido_em).toLocaleString("pt-BR"),
										" ·",
										" ",
										e.placa || "sem placa",
										" · ",
										e.erro_mensagem,
										" · ID",
										" ",
										e.request_id
									]
								}, i))]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "mt-4 rounded-xl border border-border bg-surface-2 p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
								className: "text-sm",
								children: "Acessos empresariais"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: muted,
								children: "Perfis isolados por empresa. Cada conta enxerga somente os dados da própria organização."
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
								className: "mt-3 grid gap-2 lg:grid-cols-5",
								onSubmit: async (e) => {
									e.preventDefault();
									const created = await act(token, `/integracoes/empresas/${access.id_empresa}/usuarios`, "POST", access);
									setCompanyUsers((old) => [created, ...old.filter((x) => x.id !== created.id)]);
									setAccess({
										...access,
										nome: "",
										email: "",
										senha: ""
									});
								},
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										required: true,
										className: input,
										value: access.id_empresa,
										onChange: async (e) => {
											const id = e.target.value;
											setAccess({
												...access,
												id_empresa: id
											});
											setCompanyUsers(id ? await apiRequest(`/integracoes/empresas/${id}/usuarios`, token) : []);
										},
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "",
											children: "Empresa"
										}), companies.items.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: c.id,
											children: c.nome
										}, c.id))]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										required: true,
										className: input,
										placeholder: "Nome",
										value: access.nome,
										onChange: (e) => setAccess({
											...access,
											nome: e.target.value
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										required: true,
										type: "email",
										className: input,
										placeholder: "E-mail",
										value: access.email,
										onChange: (e) => setAccess({
											...access,
											email: e.target.value
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										required: true,
										minLength: 8,
										type: "password",
										className: input,
										placeholder: "Senha inicial (8+)",
										value: access.senha,
										onChange: (e) => setAccess({
											...access,
											senha: e.target.value
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: input,
											value: access.perfil,
											onChange: (e) => setAccess({
												...access,
												perfil: e.target.value
											}),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "administrador",
													children: "Administrador"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "supervisor",
													children: "Supervisor"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "analista",
													children: "Analista"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "somente_leitura",
													children: "Somente leitura"
												})
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: btn,
											children: "Salvar"
										})]
									})
								]
							}),
							companyUsers.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4",
								children: companyUsers.map((u) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-lg border border-border p-3",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
											className: "text-xs",
											children: u.nome
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs text-muted-foreground",
											children: u.email
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "mt-2 inline-block rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary",
											children: String(u.perfil).replace("_", " ")
										})
									]
								}, u.id))
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 grid gap-4 xl:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: card + " p-4 xl:col-span-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "text-sm",
									children: "Piloto móvel · modo sombra"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: muted,
									children: "Acompanha o GPS do celular, bateria, rede e continuidade da sessão sem enviar comandos ao motorista."
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: mobilePilot.load,
									className: "ml-auto rounded-lg border border-border p-2",
									title: "Atualizar sessões",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: `h-4 w-4 ${mobilePilot.loading ? "animate-spin" : ""}` })
								})]
							}),
							mobilePilot.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 rounded-lg bg-status-critico/10 p-3 text-xs text-status-critico",
								children: mobilePilot.error
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3",
								children: mobilePilot.items.slice(0, 12).map((s) => {
									const online = s.estado_atual === "online", warning = [
										"instavel",
										"sem_sinal",
										"gps_desligado",
										"interrompida"
									].includes(s.estado_atual);
									const cp = s.composicao || {};
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
										className: "rounded-lg border border-border bg-surface-2 p-3",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-start gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
													className: "text-sm",
													children: s.placa
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
													className: muted,
													children: [
														s.motorista || "Motorista",
														" ·",
														" ",
														s.empresa || "Sem empresa vinculada"
													]
												})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: (online ? "bg-status-normal/10 text-status-normal" : warning ? "bg-status-atencao/10 text-status-atencao" : "bg-surface-2 text-muted-foreground") + " ml-auto rounded-full px-2 py-1 text-[10px] font-semibold uppercase",
													children: String(s.estado_atual || s.status).replaceAll("_", " ")
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-3 text-xs",
												children: [
													cp.tipo || "Composição não informada",
													cp.altura ? ` · ${cp.altura} m` : "",
													cp.peso ? ` · ${cp.peso} t` : ""
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"Bateria: ",
														s.bateria_percentual ?? "—",
														"%",
														s.carregando ? " · carregando" : ""
													] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Rede: ", s.tipo_rede || "—"] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"GPS:",
														" ",
														s.gps_ativo === false ? "desligado" : s.gps_ativo === true ? "ativo" : "—"
													] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"Segundo plano:",
														" ",
														s.app_segundo_plano === true ? "sim" : s.app_segundo_plano === false ? "não" : "—"
													] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"Precisão:",
														" ",
														s.ultima_precisao_m != null ? `±${Number(s.ultima_precisao_m).toFixed(0)} m` : "—"
													] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"Velocidade:",
														" ",
														s.ultima_velocidade_kmh != null ? `${Number(s.ultima_velocidade_kmh).toFixed(0)} km/h` : "—"
													] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"Frequência: ",
														s.posicoes_por_minuto ?? 0,
														"/min"
													] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														"Sem comunicação: ",
														s.segundos_sem_comunicacao ?? 0,
														"s"
													] })
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "mt-2 text-[10px] text-muted-foreground",
												children: [
													"Última comunicação:",
													" ",
													s.ultima_comunicacao_em ? new Date(s.ultima_comunicacao_em).toLocaleString("pt-BR") : "—",
													" ",
													"· ",
													s.total_posicoes || 0,
													" posições · ",
													s.total_riscos || 0,
													" ",
													"riscos observados"
												]
											})
										]
									}, s.id);
								})
							}),
							!mobilePilot.loading && !mobilePilot.items.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground",
								children: "Nenhuma sessão móvel registrada. Elas aparecerão aqui quando o Android iniciar o piloto."
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: card + " p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "text-sm",
									children: "Perfis de composição"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: muted,
									children: "A composição ativa substitui as medidas básicas do veículo na análise."
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
								className: "grid grid-cols-2 gap-2",
								onSubmit: async (e) => {
									e.preventDefault();
									await act(token, "/guardiao/perfis-composicao", "POST", composition);
									setComposition({
										nome: "",
										placa: "",
										carreta: "",
										carga: "",
										altura: "",
										largura: "",
										comprimento: "",
										peso: "",
										eixos: ""
									});
									profiles.load();
								},
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										required: true,
										className: input,
										placeholder: "Nome da composição",
										value: composition.nome,
										onChange: (e) => setComposition({
											...composition,
											nome: e.target.value
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										required: true,
										className: input,
										value: composition.placa,
										onChange: (e) => setComposition({
											...composition,
											placa: e.target.value
										}),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "",
											children: "Selecione a placa"
										}), data.veiculos.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: v.placa,
											children: v.placa
										}, v.id))]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: input,
										placeholder: "Carreta/implemento",
										value: composition.carreta,
										onChange: (e) => setComposition({
											...composition,
											carreta: e.target.value
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										className: input,
										placeholder: "Descrição da carga",
										value: composition.carga,
										onChange: (e) => setComposition({
											...composition,
											carga: e.target.value
										})
									}),
									[
										["altura", "Altura total (m)"],
										["largura", "Largura (m)"],
										["comprimento", "Comprimento total (m)"],
										["peso", "Peso total (t)"],
										["eixos", "Quantidade de eixos"]
									].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										required: key !== "eixos",
										type: "number",
										min: key === "eixos" ? 1 : .1,
										step: key === "eixos" ? 1 : .01,
										className: input,
										placeholder: label,
										value: composition[key],
										onChange: (e) => setComposition({
											...composition,
											[key]: e.target.value
										})
									}, key)),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: btn + " col-span-2",
										children: "Salvar e ativar composição"
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 space-y-2",
								children: profiles.items.slice(0, 6).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center rounded-lg bg-surface-2 p-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", {
										className: "text-xs",
										children: [
											p.placa,
											" · ",
											p.nome
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: muted,
										children: [
											p.altura,
											"m × ",
											p.largura,
											"m · ",
											p.comprimento,
											"m · ",
											p.peso,
											"t ·",
											" ",
											p.eixos || "—",
											" eixos"
										]
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-auto text-[10px] " + (p.ativo ? "text-status-normal" : "text-muted-foreground"),
										children: p.ativo ? "ATIVA" : "INATIVA"
									})]
								}, p.id))
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: card + " p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
									className: "text-sm",
									children: "Relatório do modo sombra"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: muted,
									children: "Riscos observados sem interação com o motorista."
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: btn + " ml-auto",
									onClick: async () => setShadowReport(await apiRequest("/guardiao/modo-sombra/relatorio?dias=30", token)),
									children: "Atualizar"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 grid grid-cols-2 gap-2",
								children: [
									["eventos", "Eventos"],
									["veiculos", "Veículos expostos"],
									["iminentes", "Iminentes"],
									["criticos", "Críticos"]
								].map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-lg bg-surface-2 p-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: muted,
										children: label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
										className: "mt-1 block text-xl",
										children: shadowReport?.resumo?.[key] ?? "—"
									})]
								}, key))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 max-h-64 space-y-2 overflow-y-auto",
								children: shadowReport?.eventos?.slice(0, 12).map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-lg border border-border p-3",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", {
												className: "text-xs",
												children: [
													e.placa,
													" · ",
													e.nivel
												]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "ml-auto text-xs",
												children: [Number(e.distancia_km).toFixed(1), " km"]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: muted,
											children: [
												e.empresa,
												" · ",
												e.tipo_risco || "estrutura",
												" ·",
												" ",
												new Date(e.ultimo_evento_em).toLocaleString("pt-BR")
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-2 flex gap-3",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "text-[10px] text-status-normal",
													onClick: async () => {
														await act(token, `/guardiao/eventos-empresa/${e.id}/feedback`, "PATCH", { classificacao: "confirmado" });
														setShadowReport(await apiRequest("/guardiao/modo-sombra/relatorio?dias=30", token));
													},
													children: "Confirmar risco"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "text-[10px] text-status-atencao",
													onClick: async () => {
														await act(token, `/guardiao/eventos-empresa/${e.id}/feedback`, "PATCH", { classificacao: "falso_positivo" });
														setShadowReport(await apiRequest("/guardiao/modo-sombra/relatorio?dias=30", token));
													},
													children: "Falso positivo"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "text-[10px] text-muted-foreground",
													onClick: async () => {
														await act(token, `/guardiao/eventos-empresa/${e.id}/feedback`, "PATCH", { classificacao: "ignorado" });
														setShadowReport(await apiRequest("/guardiao/modo-sombra/relatorio?dias=30", token));
													},
													children: "Marcar ignorado"
												})
											]
										})
									]
								}, e.id))
							})
						]
					})
				]
			}),
			" "
		]
	});
}
function RadarMetric({ label, value, sub, tone }) {
	const color = tone === "critical" ? "text-status-critico" : tone === "warning" ? "text-status-atencao" : tone === "safe" ? "text-status-normal" : "text-foreground";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: card + " p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: muted,
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
				className: "mt-2 block truncate text-base " + color,
				children: value
			}),
			sub && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", {
				className: "text-xs text-muted-foreground",
				children: sub
			})
		]
	});
}
function RiskCard({ risk }) {
	const r = risk.dados?.restricao || risk.restricao || {}, c = risk.dados?.incompatibilidade || {};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-lg border p-3 " + (risk.nivel === "critico" ? "border-status-critico/40 bg-status-critico/[.07]" : "border-status-atencao/35 bg-status-atencao/[.06]"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "h-4 w-4 " + (risk.nivel === "critico" ? "text-status-critico" : "text-status-atencao") }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
						className: "text-xs uppercase",
						children: risk.nivel
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", {
						className: "ml-auto",
						children: [Number(risk.distancia_km || 0).toFixed(1), " km"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm font-semibold",
				children: r.nome || r.rodovia || risk.tipo_risco || "Estrutura à frente"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: muted,
				children: risk.tempo_estimado_min ? `${Math.max(1, Math.round(risk.tempo_estimado_min))} min até o ponto` : "tempo sendo calculado"
			}),
			c.tipo && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 rounded bg-black/15 p-2 text-xs",
				children: [
					c.tipo,
					": veículo ",
					c.veiculo,
					c.unidade,
					" · limite ",
					c.limite,
					c.unidade
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-[10px] text-muted-foreground",
				children: [
					r.status_confiabilidade === "possivel_risco" ? "Possível risco" : r.status_confiabilidade === "em_revisao" ? "Em revisão" : "Restrição confirmada",
					" ",
					"· Confiança ",
					r.confianca ?? "—",
					"% · fonte ",
					r.fonte || "base validada",
					r.fonte_atualizada_em || r.atualizada_em ? ` · atualizada ${new Date(r.fonte_atualizada_em || r.atualizada_em).toLocaleDateString("pt-BR")}` : ""
				]
			})
		]
	});
}
function EnterprisePanel({ section, token, data, refreshDashboard, usuario }) {
	const restrictions = useLoad(token, "/integracoes/portal/restricoes");
	const history = useLoad(token, "/integracoes/portal/historico?limite=300");
	const canTreat = ["administrador", "supervisor"].includes(String(usuario?.perfil));
	const config = {
		localizacao: {
			title: "Localização da frota",
			desc: "Posições recebidas exclusivamente da sua empresa.",
			items: data.localizacoes,
			titleOf: (x) => x.placa || "Veículo",
			detailOf: (x) => `${x.modelo || "Modelo não informado"} · ${x.status || "sem dados"} · ${x.ultima_atualizacao ? new Date(x.ultima_atualizacao).toLocaleString("pt-BR") : "sem posição"}`
		},
		viagens: {
			title: "Viagens",
			desc: "Operação vinculada aos veículos da empresa.",
			items: data.viagens,
			titleOf: (x) => x.placa || `Viagem ${x.id}`,
			detailOf: (x) => `${x.origem || "-"} → ${x.destino || "-"} · ${x.status || "-"}`
		},
		rotas: {
			title: "Rotas",
			desc: "Rotas próprias ou já utilizadas pela empresa.",
			items: data.rotas,
			titleOf: (x) => x.nome || `Rota ${x.id}`,
			detailOf: (x) => `${x.origem || "-"} → ${x.destino || "-"}`
		},
		reportes: {
			title: "Reportes",
			desc: "Ocorrências dos veículos da sua empresa.",
			items: data.reportes,
			titleOf: (x) => x.placa || x.motorista || "Reporte",
			detailOf: (x) => `${x.tipo || "Ocorrência"} · ${x.status_reporte || "ativo"}`
		},
		alertas: {
			title: "Central de Alertas",
			desc: "Alertas analisados pelo Guardião.",
			items: data.alertas,
			titleOf: (x) => x.placa || "Alerta",
			detailOf: (x) => `${x.nivel || x.severidade || "atenção"} · ${x.mensagem || x.tipo || x.status_operacional || "novo"}`
		},
		guardiao: {
			title: "Guardião",
			desc: "Supervisão em modo sombra e tratamento operacional.",
			items: data.alertas,
			titleOf: (x) => x.placa || "Análise",
			detailOf: (x) => `${x.nivel || "preventivo"} · ${x.status_operacional || "novo"} · ${x.distancia_km ?? "-"} km`
		},
		restricoes: {
			title: "Restrições de rotas",
			desc: "Restrições públicas e privadas disponíveis para análise.",
			items: restrictions.items,
			titleOf: (x) => x.nome || x.tipo || `Restrição ${x.id}`,
			detailOf: (x) => `${x.fonte || "base operacional"} · ${x.confianca || "confiança não informada"} · ${x.ativa ? "ativa" : "inativa"}`
		},
		auditoria: {
			title: "Caixa-preta",
			desc: "Histórico de análises do Guardião para sua empresa.",
			items: history.items,
			titleOf: (x) => x.placa || `Análise ${x.id}`,
			detailOf: (x) => `${x.status || "processada"} · ${x.riscos_encontrados || 0} risco(s) · ${x.analisado_em ? new Date(x.analisado_em).toLocaleString("pt-BR") : "-"}`
		}
	};
	const current = config[section] ?? config["localizacao"];
	const treat = (alert, status) => act(token, `/integracoes/portal/alertas/${alert.id}`, "PATCH", { status }).then(refreshDashboard);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Shell, {
		title: current.title,
		desc: `${current.desc} · Perfil: ${usuario?.perfil || "consulta"}`,
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "h-5 w-5" }),
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			onClick: refreshDashboard,
			className: btn,
			children: "Atualizar"
		}),
		children: [section === "localizacao" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mb-4 min-h-[420px] overflow-hidden rounded-xl",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, { items: data.localizacoes })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cards, {
			items: current.items,
			title: current.titleOf,
			detail: current.detailOf,
			actions: canTreat && ["alertas", "guardiao"].includes(section) ? (x) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => treat(x, "em_analise"),
					className: "text-primary",
					children: "Assumir análise"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => treat(x, "monitorando"),
					className: "text-status-atencao",
					children: "Monitorar"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => treat(x, "resolvido"),
					className: "text-status-normal",
					children: "Resolver"
				})
			] }) : void 0
		})]
	});
}
function OperationalPanel(p) {
	if (p.usuario?.tipo === "empresa_usuario") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EnterprisePanel, { ...p });
	if (p.section === "saude") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SystemHealthPanel, { token: p.token });
	if (p.section === "veiculos") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Vehicles, { ...p });
	if (p.section === "frota" || p.section === "localizacao" || p.section === "motoristas") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Fleet, { ...p });
	if (p.section === "viagens") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trips, { ...p });
	if (p.section === "alertas") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Alerts, { ...p });
	if (p.section === "reportes") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Reports, { ...p });
	if (p.section === "historico") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HistoryPage, { ...p });
	if (p.section === "auditoria") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Audit, { ...p });
	if (p.section === "restricoes") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RestrictionCatalog, { ...p });
	if (p.section === "guardiao") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Restrictions, { ...p });
	if (p.section === "validadas") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Validated, { ...p });
	if (p.section === "rotas") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Routes, { ...p });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, {
		title: "Configurações",
		desc: "Área administrativa",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "h-5 w-5" }),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: card + " p-8",
			children: "Nenhuma configuração adicional exposta pela API."
		})
	});
}
var empty = {
	veiculos: [],
	motoristas: [],
	viagens: [],
	localizacoes: [],
	alertas: [],
	reportes: [],
	rotas: []
};
var recent = (x) => {
	const d = new Date(x.ultima_atualizacao);
	return Number.isFinite(+d) && Date.now() - +d <= 6e4;
};
var time = (x) => {
	const d = new Date(x.criado_em || x.data_hora || x.timestamp || x.ultima_atualizacao);
	return Number.isFinite(+d) ? d.toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit"
	}) : "-";
};
function DashboardPage() {
	const [session, setSession] = (0, import_react.useState)(() => readSession());
	const [active, setActive] = (0, import_react.useState)("dashboard");
	const [data, setData] = (0, import_react.useState)(empty);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const refresh = (0, import_react.useCallback)(async () => {
		if (!session) return;
		setBusy(true);
		try {
			setData(await loadDashboard(session.token, session.usuario));
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao atualizar");
		} finally {
			setBusy(false);
		}
	}, [session]);
	(0, import_react.useEffect)(() => {
		refresh();
		if (!session) return;
		const id = setInterval(refresh, 1e4);
		return () => clearInterval(id);
	}, [session, refresh]);
	const live = data.localizacoes.filter(recent);
	const running = data.viagens.filter((v) => v.status === "em_andamento");
	const critical = data.alertas.filter((a) => a.severidade === "alta" || a.tipo === "guardiao");
	const falhasParciais = Object.entries(data.status || {}).filter(([, s]) => s.estado === "erro");
	const activeRouteGeoJson = (0, import_react.useMemo)(() => {
		const features = [];
		for (const trip of running) {
			const savedRoute = data.rotas.find((route) => String(route.id) === String(trip.id_rota));
			let shape = trip.dados_geojson || trip.rota_aprovada_geojson || savedRoute?.dados_geojson;
			for (let pass = 0; pass < 2 && typeof shape === "string"; pass++) try {
				shape = JSON.parse(shape);
			} catch {
				shape = null;
			}
			const properties = {
				viagem_id: trip.id,
				placa: trip.placa || trip.veiculo_placa,
				rota_nome: trip.rota_nome || savedRoute?.nome
			};
			if (shape?.type === "FeatureCollection") for (const feature of shape.features || []) features.push({
				...feature,
				properties: {
					...feature.properties || {},
					...properties
				}
			});
			else if (shape?.type === "Feature") features.push({
				...shape,
				properties: {
					...shape.properties || {},
					...properties
				}
			});
			else if (["LineString", "MultiLineString"].includes(shape?.type)) features.push({
				type: "Feature",
				geometry: shape,
				properties
			});
		}
		return features.length ? {
			type: "FeatureCollection",
			features
		} : null;
	}, [running, data.rotas]);
	const runningVehicles = (0, import_react.useMemo)(() => running.filter((v) => Number.isFinite(+v.lat) && Number.isFinite(+v.lon)).map((v) => ({
		...v,
		nome: v.placa || v.veiculo_placa,
		em_viagem: true
	})), [running]);
	const metrics = (0, import_react.useMemo)(() => [
		{
			id: "v",
			label: "VEICULOS ATIVOS",
			value: String(live.length),
			sub: "de " + data.veiculos.length,
			progress: data.veiculos.length ? live.length / data.veiculos.length * 100 : 0,
			tone: "primary",
			icon: "truck"
		},
		{
			id: "t",
			label: "VIAGENS EM ANDAMENTO",
			value: String(running.length),
			sub: "operacao atual",
			progress: running.length ? 72 : 0,
			tone: "normal",
			icon: "route"
		},
		{
			id: "a",
			label: "ALERTAS CRITICOS",
			value: String(critical.length),
			sub: "requerem atencao",
			progress: Math.min(100, critical.length * 15),
			tone: "guardiao",
			icon: "alert"
		},
		{
			id: "r",
			label: "ROTAS CONCLUIDAS",
			value: String(data.viagens.filter((v) => v.status === "concluida").length),
			sub: "historico retornado",
			progress: 55,
			tone: "alerta",
			icon: "network"
		},
		{
			id: "p",
			label: "REPORTES ATIVOS",
			value: String(data.reportes.filter((r) => (r.status_reporte || "ativo") === "ativo").length),
			sub: "ocorrencias abertas",
			progress: 40,
			tone: "turquoise",
			icon: "gauge"
		}
	], [
		data,
		live.length,
		running.length,
		critical.length
	]);
	if (!session) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Login, { onLogin: async (u, p, e) => setSession(await login(u, p, e)) });
	const open = (tab) => setActive(tab);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-screen w-full overflow-hidden bg-background text-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sidebar, {
			onNavigate: open,
			alertCount: critical.length,
			activeId: active,
			usuario: session.usuario
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex min-w-0 flex-1 flex-col",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex h-[70px] items-center gap-4 border-b border-border px-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-lg font-semibold",
					children: {
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
						validadas: "Passaporte Digital"
					}[active] || "Painel operacional"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-xs text-muted-foreground",
					children: [
						session.usuario.nome || "Administrador",
						" ·",
						" ",
						session.usuario.empresa || "Administração geral"
					]
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "ml-auto flex items-center gap-3",
					children: [
						error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs text-status-critico",
							children: error
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: refresh,
							className: "rounded-md border border-border p-2",
							title: "Atualizar",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4 " + (busy ? "animate-spin" : "") })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: async () => {
								await logout(session.token);
								setSession(null);
								setData(empty);
							},
							className: "rounded-md border border-border p-2",
							title: "Sair",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "h-4 w-4" })
						})
					]
				})]
			}), active === "dashboard" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "flex-1 overflow-y-auto p-5",
				children: [
					falhasParciais.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 rounded-xl border border-status-atencao/40 bg-status-atencao/10 p-3 text-xs text-status-atencao",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Dados parcialmente indisponíveis:" }),
							" ",
							falhasParciais.map(([nome, s]) => `${nome} (${s.mensagem})`).join(" · "),
							". Os números dessas áreas não representam zero."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5",
						children: metrics.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetricCard, { metric: m }, m.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid gap-4 xl:grid-cols-[1fr_360px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "min-h-[420px] overflow-hidden rounded-xl",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMap, {
								items: runningVehicles.length ? runningVehicles : data.localizacoes,
								geojson: activeRouteGeoJson
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "rounded-xl border border-border bg-card",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center p-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
										className: "text-xs",
										children: "ALERTAS ATIVOS"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-2 rounded-full bg-status-critico px-2 text-xs",
										children: data.alertas.length
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => open("alertas"),
										className: "ml-auto text-xs text-primary",
										children: "Ver todos"
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-2 px-3 pb-3",
								children: [data.alertas.slice(0, 6).map((a, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "rounded-lg border border-status-atencao/30 bg-status-atencao/[.06] p-3",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: a.tipo === "guardiao" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "h-4 w-4 text-guardian" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-4 w-4 text-status-atencao" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
												className: "text-xs",
												children: a.placa || "Alerta operacional"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "mt-1 text-xs text-muted-foreground",
												children: a.mensagem || a.tipo || a.status_operacional
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: time(a) })
										] })]
									})
								}, a.id || i)), !data.alertas.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "p-4 text-xs text-muted-foreground",
									children: "Sem alertas ativos."
								})]
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid gap-4 lg:grid-cols-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, {
								title: "VEÍCULOS EM ANDAMENTO (" + running.length + ")",
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Truck, {}),
								rows: running.map((v) => ({
									a: v.placa || v.veiculo_placa || "Veículo",
									b: (v.origem || "-") + " → " + (v.destino || "-")
								})),
								onClick: () => open("viagens")
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, {
								title: "ÚLTIMOS REPORTES",
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {}),
								rows: data.reportes.slice(0, 6).map((r) => ({
									a: r.motorista || r.placa || "Reporte",
									b: r.tipo + " · " + (r.status_reporte || "ativo")
								})),
								onClick: () => open("reportes")
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, {
								title: "VEÍCULOS E CONDUTORES",
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, {}),
								rows: data.localizacoes.slice(0, 6).map((v) => ({
									a: v.placa || "Veículo",
									b: v.nome || v.status || "Nenhum motorista vinculado"
								})),
								onClick: () => open("localizacao")
							})
						]
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OperationalPanel, {
				section: active,
				token: session.token,
				data,
				refreshDashboard: refresh,
				usuario: session.usuario
			})]
		})]
	});
}
function Login({ onLogin }) {
	const [u, su] = (0, import_react.useState)("");
	const [p, sp] = (0, import_react.useState)("");
	const [e, se] = (0, import_react.useState)("");
	const [empresa, setEmpresa] = (0, import_react.useState)("");
	const [modoEmpresa, setModoEmpresa] = (0, import_react.useState)(false);
	const [b, sb] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: async (x) => {
				x.preventDefault();
				sb(true);
				se("");
				try {
					await onLogin(u, p, modoEmpresa ? empresa : void 0);
				} catch (y) {
					se(y instanceof Error ? y.message : "Falha no login");
				} finally {
					sb(false);
				}
			},
			className: "w-[360px] rounded-xl border border-border bg-card p-7",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "h-10 w-10 text-primary" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-3 text-xl font-bold",
					children: "GPS Caminhao Gestor"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-xs",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setModoEmpresa(false),
						className: (modoEmpresa ? "" : "bg-primary text-white") + " rounded-md p-2",
						children: "Gestor geral"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setModoEmpresa(true),
						className: (modoEmpresa ? "bg-primary text-white" : "") + " rounded-md p-2",
						children: "Empresa"
					})]
				}),
				modoEmpresa && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					required: true,
					autoFocus: true,
					value: empresa,
					onChange: (x) => setEmpresa(x.target.value),
					placeholder: "Nome ou código da empresa",
					className: "mt-3 w-full rounded border border-border bg-surface-2 p-3"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					required: true,
					autoFocus: !modoEmpresa,
					value: u,
					onChange: (x) => su(x.target.value),
					placeholder: modoEmpresa ? "E-mail" : "Usuário ou e-mail",
					className: "mt-3 w-full rounded border border-border bg-surface-2 p-3"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					required: true,
					type: "password",
					value: p,
					onChange: (x) => sp(x.target.value),
					placeholder: "Senha",
					className: "mt-3 w-full rounded border border-border bg-surface-2 p-3"
				}),
				e && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-xs text-status-critico",
					children: e
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "mt-4 w-full rounded bg-primary p-3 font-semibold",
					children: b ? "Autenticando..." : "Entrar"
				})
			]
		})
	});
}
function List({ title, icon, rows, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl border border-border bg-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2 p-4 text-xs font-bold",
				children: [
					icon && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "[&>svg]:h-4 [&>svg]:w-4",
						children: icon
					}),
					title,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick,
						className: "ml-auto text-primary",
						children: "Abrir"
					})
				]
			}),
			rows.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
					className: "text-xs",
					children: r.a
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-muted-foreground",
					children: r.b
				})]
			}, i)),
			!rows.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "border-t border-border p-4 text-xs text-muted-foreground",
				children: "Nenhum registro."
			})
		]
	});
}
//#endregion
export { DashboardPage as component };
