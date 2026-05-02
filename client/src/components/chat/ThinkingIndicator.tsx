import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  /** @deprecated Kept for backwards compatibility but no longer affects rendering.
   *  Phrases ALWAYS rotate from the local bank (Claude-style UX). The server
   *  progress label was making the indicator static, which is the opposite of
   *  what we want. */
  progressLabel?: string | null;
  /** Test id. */
  testId?: string;
  /**
   * "standalone" (default) — rendered directly in the chat flow, outside any
   *   bubble: teal dots, dark-gray text, no border.
   * "inline" — legacy in-bubble style: white dots, white/80 text, border-t.
   */
  variant?: "standalone" | "inline";
}

/** Phase 1 — general / curious / playful. Used while wait < 12 s. */
const PHRASES_GENERAL: readonly string[] = [
  "Peter réfléchit",
  "Peter pense",
  "Peter assemble ses idées",
  "Peter consulte ses notes",
  "Peter prend un instant",
  "Peter cherche le bon mot",
  "Peter trie ses indices",
  "Peter remonte la piste",
  "Peter dépoussière ses dossiers",
  "Peter recycle quelques pensées",
  "Peter ouvre ses archives écolo",
  "Peter feuillette son carnet d'enquête",
  "Peter tire un fil de la pelote",
  "Peter sirote un café écoresponsable",
  "Peter tapote son menton réfléchi",
  "Peter consulte les algues savantes",
  "Peter convoque ses neurones",
  "Peter fouille dans son labo",
  "Peter scrute la chaîne du plastique",
  "Peter pèse les microplastiques",
  "Peter mesure deux fois pour répondre une fois",
  "Peter parle aux mouettes savantes",
  "Peter chuchote à un dauphin",
  "Peter rumine façon plancton",
  "Peter écoute battre le cœur de l'océan",
  "Peter dessine un schéma mental",
  "Peter relit la fiche n°42",
  "Peter ajuste sa loupe d'enquêteur",
  "Peter tient sa langue, le temps de bien dire",
  "Peter compose une réponse aux petits oignons",
] as const;

/** Phase 2 — tongue-in-cheek "it's the plastic's fault" excuses. */
const PHRASES_BLAME_PLASTIC: readonly string[] = [
  "Peter ralentit, un microplastique dans l'engrenage",
  "Peter patauge dans une marée de bouteilles",
  "Peter est englué dans le 7e continent",
  "Peter négocie avec un sac plastique récalcitrant",
  "Peter essuie un brouillard de microbilles",
  "Peter retire un bouchon coincé dans le disque dur",
  "Peter doit d'abord trier huit milliards de pailles",
  "Peter combat un emballage trop bien scellé",
  "Peter démêle une boule de filets fantômes",
  "Peter dépile une pile de barquettes à usage unique",
  "Peter cherche son neurone, perdu sous un blister",
  "Peter rebooterait bien, mais le bouton est en PVC",
  "Peter explique à un canard que ce n'est pas du pain",
  "Peter compte les particules dans sa salive (longue liste)",
  "Peter doit d'abord déballer la réponse de son film plastique",
  "Peter glisse sur une nappe d'huile de polymère",
  "Peter attend que la mer rende un mot précis",
  "Peter contourne un tas de Tupperware orphelins",
  "Peter négocie avec un yaourt qui refuse d'être recyclé",
  "Peter cherche son stylo, mâché par un goéland",
] as const;

const ROTATION_MS = 2000;
const BLAME_THRESHOLD_MS = 12_000;
const RECENT_MEMORY = 4;

function pickPhrase(bank: readonly string[], avoid: readonly string[]): string {
  const candidates = bank.filter((p) => !avoid.includes(p));
  const pool = candidates.length > 0 ? candidates : bank;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function ThinkingIndicator({
  // progressLabel intentionally ignored — see prop docs.
  testId,
  variant = "standalone",
}: ThinkingIndicatorProps) {
  const startedAtRef = useRef<number>(Date.now());
  const recentRef = useRef<string[]>([]);
  const [text, setText] = useState<string>(() => {
    const first = pickPhrase(PHRASES_GENERAL, []);
    recentRef.current = [first];
    return first;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const useBlame = elapsed >= BLAME_THRESHOLD_MS && Math.random() < 0.75;
      const bank = useBlame ? PHRASES_BLAME_PLASTIC : PHRASES_GENERAL;
      const next = pickPhrase(bank, recentRef.current);
      recentRef.current = [next, ...recentRef.current].slice(0, RECENT_MEMORY);
      setText(next);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, []);

  const display = text;

  const isStandalone = variant === "standalone";

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        isStandalone ? "py-1" : "mt-2 pt-2 border-t border-white/20",
      )}
      data-testid={testId}
      aria-live="polite"
      aria-busy="true"
    >
      {/* Three bouncing dots */}
      <div className="flex items-end gap-[3px] h-3.5 flex-shrink-0" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className={cn(
              "block w-1.5 h-1.5 rounded-full",
              isStandalone ? "bg-teal-500" : "bg-white/80",
            )}
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
      <div className="relative min-h-[1.15rem] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={display}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "inline-block italic font-light tracking-wide",
              isStandalone
                ? "text-sm text-gray-500"
                : "text-xs text-white/80",
            )}
            data-testid={testId ? `${testId}-text` : undefined}
          >
            {display}
            <span className="inline-block w-2 text-left">…</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
