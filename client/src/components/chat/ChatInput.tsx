import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Mic, MicOff } from "lucide-react";

// Type declarations for speech recognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

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
  const messageBeforeRecognitionRef = useRef<string>("");
  const isListeningRef = useRef<boolean>(false);

  // Initialize speech recognition once
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    // Check if running in a secure context (HTTPS or localhost)
    const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    if (SpeechRecognition && isSecureContext) {
      try {
        const recognition = new SpeechRecognition();
        
        // More conservative settings for better reliability
        recognition.continuous = false;
        recognition.interimResults = false; // Disable interim results to reduce network calls
        recognition.lang = 'fr-FR';
        recognition.maxAlternatives = 1;
        
        // Test if we can create the recognition object
        recognition.onstart = () => {
          console.log('Speech recognition started successfully');
          setIsListening(true);
          isListeningRef.current = true;
        };
        
        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          
          if (finalTranscript) {
            // Update message with transcription
            const newMessage = messageBeforeRecognitionRef.current + finalTranscript;
            setMessage(newMessage);
          }
        };
        
        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          
          let errorMessage = '';
          switch (event.error) {
            case 'not-allowed':
              errorMessage = 'Accès au microphone refusé. Veuillez autoriser l\'accès au microphone dans les paramètres de votre navigateur.';
              break;
            case 'network':
              errorMessage = 'Erreur réseau. Veuillez vérifier votre connexion internet.';
              break;
            case 'no-speech':
              errorMessage = 'Aucune parole détectée. Essayez de parler plus près du microphone.';
              break;
            case 'audio-capture':
              errorMessage = 'Aucun microphone trouvé. Veuillez vérifier que votre microphone est connecté.';
              break;
            case 'service-not-allowed':
              errorMessage = 'Service de reconnaissance vocale non autorisé.';
              break;
            default:
              errorMessage = `Erreur de reconnaissance vocale: ${event.error}`;
          }
          
          // Show user-friendly error message
          setTimeout(() => {
            alert(errorMessage);
          }, 100);
          
          setIsListening(false);
          isListeningRef.current = false;
        };
        
        recognition.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
          isListeningRef.current = false;
        };
        
        // Test the recognition object
        recognitionRef.current = recognition;
        setSpeechSupported(true);
        
      } catch (error) {
        console.error('Failed to initialize speech recognition:', error);
        setSpeechSupported(false);
      }
    } else {
      console.warn('Speech recognition not supported or not in secure context');
      if (!isSecureContext) {
        console.warn('Speech recognition requires HTTPS or localhost');
      }
      setSpeechSupported(false);
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.warn('Error aborting speech recognition:', e);
        }
      }
    };
  }, []);

  const startSpeechRecognition = async () => {
    if (!recognitionRef.current || isListeningRef.current) return;
    
    try {
      // Check microphone permissions first
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permission.state === 'denied') {
        alert('Accès au microphone refusé. Veuillez autoriser l\'accès au microphone dans les paramètres de votre navigateur.');
        return;
      }
      
      // Store current message before starting recognition
      messageBeforeRecognitionRef.current = message;
      
      // Add small delay to ensure clean state
      setTimeout(() => {
        if (recognitionRef.current && !isListeningRef.current) {
          recognitionRef.current.start();
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      setIsListening(false);
      isListeningRef.current = false;
    }
  };

  const stopSpeechRecognition = () => {
    if (!recognitionRef.current) return;
    
    try {
      if (isListeningRef.current) {
        recognitionRef.current.stop();
      }
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
    }
    
    // Ensure state is updated regardless
    setIsListening(false);
    isListeningRef.current = false;
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
              onMouseDown={startSpeechRecognition}
              onMouseUp={stopSpeechRecognition}
              onMouseLeave={stopSpeechRecognition}
              onTouchStart={startSpeechRecognition}
              onTouchEnd={stopSpeechRecognition}
              disabled={disabled}
              data-testid="button-speech-recognition"
              className={`absolute right-10 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 select-none ${
                isListening 
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
              aria-label={isListening ? "Relâchez pour arrêter l'enregistrement" : "Maintenez enfoncé pour parler"}
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
              {isListening ? "🎤 Écoute en cours... (relâchez pour arrêter)" : "🎤 Maintenez enfoncé pour parler (HTTPS requis)"}
            </span>
          </>
        )}
        {" • "}
        <span className="text-amber-600 ml-1">Conversation éducative anonyme</span>
      </div>
    </div>
  );
}
