import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LatencyPhase } from "../../../../shared/debug-types";

interface LatencyBarProps {
  phases: LatencyPhase[];
  /** Total scale (ms) used to compute widths. Defaults to sum of phases. */
  scaleMs?: number;
  /** Optional reference target in ms — drawn as a dashed vertical marker. */
  targetMs?: number;
  /** Total ms shown at the right of the bar. Defaults to sum of phases. */
  totalMs?: number;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export function LatencyBar({ phases, scaleMs, targetMs, totalMs }: LatencyBarProps) {
  const sum = phases.reduce((acc, p) => acc + Math.max(0, p.ms), 0);
  const total = totalMs ?? sum;
  const scale = scaleMs ?? Math.max(sum, targetMs ?? 0, 1);
  const targetPct = targetMs && targetMs > 0 ? (targetMs / scale) * 100 : null;
  const overTarget = targetMs != null && total > targetMs;

  return (
    <div className="w-full">
      <div className="relative h-7 w-full rounded overflow-hidden bg-slate-800/60 ring-1 ring-slate-700">
        {phases.map((p, idx) => {
          if (p.ms <= 0) return null;
          const pct = (p.ms / scale) * 100;
          const minPct = pct < 1.5 ? 1.5 : pct;
          return (
            <Tooltip key={`${p.key}-${idx}`}>
              <TooltipTrigger asChild>
                <div
                  className={`${p.color} h-full inline-block align-top cursor-help transition-opacity hover:opacity-90`}
                  style={{ width: `${minPct}%` }}
                  data-testid={`bar-segment-${p.key}`}
                >
                  <span className="sr-only">
                    {p.label} : {p.ms} ms
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                <div className="font-semibold">{p.label} — {formatSeconds(p.ms)}</div>
                <div className="opacity-80 mt-1">{p.tooltip}</div>
                {p.warningSuggestion && (
                  <div className="mt-2 text-amber-300">
                    💡 {p.warningSuggestion}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {targetPct != null && targetPct < 100 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-400/80 cursor-help"
                style={{ left: `${targetPct}%` }}
                data-testid="bar-target-marker"
              >
                <span className="sr-only">Cible {targetMs ? formatSeconds(targetMs) : ""}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Cible : {targetMs ? formatSeconds(targetMs) : ""}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between text-xs">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
          {phases.filter((p) => p.ms > 0).map((p, idx) => (
            <span key={idx} className="inline-flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-sm ${p.color}`} />
              {p.label} <span className="text-slate-500">{formatSeconds(p.ms)}</span>
            </span>
          ))}
        </div>
        <div className={`font-mono ${overTarget ? "text-rose-400" : "text-slate-300"}`}>
          {formatSeconds(total)}
        </div>
      </div>
    </div>
  );
}
