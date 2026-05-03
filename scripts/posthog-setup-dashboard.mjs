#!/usr/bin/env node
// Crée le funnel + le dashboard "Usage – Dilemme Plastique" dans PostHog via l'API.
// Variables d'environnement requises :
//   POSTHOG_PERSONAL_API_KEY  (Personal API key)
//   POSTHOG_PROJECT_ID        (ID numérique du projet)
//   VITE_POSTHOG_HOST         (optionnel, défaut https://eu.posthog.com)
//
// Idempotent : si un dashboard du même nom existe déjà, le script l'utilise et ajoute
// uniquement les insights manquants (par nom).

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

const DASHBOARD_NAME = "Usage – Dilemme Plastique";
const FUNNEL_NAME = "Funnel élève – Dilemme Plastique";

const DATE_RANGE = { date_from: "-30d" };

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
        properties: [
          { key: "page", value: "homepage", operator: "exact", type: "event" },
        ],
      },
      { kind: "EventsNode", event: "identity_captured", name: "2. Prénom capturé" },
      { kind: "EventsNode", event: "message_sent", name: "3. 1er message élève" },
      { kind: "EventsNode", event: "peter_replied", name: "4. Peter répond" },
      { kind: "EventsNode", event: "message_sent", name: "5. 2e message élève" },
      { kind: "EventsNode", event: "peter_replied", name: "6. Peter répond (2e)" },
      { kind: "EventsNode", event: "message_sent", name: "7. 3e message élève (≥3 messages élève → conversation tenue)" },
    ],
    funnelsFilter: {
      funnelWindowInterval: 30,
      funnelWindowIntervalUnit: "minute",
      funnelOrderType: "ordered",
    },
  },
};

const trendsSeries = (event, name, math, mathProperty) => ({
  kind: "EventsNode",
  event,
  name,
  math: math || "total",
  ...(mathProperty ? { math_property: mathProperty } : {}),
});

const insights = [
  {
    name: FUNNEL_NAME,
    description:
      "page_view(homepage) → identity_captured → message_sent → peter_replied → message_sent (≥3 messages échangés). Fenêtre 30 min.",
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
    name: "Durée moyenne de session (ms)",
    description:
      "Moyenne de durationMs sur l'event session_complete. Diviser par 60000 pour obtenir des minutes.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries(
            "session_complete",
            "Durée moyenne (ms)",
            "avg",
            "durationMs",
          ),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
  {
    name: "Taux d'abandon par étape (funnel)",
    description: "Même funnel que ci-dessus, en visualisation funnel pour voir le drop-off.",
    query: funnelQuery,
  },
  {
    name: "Top vidéos cliquées",
    description: "Breakdown par url sur l'event video_opened.",
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
    name: "Top liens articles ouverts",
    description: "Breakdown par url sur l'event link_opened.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [trendsSeries("link_opened", "Articles ouverts")],
        breakdownFilter: { breakdown_type: "event", breakdown: "url" },
        trendsFilter: { display: "ActionsBarValue" },
      },
    },
  },
  {
    name: "Latence moyenne Peter (ttftMs / totalMs)",
    description:
      "Moyenne de ttftMs et totalMs sur l'event peter_replied (perfs streaming).",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: DATE_RANGE,
        interval: "day",
        series: [
          trendsSeries("peter_replied", "TTFT moyen (ms)", "avg", "ttftMs"),
          trendsSeries("peter_replied", "Total moyen (ms)", "avg", "totalMs"),
        ],
        trendsFilter: { display: "ActionsLineGraph" },
      },
    },
  },
];

async function findExistingByName(path, name) {
  let url = `${path}?search=${encodeURIComponent(name)}&limit=100`;
  const res = await api("GET", url);
  return (res?.results || []).find((x) => x.name === name) || null;
}

(async () => {
  console.log(`PostHog host: ${HOST}`);
  console.log(`PostHog project: ${PROJECT_ID}`);

  // 1. Dashboard (idempotent par nom)
  let dashboard = await findExistingByName("/dashboards/", DASHBOARD_NAME);
  if (dashboard) {
    console.log(`Dashboard existant trouvé : id=${dashboard.id}`);
  } else {
    dashboard = await api("POST", "/dashboards/", {
      name: DASHBOARD_NAME,
      description:
        "Vue rapide enseignant : sessions/jour, durée moyenne, funnel élève, top vidéos & articles, latence Peter.",
      pinned: true,
    });
    console.log(`Dashboard créé : id=${dashboard.id}`);
  }

  // 2. Insights (idempotent par nom : update query + description si déjà présent)
  for (const spec of insights) {
    const existing = await findExistingByName("/insights/", spec.name);
    if (existing) {
      const dashList = existing.dashboards || [];
      const dashboards = dashList.includes(dashboard.id)
        ? dashList
        : [...dashList, dashboard.id];
      await api("PATCH", `/insights/${existing.id}/`, {
        description: spec.description,
        query: spec.query,
        dashboards,
      });
      console.log(`↻ Insight mis à jour : ${spec.name}`);
      continue;
    }
    await api("POST", "/insights/", {
      name: spec.name,
      description: spec.description,
      query: spec.query,
      dashboards: [dashboard.id],
    });
    console.log(`+ Insight créé : ${spec.name}`);
  }

  const dashboardUrl = `${HOST}/project/${PROJECT_ID}/dashboard/${dashboard.id}`;
  console.log(`\nDashboard URL: ${dashboardUrl}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
