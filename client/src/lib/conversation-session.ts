// Gère le cycle de vie d'une "conversation session" persistée :
// 1) /api/sessions { firstName, lastName } → renvoie l'id
// 2) /api/sessions/:id/messages { sender, content } pour chaque message
//
// Règles de sécurité d'attribution :
// - `recordMessage` n'écrit JAMAIS pour une session "fantôme" : il utilise
//   uniquement l'id de la session ACTIVE (en mémoire), créée avec succès
//   dans cette pageload. Pas de fallback localStorage côté write — sinon le
//   prochain élève qui ouvre l'app pourrait écrire dans la session du
//   précédent si la création de sa propre session échoue.
// - L'identité (prénom/nom) est conservée en localStorage pour préremplir
//   le formulaire au prochain reload (UX, pas d'auth).

const SESSION_NAME_KEY = "dilemme.conversationName";

let activeSessionId: string | null = null;
let activeName: { firstName: string; lastName: string } | null = null;

export interface SessionIdentity {
  firstName: string;
  lastName: string;
}

export async function createConversationSession(
  identity: SessionIdentity,
): Promise<string | null> {
  // Invalide explicitement toute session active précédente AVANT de créer la
  // nouvelle : si la création échoue, on ne veut surtout pas continuer à
  // écrire dans l'ancienne session.
  activeSessionId = null;
  activeName = null;

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
    activeSessionId = json.id;
    activeName = identity;
    try {
      // On garde l'identité en localStorage UNIQUEMENT pour préremplir le
      // formulaire au prochain reload — pas pour reprendre la session.
      window.localStorage.setItem(SESSION_NAME_KEY, JSON.stringify(identity));
    } catch {}
    return json.id;
  } catch (err) {
    console.warn("[conv-session] create error", err);
    return null;
  }
}

export function getActiveSessionId(): string | null {
  return activeSessionId;
}

export function getActiveSessionName(): SessionIdentity | null {
  return activeName;
}

export function getStoredIdentity(): SessionIdentity | null {
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
  // Strict : seule la session active en mémoire peut recevoir des messages.
  // Aucun fallback localStorage ici, sous peine de cross-attribution.
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
  activeName = null;
  try {
    window.localStorage.removeItem(SESSION_NAME_KEY);
  } catch {}
}
