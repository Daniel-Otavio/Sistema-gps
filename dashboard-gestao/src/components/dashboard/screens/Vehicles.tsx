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

export function Vehicles({ token, refreshDashboard }: P) {
  const q = useLoad(token, "/veiculos"),
    blank = {
      placa: "",
      frota: "",
      modelo: "",
      comprimento: 12,
      largura: 2.6,
      peso: 15,
      consumo_medio_km_l: 2.5,
      preco_combustivel_ref: "",
      tipo_combustivel: "diesel",
    };
  const [f, setF] = useState<ApiValue>(blank),
    [edit, setEdit] = useState<ApiValue>(null),
    [msg, setMsg] = useState("");
  async function save(e: ApiValue) {
    e.preventDefault();
    try {
      await act(
        token,
        edit ? "/veiculos/" + edit.id : "/veiculos",
        edit ? "PUT" : "POST",
        {
          ...f,
          placa: f.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""),
          comprimento: +f.comprimento,
          largura: +f.largura,
          peso: +f.peso,
          consumo_medio_km_l: +f.consumo_medio_km_l || null,
          preco_combustivel_ref: +f.preco_combustivel_ref || null,
        },
      );
      setF(blank);
      setEdit(null);
      setMsg("Veículo salvo.");
      q.load();
      refreshDashboard();
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Erro");
    }
  }
  return (
    <Shell
      title="Cadastro de veículos"
      desc="Dimensões, consumo e disponibilidade da frota."
      icon={<Truck className="h-5 w-5" />}
    >
      <Note q={q} />
      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <form onSubmit={save} className={card + " grid grid-cols-2 gap-3 p-5"}>
          <Field
            label="Placa"
            value={f.placa}
            set={(v: ApiValue) => setF({ ...f, placa: v })}
          />
          <Field
            label="Frota"
            value={f.frota}
            set={(v: ApiValue) => setF({ ...f, frota: v })}
          />
          <div className="col-span-2">
            <Field
              label="Modelo"
              value={f.modelo}
              set={(v: ApiValue) => setF({ ...f, modelo: v })}
            />
          </div>
          {[
            "comprimento",
            "largura",
            "peso",
            "consumo_medio_km_l",
            "preco_combustivel_ref",
          ].map((k) => (
            <Field
              key={k}
              label={k.replaceAll("_", " ")}
              type="number"
              value={f[k]}
              set={(v: ApiValue) => setF({ ...f, [k]: v })}
            />
          ))}
          <button className={btn + " col-span-2"}>
            {edit ? "Atualizar" : "Cadastrar"} veículo
          </button>
          {msg && <p className="col-span-2 text-xs text-primary">{msg}</p>}
        </form>
        <Cards
          items={q.items}
          title={(v: ApiValue) => v.placa}
          detail={(v: ApiValue) =>
            (v.modelo || "Sem modelo") +
            " · " +
            v.comprimento +
            "m × " +
            v.largura +
            "m · " +
            v.peso +
            "t"
          }
          actions={(v: ApiValue) => [
            <button
              key="e"
              className="text-xs text-primary"
              onClick={() => {
                setEdit(v);
                setF({ ...blank, ...v });
              }}
            >
              Editar
            </button>,
            <button
              key="s"
              className="text-xs text-status-atencao"
              onClick={async () => {
                await act(token, "/veiculos/" + v.id + "/status", "PATCH", {
                  ativo: !v.ativo,
                });
                q.load();
              }}
            >
              {v.ativo ? "Desativar" : "Ativar"}
            </button>,
          ]}
        />
      </div>
    </Shell>
  );
}
