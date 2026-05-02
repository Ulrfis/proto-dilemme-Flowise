import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { MediaItem } from "../../types/chat";

interface WebViewProps {
  webpage: MediaItem | null;
}

export function WebView({ webpage }: WebViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [proxyError, setProxyError] = useState<{ status: number; message: string } | null>(null);
  const [mode, setMode] = useState<'proxy' | 'fallback'>('proxy');
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleExternalOpen = () => {
    if (webpage) {
      window.open(webpage.url, '_blank', 'noopener,noreferrer');
    }
  };

  const resetAndRetry = () => {
    setLoading(true);
    setError(false);
    setRetryCount(prev => prev + 1);
    
    // Only try fallback mode on retry
    if (retryCount === 0) {
      setMode('fallback');
    } else {
      setMode('proxy');
      setRetryCount(0);
    }
  };

  // Reset on URL change + proactively probe the proxy. The iframe's `onError`
  // never fires when the proxy returns a JSON error body with HTTP 4xx/5xx
  // (the iframe sees a "successful" response and renders the JSON as text).
  // To give a clean UX we GET /api/proxy ourselves: response is cached for
  // 5 min server-side so the subsequent iframe load reuses it for free.
  useEffect(() => {
    if (!webpage) return;
    setLoading(true);
    setError(false);
    setProxyError(null);
    setMode('proxy');
    setRetryCount(0);

    const ctrl = new AbortController();
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(webpage.url)}`;
    fetch(proxyUrl, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.details) msg = body.details;
            else if (body?.error) msg = body.error;
          } catch { /* ignore */ }
          console.warn(`[WebView] Proxy probe failed: ${msg}`);
          setProxyError({ status: res.status, message: msg });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('[WebView] Proxy probe network error:', err);
        setProxyError({ status: 0, message: String(err.message || err) });
        setLoading(false);
      });

    timeoutRef.current = setTimeout(() => {
      if (loading) {
        console.log('[WebView] Loading timeout, trying fallback mode');
        setMode('fallback');
        setRetryCount(1);
      }
    }, 15000);

    return () => {
      ctrl.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [webpage?.url]);

  const handleIframeLoad = () => {
    setLoading(false);
    setError(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handleIframeError = () => {
    console.log('[WebView] Proxy failed, trying fallback mode');
    setLoading(false);
    setError(true);
    setMode('fallback');
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
    switch (mode) {
      case 'proxy':
        return `/api/proxy?url=${encodeURIComponent(webpage.url)}`;
      case 'fallback':
        // Use Google Cache as fallback
        return `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(webpage.url)}`;
      default:
        return webpage.url;
    }
  };

  const getSandboxAttributes = () => {
    // Use safer sandbox attributes for proxy mode
    return "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-2 p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between">
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
            <span className="text-xs text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
              {mode}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              size="sm"
              variant="outline"
              onClick={resetAndRetry}
              data-testid="button-retry"
              className="bg-green-50 text-green-600 border-green-200 hover:bg-green-100 flex-shrink-0 h-8 px-2"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExternalOpen}
              data-testid="button-open-external"
              className="bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 flex-shrink-0 h-8 px-2"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Ouvrir
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 relative min-h-[500px]">
        {proxyError && (
          <div className="absolute inset-0 flex items-center justify-center bg-amber-50 border border-amber-200 rounded-lg z-20 p-6">
            <div className="text-center max-w-md">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <div className="text-amber-800 font-medium mb-2">
                Cet article ne peut pas s'afficher ici
              </div>
              <div className="text-amber-700 text-sm mb-4">
                Le site <strong>{(() => { try { return new URL(webpage.url).hostname; } catch { return webpage.url; } })()}</strong> refuse l'affichage intégré
                {proxyError.status ? ` (erreur ${proxyError.status})` : ''}. Vous pouvez l'ouvrir dans un nouvel onglet pour le consulter.
              </div>
              <Button
                onClick={handleExternalOpen}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-open-external-fallback"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Ouvrir dans un nouvel onglet
              </Button>
            </div>
          </div>
        )}

        {loading && !error && !proxyError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <div className="text-gray-500">Chargement de l'article... ({mode})</div>
              {retryCount > 0 && (
                <div className="text-xs text-gray-400 mt-1">Tentative {retryCount + 1}/3</div>
              )}
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded-lg z-10">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <div className="text-red-600 font-medium mb-2">Contenu bloqué</div>
              <div className="text-red-500 text-sm mb-4">Le site refuse l'affichage intégré</div>
              <Button onClick={resetAndRetry} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Essayer un autre mode
              </Button>
            </div>
          </div>
        )}
        
        {!proxyError && (
          <iframe
            ref={iframeRef}
            src={getIframeSrc()}
            className="w-full h-full border border-gray-200 rounded-lg shadow-lg"
            title="Webview"
            sandbox={getSandboxAttributes()}
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
