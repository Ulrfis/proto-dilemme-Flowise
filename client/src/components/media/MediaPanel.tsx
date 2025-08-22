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
    <div className="w-full h-full bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Ressources multimédias</h3>
          <div className="text-sm text-gray-500">
            Vidéos et articles partagés par Peter
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'video' | 'web')} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-6 mt-4 mb-0">
            <TabsTrigger value="video" data-testid="tab-video" className="text-base font-medium">
              📹 Vidéos
            </TabsTrigger>
            <TabsTrigger value="web" data-testid="tab-web" className="text-base font-medium">
              📰 Articles
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="video" className="flex-1 overflow-y-auto m-0 p-6">
            <VideoPlayer video={currentVideo} />
          </TabsContent>
          
          <TabsContent value="web" className="flex-1 overflow-y-auto m-0 p-6">
            <WebView webpage={currentWebpage} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
