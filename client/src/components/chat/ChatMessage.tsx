import { useState } from "react";
import { ChatMessage as ChatMessageType } from "../../types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import peterAvatarImage from "@assets/Peter_Avatar_white_1777751289628.jpeg";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Code, MessageSquare, Volume2, VolumeX } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
  onVideoClick?: (url: string) => void;
  onLinkClick?: (url: string) => void;
  onThumbsUp?: () => void;
  onChoiceClick?: (choice: string) => void;
  userAvatarUrl?: string;
  userName?: string;
  showThinking?: boolean;
  /** Dynamic step label (e.g. "Peter cherche dans ses sources…"). Falls back
   *  to a generic message when null. */
  progressLabel?: string | null;
  ttsEnabled?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function ChatMessage({ 
  message, 
  onVideoClick, 
  onLinkClick, 
  onThumbsUp, 
  onChoiceClick,
  userAvatarUrl,
  userName = 'Utilisateur',
  showThinking = false,
  progressLabel = null,
  ttsEnabled = true,
  isMuted = false,
  onToggleMute,
}: ChatMessageProps) {
  const isPeter = message.sender === 'peter';
  const isDebug = message.sender === 'debug';
  const isStreaming = message.isStreaming || false;
  const [showRawJson, setShowRawJson] = useState(false);

  const handleMediaClick = (url: string, type: 'video' | 'link') => {
    // Comprehensive URL cleaning
    let cleanUrl = url.replace(/[.,;:!?)\]}\s]+$/, '').trim();
    cleanUrl = cleanUrl.replace(/\)+\.?\s*$/, ''); // Remove trailing parentheses and dots
    cleanUrl = cleanUrl.replace(/\.$/, ''); // Remove final period
    
    console.log(`handleMediaClick: "${url}" -> "${cleanUrl}"`);
    
    if (type === 'video' && onVideoClick) {
      onVideoClick(cleanUrl);
    } else if (type === 'link' && onLinkClick) {
      onLinkClick(cleanUrl);
    }
  };

  // Detect message type for Peter's messages
  const getMessageType = (content: string) => {
    if (isDebug) return 'debug';
    if (!isPeter) return 'user';
    
    // Check if message has bullet points that should become buttons
    const hasBulletPoints = content.includes('*   ') || content.includes('* ');
    if (hasBulletPoints) return 'with-choices';
    
    // Check if message has links
    const hasLinks = content.includes('[') && content.includes('](');
    if (hasLinks) return 'with-links';
    
    // Check if it's an information message (no question marks, statements)
    const hasQuestion = content.includes('?');
    if (!hasQuestion) return 'information';
    
    return 'open-question';
  };

  const messageType = getMessageType(message.content);

  // Format message content with proper link formatting
  const formatContent = (content: string) => {
    if (messageType !== 'with-links') return content;
    
    // Replace markdown links with just the title text
    return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  };

  // Extract links from content
  const extractLinks = (content: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: Array<{title: string, url: string}> = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      let url = match[2];
      
      // Clean up URL by removing trailing punctuation (more comprehensive)
      url = url.replace(/[.,;:!?)\]}\s]+$/, '').trim();
      
      // Additional cleaning for common issues
      url = url.replace(/\)+\.?\s*$/, ''); // Remove trailing parentheses and dots
      url = url.replace(/\.$/, ''); // Remove final period if still present
      
      console.log(`Extracted link: "${match[1]}" -> "${url}" (original: "${match[2]}")`);
      
      links.push({
        title: match[1],
        url: url
      });
    }
    
    return links;
  };

  const extractedLinks = messageType === 'with-links' ? extractLinks(message.content) : [];

  // Extract choices from bullet points
  const extractChoices = (content: string) => {
    const lines = content.split('\n');
    const choices: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('*   ') || trimmed.startsWith('* ')) {
        // Remove bullet point and clean up the choice text
        const choice = trimmed.replace(/^\*\s+/, '').trim();
        if (choice) {
          choices.push(choice);
        }
      }
    }
    
    return choices;
  };

  const extractedChoices = messageType === 'with-choices' ? extractChoices(message.content) : [];

  // Format message content for choice messages (remove bullet points)
  const formatChoiceContent = (content: string) => {
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      return !(trimmed.startsWith('*   ') || trimmed.startsWith('* '));
    });
    return filteredLines.join('\n').trim();
  };

  // Render markdown formatting (bold, italic)
  const renderMarkdown = (text: string) => {
    const parts: (string | JSX.Element)[] = [];
    let currentIndex = 0;
    
    // Regex to match **bold** and *italic* (but not bullet points at line start)
    const markdownRegex = /(\*\*([^*]+)\*\*)|((?<!^|\n)\*([^*\n]+)\*)/g;
    let match;
    
    while ((match = markdownRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > currentIndex) {
        parts.push(text.substring(currentIndex, match.index));
      }
      
      // Check if it's bold or italic
      if (match[1]) {
        // Bold: **text**
        parts.push(<strong key={match.index}>{match[2]}</strong>);
      } else if (match[3]) {
        // Italic: *text*
        parts.push(<em key={match.index}>{match[4]}</em>);
      }
      
      currentIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(text.substring(currentIndex));
    }
    
    return parts.length > 0 ? parts : text;
  };

  return (
    <div 
      className={cn(
        "flex items-end space-x-3 mb-4",
        !isPeter && !isDebug && "flex-row-reverse space-x-reverse",
        isDebug && "opacity-75"
      )}
      data-testid={`message-${message.sender}-${message.id}`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0 mb-1">
        {isDebug ? (
          <AvatarFallback className="bg-gray-400 text-white text-xs font-semibold">
            {'{}'}
          </AvatarFallback>
        ) : isPeter ? (
          <>
            <AvatarImage src={peterAvatarImage} alt="Peter" />
            <AvatarFallback className="bg-primary text-white text-sm font-semibold">
              P
            </AvatarFallback>
          </>
        ) : (
          <>
            <AvatarImage src={userAvatarUrl} alt={userName} />
            <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-semibold">
              {userName.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </>
        )}
      </Avatar>
      
      <div className={cn(
        "flex-1",
        isDebug ? "mr-16" : isPeter ? "mr-16" : "ml-16 text-right"
      )}>
        <div className={cn(
          "max-w-sm shadow-sm inline-block overflow-hidden",
          isDebug
            ? "bg-gray-100 text-gray-600 rounded-lg border border-gray-300"
            : isPeter 
              ? "bg-teal-500 text-white rounded-2xl rounded-bl-md chat-bubble-left" 
              : "bg-white text-gray-800 rounded-2xl rounded-br-md border border-gray-200 chat-bubble-right float-right"
        )}>
          {/* Action bar above the text — only for Peter's completed messages */}
          {isPeter && !isStreaming && (ttsEnabled || message.rawJson) && (
            <div className="flex items-center justify-end gap-0.5 px-2 py-1 bg-teal-700/60">
              {ttsEnabled && onToggleMute && (
                <button
                  onClick={onToggleMute}
                  className="p-1.5 rounded transition-all hover:bg-white/20 text-teal-100 hover:text-white"
                  data-testid={`button-mute-toggle-${message.id}`}
                  title={
                    isMuted
                      ? "Réactiver la voix de Peter"
                      : "Couper la voix de Peter"
                  }
                  aria-label={
                    isMuted
                      ? "Réactiver la voix de Peter"
                      : "Couper la voix de Peter"
                  }
                  aria-pressed={isMuted}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              {message.rawJson && (
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className={cn(
                    "p-1.5 rounded transition-all text-teal-100 hover:text-white",
                    showRawJson
                      ? "bg-white/20 hover:bg-white/30"
                      : "hover:bg-white/20"
                  )}
                  title={showRawJson ? "Afficher le message formaté" : "Afficher le JSON brut de l'API"}
                >
                  {showRawJson ? (
                    <MessageSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Code className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
          <div className="px-4 py-3">
          
          {showRawJson && message.rawJson ? (
            <div className="text-xs font-mono leading-tight">
              <div className="mb-2 font-bold text-xs opacity-90">JSON BRUT DE FLOWISE:</div>
              <pre className="whitespace-pre-wrap overflow-x-auto text-xs bg-black/20 p-2 rounded max-h-96 overflow-y-auto">
                {JSON.stringify(message.rawJson, null, 2)}
              </pre>
            </div>
          ) : messageType === 'debug' ? (
            <div className="text-xs font-mono leading-tight">
              <div className="mb-1 text-gray-500 font-bold text-xs">DEBUG - JSON BRUT FLOWISE:</div>
              <pre className="whitespace-pre-wrap overflow-x-auto text-xs">
                {message.content}
              </pre>
            </div>
          ) : messageType === 'with-choices' ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {renderMarkdown(formatChoiceContent(message.content))}
            </div>
          ) : messageType === 'with-links' ? (
            <div className="text-sm leading-relaxed">
              {formatContent(message.content).split('\n').map((line, lineIndex) => {
                // Find any link titles in this line
                let processedLine = line;
                const lineLinks = extractedLinks.filter(link => line.includes(link.title));
                
                if (lineLinks.length > 0) {
                  // Process each link in the line
                  const parts = [];
                  let lastIndex = 0;
                  
                  lineLinks.forEach((link, linkIndex) => {
                    const titleIndex = processedLine.indexOf(link.title, lastIndex);
                    if (titleIndex !== -1) {
                      // Add text before the link (with markdown rendering)
                      if (titleIndex > lastIndex) {
                        const textBefore = processedLine.substring(lastIndex, titleIndex);
                        parts.push(...(Array.isArray(renderMarkdown(textBefore)) ? renderMarkdown(textBefore) : [renderMarkdown(textBefore)]));
                      }
                      
                      // Determine if this is a video or regular link
                      const isVideo = link.url.includes('youtube.com') || 
                                     link.url.includes('youtu.be') || 
                                     link.url.includes('gumlet.io') ||
                                     link.url.includes('vimeo.com');
                      
                      // Add the clickable link title
                      parts.push(
                        <span 
                          key={`link-${lineIndex}-${linkIndex}`}
                          className="font-bold cursor-pointer text-blue-600 hover:text-blue-800 underline"
                          onClick={() => handleMediaClick(link.url, isVideo ? 'video' : 'link')}
                        >
                          {link.title}
                        </span>
                      );
                      
                      lastIndex = titleIndex + link.title.length;
                    }
                  });
                  
                  // Add remaining text after the last link (with markdown rendering)
                  if (lastIndex < processedLine.length) {
                    const textAfter = processedLine.substring(lastIndex);
                    parts.push(...(Array.isArray(renderMarkdown(textAfter)) ? renderMarkdown(textAfter) : [renderMarkdown(textAfter)]));
                  }
                  
                  return <div key={lineIndex}>{parts}</div>;
                }
                
                return <div key={lineIndex}>{renderMarkdown(line)}</div>;
              })}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {renderMarkdown(message.content)}
              {isStreaming && isPeter && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-white animate-pulse" />
              )}
            </p>
          )}
          
          {showThinking && (
            <div
              className="flex items-center space-x-2 mt-2 pt-2 border-t border-white/20"
              data-testid={`thinking-${message.id}`}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs opacity-80" data-testid={`thinking-label-${message.id}`}>
                {progressLabel || "Peter réfléchit..."}
              </span>
            </div>
          )}
          </div>{/* end px-4 py-3 */}
        </div>{/* end bubble */}
        
        {/* Action buttons based on message type - only show when NOT streaming and actions allowed */}
        {isPeter && !isStreaming && !message.noActions && (
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Choice buttons for menu messages */}
            {messageType === 'with-choices' && onChoiceClick && extractedChoices.map((choice, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => onChoiceClick(choice)}
                data-testid={`button-choice-${index}`}
                className="bg-accent border-accent text-accent-foreground hover:bg-accent/80 text-left"
              >
                {choice}
              </Button>
            ))}
            
            {/* Thumbs up button for information messages */}
            {messageType === 'information' && onThumbsUp && (
              <Button
                variant="outline"
                size="sm"
                onClick={onThumbsUp}
                data-testid="button-thumbs-up"
                className="bg-accent border-accent text-accent-foreground hover:bg-accent/80"
              >
                👍 OK
              </Button>
            )}
            
            {/* Video buttons from metadata */}
            {message.metadata?.videoUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMediaClick(message.metadata!.videoUrl!, 'video')}
                data-testid="button-open-video"
                className="bg-accent border-accent text-accent-foreground hover:bg-accent/80"
              >
                📹 Voir la vidéo
              </Button>
            )}
            
            {/* Link buttons from metadata */}
            {message.metadata?.links?.map((link, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleMediaClick(link, 'link')}
                data-testid={`button-open-link-${index}`}
                className="bg-accent border-accent text-accent-foreground hover:bg-accent/80"
              >
                🔗 Voir le lien
              </Button>
            ))}
          </div>
        )}
        
        <div className={cn(
          "mt-1 text-xs text-gray-500",
          !isPeter && "text-right"
        )}>
          {new Date(message.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
}
