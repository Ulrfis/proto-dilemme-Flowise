// Gère le cycle de vie d'une "conversation session" persistée :
// 1) POST /api/sessions → crée une session anonyme, renvoie l'id
// 2) PATCH /api/sessions/:id → met à jour le prénom quand Peter le recueille
// 3) POST /api/sessions/:id/messages { sender, content } pour chaque message
//
// Règles de sécurité :
// - recordMessage / updateSessionFirstName utilisent UNIQUEMENT l'id actif
//   en mémoire (activeSessionId). Aucun fallback localStorage pour les
//   écritures, afin d'éviter la cross-attribution entre deux élèves.

let activeSessionId: string | null = null;
let firstNameUpdated = false;

export async function createConversationSession(): Promise<string | null> {
  // Invalide la session précédente avant toute tentative de création.
  activeSessionId = null;
  firstNameUpdated = false;

  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.warn("[conv-session] create failed", res.status);
      return null;
    }
    const json = (await res.json()) as { id: string };
    activeSessionId = json.id;
    return json.id;
  } catch (err) {
    console.warn("[conv-session] create error", err);
    return null;
  }
}

export function getActiveSessionId(): string | null {
  return activeSessionId;
}

/** Met à jour le prénom une seule fois par session (idempotent). */
export async function updateSessionFirstName(firstName: string): Promise<void> {
  if (!activeSessionId || firstNameUpdated || !firstName.trim()) return;
  firstNameUpdated = true; // marque immédiatement pour éviter les doublons
  try {
    await fetch(`/api/sessions/${activeSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: firstName.trim().slice(0, 80) }),
    });
  } catch (err) {
    firstNameUpdated = false; // réinitialise en cas d'erreur réseau → on réessaiera
    console.warn("[conv-session] updateFirstName failed", err);
  }
}

export async function recordMessage(
  sender: "user" | "peter",
  content: string,
): Promise<void> {
  const sessionId = activeSessionId;
  if (!sessionId || !content?.trim()) return;
  try {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender, content }),
    });
  } catch (err) {
    console.warn("[conv-session] recordMessage failed", err);
  }
}

export function clearConversationSession() {
  activeSessionId = null;
  firstNameUpdated = false;
}
