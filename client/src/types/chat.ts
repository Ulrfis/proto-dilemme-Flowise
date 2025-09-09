export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'peter';
  timestamp: string;
  isStreaming?: boolean;
  metadata?: {
    hasVideo?: boolean;
    hasLinks?: boolean;
    videoUrl?: string;
    links?: string[];
  };
}

export interface FlowiseConfig {
  chatflowId: string;
  apiHost: string;
  sessionId?: string;
}

export interface MediaItem {
  id: string;
  type: 'video' | 'link';
  url: string;
  title?: string;
  description?: string;
}
