export function cleanExtractedText(text: string): string {
  if (!text) return '';

  const cleaned = text
    // Remove null characters and other non-printable control chars except newline/tab.
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

    // Normalize line endings and spaces while preserving paragraph breaks.
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // Remove zero wrappers around words in a token-safe way.
  // Handles cases like: 0Word, Word0, 0Word0, (0Word0), "0Word0".
  const deZeroed = cleaned.replace(/\S+/g, (token) => {
    if (!/[A-Za-z]/.test(token)) return token;

    const m = token.match(/^([^A-Za-z0-9']*)([A-Za-z0-9'_-]+)([^A-Za-z0-9']*)$/);
    if (!m) return token;

    const prefix = m[1] ?? '';
    let core = m[2] ?? '';
    const suffix = m[3] ?? '';

    core = core
      .replace(/^0+(?=[A-Za-z])/g, '')
      .replace(/(?<=[A-Za-z])0+$/g, '');

    return `${prefix}${core}${suffix}`;
  });

  return deZeroed
    // Remove standalone zero tokens before alphabetic words: "0 Cellular" -> "Cellular"
    .replace(/(^|\s)0+(?=\s+[A-Za-z])/g, '$1')
    // Remove glued zero prefixes/suffixes around words in case tokenization missed them.
    .replace(/(^|[\s([{"'“‘])0+(?=[A-Za-z])/g, '$1')
    .replace(/(?<=[A-Za-z])0+(?=($|[\s)\]}"'”’.,;:!?]))/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
