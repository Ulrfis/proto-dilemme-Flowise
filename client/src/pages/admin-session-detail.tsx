import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

const TOKEN_KEY = "dilemme.adminToken";

interface MsgRow {
  id: string;
  sender: "user" | "peter";
  content: string;
  createdAt: string;
}

interface SessionDetail {
  session: {
    id: string;
    firstName: string | null;
    createdAt: string;
  };
  messages: MsgRow[];
}

export default function AdminSessionDetailPage() {
  const [, params] = useRoute<{ id: string }>("/admin/sessions/:id");
  const sessionId = params?.id;
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let token = "";
    try {
      token = window.sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {}
    if (!token) {
      setError("Non authentifié — retournez à la liste pour vous connecter.");
      setLoading(false);
      return;
    }
    fetch(`/api/admin/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SessionDetail;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <Link
            href="/admin/sessions"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Retour à la liste
          </Link>
        </div>

        {loading && (
          <div className="flex items-center text-gray-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Chargement…
          </div>
        )}
        {error && <p className="text-red-600">{error}</p>}

        {data && (
          <>
            <header className="bg-white rounded-xl shadow p-4 mb-4">
              <h1 className="text-xl font-semibold">
                {data.session.firstName ?? <span className="text-gray-400 italic font-normal">Prénom inconnu</span>}
              </h1>
              <p className="text-sm text-gray-500">
                Démarré le{" "}
                {new Date(data.session.createdAt).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-gray-400 font-mono mt-1">{data.session.id}</p>
            </header>

            <div className="space-y-3">
              {data.messages.length === 0 && (
                <p className="text-gray-500 text-sm">
                  Aucun message dans cette conversation.
                </p>
              )}
              {data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 ${
                    m.sender === "user"
                      ? "bg-teal-50 ml-12 border border-teal-100"
                      : "bg-white mr-12 border border-gray-200"
                  }`}
                  data-testid={`msg-${m.sender}-${m.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold uppercase text-gray-500">
                      {m.sender === "user" ? "Élève" : "Peter"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(m.createdAt).toLocaleTimeString("fr-FR")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">
                    {m.content}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
