import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw } from "lucide-react";

const TOKEN_KEY = "dilemme.adminToken";

interface SessionRow {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

function authFetch(url: string, token: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

export default function AdminSessionsPage() {
  const [token, setToken] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [draft, setDraft] = useState("");
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (t = token) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/admin/sessions", t);
      if (res.status === 401) {
        setError("Mot de passe invalide.");
        setSessions(null);
        try {
          window.sessionStorage.removeItem(TOKEN_KEY);
        } catch {}
        setToken("");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { sessions: SessionRow[] };
      setSessions(json.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <form
          className="w-full max-w-sm bg-white p-6 rounded-xl shadow space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            try {
              window.sessionStorage.setItem(TOKEN_KEY, t);
            } catch {}
            setToken(t);
            void load(t);
          }}
        >
          <h1 className="text-xl font-semibold">Admin · Sessions</h1>
          <p className="text-sm text-gray-600">
            Entrez le mot de passe d'administration pour accéder aux conversations.
          </p>
          <div className="space-y-2">
            <Label htmlFor="admin-token">Mot de passe</Label>
            <Input
              id="admin-token"
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              data-testid="input-admin-token"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" data-testid="button-admin-login">
            Se connecter
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Conversations enregistrées</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={loading}
              data-testid="button-refresh-sessions"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Actualiser
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  window.sessionStorage.removeItem(TOKEN_KEY);
                } catch {}
                setToken("");
                setSessions(null);
              }}
            >
              Se déconnecter
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Prénom</th>
                <th className="text-left px-4 py-2">Nom</th>
                <th className="text-left px-4 py-2">ID</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sessions === null && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    Aucune donnée chargée.
                  </td>
                </tr>
              )}
              {sessions && sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    Aucune conversation enregistrée pour le moment.
                  </td>
                </tr>
              )}
              {sessions?.map((s) => (
                <tr key={s.id} className="border-t" data-testid={`row-session-${s.id}`}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2">{s.firstName}</td>
                  <td className="px-4 py-2">{s.lastName}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 font-mono">
                    {s.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/sessions/${s.id}`}
                      className="text-teal-600 hover:underline"
                      data-testid={`link-session-${s.id}`}
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
