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

export function Audit({ token }: P) {
  const q = useLoad(token, "/auditoria/viagens");
  return (
    <Shell
      title="Caixa-preta"
      desc="Linha do tempo operacional."
      icon={<History className="h-5 w-5" />}
    >
      <Note q={q} />
      <Cards
        items={q.items}
        title={(x: ApiValue) => x.acao || "Evento"}
        detail={(x: ApiValue) =>
          (x.placa || "-") + " · " + (x.observacao || x.criado_em || "")
        }
      />
    </Shell>
  );
}
