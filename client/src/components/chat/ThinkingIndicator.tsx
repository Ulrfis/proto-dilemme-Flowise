import { useEffect, useRef, useState } from "react";
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
];

/** Phase 2 — tongue-in-cheek "it's the plastic's fault" excuses. Used after
 *  ~12 s of waiting to inject some humour into the latency. */
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
];

const ROTATION_MS = 2400;
const BLAME_THRESHOLD_MS = 12_000;
const RECENT_MEMORY = 4; // never re-use the last N phrases

function pickPhrase(bank: readonly string[], avoid: readonly string[]): string {
  const candidates = bank.filter((p) => !avoid.includes(p));
  const pool = candidates.length > 0 ? candidates : bank;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function ThinkingIndicator({
  progressLabel = null,
  testId,
  variant = "teal",
}: ThinkingIndicatorProps) {
  const startedAtRef = useRef<number>(Date.now());
  const recentRef = useRef<string[]>([]);
  const [text, setText] = useState<string>(() => {
    const first = pickPhrase(PHRASES_GENERAL, []);
    recentRef.current = [first];
    return first;
  });

  useEffect(() => {
    if (progressLabel) return; // Real label drives display — pause rotation
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      // After threshold, mostly use blame-plastic phrases (with occasional
      // general one for variety). Before, only general.
      const useBlame =
        elapsed >= BLAME_THRESHOLD_MS && Math.random() < 0.75;
      const bank = useBlame ? PHRASES_BLAME_PLASTIC : PHRASES_GENERAL;
      const next = pickPhrase(bank, recentRef.current);

      // Keep a sliding memory of the last N phrases — never repeat too soon
      recentRef.current = [next, ...recentRef.current].slice(0, RECENT_MEMORY);
      setText(next);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [progressLabel]);

  const display = progressLabel || text;
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
            key={display}
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
            {display}
            <span className="inline-block w-2 text-left">…</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
