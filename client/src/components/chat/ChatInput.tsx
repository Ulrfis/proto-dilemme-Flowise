import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";

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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio recording functions
  const startRecording = useCallback(async () => {
    try {
      console.log('[Audio] Requesting microphone permission...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Use webm format for better browser compatibility
      const options = { mimeType: 'audio/webm;codecs=opus' };
      
      // Fallback to other formats if webm is not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('[Audio] webm not supported, trying mp4...');
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          options.mimeType = 'audio/wav';
        } else {
          // Use default format
          delete (options as any).mimeType;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[Audio] Recording stopped, processing...');
        await processRecording();
      };

      mediaRecorder.onerror = (event) => {
        console.error('[Audio] MediaRecorder error:', event);
        setIsRecording(false);
        alert('Erreur lors de l\'enregistrement audio');
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      console.log('[Audio] Recording started');

    } catch (error) {
      console.error('[Audio] Failed to start recording:', error);
      setIsRecording(false);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          alert('Accès au microphone refusé. Veuillez autoriser l\'accès dans les paramètres de votre navigateur.');
        } else if (error.name === 'NotFoundError') {
          alert('Aucun microphone trouvé. Veuillez vérifier que votre microphone est connecté.');
        } else {
          alert('Erreur lors de l\'accès au microphone: ' + error.message);
        }
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    console.log('[Audio] Stopping recording...');
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [isRecording]);

  const processRecording = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      console.warn('[Audio] No audio data to process');
      return;
    }

    try {
      setIsTranscribing(true);
      console.log('[Audio] Creating audio blob...');
      
      const audioBlob = new Blob(audioChunksRef.current, { 
        type: 'audio/webm' 
      });

      console.log(`[Audio] Audio blob created: ${audioBlob.size} bytes`);

      // Send to backend for transcription
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      console.log('[Audio] Sending to transcription service...');
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Erreur de transcription');
      }

      const result = await response.json();
      console.log('[Audio] Transcription received:', result.text);

      if (result.text?.trim()) {
        // Create the complete message with transcribed text
        const newMessage = message + (message ? ' ' : '') + result.text.trim();
        console.log('[Audio] Auto-sending transcribed message:', newMessage);
        
        // Automatically send the message to Flowise
        onSendMessage(newMessage.trim());
        setMessage(""); // Clear the input field
      } else {
        console.warn('[Audio] Empty transcription result');
        alert('Aucune parole détectée. Essayez de parler plus fort ou plus près du microphone.');
      }

    } catch (error) {
      console.error('[Audio] Transcription error:', error);
      
      if (error instanceof Error) {
        alert('Erreur de transcription: ' + error.message);
      } else {
        alert('Erreur lors de la transcription audio');
      }
    } finally {
      setIsTranscribing(false);
      audioChunksRef.current = [];
    }
  }, [message, onSendMessage]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isTranscribing) {
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

  // Check if recording is supported
  const isAudioSupported = typeof navigator !== 'undefined' && 
    navigator.mediaDevices && 
    typeof navigator.mediaDevices.getUserMedia === 'function' && 
    typeof window !== 'undefined' && 
    typeof window.MediaRecorder === 'function';

  return (
    <div className="border-t border-gray-200 p-2">
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <div className="flex-1 relative">
          <Input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled || isTranscribing}
            data-testid="input-chat-message"
            className={isAudioSupported ? "pr-20 h-9" : "pr-12 h-9"}
            aria-label="Message pour Peter"
          />
          {isAudioSupported && (
            <Button
              type="button"
              size="sm"
              onClick={toggleRecording}
              disabled={disabled || isTranscribing}
              data-testid="button-speech-recognition"
              className={`absolute right-10 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 select-none ${
                isRecording 
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                  : isTranscribing
                  ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
              aria-label={
                isRecording 
                  ? "Cliquez pour arrêter l'enregistrement" 
                  : isTranscribing
                  ? "Transcription en cours..."
                  : "Cliquez pour commencer l'enregistrement vocal"
              }
            >
              {isTranscribing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-3 h-3" />
              ) : (
                <Mic className="w-3 h-3" />
              )}
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={!message.trim() || disabled || isTranscribing}
            data-testid="button-send-message"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
            aria-label="Envoyer le message"
          >
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </form>
      <div className="mt-1 text-xs text-gray-500">
        Entrée pour envoyer
        {isAudioSupported && (
          <>
            {" • "}
            <span className={
              isRecording 
                ? "text-red-600 font-medium" 
                : isTranscribing 
                ? "text-yellow-600 font-medium"
                : ""
            }>
              {isRecording 
                ? "🎤 Enregistrement..." 
                : isTranscribing 
                ? "⚡ Transcription..."
                : "🎤 Vocal"
              }
            </span>
          </>
        )}
      </div>
    </div>
  );
}