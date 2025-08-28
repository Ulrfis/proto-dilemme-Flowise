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
    <div className="w-full h-full bg-background flex flex-col">
      {/* Content - Tabs aligned with chat */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'video' | 'web')} className="h-full flex flex-col">
          <div className="px-3 pt-3 pb-0">
            <TabsList className="grid w-full grid-cols-2 bg-muted">
              <TabsTrigger 
                value="video" 
                data-testid="tab-video" 
                className="text-sm font-medium data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
              >
                📹 Vidéos
              </TabsTrigger>
              <TabsTrigger 
                value="web" 
                data-testid="tab-web" 
                className="text-sm font-medium data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
              >
                📰 Articles
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="video" className="flex-1 overflow-y-auto m-0 p-3">
            <VideoPlayer video={currentVideo} />
          </TabsContent>
          
          <TabsContent value="web" className="flex-1 overflow-y-auto m-0 p-3">
            <WebView webpage={currentWebpage} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
