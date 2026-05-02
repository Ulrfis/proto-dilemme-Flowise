import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

const TOKEN_KEY = "dilemme.adminToken";
const PAGE_SIZE = 50;

interface SessionRow {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  messageCount: number;
}

interface ListResponse {
  items: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
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
  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (t = token, p = page) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/admin/sessions?page=${p}&pageSize=${PAGE_SIZE}`,
        t,
      );
      if (res.status === 401) {
        setError("Mot de passe invalide.");
        setData(null);
        try { window.sessionStorage.removeItem(TOKEN_KEY); } catch {}
        setToken("");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ListResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void load(token, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <form
          className="w-full max-w-sm bg-white p-6 rounded-xl shadow space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            try { window.sessionStorage.setItem(TOKEN_KEY, t); } catch {}
            setToken(t);
            void load(t, 1);
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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold">Conversations enregistrées</h1>
            {data && (
              <p className="text-sm text-gray-500 mt-1" data-testid="text-total-sessions">
                {data.total} session{data.total > 1 ? "s" : ""} au total
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(token, page)}
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
                try { window.sessionStorage.removeItem(TOKEN_KEY); } catch {}
                setToken("");
                setData(null);
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
                <th className="text-right px-4 py-2">Messages</th>
                <th className="text-left px-4 py-2">ID</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data === null && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Aucune donnée chargée.
                  </td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Aucune conversation enregistrée pour le moment.
                  </td>
                </tr>
              )}
              {data?.items.map((s) => (
                <tr key={s.id} className="border-t" data-testid={`row-session-${s.id}`}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2">{s.firstName}</td>
                  <td className="px-4 py-2">{s.lastName}</td>
                  <td className="px-4 py-2 text-right tabular-nums" data-testid={`count-session-${s.id}`}>
                    {s.messageCount}
                  </td>
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

        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-600">
              Page {data.page} / {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-next-page"
              >
                Suivant <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
