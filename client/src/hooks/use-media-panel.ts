import { useState, useCallback } from "react";
import { MediaItem } from "../types/chat";
import { analytics } from "../lib/analytics";

export function useMediaPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'video' | 'web'>('video');
  const [currentVideo, setCurrentVideo] = useState<MediaItem | null>(null);
  const [currentWebpage, setCurrentWebpage] = useState<MediaItem | null>(null);

  const openMediaPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeMediaPanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const showVideo = useCallback((videoUrl: string, title?: string, description?: string) => {
    const videoItem: MediaItem = {
      id: `video_${Date.now()}`,
      type: 'video',
      url: videoUrl,
      title,
      description,
    };
    
    setCurrentVideo(videoItem);
    setActiveTab('video');
    setIsOpen(true);
  }, []);

  const showWebpage = useCallback((webUrl: string, title?: string) => {
    const webItem: MediaItem = {
      id: `web_${Date.now()}`,
      type: 'link',
      url: webUrl,
      title,
    };
    
    setCurrentWebpage(webItem);
    setActiveTab('web');
    setIsOpen(true);
  }, []);

  const switchTab = useCallback((tab: 'video' | 'web') => {
    setActiveTab(tab);
    setTimeout(() => {
      try { analytics.trackPanelChange(tab); } catch {}
    }, 0);
  }, []);

  return {
    isOpen,
    activeTab,
    currentVideo,
    currentWebpage,
    openMediaPanel,
    closeMediaPanel,
    showVideo,
    showWebpage,
    switchTab,
  };
}
