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

export function EnterprisePanel({
  section,
  token,
  data,
  refreshDashboard,
  usuario,
}: P) {
  const restrictions = useLoad(token, "/integracoes/portal/restricoes");
  const history = useLoad(token, "/integracoes/portal/historico?limite=300");
  const canTreat = ["administrador", "supervisor"].includes(
    String(usuario?.perfil),
  );
  const config: Record<
    string,
    {
      title: string;
      desc: string;
      items: ApiValue[];
      titleOf: (x: ApiValue) => string;
      detailOf: (x: ApiValue) => string;
    }
  > = {
    localizacao: {
      title: "Localização da frota",
      desc: "Posições recebidas exclusivamente da sua empresa.",
      items: data.localizacoes,
      titleOf: (x) => x.placa || "Veículo",
      detailOf: (x) =>
        `${x.modelo || "Modelo não informado"} · ${x.status || "sem dados"} · ${x.ultima_atualizacao ? new Date(x.ultima_atualizacao).toLocaleString("pt-BR") : "sem posição"}`,
    },
    viagens: {
      title: "Viagens",
      desc: "Operação vinculada aos veículos da empresa.",
      items: data.viagens,
      titleOf: (x) => x.placa || `Viagem ${x.id}`,
      detailOf: (x) =>
        `${x.origem || "-"} → ${x.destino || "-"} · ${x.status || "-"}`,
    },
    rotas: {
      title: "Rotas",
      desc: "Rotas próprias ou já utilizadas pela empresa.",
      items: data.rotas,
      titleOf: (x) => x.nome || `Rota ${x.id}`,
      detailOf: (x) => `${x.origem || "-"} → ${x.destino || "-"}`,
    },
    reportes: {
      title: "Reportes",
      desc: "Ocorrências dos veículos da sua empresa.",
      items: data.reportes,
      titleOf: (x) => x.placa || x.motorista || "Reporte",
      detailOf: (x) =>
        `${x.tipo || "Ocorrência"} · ${x.status_reporte || "ativo"}`,
    },
    alertas: {
      title: "Central de Alertas",
      desc: "Alertas analisados pelo Guardião.",
      items: data.alertas,
      titleOf: (x) => x.placa || "Alerta",
      detailOf: (x) =>
        `${x.nivel || x.severidade || "atenção"} · ${x.mensagem || x.tipo || x.status_operacional || "novo"}`,
    },
    guardiao: {
      title: "Guardião",
      desc: "Supervisão em modo sombra e tratamento operacional.",
      items: data.alertas,
      titleOf: (x) => x.placa || "Análise",
      detailOf: (x) =>
        `${x.nivel || "preventivo"} · ${x.status_operacional || "novo"} · ${x.distancia_km ?? "-"} km`,
    },
    restricoes: {
      title: "Restrições de rotas",
      desc: "Restrições públicas e privadas disponíveis para análise.",
      items: restrictions.items,
      titleOf: (x) => x.nome || x.tipo || `Restrição ${x.id}`,
      detailOf: (x) =>
        `${x.fonte || "base operacional"} · ${x.confianca || "confiança não informada"} · ${x.ativa ? "ativa" : "inativa"}`,
    },
    auditoria: {
      title: "Caixa-preta",
      desc: "Histórico de análises do Guardião para sua empresa.",
      items: history.items,
      titleOf: (x) => x.placa || `Análise ${x.id}`,
      detailOf: (x) =>
        `${x.status || "processada"} · ${x.riscos_encontrados || 0} risco(s) · ${x.analisado_em ? new Date(x.analisado_em).toLocaleString("pt-BR") : "-"}`,
    },
  };
  const current = config[section] ?? config["localizacao"]!;
  const treat = (alert: ApiValue, status: string) =>
    act(token, `/integracoes/portal/alertas/${alert.id}`, "PATCH", {
      status,
    }).then(refreshDashboard);
  return (
    <Shell
      title={current.title}
      desc={`${current.desc} · Perfil: ${usuario?.perfil || "consulta"}`}
      icon={<ShieldAlert className="h-5 w-5" />}
      actions={
        <button onClick={refreshDashboard} className={btn}>
          Atualizar
        </button>
      }
    >
      {section === "localizacao" && (
        <div className="mb-4 min-h-[420px] overflow-hidden rounded-xl">
          <LiveMap items={data.localizacoes} />
        </div>
      )}
      <Cards
        items={current.items}
        title={current.titleOf}
        detail={current.detailOf}
        actions={
          canTreat && ["alertas", "guardiao"].includes(section)
            ? (x: ApiValue) => (
                <>
                  <button
                    onClick={() => treat(x, "em_analise")}
                    className="text-primary"
                  >
                    Assumir análise
                  </button>
                  <button
                    onClick={() => treat(x, "monitorando")}
                    className="text-status-atencao"
                  >
                    Monitorar
                  </button>
                  <button
                    onClick={() => treat(x, "resolvido")}
                    className="text-status-normal"
                  >
                    Resolver
                  </button>
                </>
              )
            : undefined
        }
      />
    </Shell>
  );
}
