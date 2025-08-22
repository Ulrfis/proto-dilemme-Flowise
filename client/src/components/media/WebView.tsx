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

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span 
              className="text-gray-700 truncate font-medium"
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
            className="ml-3 bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 flex-shrink-0"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Ouvrir dans un nouvel onglet
          </Button>
        </div>
      </div>
      
      <div className="flex-1 relative min-h-[500px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg z-10">
            <div className="text-gray-500">Chargement de l'article...</div>
          </div>
        )}
        <iframe
          src={webpage.url}
          className="w-full h-full border border-gray-200 rounded-lg shadow-lg"
          title="Webview"
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => setLoading(false)}
          data-testid="iframe-webview"
        />
      </div>
    </div>
  );
}
