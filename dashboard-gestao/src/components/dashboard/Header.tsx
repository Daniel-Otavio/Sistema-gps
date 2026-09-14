import { Menu, Search, Bell, ChevronDown } from "lucide-react";
import avatar from "@/assets/avatar-admin.png";

export function Header() {
  return (
    <header className="flex h-[70px] shrink-0 items-center gap-6 border-b border-border bg-card/40 px-6">
      <button
        aria-label="Alternar menu"
        className="text-slate-300 transition-colors hover:text-foreground"
      >
        <Menu className="h-[22px] w-[22px]" />
      </button>
      <h1 className="text-[19px] font-semibold text-foreground">Dashboard</h1>

      <div className="mx-auto w-full max-w-[450px]">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-[9px] transition-colors focus-within:border-primary/50">
          <Search className="h-[16px] w-[16px] text-slate-500" />
          <input
            id="global-search"
            placeholder="Buscar veículo, motorista, rota..."
            className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-slate-500"
          />
          <span className="shrink-0 rounded border border-border bg-surface-3 px-1.5 py-[2px] text-[10px] text-slate-400">
            Ctrl + K
          </span>
        </div>
      </div>

      <button
        aria-label="Notificações"
        className="relative text-slate-300 hover:text-foreground"
      >
        <Bell className="h-[19px] w-[19px]" />
        <span className="absolute -right-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-status-critico px-1 text-[9px] font-bold text-white">
          3
        </span>
      </button>

      <button className="flex items-center gap-2.5 text-left">
        <img
          src={avatar}
          alt="Avatar do administrador"
          className="h-9 w-9 rounded-full"
          width={72}
          height={72}
        />
        <span className="leading-tight">
          <span className="block text-[13px] font-medium text-foreground">
            Administrador
          </span>
          <span className="block text-[11px] text-muted-foreground">
            admin@empresa.com
          </span>
        </span>
        <ChevronDown className="h-[15px] w-[15px] text-slate-500" />
      </button>
    </header>
  );
}
