import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";
import { VideoPlayer } from "./VideoPlayer";
import { WebView } from "./WebView";
import { InfoPanel } from "./InfoPanel";
import { MediaItem } from "../../types/chat";
import { cn } from "@/lib/utils";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface MediaPanelProps {
  isOpen: boolean;
  activeTab: 'video' | 'web';
  currentVideo: MediaItem | null;
  currentWebpage: MediaItem | null;
  infoData?: InfoPanelData | null;
  onClose: () => void;
  onTabChange: (tab: 'video' | 'web') => void;
}

export function MediaPanel({
  isOpen,
  activeTab,
  currentVideo,
  currentWebpage,
  infoData,
  onClose,
  onTabChange,
}: MediaPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {/* Info Panel - Compact */}
      <div className="pt-3">
        <InfoPanel data={infoData} />
      </div>

      {/* Content - Direct tabs without header */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'video' | 'web')} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-2 mb-0">
            <TabsTrigger value="video" data-testid="tab-video" className="text-base font-medium">
              📹 Vidéos
            </TabsTrigger>
            <TabsTrigger value="web" data-testid="tab-web" className="text-base font-medium">
              📰 Articles
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="video" className="flex-1 overflow-y-auto m-0 p-4">
            <VideoPlayer video={currentVideo} />
          </TabsContent>
          
          <TabsContent value="web" className="flex-1 overflow-y-auto m-0 p-4">
            <WebView webpage={currentWebpage} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
