import { ChatMessage as ChatMessageType } from "../../types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import peterAvatarImage from "@assets/Peter Avatar_1756370825342.jpg";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
  onVideoClick?: (url: string) => void;
  onLinkClick?: (url: string) => void;
  onThumbsUp?: () => void;
  onChoiceClick?: (choice: string) => void;
  userAvatarUrl?: string;
  userName?: string;
}

export function ChatMessage({ 
  message, 
  onVideoClick, 
  onLinkClick, 
  onThumbsUp, 
  onChoiceClick,
  userAvatarUrl,
  userName = 'Utilisateur'
}: ChatMessageProps) {
  const isPeter = message.sender === 'peter';

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
  
  // Typing indicator component for streaming messages
  const TypingIndicator = () => (
    <div className="flex items-center space-x-1 text-white/70">
      <div className="flex space-x-1">
        <div className="w-1 h-1 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-1 h-1 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-1 h-1 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>
      <span className="text-xs">Peter écrit...</span>
    </div>
  );

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

  return (
    <div 
      className={cn(
        "flex items-end space-x-3 mb-4",
        !isPeter && "flex-row-reverse space-x-reverse"
      )}
      data-testid={`message-${message.sender}-${message.id}`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0 mb-1">
        {isPeter ? (
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
        isPeter ? "mr-16" : "ml-16 text-right"
      )}>
        <div className={cn(
          "relative px-4 py-3 max-w-sm shadow-sm inline-block",
          isPeter 
            ? "bg-teal-500 text-white rounded-2xl rounded-bl-md chat-bubble-left" 
            : "bg-white text-gray-800 rounded-2xl rounded-br-md border border-gray-200 chat-bubble-right float-right"
        )}>
          {/* Show typing indicator for streaming messages with no content */}
          {isPeter && message.isStreaming && !message.content ? (
            <TypingIndicator />
          ) : messageType === 'with-choices' ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {formatChoiceContent(message.content)}
              {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-white/70 animate-pulse">|</span>}
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
                      // Add text before the link
                      if (titleIndex > lastIndex) {
                        parts.push(processedLine.substring(lastIndex, titleIndex));
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
                  
                  // Add remaining text after the last link
                  if (lastIndex < processedLine.length) {
                    parts.push(processedLine.substring(lastIndex));
                  }
                  
                  return <div key={lineIndex}>{parts}</div>;
                }
                
                return <div key={lineIndex}>{line}</div>;
              })}
              {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-white/70 animate-pulse">|</span>}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
              {isPeter && message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-white/70 animate-pulse">|</span>}
            </p>
          )}
        </div>
        
        {/* Action buttons based on message type - only show when not streaming */}
        {isPeter && !message.isStreaming && (
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
