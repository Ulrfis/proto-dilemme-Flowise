import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  /** Real progress label from Flowise SSE events. When provided, takes priority
   *  over the rotating placeholder phrases. */
  progressLabel?: string | null;
  /** Test id (typically the parent message id). */
  testId?: string;
  /** Visual theme for the bubble color. Default = teal (Peter's bubble). */
  variant?: "teal" | "neutral";
}

const PHRASES: readonly string[] = [
  "Peter réfléchit",
  "Peter pense",
  "Peter assemble ses idées",
  "Peter consulte ses notes",
  "Peter prend un instant",
  "Peter cherche le bon mot",
  "Peter trie ses indices",
  "Peter remonte la piste du plastique",
  "Peter plonge dans l'océan d'infos",
  "Peter dépoussière ses dossiers",
  "Peter pèse les microplastiques",
  "Peter recycle quelques pensées",
  "Peter ouvre ses archives écolo",
  "Peter scrute la chaîne du plastique",
  "Peter fouille dans son labo",
] as const;

const ROTATION_MS = 2400;

export function ThinkingIndicator({
  progressLabel = null,
  testId,
  variant = "teal",
}: ThinkingIndicatorProps) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * PHRASES.length));

  useEffect(() => {
    if (progressLabel) return; // Real label drives display — pause rotation
    const id = setInterval(() => {
      setIndex((prev) => {
        // Avoid showing the same phrase twice in a row
        if (PHRASES.length <= 1) return prev;
        let next = Math.floor(Math.random() * PHRASES.length);
        if (next === prev) next = (next + 1) % PHRASES.length;
        return next;
      });
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [progressLabel]);

  const text = progressLabel || PHRASES[index];
  const dotColor = variant === "teal" ? "bg-white/80" : "bg-gray-500";
  const textColor = variant === "teal" ? "text-white/80" : "text-gray-600";
  const borderColor = variant === "teal" ? "border-white/20" : "border-gray-300";

  return (
    <div
      className={cn("flex items-center gap-2 mt-2 pt-2 border-t", borderColor)}
      data-testid={testId}
      aria-live="polite"
      aria-busy="true"
    >
      {/* Three bouncing dots — Claude-style */}
      <div className="flex items-end gap-[3px] h-3.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className={cn("block w-1.5 h-1.5 rounded-full", dotColor)}
            animate={{ y: [0, -3, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.15,
            }}
          />
        ))}
      </div>

      {/* Phrase with smooth fade-swap */}
      <div className="relative flex-1 min-h-[1.1rem] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "inline-block text-xs italic font-light tracking-wide",
              textColor,
            )}
            data-testid={testId ? `${testId}-text` : undefined}
          >
            {text}
            <span className="inline-block w-2 text-left">…</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
