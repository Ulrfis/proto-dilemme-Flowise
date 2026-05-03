import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Mic, Loader2 } from "lucide-react";
import { analytics } from "../../lib/analytics";

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
  const recordingStartRef = useRef<number>(0);

  // Web Audio API refs for the live waveform visualization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

      try {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.7;
          source.connect(analyser);
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
        }
      } catch (vizErr) {
        console.warn('[Audio] Waveform analyser unavailable:', vizErr);
      }

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
        analytics.trackError({ component: "recording", errorType: "MediaRecorderError", message: "MediaRecorder error during recording" });
        alert('Erreur lors de l\'enregistrement audio');
      };

      mediaRecorder.start(1000);
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      analytics.trackRecordingStart({ provider: "browser" });
      console.log('[Audio] Recording started');

    } catch (error) {
      console.error('[Audio] Failed to start recording:', error);
      setIsRecording(false);
      
      if (error instanceof Error) {
        analytics.trackError({ component: "recording", errorType: error.name, message: error.message });
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
      const durationMs = Date.now() - recordingStartRef.current;
      analytics.trackRecordingStop({ durationMs });
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, [isRecording]);

  // Drive the waveform animation while recording.
  useEffect(() => {
    if (!isRecording) return;

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI scaling — keep the canvas crisp on retina screens.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth || 400;
    const cssH = canvas.offsetHeight || 36;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const BAR_COUNT = 40;
    const BAR_WIDTH = 2;
    const GAP = (cssW - BAR_COUNT * BAR_WIDTH) / (BAR_COUNT - 1);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, cssW, cssH);

      for (let i = 0; i < BAR_COUNT; i++) {
        const v = dataArray[Math.floor((i * bufferLength) / BAR_COUNT)] / 255;
        const barH = Math.max(2, v * cssH * 0.9);
        const x = i * (BAR_WIDTH + GAP);
        const y = (cssH - barH) / 2;
        const alpha = (0.4 + v * 0.6).toFixed(2);
        ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`;
        ctx.fillRect(x, y, BAR_WIDTH, barH);
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isRecording]);

  // Safety net: on unmount, release everything.
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const processRecording = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      console.warn('[Audio] No audio data to process');
      return;
    }

    const sttStart = Date.now();
    let sttTracked = false;

    try {
      setIsTranscribing(true);
      console.log('[Audio] Creating audio blob...');
      
      const audioBlob = new Blob(audioChunksRef.current, { 
        type: 'audio/webm' 
      });

      console.log(`[Audio] Audio blob created: ${audioBlob.size} bytes`);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      console.log('[Audio] Sending to transcription service...');
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errMsg = errorData.details || 'Erreur de transcription';
        sttTracked = true;
        analytics.trackSTTCompleted({
          latencyMs: Date.now() - sttStart,
          provider: "browser",
          wordCount: 0,
          success: false,
          errorType: `HTTP_${response.status}`,
        });
        analytics.trackError({ component: "stt", errorType: `HTTP_${response.status}`, message: errMsg });
        throw new Error(errMsg);
      }

      const result = await response.json();
      console.log('[Audio] Transcription received:', result.text);

      const wordCount = result.text?.trim() ? result.text.trim().split(/\s+/).length : 0;
      sttTracked = true;
      analytics.trackSTTCompleted({
        latencyMs: Date.now() - sttStart,
        provider: result.provider || "browser",
        wordCount,
        success: true,
      });

      if (result.text?.trim()) {
        const newMessage = message + (message ? ' ' : '') + result.text.trim();
        console.log('[Audio] Auto-sending transcribed message:', newMessage);
        onSendMessage(newMessage.trim());
        setMessage("");
      } else {
        console.warn('[Audio] Empty transcription result');
        alert('Aucune parole détectée. Essayez de parler plus fort ou plus près du microphone.');
      }

    } catch (error) {
      console.error('[Audio] Transcription error:', error);
      
      if (error instanceof Error) {
        if (!sttTracked) {
          analytics.trackSTTCompleted({
            latencyMs: Date.now() - sttStart,
            provider: "browser",
            wordCount: 0,
            success: false,
            errorType: error.name,
          });
          analytics.trackError({ component: "stt", errorType: error.name, message: error.message });
        }
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
          {isRecording ? (
            <canvas
              ref={canvasRef}
              className={`block w-full h-9 rounded-md bg-purple-50 border border-purple-200 ${isAudioSupported ? "pr-20" : "pr-12"}`}
              aria-label="Enregistrement audio en cours"
              data-testid="canvas-waveform"
            />
          ) : (
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
          )}
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
                  : "bg-accent hover:bg-accent/80 text-accent-foreground"
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
                <Send className="w-3 h-3" />
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
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 bg-accent hover:bg-accent/80 text-accent-foreground"
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
