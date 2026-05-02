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
  onVideoEnded?: () => void;
  onVideoPaused?: () => void;
  onVideoPlay?: () => void;
}

export function MediaPanel({
  isOpen,
  activeTab,
  currentVideo,
  currentWebpage,
  onClose,
  onTabChange,
  onVideoEnded,
  onVideoPaused,
  onVideoPlay,
}: MediaPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-full h-full bg-background flex flex-col">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as 'video' | 'web')} className="h-full flex flex-col">
        {/* Sticky Tabs Header */}
        <div className="sticky top-0 z-40 bg-background px-3 pt-3 pb-0 border-b border-border">
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
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="video" className="h-full overflow-y-auto m-0 p-3">
            <VideoPlayer
              video={currentVideo}
              onVideoEnded={onVideoEnded}
              onVideoPaused={onVideoPaused}
              onVideoPlay={onVideoPlay}
            />
          </TabsContent>
          
          <TabsContent value="web" className="h-full overflow-y-auto m-0 p-3">
            <WebView webpage={currentWebpage} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
