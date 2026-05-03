// Strip markdown formatting so the TTS doesn't read characters like "*" or "[".
//
// Special handling for links: Peter must NEVER mention the links out loud —
// they're shown clickable in the chat and side panel. We strip them silently
// (no substitute phrase, no URL, no domain). Introducing punctuation like
// " : ", " — ", " – " just before/after the removed link is also cleaned up,
// and bullet lines whose only content was a link are dropped entirely.
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
    // 3. Markdown links → silently removed (no URL, no label, no substitute).
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    // 4. Bare URLs that slipped through — silent removal.
    .replace(/https?:\/\/\S+/g, " ")
    // 5. Bare domain mentions like "vimeo.com", "rts.ch", "frontiersin.org" —
    //    silent removal so Peter never spells out a domain.
    .replace(
      /\b(?:[a-z0-9-]+\.)+(?:com|org|net|fr|ch|be|ca|tv|io|edu|gov|info|news|app|dev|tech|eu|de|uk|it|es|nl)(?:\/\S*)?/gi,
      " ",
    )
    // 6. Bold / italic markers.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    // 7. (Removed) — we used to drop entire "Sources : …" sentences here, but
    //    Peter must read all the surrounding text. Links inside such sentences
    //    are already stripped above (rules 3-5).
    // 8. Drop entire lines that became empty after link removal (e.g. bullet
    //    list whose only content was a link).
    .replace(/^[ \t]*[-*•·][ \t]*$/gm, "")
    // 9. Line-starting bullets only.
    .replace(/^\s*[-*]\s+/gm, "")
    // 10. Inline code.
    .replace(/`([^`]+)`/g, "$1")
    // 11. Clean dangling introducing punctuation left after a removed link
    //     (e.g. "Lis cet article :    ." → "Lis cet article.").
    .replace(/\s*[:：]\s*(?=[.!?\n]|$)/g, "")
    .replace(/\s+[—–-]\s+(?=[.!?\n]|$)/g, "")
    // 12. Remove a stray period that was preceded only by whitespace
    //     (link removal can leave " ." at line start).
    .replace(/(^|\n)\s*\.\s*/g, "$1")
    // 13. Collapse any whitespace runs created by the deletions.
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+([.!?,;])/g, "$1")
    .trim();
}
