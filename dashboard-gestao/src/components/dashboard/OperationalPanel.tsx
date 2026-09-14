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
import { SystemHealthPanel } from "./SystemHealthPanel";
import { LiveMap } from "./LiveMap";
import {
  P,
  Shell,
  Cards,
  useLoad,
  card,
  input,
  btn,
  muted,
} from "./panel-shared";
import { Vehicles } from "./screens/Vehicles";
import { Fleet } from "./screens/Fleet";
import { Alerts } from "./screens/Alerts";
import { Trips } from "./screens/Trips";
import { Reports } from "./screens/Reports";
import { HistoryPage } from "./screens/HistoryPage";
import { Audit } from "./screens/Audit";
import { Validated } from "./screens/Validated";
import { Routes } from "./screens/Routes";
import { RestrictionCatalog } from "./screens/RestrictionCatalog";
import { Restrictions } from "./screens/Guardian";
import { EnterprisePanel } from "./screens/Integrations";
import { apiRequest } from "@/lib/api";
export function OperationalPanel(p: P) {
  if (p.usuario?.tipo === "empresa_usuario") return <EnterprisePanel {...p} />;
  if (p.section === "saude") return <SystemHealthPanel token={p.token} />;
  if (p.section === "veiculos") return <Vehicles {...p} />;
  if (
    p.section === "frota" ||
    p.section === "localizacao" ||
    p.section === "motoristas"
  )
    return <Fleet {...p} />;
  if (p.section === "viagens") return <Trips {...p} />;
  if (p.section === "alertas") return <Alerts {...p} />;
  if (p.section === "reportes") return <Reports {...p} />;
  if (p.section === "historico") return <HistoryPage {...p} />;
  if (p.section === "auditoria") return <Audit {...p} />;
  if (p.section === "restricoes") return <RestrictionCatalog {...p} />;
  if (p.section === "guardiao") return <Restrictions {...p} />;
  if (p.section === "validadas") return <Validated {...p} />;
  if (p.section === "rotas") return <Routes {...p} />;
  return (
    <Shell
      title="Configurações"
      desc="Área administrativa"
      icon={<FileText className="h-5 w-5" />}
    >
      <div className={card + " p-8"}>
        Nenhuma configuração adicional exposta pela API.
      </div>
    </Shell>
  );
}
