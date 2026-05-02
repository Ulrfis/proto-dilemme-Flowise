// Strip markdown formatting so the TTS doesn't read characters like "*" or "[".
//
// Special handling for links: Peter must NOT read URLs or domain names out loud.
// Instead we substitute a short French phrase that tells the listener a link is
// available in the side panel — without saying the URL itself. Videos (we tag
// them with a 📹 prefix in extractMediaFromText) get a "vidéo à regarder"
// phrase, regular links get "article à consulter".
//
// Special handling for citations: any sentence starting with "Source:" /
// "Sources:" is dropped entirely so Peter goes straight to the next sentence.
// Order matters here — we must neutralise URLs and bold markers BEFORE the
// "Source:" pass, otherwise the dots inside URLs (e.g. "frontiersin.org")
// would terminate the sentence early and leave half-eaten gibberish.
export function plainifyForTTS(content: string): string {
  return content
    // 1. Image markdown — drop entirely.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // 2. Headings: strip the leading ##/###/etc.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // 3. Markdown links → spoken substitute (never the URL nor the title).
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string) => {
      if (label.trim().startsWith("📹")) return " — vidéo à regarder dans le panneau ";
      return " — article à consulter dans le panneau ";
    })
    // 4. Bare URLs that slipped through.
    .replace(/https?:\/\/\S+/g, " — lien à consulter dans le panneau ")
    // 5. Bare domain mentions like "vimeo.com", "rts.ch", "frontiersin.org".
    .replace(
      /\b(?:[a-z0-9-]+\.)+(?:com|org|net|fr|ch|be|ca|tv|io|edu|gov|info|news|app|dev|tech|eu|de|uk|it|es|nl)(?:\/\S*)?/gi,
      " — lien à consulter dans le panneau ",
    )
    // 6. Bold / italic markers — must run BEFORE the "Source:" pass so that
    // "**Source** :" is matched too.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    // 7. Citations "Source : …" / "Sources : …" — drop the entire segment up
    // to the next strong punctuation OR newline. Anchored to start-of-line or
    // start of sentence so we never eat ordinary phrases like
    // "la source de plastique est dangereuse" mid-sentence.
    .replace(
      /(^|[.!?]\s+|\n)\s*sources?(?:\s*[\(（][^)）]*[\)）])?\s*(?:[:：]|—|-)\s*[^.!?\n]*[.!?\n]?/gim,
      "$1",
    )
    // 8. Line-starting bullets only.
    .replace(/^\s*[-*]\s+/gm, "")
    // 9. Inline code.
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
