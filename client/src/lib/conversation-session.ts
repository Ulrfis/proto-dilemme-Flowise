// Gère le cycle de vie d'une "conversation session" persistée :
// 1) /api/sessions { firstName, lastName } → renvoie l'id
// 2) /api/sessions/:id/messages { sender, content } pour chaque message
//
// L'id est conservé en localStorage UNIQUEMENT pour le diagnostic ; on ne
// reprend pas une session existante au reload (chaque arrivée = nouvelle entrée
// avec son prénom/nom). Les ajouts sont best-effort : un échec réseau ne casse
// jamais le chat.

const SESSION_STORAGE_KEY = "dilemme.conversationSessionId";
const SESSION_NAME_KEY = "dilemme.conversationName";

let currentSessionId: string | null = null;
let currentName: { firstName: string; lastName: string } | null = null;

export interface SessionIdentity {
  firstName: string;
  lastName: string;
}

export async function createConversationSession(
  identity: SessionIdentity,
): Promise<string | null> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity),
    });
    if (!res.ok) {
      console.warn("[conv-session] create failed", res.status);
      return null;
    }
    const json = (await res.json()) as { id: string };
    currentSessionId = json.id;
    currentName = identity;
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, json.id);
      window.localStorage.setItem(SESSION_NAME_KEY, JSON.stringify(identity));
    } catch {}
    return json.id;
  } catch (err) {
    console.warn("[conv-session] create error", err);
    return null;
  }
}

export function getCurrentSessionId(): string | null {
  if (currentSessionId) return currentSessionId;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getCurrentSessionName(): SessionIdentity | null {
  if (currentName) return currentName;
  try {
    const raw = window.localStorage.getItem(SESSION_NAME_KEY);
    return raw ? (JSON.parse(raw) as SessionIdentity) : null;
  } catch {
    return null;
  }
}

export async function recordMessage(
  sender: "user" | "peter",
  content: string,
): Promise<void> {
  const sessionId = getCurrentSessionId();
  if (!sessionId || !content?.trim()) return;
  try {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender, content }),
    });
  } catch (err) {
    // Persistance best-effort — on ignore les erreurs réseau.
    console.warn("[conv-session] recordMessage failed", err);
  }
}

export function clearConversationSession() {
  currentSessionId = null;
  currentName = null;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_NAME_KEY);
  } catch {}
}
