/**
 * Découpe un texte FR en phrases pour TTS streaming.
 *
 * Approche : on remplace temporairement les abréviations courantes pour
 * éviter de couper sur "M.", "Mme.", "etc." ou "3.14", puis on coupe
 * sur ponctuation forte suivie d'un espace + majuscule (ou fin).
 */

const ABBREVIATIONS = [
  "M.", "Mme.", "Mlle.", "Dr.", "Pr.", "St.", "Ste.",
  "etc.", "cf.", "ex.", "p.ex.", "av.", "J.-C.",
  "ie.", "i.e.", "e.g.",
];

const PLACEHOLDER = "\u0001"; // unique marker unlikely to appear in text

// Domains we strip out of TTS — same list as in tts-text.ts. We protect the
// inner dots so the sentence splitter doesn't fragment a sentence that
// contains a bare domain or a URL.
const DOMAIN_TLDS = "com|org|net|fr|ch|be|ca|tv|io|edu|gov|info|news|app|dev|tech|eu|de|uk|it|es|nl";

function protectAbbreviations(text: string): { protected: string; tokens: string[] } {
  const tokens: string[] = [];
  let result = text;

  // 1) Protect entire markdown links `[label](url)` — we wrap them as a single
  //    opaque token so neither the inner `.` of the URL nor the closing `)`
  //    can confuse the splitter. Restored 1:1 later for downstream TTS cleanup.
  result = result.replace(/\[[^\]]+\]\([^)]+\)/g, (m) => {
    tokens.push(m);
    return PLACEHOLDER + (tokens.length - 1) + PLACEHOLDER;
  });

  // 2) Protect bare URLs.
  result = result.replace(/https?:\/\/\S+/g, (m) => {
    tokens.push(m);
    return PLACEHOLDER + (tokens.length - 1) + PLACEHOLDER;
  });

  // 3) Protect bare domains like "lemonde.fr/article-1" or "frontiersin.org".
  result = result.replace(
    new RegExp(`\\b(?:[a-z0-9-]+\\.)+(?:${DOMAIN_TLDS})(?:\\/\\S*)?`, "gi"),
    (m) => {
      tokens.push(m);
      return PLACEHOLDER + (tokens.length - 1) + PLACEHOLDER;
    },
  );

  // 4) Protect known abbreviations.
  for (const abbr of ABBREVIATIONS) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), () => {
      tokens.push(abbr);
      return PLACEHOLDER + (tokens.length - 1) + PLACEHOLDER;
    });
  }

  // 5) Decimal numbers like 3.14 — protect the dot.
  result = result.replace(/(\d)\.(\d)/g, (_m, a, b) => {
    tokens.push(".");
    return a + PLACEHOLDER + (tokens.length - 1) + PLACEHOLDER + b;
  });

  return { protected: result, tokens };
}

function restoreAbbreviations(text: string, tokens: string[]): string {
  return text.replace(
    new RegExp(PLACEHOLDER + "(\\d+)" + PLACEHOLDER, "g"),
    (_m, idx) => tokens[Number(idx)] ?? "",
  );
}

/**
 * Découpe un texte complet en phrases. Conserve la ponctuation finale.
 * Retourne au moins un élément (le texte tel quel) si pas de ponctuation forte.
 */
export function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const { protected: protectedText, tokens } = protectAbbreviations(trimmed);

  // Split on . ? ! followed by whitespace + uppercase letter (or end of string)
  // Keep the punctuation with the previous sentence.
  const parts: string[] = [];
  const regex = /[^.!?]+[.!?]+(?=\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ«"'(]|\s*$)|[^.!?]+$/g;
  const matches = protectedText.match(regex);

  if (!matches || matches.length === 0) {
    return [restoreAbbreviations(trimmed, tokens)];
  }

  for (const m of matches) {
    const restored = restoreAbbreviations(m.trim(), tokens);
    if (restored) parts.push(restored);
  }

  return parts.length > 0 ? parts : [trimmed];
}

/**
 * Extrait les nouvelles phrases COMPLÈTES qui sont apparues dans `currentText`
 * mais n'étaient pas présentes dans `previousText`. La dernière phrase du
 * texte courant n'est pas retournée si elle ne se termine pas par une
 * ponctuation forte (elle peut encore grandir).
 *
 * Retourne :
 *  - sentences[]   : nouvelles phrases complètes prêtes pour TTS
 *  - consumedUpTo  : longueur (en chars) du texte couvert par les phrases
 *                    déjà traitées (à mémoriser pour le prochain appel)
 */
export function extractNewCompleteSentences(
  currentText: string,
  consumedUpTo: number,
): { sentences: string[]; consumedUpTo: number } {
  const remaining = currentText.slice(consumedUpTo);
  if (!remaining.trim()) {
    return { sentences: [], consumedUpTo };
  }

  // Find the position of the last strong punctuation followed by space (or end)
  // in the remaining text. Everything up to that point is "complete".
  const { protected: protectedText, tokens } = protectAbbreviations(remaining);

  // Find last terminator that's followed by whitespace OR is at the end.
  // We need the position in the ORIGINAL `remaining` string, but
  // protectAbbreviations preserves length only approximately. So we work
  // on the protected string and convert back via a marker.
  let lastTerminatorEnd = -1;
  const terminatorRegex = /[.!?]+(?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = terminatorRegex.exec(protectedText)) !== null) {
    lastTerminatorEnd = match.index + match[0].length;
  }

  if (lastTerminatorEnd === -1) {
    return { sentences: [], consumedUpTo };
  }

  const completePortionProtected = protectedText.slice(0, lastTerminatorEnd);
  const completePortion = restoreAbbreviations(completePortionProtected, tokens);

  const sentences = splitIntoSentences(completePortion).filter(s => s.trim().length > 0);
  if (sentences.length === 0) {
    return { sentences: [], consumedUpTo };
  }

  // Compute new consumedUpTo in the ORIGINAL currentText. We measure how many
  // chars of `remaining` correspond to `completePortion` (after restoration).
  // Because restoreAbbreviations is a 1-to-1 substitution that preserves
  // semantic length when the placeholders match the original abbreviations,
  // we use the length of completePortion as an approximation, then advance
  // past trailing whitespace.
  let newConsumed = consumedUpTo + completePortion.length;
  // Skip whitespace after the last terminator
  while (newConsumed < currentText.length && /\s/.test(currentText[newConsumed])) {
    newConsumed++;
  }

  return { sentences, consumedUpTo: newConsumed };
}
