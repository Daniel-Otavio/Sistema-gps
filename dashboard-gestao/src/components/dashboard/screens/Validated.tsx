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

export function Validated({ token }: P) {
  const q = useLoad(token, "/rotas-especificas");
  return (
    <Shell
      title="Passaporte Digital"
      desc="Rotas específicas validadas."
      icon={<CheckCircle2 className="h-5 w-5" />}
      actions={
        <button
          className={btn}
          onClick={async () => {
            await act(token, "/rotas-especificas/verificar-reportes", "POST");
            q.load();
          }}
        >
          Verificar reportes
        </button>
      }
    >
      <Cards
        items={q.items}
        title={(x: ApiValue) => x.nome || x.rota_nome || "Rota " + x.id}
        detail={(x: ApiValue) => (x.origem || "-") + " → " + (x.destino || "-")}
        actions={(x: ApiValue) => (
          <button
            className="text-xs text-primary"
            onClick={async () => {
              await act(
                token,
                "/rotas-especificas/" + x.id + "/bloqueio",
                "PATCH",
                { bloqueada: !x.bloqueada, motivo: "Ação do gestor" },
              );
              q.load();
            }}
          >
            {x.bloqueada ? "Desbloquear" : "Bloquear"}
          </button>
        )}
      />
    </Shell>
  );
}
