import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "../lib/analytics";

interface UseTTSOptions {
  voiceId?: string | null;
}

interface UseTTSResult {
  play: (text: string) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentId: string | null;
}

let activeStopFn: (() => void) | null = null;

export function useTTS(options: UseTTSOptions = {}): UseTTSResult {
  const { voiceId } = options;
  const voiceIdRef = useRef<string | null | undefined>(voiceId);
  voiceIdRef.current = voiceId;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setIsPlaying(false);
    setIsLoading(false);
    setCurrentId(null);
    if (activeStopFn === stop) {
      activeStopFn = null;
    }
  }, [cleanup]);

  const play = useCallback(
    async (text: string) => {
      const trimmed = text?.trim();
      if (!trimmed) return;

      if (activeStopFn && activeStopFn !== stop) {
        activeStopFn();
      }
      cleanup();

      const requestId = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      activeStopFn = stop;
      setCurrentId(requestId);
      setError(null);
      setIsLoading(true);
      setIsPlaying(false);

      const controller = new AbortController();
      abortRef.current = controller;

      const sessionId = analytics.getSessionId();

      try {
        const requestVoiceId = voiceIdRef.current;
        const body: { text: string; voiceId?: string; sessionId: string } = {
          text: trimmed,
          sessionId,
        };
        if (requestVoiceId) {
          body.voiceId = requestVoiceId;
        }

        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = "Erreur lors de la synthèse vocale";
          try {
            const data = await response.json();
            detail = data?.details || data?.error || detail;
          } catch {
            // ignore
          }
          const provider = response.headers.get("X-TTS-Provider") || "server";
          analytics.trackError({ component: "tts", errorType: `HTTP_${response.status}`, message: detail, provider });
          throw new Error(detail);
        }

        const blob = await response.blob();
        if (controller.signal.aborted) return;

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setIsLoading(false);
          setIsPlaying(true);
        };
        audio.onended = () => {
          setIsPlaying(false);
          setIsLoading(false);
          setCurrentId(null);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          if (activeStopFn === stop) {
            activeStopFn = null;
          }
        };
        audio.onerror = () => {
          setError("Erreur de lecture audio");
          setIsPlaying(false);
          setIsLoading(false);
          setCurrentId(null);
          analytics.trackError({ component: "tts", errorType: "AudioPlaybackError", message: "HTML audio element error" });
        };

        await audio.play();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Erreur lors de la lecture vocale";
        console.error("[useTTS] play error:", err);
        analytics.trackError({ component: "tts", errorType: err instanceof Error ? err.name : "UnknownError", message });
        setError(message);
        setIsLoading(false);
        setIsPlaying(false);
        setCurrentId(null);
        cleanup();
      }
    },
    [cleanup, stop],
  );

  useEffect(() => {
    return () => {
      cleanup();
      if (activeStopFn === stop) {
        activeStopFn = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { play, stop, isPlaying, isLoading, error, currentId };
}
