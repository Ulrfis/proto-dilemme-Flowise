import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";
import { WebView } from "./WebView";
import { MediaItem } from "../../types/chat";
import { cn } from "@/lib/utils";

interface MediaPanelProps {
  isOpen: boolean;
  activeTab: 'video' | 'web';
  currentVideo: MediaItem | null;
  currentWebpage: MediaItem | null;
  onClose: () => void;
  onTabChange: (tab: 'video' | 'web') => void;
}

export function MediaPanel({
  isOpen,
  activeTab,
  currentVideo,
  currentWebpage,
  onClose,
  onTabChange,
}: MediaPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Ressources multimédias</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="button-close-media-panel"
            className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'video' | 'web')} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 m-4 mb-0">
            <TabsTrigger value="video" data-testid="tab-video">
              Vidéos
            </TabsTrigger>
            <TabsTrigger value="web" data-testid="tab-web">
              Articles
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="video" className="flex-1 overflow-y-auto m-0">
            <VideoPlayer video={currentVideo} />
          </TabsContent>
          
          <TabsContent value="web" className="flex-1 overflow-y-auto m-0">
            <WebView webpage={currentWebpage} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
