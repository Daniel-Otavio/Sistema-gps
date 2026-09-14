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

export function Fleet({ token, data }: P) {
  const l = useLoad(token, "/localizacoes", data.localizacoes);
  return (
    <Shell
      title="Localização da frota"
      desc="Veículos e condutores atuais em tempo real."
      icon={<MapPin className="h-5 w-5" />}
      actions={
        <button
          className={btn}
          onClick={() => {
            l.load();
          }}
        >
          Atualizar
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.7fr)]">
        <div className="min-w-0">
          <LiveMap items={l.items} />
        </div>
        <div className={card + " min-w-0 overflow-hidden"}>
          <div className="flex items-center border-b border-border p-4">
            <div>
              <h3 className="font-bold">Veículos monitorados</h3>
              <p className={muted}>Placa e motorista atual</p>
            </div>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {l.items.length}
            </span>
          </div>
          <div className="max-h-[455px] space-y-2 overflow-y-auto p-3">
            {l.items.map((x: ApiValue) => {
              const updated = new Date(x.ultima_atualizacao || 0);
              const online =
                Number.isFinite(+updated) &&
                Date.now() - +updated <= 5 * 60 * 1000;
              return (
                <div
                  key={x.id}
                  className="rounded-lg border border-border/80 bg-gradient-to-br from-card to-surface-2/55 p-3 transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Truck className="h-4 w-4 text-primary" />
                    </div>
                    <div className="ml-3 min-w-0">
                      <b className="block text-sm">{x.placa}</b>
                      <p className={muted}>
                        {x.modelo || x.frota || "Veículo cadastrado"}
                      </p>
                    </div>
                    <span
                      className={
                        (online
                          ? "bg-status-normal/10 text-status-normal"
                          : "bg-status-atencao/10 text-status-atencao") +
                        " ml-auto rounded-full px-2 py-1 text-[10px]"
                      }
                    >
                      {online
                        ? "ONLINE"
                        : x.ultima_atualizacao
                          ? "SEM SINAL"
                          : "SEM GPS"}
                    </span>
                  </div>
                  <div className="mt-3 border-t border-border/60 pt-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Motorista atual
                    </p>
                    <p className="mt-1 text-xs font-medium">
                      {x.nome || "Nenhum motorista vinculado"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {x.ultima_atualizacao
                        ? `Última posição: ${updated.toLocaleString("pt-BR")}`
                        : "Ainda não enviou posição"}
                    </p>
                  </div>
                </div>
              );
            })}
            {!l.items.length && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum veículo monitorado.
              </p>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
