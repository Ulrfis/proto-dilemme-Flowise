import { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, RefreshCw, AlertCircle, Globe, BookOpen, Archive, FileText } from "lucide-react";
import { MediaItem } from "../../types/chat";
import { analytics } from "../../lib/analytics";

interface WebViewProps {
  webpage: MediaItem | null;
}

type ViewMode = 'proxy' | 'reader' | 'archive' | 'error';
type PreferredMode = 'auto' | 'proxy' | 'reader' | 'archive';

const PREFERRED_MODE_KEY = 'webview_preferred_mode';

interface ReaderData {
  title: string;
  content: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
}

function ReaderView({ title, content, byline, siteName, sourceUrl }: ReaderData & { sourceUrl: string }) {
  return (
    <div className="w-full h-full overflow-y-auto bg-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
          <BookOpen className="w-3 h-3" />
          {siteName || (() => { try { return new URL(sourceUrl).hostname; } catch { return sourceUrl; } })()}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-3">{title}</h1>
        {byline && (
          <p className="text-sm text-gray-500 mb-4">{byline}</p>
        )}
        <hr className="border-gray-200 mb-6" />
        <div
          className="prose prose-sm max-w-none text-gray-800 leading-relaxed
            [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-4
            [&_p]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3
            [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_li]:mb-1
            [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4
            [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content, { USE_PROFILES: { html: true } }) }}
        />
      </div>
    </div>
  );
}

const MODE_LABELS: Record<ViewMode, { icon: React.ReactNode; label: string; color: string }> = {
  proxy:   { icon: <Globe className="w-3 h-3" />,    label: "🌐 Proxy",   color: "bg-blue-100 text-blue-700" },
  reader:  { icon: <BookOpen className="w-3 h-3" />, label: "📖 Lecteur", color: "bg-green-100 text-green-700" },
  archive: { icon: <Archive className="w-3 h-3" />,  label: "🗄️ Archive", color: "bg-purple-100 text-purple-700" },
  error:   { icon: <AlertCircle className="w-3 h-3" />, label: "Erreur", color: "bg-red-100 text-red-700" },
};

const LOADING_MESSAGES: Record<ViewMode, string> = {
  proxy:   "Chargement via proxy…",
  reader:  "Extraction du contenu…",
  archive: "Chargement depuis l'archive…",
  error:   "",
};

export function WebView({ webpage }: WebViewProps) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>('proxy');
  const [readerData, setReaderData] = useState<ReaderData | null>(null);
  const [readerFallback, setReaderFallback] = useState<ReaderData | null>(null);
  const [finalError, setFinalError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [preferredMode, setPreferredModeState] = useState<PreferredMode>(() => {
    try {
      const stored = localStorage.getItem(PREFERRED_MODE_KEY);
      if (stored === 'auto' || stored === 'proxy' || stored === 'reader' || stored === 'archive') {
        return stored;
      }
    } catch { /* ignore */ }
    return 'auto';
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const modeRef = useRef<ViewMode>('proxy');
  const preferredModeRef = useRef<PreferredMode>(preferredMode);
  const articleOpenedAtRef = useRef<number | null>(null);
  const articleUrlRef = useRef<string | null>(null);
  const loadMethodFiredRef = useRef<string | null>(null);
  const readTimeTrackedRef = useRef<string | null>(null);

  const setPreferredMode = (m: PreferredMode) => {
    preferredModeRef.current = m;
    setPreferredModeState(m);
    try { localStorage.setItem(PREFERRED_MODE_KEY, m); } catch { /* ignore */ }
  };

  const handleExternalOpen = () => {
    if (webpage) {
      window.open(webpage.url, '_blank', 'noopener,noreferrer');
    }
  };

  const setModeAndRef = (m: ViewMode) => {
    modeRef.current = m;
    setMode(m);
  };

  // Fire article_load_method once per article open — URL-only guard so a
  // cascade (proxy→reader→archive) emits only the final resolved method.
  const fireLoadMethod = (url: string, method: "proxy" | "reader" | "archive" | "failed", latencyMs?: number) => {
    if (loadMethodFiredRef.current === url) return;
    loadMethodFiredRef.current = url;
    analytics.trackArticleLoadMethod({ url, method, latencyMs });
  };

  const tryReaderMode = async (url: string) => {
    const readerStart = Date.now();
    setModeAndRef('reader');
    setLoading(true);
    const ctrl = new AbortController();
    const readerTimeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(`/api/reader?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
      clearTimeout(readerTimeout);
      if (resp.ok) {
        const data: ReaderData = await resp.json();
        setReaderData(data);
        setLoading(false);
        fireLoadMethod(url, "reader", Date.now() - readerStart);
      } else {
        if (preferredModeRef.current === 'reader') {
          console.warn('[WebView] Reader mode failed (forced reader mode — not cascading)');
          setModeAndRef('error');
          setFinalError(true);
          setLoading(false);
          fireLoadMethod(url, "failed");
          analytics.trackError({ component: "reader", errorType: `HTTP_${resp.status}`, message: `Reader failed with HTTP ${resp.status}` });
        } else {
          console.warn('[WebView] Reader mode failed, trying archive');
          tryArchiveMode(url);
        }
      }
    } catch (err) {
      clearTimeout(readerTimeout);
      if (preferredModeRef.current === 'reader') {
        console.warn('[WebView] Reader mode error (forced reader mode — not cascading):', err);
        setModeAndRef('error');
        setFinalError(true);
        setLoading(false);
        fireLoadMethod(url, "failed");
        analytics.trackError({ component: "reader", errorType: err instanceof Error ? err.name : "UnknownError", message: err instanceof Error ? err.message : String(err) });
      } else {
        console.warn('[WebView] Reader mode error:', err);
        tryArchiveMode(url);
      }
    }
  };

  const tryArchiveMode = (url: string) => {
    setModeAndRef('archive');
    setLoading(true);
    setReaderFallback(readerData);
    setReaderData(null);
    if (!readerData) {
      fetch(`/api/reader?url=${encodeURIComponent(url)}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: ReaderData | null) => {
          if (data?.title) setReaderFallback(data);
        })
        .catch(() => { /* metadata is best-effort; ignore failures */ });
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (modeRef.current === 'archive') {
        console.warn('[WebView] Archive timeout, showing final error');
        setModeAndRef('error');
        setFinalError(true);
        setLoading(false);
        if (webpage) {
          fireLoadMethod(webpage.url, "failed");
          analytics.trackError({ component: "proxy", errorType: "ArchiveTimeout", message: "Archive iframe timed out" });
        }
      }
    }, 15000);
  };

  // Track read time on article URL change or unmount (once per article URL)
  useEffect(() => {
    return () => {
      const url = articleUrlRef.current;
      if (articleOpenedAtRef.current !== null && url && readTimeTrackedRef.current !== url) {
        readTimeTrackedRef.current = url;
        const readTimeSec = Math.round((Date.now() - articleOpenedAtRef.current) / 1000);
        if (readTimeSec >= 1) {
          analytics.trackArticleReadTime({ url, readTimeSec });
        }
      }
    };
  }, [webpage?.url]);

  // Main entry: respect preferredMode, fall back to cascade for 'auto'
  useEffect(() => {
    if (!webpage) return;

    // Fire read time for previous article before switching (once per URL guard)
    const prevUrl = articleUrlRef.current;
    if (articleOpenedAtRef.current !== null && prevUrl && prevUrl !== webpage.url && readTimeTrackedRef.current !== prevUrl) {
      readTimeTrackedRef.current = prevUrl;
      const readTimeSec = Math.round((Date.now() - articleOpenedAtRef.current) / 1000);
      if (readTimeSec >= 1) {
        analytics.trackArticleReadTime({ url: prevUrl, readTimeSec });
      }
    }

    articleOpenedAtRef.current = Date.now();
    articleUrlRef.current = webpage.url;
    readTimeTrackedRef.current = null;
    loadMethodFiredRef.current = null;
    analytics.trackArticleOpened({ url: webpage.url, title: webpage.title });

    setLoading(true);
    setFinalError(false);
    setReaderData(null);
    setReaderFallback(null);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const pref = preferredMode;

    if (pref === 'reader') {
      tryReaderMode(webpage.url);
      return;
    }

    if (pref === 'archive') {
      setModeAndRef('archive');
      timeoutRef.current = setTimeout(() => {
        if (modeRef.current === 'archive') {
          setModeAndRef('error');
          setFinalError(true);
          setLoading(false);
        }
      }, 15000);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }

    if (pref === 'proxy') {
      setModeAndRef('proxy');
      timeoutRef.current = setTimeout(() => {
        if (modeRef.current === 'proxy') {
          console.warn('[WebView] Proxy iframe timeout (forced proxy mode)');
          setModeAndRef('error');
          setFinalError(true);
          setLoading(false);
        }
      }, 15000);
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }

    // 'auto' — original cascade logic
    setModeAndRef('proxy');
    const ctrl = new AbortController();
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(webpage.url)}`;
    fetch(proxyUrl, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          console.warn(`[WebView] Proxy probe failed HTTP ${res.status}, trying reader`);
          analytics.trackError({ component: "proxy", errorType: `HTTP_${res.status}`, message: `Proxy failed with HTTP ${res.status}` });
          tryReaderMode(webpage.url);
        }
        // Probe success: do NOT emit article_load_method here.
        // handleIframeLoad fires "proxy" once the iframe actually renders,
        // ensuring the emitted method matches the confirmed render outcome.
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('[WebView] Proxy probe network error:', err);
        analytics.trackError({ component: "proxy", errorType: err.name, message: err.message });
        tryReaderMode(webpage.url);
      });

    timeoutRef.current = setTimeout(() => {
      if (modeRef.current === 'proxy') {
        console.warn('[WebView] Proxy iframe timeout, trying reader');
        tryReaderMode(webpage.url);
      }
    }, 15000);

    return () => {
      ctrl.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [webpage?.url, retryKey, preferredMode]);

  const handleIframeLoad = () => {
    if (modeRef.current === 'proxy' || modeRef.current === 'archive') {
      setLoading(false);
      setFinalError(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (webpage) {
        fireLoadMethod(webpage.url, modeRef.current as "proxy" | "archive");
      }
    }
  };

  const handleIframeError = () => {
    if (modeRef.current === 'proxy') {
      if (preferredMode === 'proxy') {
        setModeAndRef('error');
        setFinalError(true);
        setLoading(false);
        if (webpage) {
          fireLoadMethod(webpage.url, "failed");
          analytics.trackError({ component: "proxy", errorType: "IframeError", message: "Proxy iframe load error" });
        }
      } else {
        console.warn('[WebView] Proxy iframe error, trying reader');
        if (webpage) tryReaderMode(webpage.url);
      }
    } else if (modeRef.current === 'archive') {
      console.warn('[WebView] Archive iframe error, showing final error');
      setModeAndRef('error');
      setFinalError(true);
      setLoading(false);
      if (webpage) {
        fireLoadMethod(webpage.url, "failed");
        analytics.trackError({ component: "proxy", errorType: "ArchiveIframeError", message: "Archive iframe load error" });
      }
    }
  };

  const resetAll = () => {
    if (!webpage) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setRetryKey(prev => prev + 1);
  };

  if (!webpage) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-400 max-w-md">
          <div className="w-20 h-20 mx-auto text-gray-300 mb-6">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-600 mb-2">Aucun article sélectionné</h4>
          <p className="text-gray-500">
            Les articles et liens externes partagés par Peter dans la conversation s'afficheront ici.
            Cliquez sur les boutons "🔗 Voir le lien" pour les consulter.
          </p>
        </div>
      </div>
    );
  }

  const getIframeSrc = () => {
    if (mode === 'proxy') {
      return `/api/proxy?url=${encodeURIComponent(webpage.url)}`;
    }
    if (mode === 'archive') {
      return `https://web.archive.org/web/2/${webpage.url}`;
    }
    return '';
  };

  const modeInfo = MODE_LABELS[mode];

  const showIframe = (mode === 'proxy' || mode === 'archive') && !finalError;

  return (
    <div className="h-full flex flex-col">
      {/* URL bar */}
      <div className="mb-2 p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span
              className="text-gray-700 truncate text-sm font-medium"
              data-testid="text-webview-url"
              title={webpage.url}
            >
              {webpage.url}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0 ${modeInfo.color}`}>
              {modeInfo.icon}
              {modeInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Preferred mode selector */}
            <Select
              value={preferredMode}
              onValueChange={(v) => {
                if (v === 'auto' || v === 'proxy' || v === 'reader' || v === 'archive') {
                  setPreferredMode(v);
                }
              }}
            >
              <SelectTrigger
                className="h-8 text-xs w-[110px] border-gray-200 bg-gray-50 hover:bg-gray-100"
                data-testid="select-preferred-mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">⚡ Auto</SelectItem>
                <SelectItem value="proxy">🌐 Proxy</SelectItem>
                <SelectItem value="reader">📖 Lecteur</SelectItem>
                <SelectItem value="archive">🗄️ Archive</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              onClick={resetAll}
              data-testid="button-retry"
              className="bg-green-50 text-green-600 border-green-200 hover:bg-green-100 h-8 px-2"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExternalOpen}
              data-testid="button-open-external"
              className="bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 h-8 px-2"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Ouvrir
            </Button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 relative min-h-[500px] overflow-hidden">
        {/* Loading overlay */}
        {loading && !finalError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <div className="text-gray-600 font-medium">{LOADING_MESSAGES[mode]}</div>
              <div className="flex items-center justify-center gap-3 mt-3">
                {(['proxy', 'reader', 'archive'] as ViewMode[]).map((m) => (
                  <div
                    key={m}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all ${
                      m === mode
                        ? MODE_LABELS[m].color + ' font-semibold'
                        : 'text-gray-300'
                    }`}
                  >
                    {MODE_LABELS[m].icon}
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Final error state — informational card with article preview */}
        {finalError && (() => {
          const hostname = (() => { try { return new URL(webpage.url).hostname; } catch { return webpage.url; } })();
          const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(webpage.url)}`;
          const title = readerFallback?.title;
          const excerpt = readerFallback?.excerpt;
          const siteName = readerFallback?.siteName || hostname;
          return (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg z-20 p-6">
              <div className="max-w-sm w-full">
                {/* Site header */}
                <div className="flex items-center gap-2 mb-4">
                  <img
                    src={faviconUrl}
                    alt=""
                    className="w-5 h-5 rounded-sm flex-shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="text-sm text-gray-500 font-medium truncate">{siteName}</span>
                </div>

                {/* Article preview card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
                  {title ? (
                    <>
                      <div className="flex items-start gap-2 mb-2">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-3">{title}</h3>
                      </div>
                      {excerpt && (
                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mt-2">{excerpt}</p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Globe className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm truncate">{webpage.url}</span>
                    </div>
                  )}
                </div>

                {/* Explanation */}
                <p className="text-xs text-gray-400 text-center mb-4">
                  Ce site ne peut pas s'afficher ici — ouvre-le dans un onglet pour le lire.
                </p>

                {/* CTA */}
                <Button
                  onClick={handleExternalOpen}
                  className="w-full bg-accent hover:bg-accent/90 text-white"
                  data-testid="button-open-external-fallback"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Lire l'article
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Reader view */}
        {mode === 'reader' && readerData && !loading && (
          <div className="absolute inset-0 rounded-lg overflow-hidden border border-gray-200 shadow-lg">
            <ReaderView {...readerData} sourceUrl={webpage.url} />
          </div>
        )}

        {/* Iframe for proxy and archive modes */}
        {showIframe && (
          <iframe
            key={`${mode}-${webpage.url}`}
            ref={iframeRef}
            src={getIframeSrc()}
            className="w-full h-full border border-gray-200 rounded-lg shadow-lg"
            title="Webview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            data-testid="iframe-webview"
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            style={{ border: 'none', background: 'white' }}
          />
        )}
      </div>
    </div>
  );
}
