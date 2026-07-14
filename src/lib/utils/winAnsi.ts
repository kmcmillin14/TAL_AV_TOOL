// pdf-lib's StandardFonts (Helvetica/Courier) use WinAnsi (Windows-1252)
// encoding, which throws on any codepoint outside its repertoire — e.g. the
// route arrow "→" (U+2192) used in flow rows. `winAnsiSafe` maps the app's
// known non-Win1252 glyphs to ASCII and replaces anything else the encoder
// can't handle with "?", so drawing text can never crash on user data.

// App glyphs that WinAnsi can't encode → ASCII equivalents.
const REPLACEMENTS: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '⌈': '', '⌉': '', '⌊': '', '⌋': '',
  '≈': '~', '≥': '>=', '≤': '<=', '≠': '!=',
  '✓': 'v', '✗': 'x', '✕': 'x', '△': '', '●': '*',
  // NB: '·'(0xB7), '×'(0xD7), '÷'(0xF7), '—', '–', '…' are all Win1252 —
  // never map them or the PDF text changes (e.g. "48×40" → "48x40").
}

// Win1252 high-punctuation pdf-lib's WinAnsi encoder DOES support (mapped into
// the 0x80–0x9F range) — keep these as-is (em/en dash, curly quotes, …, €, ™…).
const WIN1252_PUNCT = '‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ€'

/** Make a string safe for pdf-lib StandardFonts (WinAnsi). Non-encodable
 *  characters become an ASCII equivalent or "?". Idempotent. */
export function winAnsiSafe(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch in REPLACEMENTS) { out += REPLACEMENTS[ch]; continue }
    const cp = ch.codePointAt(0) ?? 0
    if (cp <= 0x7f) out += ch                       // ASCII
    else if (cp >= 0xa0 && cp <= 0xff) out += ch     // Latin-1 supplement (Win1252 lower half)
    else if (WIN1252_PUNCT.includes(ch)) out += ch   // supported high punctuation
    else out += '?'                                  // anything else → safe placeholder
  }
  return out
}
