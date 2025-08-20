import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { MediaItem } from "../../types/chat";

interface WebViewProps {
  webpage: MediaItem | null;
}

export function WebView({ webpage }: WebViewProps) {
  const [loading, setLoading] = useState(true);

  const handleExternalOpen = () => {
    if (webpage) {
      window.open(webpage.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!webpage) {
    return (
      <div className="p-4">
        <div className="text-center text-gray-500 py-8">
          <div className="w-12 h-12 mx-auto text-gray-300 mb-3">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <p className="text-sm">
            Les liens externes partagés<br />s'ouvriront ici
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span 
              className="text-sm text-gray-600 truncate"
              data-testid="text-webview-url"
              title={webpage.url}
            >
              {webpage.url}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExternalOpen}
            data-testid="button-open-external"
            className="ml-2 text-xs bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-200 flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Externe
          </Button>
        </div>
      </div>
      
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Chargement...</div>
          </div>
        )}
        <iframe
          src={webpage.url}
          className="w-full h-80 border border-gray-200 rounded-lg"
          title="Webview"
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => setLoading(false)}
          data-testid="iframe-webview"
        />
      </div>
    </div>
  );
}
