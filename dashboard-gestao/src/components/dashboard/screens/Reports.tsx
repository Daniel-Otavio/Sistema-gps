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

export function Reports({ token }: P) {
  const q = useLoad(token, "/reportes"),
    [f, setF] = useState("ativo");
  const items = q.items.filter(
    (x) => f === "todos" || (x.status_reporte || "ativo") === f,
  );
  return (
    <Shell
      title="Reportes"
      desc="Ocorrências enviadas pelos motoristas."
      icon={<FileText className="h-5 w-5" />}
      actions={
        <div className="flex gap-2">
          <select
            className={input}
            value={f}
            onChange={(e) => setF(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="resolvido">Resolvidos</option>
            <option value="expirado">Expirados</option>
          </select>
          <button className={btn} onClick={q.load}>
            Atualizar
          </button>
          <button
            className="rounded-lg border border-status-critico/40 px-3 text-xs text-status-critico"
            onClick={async () => {
              if (confirm("Apagar todos os reportes?")) {
                await act(token, "/reportes", "DELETE");
                q.load();
              }
            }}
          >
            Limpar
          </button>
        </div>
      }
    >
      <Note q={q} />
      <Cards
        items={items}
        title={(x: ApiValue) => x.motorista || x.placa || "Reporte"}
        detail={(x: ApiValue) => x.tipo + " · " + (x.status_reporte || "ativo")}
        actions={(x: ApiValue) => (
          <button
            className="text-xs text-primary"
            onClick={async () => {
              await act(token, "/reportes/" + x.id + "/status", "PATCH", {
                status:
                  (x.status_reporte || "ativo") === "ativo"
                    ? "resolvido"
                    : "ativo",
              });
              q.load();
            }}
          >
            Alterar status
          </button>
        )}
      />
    </Shell>
  );
}
