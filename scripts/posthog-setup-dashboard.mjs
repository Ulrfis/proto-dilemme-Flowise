#!/usr/bin/env node
// Creates / updates four PostHog dashboards via the PostHog REST API.
// Required env vars:
//   POSTHOG_PERSONAL_API_KEY  (Personal API key)
//   POSTHOG_PROJECT_ID        (numeric project ID)
//   VITE_POSTHOG_HOST         (optional, default https://eu.posthog.com)
//
// Idempotent: if a dashboard with the same name already exists the script
// reuses it and adds only missing insights (by name).

const HOST = (process.env.VITE_POSTHOG_HOST || "https://eu.posthog.com")
  .trim()
  .replace(/\/+$/, "")
  .replace("i.posthog.com", "posthog.com");
const PROJECT_ID = (process.env.POSTHOG_PROJECT_ID || "").trim();
const API_KEY = (process.env.POSTHOG_PERSONAL_API_KEY || "").trim();

if (!PROJECT_ID || !API_KEY) {
  console.error("Missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
  process.exit(1);
}

const BASE = `${HOST}/api/projects/${PROJECT_ID}`;
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : null;
}

const DATE_RANGE = { date_from: "-30d" };

const trendsSeries = (event, name, math, mathProperty) => ({
  kind: "EventsNode",
  event,
  name,
  math: math || "total",
  ...(mathProperty ? { math_property: mathProperty } : {}),
});

async function findExistingByName(path, name) {
  const url = `${path}?search=${encodeURIComponent(name)}&limit=100`;
  const res = await api("GET", url);
  return (res?.results || []).find((x) => x.name === name) || null;
}

async function upsertDashboard(name, description) {
  let dashboard = await findExistingByName("/dashboards/", name);
  if (dashboard) {
    console.log(`Dashboard existant : "${name}" (id=${dashboard.id})`);
  } else {
    dashboard = await api("POST", "/dashboards/", { name, description, pinned: true });
    console.log(`Dashboard créé : "${name}" (id=${dashboard.id})`);
  }
  return dashboard;
}

async function upsertInsights(dashboard, insights) {
  for (const spec of insights) {
    const existing = await findExistingByName("/insights/", spec.name);
    if (existing) {
      const dashList = existing.dashboards || [];
      const dashboards = dashList.includes(dashboard.id) ? dashList : [...dashList, dashboard.id];
      await api("PATCH", `/insights/${existing.id}/`, {
        description: spec.description,
        query: spec.query,
        dashboards,
      });
      console.log(`  ↻ Insight mis à jour : ${spec.name}`);
    } else {
      await api("POST", "/insights/", {
        name: spec.name,
        description: spec.description,
        query: spec.query,
        dashboards: [dashboard.id],
      });
      console.log(`  + Insight créé : ${spec.name}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard 1: User Journey
// ─────────────────────────────────────────────────────────────────────────────
const funnelQuery = {
  kind: "InsightVizNode",
  source: {
    kind: "FunnelsQuery",
    dateRange: DATE_RANGE,
    series: [
      {
        kind: "EventsNode",
        event: "page_view",
        name: "1. Page d'accueil",
        properties: [{ key: "page", value: "homepage", operator: "exact", type: "event" }],
      },
      { kind: "EventsNode", event: "identity_captured", name: "2. Prénom capturé" },
      { kind: "EventsNode", event: "message_sent", name: "3. 1er message élève" },
      { kind: "EventsNode", event: "peter_replied", name: "4. Peter répond" },
      { kind: "EventsNode", event: "message_sent", name: "5. 2e message élève" },
      { kind: "EventsNode", event: "peter_replied", name: "6. Peter répond (2e)" },
      { kind: "EventsNode", event: "message_sent", name: "7. 3e message élève" },
    ],
    funnelsFilter: {
      funnelWindowInterval: 30,
      funnelWindowIntervalUnit: "minute",
      funnelOrderType: "ordered",
    },
  },
};

const userJourneyInsights = [
  {
    name: "Funnel élève – Dilemme Plastique",
    description: "page_view(homepage) → identity_captured → message_sent × 3 / peter_replied × 2. Fenêtre 30 min.",
    query: funnelQuery,
  },
  {
    name: "Taux d'abandon par étape (drop-off)",
    description: "Même funnel, visualisation funnel pour voir le drop-off entre chaque étape.",
    query: funnelQuery,
  },
  {
    name: "Sessions par jour",
    description: "Nombre de sessions démarrées (event session_started) par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("session_started", "Sessions")],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Durée de session – p50 et p95 (ms)",
    description: "Médiane et p95 de durationMs sur session_complete.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries("session_complete", "Durée p50 (ms)", "median", "durationMs"),
          trendsSeries("session_complete", "Durée p95 (ms)", "p95", "durationMs"),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Temps médian par étape (stepMs)",
    description: "Médiane de stepMs (temps sur l'étape courante) sur message_sent par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries("message_sent", "stepMs p50 (ms)", "median", "stepMs"),
          trendsSeries("message_sent", "stepMs p95 (ms)", "p95", "stepMs"),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard 2: Latency & Performance
// ─────────────────────────────────────────────────────────────────────────────
const latencyInsights = [
  {
    name: "STT – p50 latence par provider (ms)",
    description: "Médiane (p50) de latencyMs sur stt_completed, breakdowné par provider.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("stt_completed", "STT p50 (ms)", "median", "latencyMs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "provider" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "STT – p95 latence par provider (ms)",
    description: "P95 de latencyMs sur stt_completed, breakdowné par provider.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("stt_completed", "STT p95 (ms)", "p95", "latencyMs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "provider" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "TTS – p50 latence par provider (ms)",
    description: "Médiane (p50) de latencyMs sur tts_completed, breakdowné par provider.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("tts_completed", "TTS p50 (ms)", "median", "latencyMs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "provider" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "TTS – p95 latence par provider (ms)",
    description: "P95 de latencyMs sur tts_completed, breakdowné par provider.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("tts_completed", "TTS p95 (ms)", "p95", "latencyMs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "provider" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "TTS – Cache hit vs miss",
    description: "Nombre de tts_completed avec cacheHit=true vs false par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("tts_completed", "TTS synthèses")],
        breakdownFilter: { breakdown_type: "event", breakdown: "cacheHit" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "AI – TTFT p50 et p95 (ms)",
    description: "Médiane et p95 de ttftMs (first token) sur ai_response_received.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries("ai_response_received", "TTFT p50 (ms)", "median", "ttftMs"),
          trendsSeries("ai_response_received", "TTFT p95 (ms)", "p95", "ttftMs"),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "AI – Total latence p50 et p95 (ms)",
    description: "Médiane et p95 de totalMs sur ai_response_received.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries("ai_response_received", "Total p50 (ms)", "median", "totalMs"),
          trendsSeries("ai_response_received", "Total p95 (ms)", "p95", "totalMs"),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "AI – p50/p95 par provider",
    description: "Médiane et p95 de totalMs sur ai_response_received, breakdowné par provider.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("ai_response_received", "AI total p95 (ms)", "p95", "totalMs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "provider" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard 3: Error Rates
// ─────────────────────────────────────────────────────────────────────────────
const errorInsights = [
  {
    name: "Erreurs par composant (total)",
    description: "Breakdown par component sur error_occurred.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("error_occurred", "Erreurs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "component" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
  {
    name: "Erreurs par type (errorType) – total",
    description: "Breakdown par errorType sur error_occurred pour identifier les causes.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("error_occurred", "Erreurs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "errorType" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
  {
    name: "Erreurs par errorType – tendance (ligne)",
    description: "Évolution quotidienne du nombre d'erreurs groupées par errorType sur 30 jours.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("error_occurred", "Erreurs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "errorType" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Taux d'erreur STT (échecs / total)",
    description: "Nombre de stt_completed avec success=false vs true par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("stt_completed", "STT résultats")],
        breakdownFilter: { breakdown_type: "event", breakdown: "success" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Taux d'erreur TTS (échecs / total)",
    description: "Nombre de tts_completed avec success=false vs true par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("tts_completed", "TTS résultats")],
        breakdownFilter: { breakdown_type: "event", breakdown: "success" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Taux d'erreur AI (échecs / total)",
    description: "Nombre de ai_response_received avec success=false vs true par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("ai_response_received", "AI résultats")],
        breakdownFilter: { breakdown_type: "event", breakdown: "success" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Erreurs par composant – tendance (ligne)",
    description: "Ligne de tendance des erreurs par composant sur 30 jours.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("error_occurred", "Erreurs")],
        breakdownFilter: { breakdown_type: "event", breakdown: "component" },
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard 4: Engagement
// ─────────────────────────────────────────────────────────────────────────────
const engagementInsights = [
  {
    name: "Messages par session (moyenne)",
    description: "Moyenne du nombre de messages envoyés (message_sent) par session.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("message_sent", "Messages envoyés")],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Taux de capture d'identité",
    description: "identity_captured vs session_started par jour.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries("session_started", "Sessions démarrées"),
          trendsSeries("identity_captured", "Identités capturées"),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Temps de lecture articles (secondes)",
    description: "Moyenne de readTimeSec sur article_read_time_sec.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("article_read_time_sec", "Temps lecture (sec)", "avg", "readTimeSec")],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Méthode de chargement articles (proxy/reader/archive/failed)",
    description: "Breakdown par method sur article_load_method.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("article_load_method", "Chargements articles")],
        breakdownFilter: { breakdown_type: "event", breakdown: "method" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
  {
    name: "Progression vidéo (25/50/75/100 %)",
    description: "Breakdown par progressPct sur video_progress_pct.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("video_progress_pct", "Progression vidéo")],
        breakdownFilter: { breakdown_type: "event", breakdown: "progressPct" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
  {
    name: "Taux de complétion vidéo (100 %)",
    description: "Funnel video_progress_pct(25%) → (50%) → (75%) → (100%) pour mesurer le taux de complétion.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        dateRange: DATE_RANGE,
        series: [
          {
            kind: "EventsNode",
            event: "video_progress_pct",
            name: "25 %",
            properties: [{ key: "progressPct", value: 25, operator: "exact", type: "event" }],
          },
          {
            kind: "EventsNode",
            event: "video_progress_pct",
            name: "50 %",
            properties: [{ key: "progressPct", value: 50, operator: "exact", type: "event" }],
          },
          {
            kind: "EventsNode",
            event: "video_progress_pct",
            name: "75 %",
            properties: [{ key: "progressPct", value: 75, operator: "exact", type: "event" }],
          },
          {
            kind: "EventsNode",
            event: "video_progress_pct",
            name: "100 %",
            properties: [{ key: "progressPct", value: 100, operator: "exact", type: "event" }],
          },
        ],
        funnelsFilter: {
          funnelWindowInterval: 60,
          funnelWindowIntervalUnit: "minute",
          funnelOrderType: "ordered",
        },
      },
    },
  },
  {
    name: "Top vidéos cliquées",
    description: "Breakdown par url sur video_opened.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("video_opened", "Vidéos ouvertes")],
        breakdownFilter: { breakdown_type: "event", breakdown: "url" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
  {
    name: "Top articles ouverts",
    description: "Breakdown par url sur article_opened.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("article_opened", "Articles ouverts")],
        breakdownFilter: { breakdown_type: "event", breakdown: "url" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`PostHog host: ${HOST}`);
  console.log(`PostHog project: ${PROJECT_ID}\n`);

  const dashboards = [
    {
      name: "User Journey – Dilemme Plastique",
      description: "Funnel élève, drop-off par étape, sessions/jour, durée de session.",
      insights: userJourneyInsights,
    },
    {
      name: "Latency & Performance – Dilemme Plastique",
      description: "p50/p95 STT, TTS, AI first-token et total, par provider et cache-hit.",
      insights: latencyInsights,
    },
    {
      name: "Error Rates – Dilemme Plastique",
      description: "Taux d'erreur STT/TTS/AI, breakdown par component et errorType.",
      insights: errorInsights,
    },
    {
      name: "Engagement – Dilemme Plastique",
      description: "Messages/session, durée session, progression vidéo, temps lecture articles, taux identité.",
      insights: engagementInsights,
    },
  ];

  for (const dashSpec of dashboards) {
    console.log(`\n=== ${dashSpec.name} ===`);
    const dashboard = await upsertDashboard(dashSpec.name, dashSpec.description);
    await upsertInsights(dashboard, dashSpec.insights);
    const url = `${HOST}/project/${PROJECT_ID}/dashboard/${dashboard.id}`;
    console.log(`  URL: ${url}`);
  }

  console.log("\nDone.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
