import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Download, Printer } from "lucide-react";

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

function csvEscape(value: string): string {
  // Neutralise les valeurs commençant par =, +, -, @ pour éviter
  // l'injection de formules dans Excel/Google Sheets/LibreOffice.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function downloadCsv(data: SessionDetail) {
  const header = ["timestamp", "sender", "content"];
  const lines = [header.join(",")];
  for (const m of data.messages) {
    lines.push(
      [
        csvEscape(new Date(m.createdAt).toISOString()),
        csvEscape(m.sender),
        csvEscape(m.content),
      ].join(","),
    );
  }
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `conversation-${data.session.firstName ?? "anonyme"}-${data.session.id.slice(0, 8)}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadPdf(data: SessionDetail) {
  const title = `Conversation – ${data.session.firstName ?? "Prénom inconnu"}`;
  const dateStr = new Date(data.session.createdAt).toLocaleString("fr-FR");
  const bubbles = data.messages
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleTimeString("fr-FR");
      const who = m.sender === "user" ? "Élève" : "Peter";
      const sideClass = m.sender === "user" ? "user" : "peter";
      return `
        <div class="bubble ${sideClass}">
          <div class="meta"><span class="who">${who}</span><span class="time">${time}</span></div>
          <div class="content">${htmlEscape(m.content).replace(/\n/g, "<br>")}</div>
        </div>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${htmlEscape(title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; margin: 0; padding: 24px; background: #f9fafb; }
  header { margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  header h1 { font-size: 22px; margin: 0 0 4px; }
  header p { margin: 0; font-size: 12px; color: #6b7280; }
  .conversation { display: flex; flex-direction: column; gap: 10px; }
  .bubble { padding: 10px 12px; border-radius: 10px; max-width: 78%; page-break-inside: avoid; border: 1px solid; }
  .bubble.user { background: #ccfbf1; border-color: #99f6e4; align-self: flex-end; margin-left: auto; }
  .bubble.peter { background: #ffffff; border-color: #e5e7eb; align-self: flex-start; margin-right: auto; }
  .meta { display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .who { font-weight: 600; color: #374151; }
  .content { font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .empty { font-size: 13px; color: #6b7280; font-style: italic; }
  @media print {
    body { background: #fff; padding: 0; }
    header { border-color: #d1d5db; }
  }
</style>
</head>
<body>
  <header>
    <h1>${htmlEscape(title)}</h1>
    <p>Démarré le ${htmlEscape(dateStr)}</p>
    <p style="font-family: ui-monospace, monospace; color:#9ca3af; margin-top:4px;">${htmlEscape(data.session.id)}</p>
  </header>
  <div class="conversation">
    ${data.messages.length === 0 ? '<p class="empty">Aucun message dans cette conversation.</p>' : bubbles}
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Impossible d'ouvrir la fenêtre d'impression. Vérifiez que les popups sont autorisés.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
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
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-xl font-semibold">
                    {data.session.firstName ?? <span className="text-gray-400 italic font-normal">Prénom inconnu</span>}
                  </h1>
                  <p className="text-sm text-gray-500">
                    Démarré le{" "}
                    {new Date(data.session.createdAt).toLocaleString("fr-FR")}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-1">{data.session.id}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadCsv(data)}
                    data-testid="button-download-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPdf(data)}
                    data-testid="button-download-pdf"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </div>
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
