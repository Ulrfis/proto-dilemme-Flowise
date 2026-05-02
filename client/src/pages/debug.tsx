import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Activity, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LatencyBar } from "../components/debug/LatencyBar";
import { ServiceStatusCard } from "../components/debug/ServiceStatusCard";
import type {
  DebugHealthResponse,
  DebugTracesResponse,
  FlowiseTraceDTO,
  LatencyPhase,
} from "../../../shared/debug-types";

const TARGET_END_TO_END_MS = 8000;

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `il y a ${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  return new Date(ts).toLocaleTimeString("fr-FR");
}

function flowiseToPhases(t: FlowiseTraceDTO): LatencyPhase[] {
  const connect = Math.max(0, t.connectMs);
  const preTtft = Math.max(0, (t.ttftMs || 0) - connect);
  const stream = Math.max(0, t.totalMs - (t.ttftMs || 0));
  return [
    {
      key: "connect",
      label: "Connect",
      ms: connect,
      color: "bg-sky-500",
      tooltip: "Temps DNS + TLS + ouverture de la connexion HTTP vers Flowise.",
      warningSuggestion:
        connect > 500
          ? "Connexion lente (>500ms) — vérifier que le keep-alive HTTP est actif (server/flowise-fetch.ts) et que le warmer tourne."
          : undefined,
    },
    {
      key: "preTtft",
      label: "Pré-TTFT",
      ms: preTtft,
      color: "bg-violet-500",
      tooltip: "Temps entre l'envoi de la question et le premier token (Flowise réfléchit).",
      warningSuggestion:
        preTtft > 5000
          ? "Le chatflow Flowise met longtemps avant de produire le 1er token (>5s). Vérifier le rapport docs/flowise-chatflow-audit-report.md : trop de nœuds séquentiels avant le LLM final ?"
          : undefined,
    },
    {
      key: "stream",
      label: "Stream",
      ms: stream,
      color: "bg-emerald-500",
      tooltip: "Temps de génération des tokens (du 1er au dernier).",
      warningSuggestion:
        stream > 8000
          ? "Stream très long (>8s). Vérifier que streaming: true est activé sur les nœuds LLM dans Flowise."
          : undefined,
    },
  ];
}

export default function DebugPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(Date.now());

  const health = useQuery<DebugHealthResponse>({
    queryKey: ["/api/debug/health"],
    refetchInterval: autoRefresh ? 5000 : false,
  });
  const traces = useQuery<DebugTracesResponse>({
    queryKey: ["/api/debug/traces"],
    refetchInterval: autoRefresh ? 3000 : false,
  });

  // Tick every 10s to refresh "il y a Xs" labels
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const flowiseScale = useMemo(() => {
    const max = Math.max(
      TARGET_END_TO_END_MS,
      ...(traces.data?.flowise.map((t) => t.totalMs) || [0]),
    );
    return max * 1.05;
  }, [traces.data]);

  const flowiseAvg = useMemo(() => {
    const items = traces.data?.flowise.filter((t) => t.status === "ok") || [];
    if (items.length === 0) return null;
    return items.reduce((acc, t) => acc + t.totalMs, 0) / items.length;
  }, [traces.data]);

  const ttsHitRate = useMemo(() => {
    const c = health.data?.cache;
    if (!c) return null;
    const total = c.hits + c.misses;
    if (total === 0) return null;
    return (c.hits / total) * 100;
  }, [health.data]);

  const criticalServices = (health.data?.services || []).filter((s) => s.level === "red");

  const refreshAll = () => {
    health.refetch();
    traces.refetch();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="text-lg font-semibold" data-testid="debug-title">
                Console Debug — Dilemme Plastique
              </h1>
              <p className="text-xs text-slate-400">
                État des services, latences mesurées et erreurs récentes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                data-testid="switch-auto-refresh"
              />
              <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">
                Auto-refresh
              </Label>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshAll}
              data-testid="button-refresh"
              className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-100"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${health.isFetching || traces.isFetching ? "animate-spin" : ""}`} />
              Rafraîchir
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {criticalServices.length > 0 && (
          <div
            className="rounded-lg border border-rose-700/50 bg-rose-950/40 p-4 flex gap-3"
            data-testid="alert-critical"
          >
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-rose-100 mb-1">
                {criticalServices.length} service(s) en erreur
              </div>
              <ul className="text-sm text-rose-200/90 space-y-1">
                {criticalServices.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.name}</span> — {s.message}
                    {s.suggestion && <span className="block text-rose-200/70 text-xs ml-4 mt-0.5">→ {s.suggestion}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Services */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Services connectés
          </h2>
          {health.isLoading && !health.data && (
            <div className="text-sm text-slate-500">Chargement…</div>
          )}
          {health.data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {health.data.services.map((s, i) => (
                <ServiceStatusCard key={i} service={s} />
              ))}
            </div>
          )}
        </section>

        {/* Sub-stats: warmer + cache */}
        {health.data && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Flowise warmer (keep-alive)
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="text-slate-400">Status</div>
                <div className={health.data.warmer.enabled ? "text-emerald-400" : "text-slate-500"}>
                  {health.data.warmer.enabled ? "Actif" : "Désactivé"}
                </div>
                <div className="text-slate-400">Intervalle</div>
                <div className="font-mono">{health.data.warmer.intervalMs / 1000}s</div>
                <div className="text-slate-400">Pings réussis</div>
                <div className="font-mono">
                  {health.data.warmer.successfulPings}/{health.data.warmer.totalPings}
                </div>
                <div className="text-slate-400">Dernier ping</div>
                <div className="font-mono">
                  {health.data.warmer.lastPingMs != null ? `${health.data.warmer.lastPingMs} ms` : "—"}
                  {health.data.warmer.lastPingOk === false && (
                    <span className="text-rose-400 ml-1">✗</span>
                  )}
                </div>
                {health.data.warmer.lastError && (
                  <>
                    <div className="text-slate-400">Dernière erreur</div>
                    <div className="text-rose-400 truncate" title={health.data.warmer.lastError}>
                      {health.data.warmer.lastError}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Cache TTS
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="text-slate-400">Entrées</div>
                <div className="font-mono">
                  {health.data.cache.size} / {health.data.cache.maxEntries}
                </div>
                <div className="text-slate-400">Hits / Misses</div>
                <div className="font-mono">
                  <span className="text-emerald-400">{health.data.cache.hits}</span>
                  {" / "}
                  <span className="text-amber-400">{health.data.cache.misses}</span>
                </div>
                <div className="text-slate-400">Taux de hit</div>
                <div className={`font-mono ${ttsHitRate != null && ttsHitRate < 30 ? "text-amber-400" : "text-emerald-400"}`}>
                  {ttsHitRate != null ? `${ttsHitRate.toFixed(0)} %` : "—"}
                </div>
                <div className="text-slate-400">Uptime serveur</div>
                <div className="font-mono">
                  {Math.floor((health.data.uptimeMs || 0) / 60_000)} min
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Flowise traces */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Latence Flowise — sessions récentes
            </h2>
            {flowiseAvg != null && (
              <div className="text-xs text-slate-400">
                Moyenne sur {traces.data?.flowise.length} requête(s) :{" "}
                <span className={`font-mono ${flowiseAvg > TARGET_END_TO_END_MS ? "text-rose-400" : "text-emerald-400"}`}>
                  {(flowiseAvg / 1000).toFixed(2)} s
                </span>
                {" "}(cible {TARGET_END_TO_END_MS / 1000} s)
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {!traces.data || traces.data.flowise.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Aucune requête Flowise enregistrée. Envoie un message à Peter pour commencer à mesurer.
              </div>
            ) : (
              <div className="space-y-3">
                {traces.data.flowise.map((trace) => (
                  <div
                    key={trace.id}
                    className="border-b border-slate-800 last:border-0 pb-3 last:pb-0"
                    data-testid={`trace-flowise-${trace.id}`}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {trace.status !== "ok" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 text-[10px] uppercase tracking-wide">
                            {trace.status}
                          </span>
                        )}
                        <span className="font-mono text-slate-500">{trace.chatId.slice(0, 12)}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-slate-300 truncate cursor-help">
                              {trace.question || "(vide)"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-md text-xs">
                            {trace.question}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-slate-500 font-mono text-[11px] flex-shrink-0">
                        {formatRelative(trace.startedAt)}
                      </div>
                    </div>
                    <LatencyBar
                      phases={flowiseToPhases(trace)}
                      scaleMs={flowiseScale}
                      targetMs={TARGET_END_TO_END_MS}
                      totalMs={trace.totalMs}
                    />
                    {(trace.nodes > 0 || trace.tools > 0 || trace.unknownEvents > 0 || trace.errorMessage) && (
                      <div className="mt-1.5 text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                        {trace.nodes > 0 && <span>nodes: {trace.nodes}</span>}
                        {trace.tools > 0 && <span>tools: {trace.tools}</span>}
                        {trace.tokens > 0 && <span>tokens: {trace.tokens}</span>}
                        {trace.unknownEvents > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-amber-500 cursor-help">
                                ⚠ unknown events: {trace.unknownEvents}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Le proxy a reçu des events SSE inconnus de Flowise.
                              Ajouter leurs noms dans server/flowise-progress-labels.ts
                              pour produire un label dynamique côté UI.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {trace.errorMessage && (
                          <span className="text-rose-400 truncate" title={trace.errorMessage}>
                            {trace.errorMessage}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* TTS traces */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Appels TTS récents
          </h2>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {!traces.data || traces.data.tts.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Aucun appel TTS récent.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {traces.data.tts.slice(0, 30).map((t) => {
                  const isSlow = !t.cacheHit && t.durationMs > 2000;
                  return (
                    <div
                      key={t.id}
                      className="grid grid-cols-[80px_minmax(0,1fr)_60px_80px] gap-3 items-center text-xs py-1.5 px-2 rounded hover:bg-slate-800/50"
                      data-testid={`trace-tts-${t.id}`}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`font-mono inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] uppercase cursor-help ${
                              t.status === "error"
                                ? "bg-rose-900/60 text-rose-300"
                                : t.cacheHit
                                  ? "bg-emerald-900/50 text-emerald-300"
                                  : "bg-amber-900/40 text-amber-300"
                            }`}
                          >
                            {t.status === "error" ? "ERROR" : t.cacheHit ? "HIT" : "MISS"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          {t.cacheHit
                            ? "Servi depuis le cache mémoire — pas d'appel au provider."
                            : t.status === "error"
                              ? `Erreur du provider ${t.provider}. ${t.errorMessage || ""}`
                              : `Synthétisé par ${t.provider}. Sera servi en cache aux prochaines occurrences du même texte.`}
                        </TooltipContent>
                      </Tooltip>

                      <span className="text-slate-300 truncate" title={t.textPreview}>
                        {t.textPreview}
                      </span>

                      <span className="text-right font-mono text-slate-500">
                        {t.chars} ch.
                      </span>

                      <span
                        className={`text-right font-mono ${
                          isSlow ? "text-amber-400" : t.cacheHit ? "text-emerald-400" : "text-slate-300"
                        }`}
                      >
                        {t.durationMs} ms
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <footer className="text-center text-xs text-slate-600 pt-4 pb-8">
          Console debug — accessible via <code className="text-slate-400">/debug</code> ou{" "}
          <code className="text-slate-400">?debug</code>. Données en mémoire uniquement, perdues au redémarrage.
          {health.data && (
            <span className="block mt-1">
              Dernière mise à jour : {new Date(health.data.generatedAt).toLocaleTimeString("fr-FR")}
            </span>
          )}
          {/* now is referenced to keep the timer subscription alive */}
          <span className="hidden">{now}</span>
        </footer>
      </main>
    </div>
  );
}
