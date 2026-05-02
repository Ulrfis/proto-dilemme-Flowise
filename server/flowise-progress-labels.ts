/**
 * Mapping entre les événements Flowise (Agent Flow) et un label FR
 * affichable à l'élève pendant l'attente du premier token.
 *
 * Heuristiques basées sur le contenu de l'événement, car Flowise envoie
 * différents formats selon le type de nœud :
 *  - agentFlowEvent       : début d'exécution d'un nœud
 *  - nextAgentFlow        : transition vers le nœud suivant
 *  - agentFlowExecutedData: nœud terminé avec ses données
 *  - calledTools          : appel d'outil(s)
 *  - usedTools            : outil(s) utilisé(s)
 *  - usageMetadata        : métadonnées finales
 */

export interface ProgressLabel {
  step: string;     // identifiant court (pour analytics)
  label: string;    // texte FR pour l'UI
}

const TOOL_LABEL: ProgressLabel = {
  step: "tool",
  label: "Peter consulte ses outils…",
};

const RETRIEVAL_LABEL: ProgressLabel = {
  step: "retrieval",
  label: "Peter cherche dans ses sources…",
};

const REASONING_LABEL: ProgressLabel = {
  step: "reasoning",
  label: "Peter réfléchit à sa réponse…",
};

const GENERATING_LABEL: ProgressLabel = {
  step: "generating",
  label: "Peter rédige sa réponse…",
};

const TRANSITION_LABEL: ProgressLabel = {
  step: "transition",
  label: "Peter prépare la suite…",
};

/**
 * Détermine le label à afficher pour un événement Flowise donné.
 * Retourne null si l'événement n'apporte pas d'info utile pour l'utilisateur.
 */
export function labelForFlowiseEvent(event: string, data: unknown): ProgressLabel | null {
  switch (event) {
    case "calledTools":
    case "usedTools":
      return TOOL_LABEL;

    case "agentFlowEvent":
    case "nextAgentFlow":
    case "agentFlowExecutedData": {
      // Try to inspect the node name/category to pick a more specific label
      const nodeName = extractNodeName(data);
      if (nodeName) {
        const lower = nodeName.toLowerCase();
        if (lower.includes("retriev") || lower.includes("vector") || lower.includes("rag")) {
          return RETRIEVAL_LABEL;
        }
        if (lower.includes("tool") || lower.includes("api")) {
          return TOOL_LABEL;
        }
        if (lower.includes("llm") || lower.includes("chat") || lower.includes("openai") || lower.includes("anthropic")) {
          return GENERATING_LABEL;
        }
        if (lower.includes("agent") || lower.includes("router") || lower.includes("condition")) {
          return REASONING_LABEL;
        }
      }
      return TRANSITION_LABEL;
    }

    case "token":
      return GENERATING_LABEL;

    default:
      return null;
  }
}

function extractNodeName(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const key of ["nodeLabel", "nodeName", "name", "label", "nodeId", "id"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
