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
  const [mode, setMode] = useState<'iframe' | 'proxy' | 'fallback'>('iframe');
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
    
    // Try different modes on retry
    if (retryCount === 0) {
      setMode('proxy');
    } else if (retryCount === 1) {
      setMode('fallback');
    } else {
      setMode('iframe');
      setRetryCount(0);
    }
  };

  // Reset on URL change
  useEffect(() => {
    if (webpage) {
      setLoading(true);
      setError(false);
      setMode('iframe');
      setRetryCount(0);
      
      // Set timeout to detect loading failures
      timeoutRef.current = setTimeout(() => {
        if (loading) {
          console.log('[WebView] Loading timeout, switching to proxy mode');
          setMode('proxy');
          setRetryCount(1);
        }
      }, 10000);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
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
    console.log('[WebView] Iframe failed, trying proxy mode');
    setLoading(false);
    setError(true);
    setMode('proxy');
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
    switch (mode) {
      case 'iframe':
        return "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-top-navigation allow-top-navigation-by-user-activation";
      default:
        return "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";
    }
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
        {loading && !error && (
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
          style={{ 
            border: 'none',
            background: 'white'
          }}
        />
      </div>
    </div>
  );
}
