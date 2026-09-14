import { Truck, Route, AlertTriangle, Network, Gauge } from "lucide-react";
export type Metric = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  progress: number;
  tone: "primary" | "normal" | "alerta" | "guardiao" | "turquoise";
  icon: keyof typeof icons;
};
import { cn } from "@/lib/utils";

const icons = {
  truck: Truck,
  route: Route,
  alert: AlertTriangle,
  network: Network,
  gauge: Gauge,
} as const;

const tones: Record<Metric["tone"], { icon: string; bar: string }> = {
  primary: { icon: "bg-primary/15 text-primary", bar: "bg-primary" },
  normal: {
    icon: "bg-status-normal/15 text-status-normal",
    bar: "bg-status-normal",
  },
  guardiao: { icon: "bg-guardian/15 text-guardian", bar: "bg-guardian" },
  alerta: {
    icon: "bg-status-alerta/15 text-status-alerta",
    bar: "bg-status-alerta",
  },
  turquoise: { icon: "bg-turquoise/15 text-turquoise", bar: "bg-turquoise" },
};

export function MetricCard({ metric }: { metric: Metric }) {
  const Icon = icons[metric.icon];
  const tone = tones[metric.tone];

  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-[15px] shadow-card transition-colors hover:border-white/15">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg",
            tone.icon,
          )}
        >
          <Icon className="h-[19px] w-[19px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground">
            {metric.label}
          </p>
          <p className="mt-[6px] text-[27px] font-bold leading-none text-foreground">
            {metric.value}
            {metric.unit && (
              <span className="ml-1 text-[15px] font-semibold">
                {metric.unit}
              </span>
            )}
          </p>
        </div>
      </div>
      <p className="mt-[10px] text-[11.5px] text-muted-foreground">
        {metric.sub}
      </p>
      <div className="mt-[9px] h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn("h-full rounded-full", tone.bar)}
          style={{ width: `${metric.progress}%` }}
        />
      </div>
    </div>
  );
}
