export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'peter' | 'debug';
  timestamp: string;
  rawJson?: any; // For storing raw Flowise JSON response
  metadata?: {
    hasVideo?: boolean;
    hasLinks?: boolean;
    videoUrl?: string;
    links?: string[];
  };
  isStreaming?: boolean; // Indique si le message est en cours de streaming
  noActions?: boolean;  // Désactive les boutons d'action (👍, choix, liens)
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
