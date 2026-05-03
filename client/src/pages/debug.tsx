import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Zap,
  History,
  Trash2,
  ChevronDown,
  Search,
  Download,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LatencyBar } from "../components/debug/LatencyBar";
import { ServiceStatusCard } from "../components/debug/ServiceStatusCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type {
  DebugHealthResponse,
  DebugTracesResponse,
  FlowiseTraceDTO,
  TTSTraceDTO,
  LatencyPhase,
} from "../../../shared/debug-types";

const TARGET_END_TO_END_MS = 8000;
const PAGE_SIZE = 50;

// ─── Filter / sort types ──────────────────────────────────────────────────────
type FlowiseStatus = "all" | "ok" | "error" | "aborted";
type FlowiseSort = "date_desc" | "date_asc" | "latency_asc" | "latency_desc";

// ─── Session group ────────────────────────────────────────────────────────────
interface SessionGroupData {
  chatId: string;
  firstName?: string;
  traces: FlowiseTraceDTO[];
  turnCount: number;
  medianLatencyMs: number;
  hasError: boolean;
  lastTraceAt: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Groups traces by chatId while preserving the API-provided sort order within
 * each session. The session list order follows the first appearance of each
 * chatId in the API-sorted trace array.
 */
function groupTracesBySession(traces: FlowiseTraceDTO[]): SessionGroupData[] {
  const map = new Map<string, FlowiseTraceDTO[]>();
  for (const t of traces) {
    const existing = map.get(t.chatId);
    if (existing) {
      existing.push(t);
    } else {
      map.set(t.chatId, [t]);
    }
  }
  const groups: SessionGroupData[] = [];
  for (const [chatId, ts] of map.entries()) {
    groups.push({
      chatId,
      firstName: ts.find((t) => t.firstName)?.firstName,
      traces: ts,
      turnCount: ts.length,
      medianLatencyMs: median(ts.map((t) => t.totalMs)),
      hasError: ts.some((t) => t.status === "error"),
      lastTraceAt: Math.max(...ts.map((t) => t.startedAt)),
    });
  }
  return groups;
}

function SessionGroup({
  group,
  scaleMs,
}: {
  group: SessionGroupData;
  scaleMs: number;
}) {
  const [open, setOpen] = useState(false);
  const latencyColor =
    group.medianLatencyMs > TARGET_END_TO_END_MS
      ? "text-rose-400"
      : group.medianLatencyMs > TARGET_END_TO_END_MS * 0.75
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-slate-100 text-sm truncate">
            {group.firstName ?? (
              <span className="font-mono text-slate-400 text-xs">{group.chatId.slice(0, 12)}…</span>
            )}
          </span>
          {group.hasError && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 text-[10px] uppercase tracking-wide flex-shrink-0">
              erreur
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 text-xs">
          <span className="text-slate-500">
            {group.turnCount} tour{group.turnCount > 1 ? "s" : ""}
          </span>
          <span className={`font-mono ${latencyColor}`}>
            {(group.medianLatencyMs / 1000).toFixed(2)} s
          </span>
          <span className="text-slate-500 font-mono">{formatRelative(group.lastTraceAt)}</span>
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-slate-900/40">
          {group.traces.map((trace) => (
            <FlowiseTraceRow key={trace.id} trace={trace} scaleMs={scaleMs} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Date range types ────────────────────────────────────────────────────────
type QuickRange = "1h" | "today" | "7d" | "custom";

interface DateRange {
  from: number;
  to: number;
}

function quickRangeToMs(range: QuickRange): DateRange {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  switch (range) {
    case "1h":
      return { from: now - 3_600_000, to: now };
    case "today":
      return { from: startOfDay.getTime(), to: now };
    case "7d":
      return { from: now - 7 * 86_400_000, to: now };
    default:
      return { from: now - 86_400_000, to: now };
  }
}

// ─── API response types ──────────────────────────────────────────────────────
interface FlowisePage {
  items: FlowiseTraceDTO[];
  total: number;
  limit: number;
  offset: number;
}

interface TtsPage {
  items: TTSTraceDTO[];
  total: number;
  limit: number;
  offset: number;
}

interface FlowiseBucket {
  bucket: string;
  medianTotalMs: number;
  medianTtftMs: number;
  count: number;
  errorCount: number;
}

interface TtsBucket {
  bucket: string;
  count: number;
  errorCount: number;
  errorRate: number;
}

interface StatsResponse {
  granularity: string;
  flowise: FlowiseBucket[];
  tts: TtsBucket[];
}

interface RetentionResponse {
  retentionDays: number;
  flowiseCount: number;
  ttsCount: number;
  lastPurge: {
    ranAt: number;
    flowiseDeleted: number;
    ttsDeleted: number;
  } | null;
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `il y a ${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  return new Date(ts).toLocaleTimeString("fr-FR");
}

function formatBucket(bucket: string, granularity: string): string {
  const d = new Date(bucket);
  if (granularity === "day") {
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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

function FlowiseTraceRow({
  trace,
  scaleMs,
}: {
  trace: FlowiseTraceDTO;
  scaleMs: number;
}) {
  return (
    <div
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
        scaleMs={scaleMs}
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
                Le proxy a reçu des events SSE inconnus de Flowise. Ajouter leurs noms dans
                server/flowise-progress-labels.ts pour produire un label dynamique côté UI.
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
  );
}

function TtsTraceRow({ t }: { t: TTSTraceDTO }) {
  const isSlow = !t.cacheHit && t.durationMs > 2000;
  return (
    <div
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
      <span className="text-right font-mono text-slate-500">{t.chars} ch.</span>
      <span
        className={`text-right font-mono ${
          isSlow ? "text-amber-400" : t.cacheHit ? "text-emerald-400" : "text-slate-300"
        }`}
      >
        {t.durationMs} ms
      </span>
    </div>
  );
}

function Paginator({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
      <span>
        {Math.min(page * pageSize + 1, total)}–{Math.min((page + 1) * pageSize, total)} sur {total}
      </span>
      <div className="flex gap-1 items-center">
        <button
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="p-1 rounded disabled:opacity-30 hover:bg-slate-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 py-1 font-mono">
          {page + 1}/{totalPages}
        </span>
        <button
          disabled={page >= totalPages - 1}
          onClick={() => onPage(page + 1)}
          className="p-1 rounded disabled:opacity-30 hover:bg-slate-800"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function DebugPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [quickRange, setQuickRange] = useState<QuickRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [flowisePage, setFlowisePage] = useState(0);
  const [ttsPage, setTtsPage] = useState(0);
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("debug_admin_token") ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [flowiseStatus, setFlowiseStatus] = useState<FlowiseStatus>("all");
  const [flowiseSort, setFlowiseSort] = useState<FlowiseSort>("date_desc");
  const [flowiseSearch, setFlowiseSearch] = useState("");

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tokenInput.trim();
    setAdminToken(t);
    sessionStorage.setItem("debug_admin_token", t);
    setTokenInput("");
  };

  const range = useMemo<DateRange>(() => {
    if (quickRange === "custom" && customFrom && customTo) {
      const f = new Date(customFrom).getTime();
      const t = new Date(customTo).getTime();
      if (!isNaN(f) && !isNaN(t) && f < t) return { from: f, to: t };
    }
    return quickRangeToMs(quickRange);
  }, [quickRange, customFrom, customTo]);

  const granularity = useMemo(() => {
    const span = range.to - range.from;
    return span > 2 * 86_400_000 ? "day" : "hour";
  }, [range]);

  // Reset pages when range or filters change
  useEffect(() => {
    setFlowisePage(0);
    setTtsPage(0);
  }, [range]);

  useEffect(() => {
    setFlowisePage(0);
  }, [flowiseStatus, flowiseSort]);

  // ── Retention / row counts (60s cadence, public endpoint) ───────────────
  const retention = useQuery<RetentionResponse>({
    queryKey: ["/api/debug/retention"],
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  // ── Real-time in-memory buffer (3s cadence, always live) ─────────────────
  const health = useQuery<DebugHealthResponse>({
    queryKey: ["/api/debug/health"],
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const traces = useQuery<DebugTracesResponse>({
    queryKey: ["/api/debug/traces"],
    refetchInterval: autoRefresh ? 3000 : false,
  });

  // ── Historical DB-backed queries (15s cadence, date-filtered, admin-only) ─
  const histFlowise = useQuery<FlowisePage>({
    queryKey: ["/api/debug/traces/flowise", range.from, range.to, flowisePage, adminToken, flowiseStatus, flowiseSort],
    queryFn: () => {
      const params = new URLSearchParams({
        from: String(range.from),
        to: String(range.to),
        limit: String(PAGE_SIZE),
        offset: String(flowisePage * PAGE_SIZE),
        sort: flowiseSort,
      });
      if (flowiseStatus !== "all") params.set("status", flowiseStatus);
      return fetchJson<FlowisePage>(`/api/debug/traces/flowise?${params}`, adminToken || undefined);
    },
    enabled: !!adminToken,
    refetchInterval: autoRefresh && !!adminToken ? 15_000 : false,
  });

  const histTts = useQuery<TtsPage>({
    queryKey: ["/api/debug/traces/tts", range.from, range.to, ttsPage, adminToken],
    queryFn: () =>
      fetchJson<TtsPage>(
        `/api/debug/traces/tts?from=${range.from}&to=${range.to}&limit=${PAGE_SIZE}&offset=${
          ttsPage * PAGE_SIZE
        }`,
        adminToken || undefined,
      ),
    enabled: !!adminToken,
    refetchInterval: autoRefresh && !!adminToken ? 15_000 : false,
  });

  const stats = useQuery<StatsResponse>({
    queryKey: ["/api/debug/traces/stats", range.from, range.to, granularity, adminToken],
    queryFn: () =>
      fetchJson<StatsResponse>(
        `/api/debug/traces/stats?from=${range.from}&to=${range.to}&granularity=${granularity}`,
        adminToken || undefined,
      ),
    enabled: !!adminToken,
    refetchInterval: autoRefresh && !!adminToken ? 15_000 : false,
  });

  // Tick every 10s to refresh "il y a Xs" labels
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Live buffer data (always from in-memory)
  const liveFlowiseItems = traces.data?.flowise ?? [];
  const liveTtsItems = traces.data?.tts ?? [];

  const liveFlowiseScale = useMemo(() => {
    const max = Math.max(TARGET_END_TO_END_MS, ...liveFlowiseItems.map((t) => t.totalMs));
    return max * 1.05;
  }, [liveFlowiseItems]);

  const liveFlowiseAvg = useMemo(() => {
    const items = liveFlowiseItems.filter((t) => t.status === "ok");
    if (items.length === 0) return null;
    return items.reduce((acc, t) => acc + t.totalMs, 0) / items.length;
  }, [liveFlowiseItems]);

  // Historical data
  const histFlowiseScale = useMemo(() => {
    const items = histFlowise.data?.items ?? [];
    const max = Math.max(TARGET_END_TO_END_MS, ...items.map((t) => t.totalMs));
    return max * 1.05;
  }, [histFlowise.data]);

  const sessionGroups = useMemo(() => {
    const items = histFlowise.data?.items ?? [];
    const groups = groupTracesBySession(items);
    if (!flowiseSearch.trim()) return groups;
    const q = flowiseSearch.trim().toLowerCase();
    return groups.filter(
      (g) =>
        (g.firstName && g.firstName.toLowerCase().includes(q)) ||
        g.traces.some((t) => t.question.toLowerCase().includes(q)),
    );
  }, [histFlowise.data, flowiseSearch]);

  const ttsHitRate = useMemo(() => {
    const c = health.data?.cache;
    if (!c) return null;
    const total = c.hits + c.misses;
    if (total === 0) return null;
    return (c.hits / total) * 100;
  }, [health.data]);

  const criticalServices = (health.data?.services || []).filter((s) => s.level === "red");

  const chartFlowiseData = useMemo(
    () =>
      (stats.data?.flowise ?? []).map((b) => ({
        time: formatBucket(b.bucket, granularity),
        "Latence totale (ms)": Math.round(b.medianTotalMs),
        "TTFT (ms)": Math.round(b.medianTtftMs),
      })),
    [stats.data, granularity],
  );

  const chartTtsData = useMemo(
    () =>
      (stats.data?.tts ?? []).map((b) => ({
        time: formatBucket(b.bucket, granularity),
        "Taux d'erreur (%)": Math.round(b.errorRate * 100),
      })),
    [stats.data, granularity],
  );

  const refreshAll = () => {
    health.refetch();
    traces.refetch();
    retention.refetch();
    histFlowise.refetch();
    histTts.refetch();
    stats.refetch();
  };

  const QUICK_RANGES: { label: string; value: QuickRange }[] = [
    { label: "1h", value: "1h" },
    { label: "Aujourd'hui", value: "today" },
    { label: "7 jours", value: "7d" },
    { label: "Personnalisé", value: "custom" },
  ];

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
              <RefreshCw
                className={`w-4 h-4 mr-1.5 ${
                  health.isFetching || traces.isFetching ? "animate-spin" : ""
                }`}
              />
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
                    {s.suggestion && (
                      <span className="block text-rose-200/70 text-xs ml-4 mt-0.5">
                        → {s.suggestion}
                      </span>
                    )}
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
                  {health.data.warmer.lastPingMs != null
                    ? `${health.data.warmer.lastPingMs} ms`
                    : "—"}
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
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Cache TTS</div>
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
                <div
                  className={`font-mono ${
                    ttsHitRate != null && ttsHitRate < 30 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
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

        {/* Retention / DB row counts */}
        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-4 h-4 text-slate-400" />
            <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
              Rétention des traces DB
            </span>
          </div>
          {retention.isLoading && !retention.data ? (
            <div className="text-sm text-slate-500">Chargement…</div>
          ) : retention.isError ? (
            <div className="text-sm text-rose-400">Erreur lors du chargement.</div>
          ) : retention.data ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              <div className="text-slate-400">Fenêtre</div>
              <div className="font-mono">{retention.data.retentionDays} jours</div>
              <div className="text-slate-400">Flowise (total DB)</div>
              <div className="font-mono">{retention.data.flowiseCount.toLocaleString()} lignes</div>
              <div className="text-slate-400">TTS (total DB)</div>
              <div className="font-mono">{retention.data.ttsCount.toLocaleString()} lignes</div>
              <div className="text-slate-400">Dernier purge</div>
              <div className="font-mono text-xs">
                {retention.data.lastPurge ? (
                  <>
                    {new Date(retention.data.lastPurge.ranAt).toLocaleString("fr-FR")}
                    <span className="text-slate-500 ml-2">
                      (−{retention.data.lastPurge.flowiseDeleted} fw, −{retention.data.lastPurge.ttsDeleted} tts)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">En cours…</span>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* ══ LIVE SECTION ═══════════════════════════════════════════════════ */}
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <h2 className="text-base font-semibold text-emerald-400">Temps réel</h2>
          <span className="text-xs text-slate-500 ml-1">— buffer mémoire, refresh 3s</span>
        </div>

        {/* Live Flowise traces */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Latence Flowise — sessions récentes ({liveFlowiseItems.length})
            </h3>
            {liveFlowiseAvg != null && (
              <div className="text-xs text-slate-400">
                Moyenne :{" "}
                <span
                  className={`font-mono ${
                    liveFlowiseAvg > TARGET_END_TO_END_MS ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {(liveFlowiseAvg / 1000).toFixed(2)} s
                </span>{" "}
                (cible {TARGET_END_TO_END_MS / 1000} s)
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {traces.isLoading && !traces.data ? (
              <div className="text-sm text-slate-500 py-4 text-center">Chargement…</div>
            ) : liveFlowiseItems.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Aucune requête Flowise depuis le dernier redémarrage. Envoie un message à Peter pour
                commencer à mesurer.
              </div>
            ) : (
              <div className="space-y-3">
                {liveFlowiseItems.map((trace) => (
                  <FlowiseTraceRow key={trace.id} trace={trace} scaleMs={liveFlowiseScale} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Live TTS traces */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Appels TTS récents ({liveTtsItems.length})
          </h3>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {traces.isLoading && !traces.data ? (
              <div className="text-sm text-slate-500 py-4 text-center">Chargement…</div>
            ) : liveTtsItems.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Aucun appel TTS depuis le dernier redémarrage.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {liveTtsItems.map((t) => (
                  <TtsTraceRow key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ══ HISTORY SECTION ════════════════════════════════════════════════ */}
        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <History className="w-4 h-4 text-violet-400" />
          <h2 className="text-base font-semibold text-violet-400">Historique</h2>
          <span className="text-xs text-slate-500 ml-1">— base Postgres, refresh 15s</span>
          <div className="ml-auto flex items-center gap-2">
            {adminToken ? (
              <>
                <span className="text-xs text-emerald-400 font-mono">🔓 Connecté</span>
                <button
                  onClick={() => { setAdminToken(""); sessionStorage.removeItem("debug_admin_token"); }}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  Déconnecter
                </button>
              </>
            ) : (
              <form onSubmit={handleTokenSubmit} className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Mot de passe admin…"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 w-40"
                />
                <button
                  type="submit"
                  className="text-xs bg-violet-700 hover:bg-violet-600 text-white rounded px-2 py-1"
                >
                  Accéder
                </button>
              </form>
            )}
          </div>
        </div>

        {!adminToken && (
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-8 text-center text-sm text-slate-500">
            Saisir le mot de passe admin ci-dessus pour accéder aux données historiques persistées.
          </div>
        )}

        {adminToken && (() => {
          const isAuthError = [histFlowise.error, histTts.error, stats.error].some(
            (e) => e && String(e.message).includes("401"),
          );
          if (isAuthError) return (
            <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 p-6 text-center">
              <p className="text-sm text-rose-400 mb-3">Mot de passe incorrect — accès refusé.</p>
              <button
                onClick={() => { setAdminToken(""); sessionStorage.removeItem("debug_admin_token"); }}
                className="text-xs bg-rose-700 hover:bg-rose-600 text-white rounded px-3 py-1"
              >
                Réessayer
              </button>
            </div>
          );
          return null;
        })()}

        {adminToken && <>

        {/* Date range selector */}
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
              Plage
            </span>
            <div className="flex gap-1">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setQuickRange(r.value)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    quickRange === r.value
                      ? "bg-violet-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {quickRange === "custom" && (
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <label className="text-xs text-slate-400">Du</label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-600"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Au</label>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-600"
                />
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-600 mt-1.5">
            {new Date(range.from).toLocaleString("fr-FR")} →{" "}
            {new Date(range.to).toLocaleString("fr-FR")} · granularité : {granularity}
          </p>
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
              Latence Flowise — médiane dans le temps
            </div>
            {stats.isLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                Chargement…
              </div>
            ) : stats.isError ? (
              <div className="h-48 flex items-center justify-center text-rose-400 text-sm">
                Erreur lors du chargement des statistiques.
              </div>
            ) : chartFlowiseData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                Aucune donnée sur cette plage.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={chartFlowiseData}
                  margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} unit="ms" width={55} />
                  <ReTooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Line
                    type="monotone"
                    dataKey="Latence totale (ms)"
                    stroke="#10b981"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="TTFT (ms)"
                    stroke="#8b5cf6"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
              Taux d'erreur TTS — évolution dans le temps
            </div>
            {stats.isLoading ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                Chargement…
              </div>
            ) : stats.isError ? (
              <div className="h-48 flex items-center justify-center text-rose-400 text-sm">
                Erreur lors du chargement des statistiques.
              </div>
            ) : chartTtsData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                Aucune donnée sur cette plage.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={chartTtsData}
                  margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    unit="%"
                    width={40}
                    domain={[0, 100]}
                  />
                  <ReTooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Line
                    type="monotone"
                    dataKey="Taux d'erreur (%)"
                    stroke="#f43f5e"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Historical Flowise table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Latence Flowise — historique filtré
              {histFlowise.data && (
                <span className="ml-2 text-slate-600 font-normal normal-case">
                  ({histFlowise.data.total} traces · {sessionGroups.length} session{sessionGroups.length !== 1 ? "s" : ""})
                </span>
              )}
            </h3>
            {adminToken && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                onClick={() => {
                  const params = new URLSearchParams({
                    from: String(range.from),
                    to: String(range.to),
                    sort: flowiseSort,
                  });
                  if (flowiseStatus !== "all") params.set("status", flowiseStatus);
                  const url = `/api/debug/traces/flowise/export?${params}`;
                  const a = document.createElement("a");
                  a.href = url;
                  const headers = new Headers({ Authorization: `Bearer ${adminToken}` });
                  fetch(url, { headers })
                    .then((res) => {
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const disposition = res.headers.get("Content-Disposition") ?? "";
                      const match = disposition.match(/filename="([^"]+)"/);
                      const filename = match ? match[1] : "flowise-traces.csv";
                      return res.blob().then((blob) => ({ blob, filename }));
                    })
                    .then(({ blob, filename }) => {
                      const objectUrl = URL.createObjectURL(blob);
                      a.href = objectUrl;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(objectUrl);
                    })
                    .catch((err) => console.error("[export csv]", err));
                }}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
            )}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Select value={flowiseStatus} onValueChange={(v) => setFlowiseStatus(v as FlowiseStatus)}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 w-32">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="error">Erreur</SelectItem>
                <SelectItem value="aborted">Abandonné</SelectItem>
              </SelectContent>
            </Select>

            <Select value={flowiseSort} onValueChange={(v) => setFlowiseSort(v as FlowiseSort)}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 w-44">
                <SelectValue placeholder="Tri" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="date_desc">Date — plus récent</SelectItem>
                <SelectItem value="date_asc">Date — plus ancien</SelectItem>
                <SelectItem value="latency_asc">Latence — croissante</SelectItem>
                <SelectItem value="latency_desc">Latence — décroissante</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Rechercher prénom ou question…"
                value={flowiseSearch}
                onChange={(e) => setFlowiseSearch(e.target.value)}
                className="w-full h-8 pl-7 pr-3 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {histFlowise.isLoading ? (
              <div className="text-sm text-slate-500 py-4 text-center">Chargement…</div>
            ) : histFlowise.isError ? (
              <div className="text-sm text-rose-400 py-4 text-center">
                Erreur lors du chargement des traces.
              </div>
            ) : sessionGroups.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Aucune requête Flowise sur cette plage.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {sessionGroups.map((group) => (
                    <SessionGroup key={group.chatId} group={group} scaleMs={histFlowiseScale} />
                  ))}
                </div>
                <div className="mt-3">
                  <Paginator
                    page={flowisePage}
                    total={histFlowise.data?.total ?? 0}
                    pageSize={PAGE_SIZE}
                    onPage={setFlowisePage}
                  />
                  <p className="text-[10px] text-slate-600 mt-1.5 text-center">
                    Pagination par traces — les sessions affichées correspondent aux traces de la page courante.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Historical TTS table */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Appels TTS — historique filtré
            {histTts.data && (
              <span className="ml-2 text-slate-600 font-normal normal-case">
                ({histTts.data.total} traces)
              </span>
            )}
          </h3>
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {histTts.isLoading ? (
              <div className="text-sm text-slate-500 py-4 text-center">Chargement…</div>
            ) : histTts.isError ? (
              <div className="text-sm text-rose-400 py-4 text-center">
                Erreur lors du chargement des traces.
              </div>
            ) : (histTts.data?.items ?? []).length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">
                Aucun appel TTS sur cette plage.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  {(histTts.data?.items ?? []).map((t) => (
                    <TtsTraceRow key={t.id} t={t} />
                  ))}
                </div>
                <Paginator
                  page={ttsPage}
                  total={histTts.data?.total ?? 0}
                  pageSize={PAGE_SIZE}
                  onPage={setTtsPage}
                />
              </>
            )}
          </div>
        </section>

        </>}

        <footer className="text-center text-xs text-slate-600 pt-4 pb-8">
          Console debug — accessible via <code className="text-slate-400">/debug</code> ou{" "}
          <code className="text-slate-400">?debug</code>. Traces persistées en base Postgres.
          {health.data && (
            <span className="block mt-1">
              Dernière mise à jour :{" "}
              {new Date(health.data.generatedAt).toLocaleTimeString("fr-FR")}
            </span>
          )}
          <span className="hidden">{now}</span>
        </footer>
      </main>
    </div>
  );
}
