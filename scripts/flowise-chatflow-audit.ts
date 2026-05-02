/**
 * Audit du chatflow Flowise — récupère sa configuration via l'API et
 * identifie les goulots de latence.
 *
 * Usage : npx tsx scripts/flowise-chatflow-audit.ts
 *
 * Variables d'environnement requises :
 *   FLOWISE_HOST          (ex: https://flowise.example.com)
 *   FLOWISE_CHATFLOW_ID   (UUID du chatflow)
 *   FLOWISE_API_KEY       (optionnel mais recommandé)
 *
 * Sortie :
 *   - rapport markdown sur stdout
 *   - écrit également dans docs/flowise-chatflow-audit-report.md
 */

import fs from "node:fs/promises";
import path from "node:path";

interface FlowiseNode {
  id: string;
  type?: string;
  data?: {
    label?: string;
    name?: string;
    category?: string;
    description?: string;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  };
}

interface FlowiseEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface FlowiseFlow {
  nodes: FlowiseNode[];
  edges: FlowiseEdge[];
}

interface FlowiseChatflow {
  id: string;
  name: string;
  flowData: string; // JSON string
  type?: string;
  category?: string;
  isPublic?: boolean;
}

const HEAVY_NODE_PATTERNS = [
  { pattern: /retriev|vector|chroma|pinecone|qdrant|weaviate|faiss/i, kind: "RAG retrieval", advice: "Cacher les embeddings; réduire k; activer hybrid search" },
  { pattern: /openai|anthropic|llm|chat.*model|claude|gpt/i, kind: "LLM call", advice: "Vérifier streaming activé; activer prompt caching (OpenAI/Anthropic)" },
  { pattern: /tool|api.*call|http.*request|webhook/i, kind: "External tool/API", advice: "Paralléliser les appels; ajouter timeout court; cache" },
  { pattern: /agent|router|condition|if.*else/i, kind: "Routing/agent", advice: "Vérifier qu'un seul chemin se déclenche; éviter les agents imbriqués" },
  { pattern: /memory|buffer|conversation/i, kind: "Memory", advice: "Limiter la taille; éviter retrieval coûteux à chaque tour" },
  { pattern: /loader|document|pdf|csv|web.*scraper/i, kind: "Document loader", advice: "Pré-charger en index; éviter le runtime" },
];

async function main() {
  const host = process.env.FLOWISE_HOST?.replace(/\/+$/, "");
  const id = process.env.FLOWISE_CHATFLOW_ID;
  const apiKey = process.env.FLOWISE_API_KEY;

  if (!host || !id) {
    console.error("❌ FLOWISE_HOST et FLOWISE_CHATFLOW_ID requis");
    process.exit(1);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const url = `${host}/api/v1/chatflows/${id}`;
  console.error(`▶ GET ${url}`);

  const start = Date.now();
  const res = await fetch(url, { headers });
  const elapsed = Date.now() - start;

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status} ${res.statusText} in ${elapsed}ms`);
    const body = await res.text();
    console.error(body.slice(0, 500));
    process.exit(2);
  }

  const chatflow = (await res.json()) as FlowiseChatflow;
  console.error(`✓ chatflow "${chatflow.name}" récupéré en ${elapsed}ms`);

  let flow: FlowiseFlow;
  try {
    flow = JSON.parse(chatflow.flowData);
  } catch (err) {
    console.error("❌ flowData n'est pas du JSON valide:", err);
    process.exit(3);
  }

  const report = buildReport(chatflow, flow);
  console.log(report);

  const outPath = path.resolve("docs/flowise-chatflow-audit-report.md");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, report, "utf-8");
  console.error(`\n📄 Rapport écrit dans ${outPath}`);
}

function buildReport(chatflow: FlowiseChatflow, flow: FlowiseFlow): string {
  const nodes = flow.nodes ?? [];
  const edges = flow.edges ?? [];
  const lines: string[] = [];

  lines.push(`# Audit chatflow Flowise — ${chatflow.name}`);
  lines.push(`> Généré le ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`**ID** : \`${chatflow.id}\``);
  lines.push(`**Type** : ${chatflow.type || "?"}  |  **Catégorie** : ${chatflow.category || "?"}`);
  lines.push(`**Nœuds** : ${nodes.length}  |  **Arêtes** : ${edges.length}`);
  lines.push("");

  // ── Inventaire ────────────────────────────────────────────────────────
  lines.push("## Inventaire des nœuds");
  lines.push("");
  lines.push("| ID | Label | Catégorie | Type |");
  lines.push("|---|---|---|---|");
  for (const n of nodes) {
    const label = n.data?.label || n.data?.name || "?";
    const cat = n.data?.category || "?";
    const typ = n.type || "?";
    lines.push(`| \`${n.id}\` | ${label} | ${cat} | ${typ} |`);
  }
  lines.push("");

  // ── Goulots détectés ──────────────────────────────────────────────────
  lines.push("## Goulots de latence détectés");
  lines.push("");
  const findings: Array<{ node: FlowiseNode; kind: string; advice: string }> = [];
  for (const n of nodes) {
    const haystack = `${n.type || ""} ${n.data?.name || ""} ${n.data?.label || ""} ${n.data?.category || ""}`;
    for (const p of HEAVY_NODE_PATTERNS) {
      if (p.pattern.test(haystack)) {
        findings.push({ node: n, kind: p.kind, advice: p.advice });
        break;
      }
    }
  }

  if (findings.length === 0) {
    lines.push("_Aucun nœud lourd détecté par heuristique. Inspection manuelle recommandée._");
  } else {
    lines.push("| Nœud | Type détecté | Recommandation |");
    lines.push("|---|---|---|");
    for (const f of findings) {
      const label = f.node.data?.label || f.node.data?.name || f.node.id;
      lines.push(`| \`${label}\` | ${f.kind} | ${f.advice} |`);
    }
  }
  lines.push("");

  // ── Topologie : longueur du chemin séquentiel ─────────────────────────
  lines.push("## Topologie d'exécution");
  lines.push("");
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  // Find roots (nodes with no incoming edges)
  const incoming = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !incoming.has(n.id));

  lines.push(`- **Roots (entrées)** : ${roots.length} (${roots.map((r) => r.data?.label || r.id).join(", ") || "aucun"})`);

  // Longest path estimation
  const longestPath = computeLongestPath(nodes, edges);
  lines.push(`- **Plus long chemin** : ${longestPath.length} nœuds`);
  lines.push("");
  if (longestPath.length > 5) {
    lines.push(`> ⚠️ Le plus long chemin contient ${longestPath.length} nœuds, ce qui correspond aux ~11 cycles \`agentFlowEvent\` observés dans les logs. Chaque nœud ajoute de la latence séquentielle.`);
    lines.push("");
    lines.push("**Détail du chemin le plus long :**");
    lines.push("");
    longestPath.forEach((id, i) => {
      const node = nodes.find((n) => n.id === id);
      const label = node?.data?.label || node?.data?.name || id;
      lines.push(`${i + 1}. \`${label}\` (${node?.type || "?"})`);
    });
    lines.push("");
  }

  // ── Recommandations actionables ───────────────────────────────────────
  lines.push("## Recommandations actionnables");
  lines.push("");
  lines.push("### Quick wins (à appliquer en priorité)");
  lines.push("");
  if (findings.some((f) => f.kind === "RAG retrieval")) {
    lines.push("- 🎯 **RAG** : réduire `k` (top-k) à 3-5 max, activer le cache d'embeddings, indexer en avance");
  }
  if (findings.some((f) => f.kind === "LLM call")) {
    lines.push("- 🎯 **LLM** : vérifier que le streaming est activé sur tous les nœuds LLM ; activer prompt caching côté provider (OpenAI > 1024 tokens, Anthropic via cache_control)");
  }
  if (findings.some((f) => f.kind === "External tool/API")) {
    lines.push("- 🎯 **Outils externes** : ajouter un timeout court (3-5s), paralléliser quand possible, cacher les réponses idempotentes");
  }
  if (longestPath.length > 5) {
    lines.push(`- 🎯 **Chemin séquentiel** : audit manuel des ${longestPath.length} nœuds du chemin le plus long pour identifier ceux qui peuvent être supprimés ou rendus parallèles`);
  }
  lines.push("");
  lines.push("### Vérifications côté Flowise");
  lines.push("");
  lines.push("- `streaming: true` activé sur le LLM final");
  lines.push("- `returnSourceDocuments: false` (déjà fait côté serveur)");
  lines.push("- Mémoire : limiter à N derniers échanges");
  lines.push("- Tools : annoter `async: true` quand le résultat n'est pas critique pour la réponse");
  lines.push("");

  return lines.join("\n");
}

function computeLongestPath(nodes: FlowiseNode[], edges: FlowiseEdge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const incoming = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);

  let best: string[] = [];
  const memo = new Map<string, string[]>();

  function dfs(id: string, visited: Set<string>): string[] {
    if (visited.has(id)) return []; // avoid cycles
    if (memo.has(id)) return memo.get(id)!;
    const next = adj.get(id) ?? [];
    let bestSub: string[] = [];
    for (const t of next) {
      const newVisited = new Set(visited);
      newVisited.add(id);
      const sub = dfs(t, newVisited);
      if (sub.length > bestSub.length) bestSub = sub;
    }
    const result = [id, ...bestSub];
    memo.set(id, result);
    return result;
  }

  for (const r of roots) {
    const p = dfs(r, new Set());
    if (p.length > best.length) best = p;
  }
  // Fallback if no roots (cyclic graph)
  if (best.length === 0 && nodes.length > 0) {
    for (const n of nodes) {
      const p = dfs(n.id, new Set());
      if (p.length > best.length) best = p;
    }
  }
  return best;
}

main().catch((err) => {
  console.error("❌ Erreur:", err);
  process.exit(99);
});
