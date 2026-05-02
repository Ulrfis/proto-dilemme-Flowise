import { useCallback, useEffect, useRef, useState } from "react";

interface QueueItem {
  id: string;
  text: string;
  audioBlob?: Blob;
  audioUrl?: string;
  fetchPromise?: Promise<void>;
  status: "pending" | "fetching" | "ready" | "playing" | "done" | "error";
  error?: string;
}

interface UseTTSQueueResult {
  /** Push une phrase dans la queue. Si rien ne joue, démarre la lecture. */
  enqueue: (text: string) => void;
  /** Stop tout : interrompt la lecture en cours, vide la queue, abort les fetches. */
  stop: () => void;
  /** True si une phrase est en cours de lecture ou de chargement. */
  isActive: boolean;
  /** Erreur du dernier item joué (réinitialisée au prochain enqueue). */
  error: string | null;
}

/**
 * File d'attente TTS pour streaming par phrase :
 *  - chaque phrase enqueued est synthétisée (POST /api/tts) en parallèle
 *    de la lecture des phrases précédentes
 *  - la lecture est strictement séquentielle (pas de chevauchement)
 *  - prefetch automatique de la phrase N+1 dès que N commence à jouer
 *  - stop() interrompt tout proprement (audio + fetches en vol)
 */
export function useTTSQueue(): UseTTSQueueResult {
  const queueRef = useRef<QueueItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingIndexRef = useRef<number>(-1);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
  }, []);

  const fetchItem = useCallback(async (item: QueueItem, generation: number) => {
    if (generation !== generationRef.current) return;
    item.status = "fetching";
    const controller = new AbortController();
    abortControllersRef.current.set(item.id, controller);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
        signal: controller.signal,
      });
      if (generation !== generationRef.current) return;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (generation !== generationRef.current) return;
      item.audioBlob = blob;
      item.audioUrl = URL.createObjectURL(blob);
      item.status = "ready";
    } catch (err) {
      if (generation !== generationRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        item.status = "done";
        return;
      }
      item.status = "error";
      item.error = err instanceof Error ? err.message : String(err);
      console.warn(`[TTSQueue] Fetch failed for "${item.text.slice(0, 40)}…":`, item.error);
    } finally {
      abortControllersRef.current.delete(item.id);
    }
  }, []);

  const playNext = useCallback(async (generation: number) => {
    if (generation !== generationRef.current) return;
    const queue = queueRef.current;
    const nextIndex = playingIndexRef.current + 1;

    if (nextIndex >= queue.length) {
      // Queue exhausted
      playingIndexRef.current = -1;
      setIsActive(false);
      return;
    }

    const item = queue[nextIndex];
    playingIndexRef.current = nextIndex;

    // Wait for fetch to complete if not yet ready
    if (item.status === "fetching" && item.fetchPromise) {
      await item.fetchPromise;
    }

    if (generation !== generationRef.current) return;

    if (item.status === "error" || !item.audioUrl) {
      // Skip and move on
      if (item.error) setError(item.error);
      void playNext(generation);
      return;
    }

    // Start prefetch of N+1 BEFORE we begin playing N (overlaps fetch with playback)
    const upcoming = queue[nextIndex + 1];
    if (upcoming && upcoming.status === "pending") {
      upcoming.fetchPromise = fetchItem(upcoming, generation);
    }

    const audio = new Audio(item.audioUrl);
    audioRef.current = audio;
    item.status = "playing";

    audio.onended = () => {
      if (generation !== generationRef.current) return;
      item.status = "done";
      if (item.audioUrl) {
        URL.revokeObjectURL(item.audioUrl);
        item.audioUrl = undefined;
      }
      audioRef.current = null;
      void playNext(generation);
    };
    audio.onerror = () => {
      if (generation !== generationRef.current) return;
      item.status = "error";
      item.error = "audio playback error";
      setError("Erreur de lecture audio");
      audioRef.current = null;
      void playNext(generation);
    };

    try {
      await audio.play();
    } catch (err) {
      if (generation !== generationRef.current) return;
      console.warn("[TTSQueue] Audio play() failed:", err);
      item.status = "error";
      audioRef.current = null;
      void playNext(generation);
    }
  }, [fetchItem]);

  const enqueue = useCallback((text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    setError(null);
    const generation = generationRef.current;
    const id = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item: QueueItem = { id, text: trimmed, status: "pending" };
    queueRef.current.push(item);

    const isIdle = playingIndexRef.current === -1;
    if (isIdle) {
      // Start the engine: fetch this first item and play it as soon as ready
      setIsActive(true);
      item.fetchPromise = fetchItem(item, generation);
      void playNext(generation);
    } else {
      // Engine running: prefetch only if this item is the immediate next one,
      // otherwise wait for playNext to trigger the prefetch when its turn comes.
      const nextToPlay = playingIndexRef.current + 1;
      if (queueRef.current.indexOf(item) === nextToPlay) {
        item.fetchPromise = fetchItem(item, generation);
      }
    }
  }, [fetchItem, playNext]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    cleanupAudio();
    // Abort in-flight fetches
    Array.from(abortControllersRef.current.values()).forEach((ctrl) => {
      try { ctrl.abort(); } catch { /* ignore */ }
    });
    abortControllersRef.current.clear();
    // Free pending object URLs
    for (const item of queueRef.current) {
      if (item.audioUrl) {
        try { URL.revokeObjectURL(item.audioUrl); } catch { /* ignore */ }
        item.audioUrl = undefined;
      }
    }
    queueRef.current = [];
    playingIndexRef.current = -1;
    setIsActive(false);
  }, [cleanupAudio]);

  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { enqueue, stop, isActive, error };
}
