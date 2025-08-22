import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Mic, MicOff } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ 
  onSendMessage, 
  disabled = false,
  placeholder = "Tapez votre message..."
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      
      // Initialize speech recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'fr-FR';
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Update message with final transcript, keep interim for real-time feedback
        if (finalTranscript) {
          setMessage(prev => prev + finalTranscript);
        } else if (interimTranscript) {
          // Show interim results in a subtle way by updating the input
          const currentMessage = message;
          setMessage(currentMessage + interimTranscript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <div className="flex-1 relative">
          <Input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            data-testid="input-chat-message"
            className={speechSupported ? "pr-20" : "pr-12"}
            aria-label="Message pour Peter"
          />
          {speechSupported && (
            <Button
              type="button"
              size="sm"
              onClick={toggleSpeechRecognition}
              disabled={disabled}
              data-testid="button-speech-recognition"
              className={`absolute right-10 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 ${
                isListening 
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                  : "bg-gray-100 hover:bg-gray-200 text-gray-600"
              }`}
              aria-label={isListening ? "Arrêter l'enregistrement vocal" : "Commencer l'enregistrement vocal"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={!message.trim() || disabled}
            data-testid="button-send-message"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
            aria-label="Envoyer le message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
      <div className="mt-2 text-xs text-gray-500">
        Appuyez sur Entrée pour envoyer
        {speechSupported && (
          <>
            {" • "}
            <span className={isListening ? "text-red-600 font-medium" : ""}>
              {isListening ? "🎤 Écoute en cours..." : "🎤 Cliquez pour parler"}
            </span>
          </>
        )}
        {" • "}
        <span className="text-amber-600 ml-1">Conversation éducative anonyme</span>
      </div>
    </div>
  );
}
