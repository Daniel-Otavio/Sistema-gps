import { useState } from "react";
import {
  LayoutDashboard,
  Route,
  Truck,
  MapPin,
  FileText,
  Ban,
  ShieldAlert,
  AlertTriangle,
  Archive,
  BadgeCheck,
  UserCog,
  Settings,
  HeartPulse,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo-shield.png";

type Badge = { text: string; tone: "live" | "new" | "danger" };

interface Item {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: Badge;
  children?: { id: string; label: string }[];
}

const operacao: Item[] = [
  { id: "rotas", label: "Rotas", icon: Route },
  {
    id: "frota",
    label: "Frota",
    icon: Truck,
    children: [
      { id: "cadastro", label: "Cadastro" },
      { id: "viagens", label: "Viagens" },
    ],
  },
  {
    id: "localizacao",
    label: "Localização",
    icon: MapPin,
    badge: { text: "Ao vivo", tone: "live" },
  },
  { id: "reportes", label: "Reportes", icon: FileText },
  { id: "restricao", label: "Restrição de Rotas", icon: Ban },
  {
    id: "guardiao",
    label: "Guardião",
    icon: ShieldAlert,
    badge: { text: "NOVO", tone: "new" },
  },
];

const inteligencia: Item[] = [
  {
    id: "alertas",
    label: "Central de Alertas",
    icon: AlertTriangle,
    badge: { text: "0", tone: "danger" },
  },
  { id: "caixa-preta", label: "Caixa-preta", icon: Archive },
  { id: "passaporte", label: "Passaporte Digital", icon: BadgeCheck },
];

const configuracoes: Item[] = [
  { id: "saude", label: "Saúde do Sistema", icon: HeartPulse },
  { id: "usuarios", label: "Usuários", icon: UserCog },
  { id: "config", label: "Configurações", icon: Settings },
];

function BadgePill({ badge }: { badge: Badge }) {
  return (
    <span
      className={cn(
        "ml-auto rounded-full px-2 py-[2px] text-[10px] font-semibold leading-none",
        badge.tone === "live" && "bg-status-normal/15 text-status-normal",
        badge.tone === "new" && "bg-guardian/20 text-guardian",
        badge.tone === "danger" && "bg-status-critico/20 text-status-critico",
      )}
    >
      {badge.text}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 pb-2 pt-5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/70">
      {children}
    </p>
  );
}

export function Sidebar({
  onNavigate,
  alertCount = 0,
  activeId,
  usuario,
}: {
  onNavigate?: (section: string) => void;
  alertCount?: number;
  activeId?: string;
  usuario?: {
    tipo?: string;
    perfil?: string;
    [key: string]: ApiValue;
  };
}) {
  const [active, setActive] = useState("dashboard");
  const [openFrota, setOpenFrota] = useState(true);
  const empresarial = usuario?.tipo === "empresa_usuario";
  const permitidosEmpresa = new Set([
    "rotas",
    "frota",
    "localizacao",
    "reportes",
    "restricao",
    "guardiao",
    "alertas",
    "caixa-preta",
  ]);

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const isActive = (activeId ?? active) === item.id;
    const visibleChildren = empresarial
      ? item.children?.filter((child) => child.id === "viagens")
      : item.children;
    const expandable = !!visibleChildren?.length;
    return (
      <div key={item.id}>
        <button
          onClick={() => {
            setActive(item.id);
            if (!expandable)
              onNavigate?.(
                item.id === "restricao"
                  ? "restricoes"
                  : item.id === "caixa-preta"
                    ? "auditoria"
                    : item.id === "passaporte"
                      ? "validadas"
                      : item.id === "usuarios" || item.id === "config"
                        ? "dashboard"
                        : item.id,
              );
            if (expandable) setOpenFrota((v) => !v);
          }}
          className={cn(
            "flex w-full items-center gap-3 px-5 py-[9px] text-[13px] transition-colors",
            isActive
              ? "bg-sidebar-accent text-foreground"
              : "text-slate-300 hover:bg-sidebar-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="h-[15px] w-[15px] shrink-0 text-slate-400" />
          <span className="truncate">{item.label}</span>
          {item.badge && (
            <BadgePill
              badge={
                item.id === "alertas"
                  ? { ...item.badge, text: String(alertCount) }
                  : item.badge
              }
            />
          )}
          {expandable &&
            (openFrota ? (
              <ChevronUp className="ml-auto h-[14px] w-[14px] text-slate-500" />
            ) : (
              <ChevronDown className="ml-auto h-[14px] w-[14px] text-slate-500" />
            ))}
        </button>
        {expandable && openFrota && (
          <div>
            {visibleChildren!.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActive(c.id);
                  onNavigate?.(c.id === "cadastro" ? "veiculos" : c.id);
                }}
                className={cn(
                  "block w-full px-5 py-[7px] pl-[52px] text-left text-[12.5px] transition-colors",
                  (activeId ?? active) ===
                    (c.id === "cadastro" ? "veiculos" : c.id)
                    ? "text-primary"
                    : "text-slate-400 hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-screen w-[230px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar">
      <div className="flex items-center gap-[10px] px-4 py-[18px]">
        <img
          src={logo}
          alt="Logotipo GPS Caminhão"
          className="h-9 w-9"
          width={72}
          height={72}
        />
        <div className="leading-none">
          <p className="text-[15px] font-extrabold tracking-tight text-foreground">
            GPS CAMINHÃO
          </p>
          <p className="mt-[3px] text-[10px] font-bold tracking-[0.18em] text-brand">
            GESTOR
          </p>
        </div>
      </div>

      <button
        onClick={() => {
          setActive("dashboard");
          onNavigate?.("dashboard");
        }}
        className={cn(
          "mx-3 flex items-center gap-3 rounded-md px-3 py-[10px] text-[13px] font-medium transition-colors",
          (activeId ?? active) === "dashboard"
            ? "bg-primary/15 text-primary"
            : "text-slate-300 hover:bg-sidebar-accent",
        )}
      >
        <LayoutDashboard className="h-[16px] w-[16px]" />
        Dashboard
      </button>

      <SectionLabel>OPERAÇÃO</SectionLabel>
      {(empresarial
        ? operacao.filter((item) => permitidosEmpresa.has(item.id))
        : operacao
      ).map(renderItem)}

      <SectionLabel>INTELIGÊNCIA</SectionLabel>
      {(empresarial
        ? inteligencia.filter((item) => permitidosEmpresa.has(item.id))
        : inteligencia
      ).map(renderItem)}

      {!empresarial && <SectionLabel>CONFIGURAÇÕES</SectionLabel>}
      {!empresarial && configuracoes.map(renderItem)}

      <div className="h-6" />
    </aside>
  );
}
