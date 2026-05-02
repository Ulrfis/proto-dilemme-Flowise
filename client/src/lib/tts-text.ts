// Strip markdown formatting so the TTS doesn't read characters like "*" or "[".
//
// Special handling for links: Peter must NOT read URLs or domain names out loud.
// Instead we substitute a short French phrase that tells the listener a link is
// available in the side panel — without saying the URL itself. Videos (we tag
// them with a 📹 prefix in extractMediaFromText) get a "vidéo à regarder"
// phrase, regular links get "article à consulter".
export function plainifyForTTS(content: string): string {
  return content
    // Image markdown — drop entirely.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Markdown links: replace with a spoken-friendly substitute, never the URL
    // and never the (often technical) link title like "journals.plos.org".
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string) => {
      // The 📹 prefix is added by extractMediaFromText for video URLs.
      if (label.trim().startsWith("📹")) return " — vidéo à regarder dans le panneau ";
      return " — article à consulter dans le panneau ";
    })
    // Bold / italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    // Line-starting bullets only
    .replace(/^\s*[-*]\s+/gm, "")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Bare URLs that may have slipped through (Peter forgot the markdown):
    // collapse them to the same spoken substitute.
    .replace(/https?:\/\/\S+/g, " — lien à consulter dans le panneau ")
    .replace(/\s+/g, " ")
    .trim();
}
