import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, HelpCircle } from "lucide-react";
import type { ServiceHealth } from "../../../../shared/debug-types";

const LEVEL_STYLES = {
  green: { bar: "bg-emerald-500", text: "text-emerald-400", icon: CheckCircle2, label: "OK" },
  orange: { bar: "bg-amber-500", text: "text-amber-400", icon: AlertTriangle, label: "Lent" },
  red: { bar: "bg-rose-500", text: "text-rose-400", icon: XCircle, label: "KO" },
  gray: { bar: "bg-slate-500", text: "text-slate-400", icon: MinusCircle, label: "—" },
} as const;

interface ServiceStatusCardProps {
  service: ServiceHealth;
}

export function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const style = LEVEL_STYLES[service.level];
  const Icon = style.icon;

  return (
    <div
      className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 flex flex-col gap-2"
      data-testid={`service-card-${service.name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${style.bar} ring-2 ring-slate-800 flex-shrink-0`} />
          <span className="font-medium text-slate-100 truncate">{service.name}</span>
        </div>
        <Icon className={`w-4 h-4 ${style.text} flex-shrink-0`} />
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className={style.text}>{service.message}</span>
        {service.latencyMs != null && (
          <span className="font-mono text-slate-400">{service.latencyMs} ms</span>
        )}
      </div>

      {service.suggestion && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="self-start inline-flex items-center gap-1 text-[11px] text-amber-400/80 hover:text-amber-300 cursor-help"
            >
              <HelpCircle className="w-3 h-3" />
              Solution possible
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {service.suggestion}
          </TooltipContent>
        </Tooltip>
      )}

      {service.details && Object.keys(service.details).length > 0 && (
        <div className="text-[11px] text-slate-500 font-mono space-y-0.5">
          {Object.entries(service.details).map(([k, v]) => (
            <div key={k} className="truncate" title={`${k}: ${String(v)}`}>
              {k}: {String(v)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
