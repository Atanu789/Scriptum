import sanitizeHtml from 'sanitize-html';

/**
 * Strip ALL HTML tags and attributes — returns plain text only.
 * Use this on any user-supplied or scraped content before storing.
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return '';
  return sanitizeHtml(dirty, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'recursiveEscape',
  }).trim();
}

/**
 * Allow only basic formatting tags (for rich-text fields that need it).
 * Strips scripts, iframes, styles, event handlers, etc.
 */
export function sanitizeRichText(dirty: string): string {
  if (!dirty) return '';
  return sanitizeHtml(dirty, {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code'],
    allowedAttributes: {},
    disallowedTagsMode: 'recursiveEscape',
  }).trim();
}

/**
 * Sanitize an array of strings (e.g. paragraphs, tips).
 */
export function sanitizeArray(arr: string[]): string[] {
  return arr.map(sanitizeText).filter(Boolean);
}

/**
 * Sanitize rich content that may contain embedded media (img, video, audio).
 * Allows formatting tags + media elements whose src is restricted to /uploads/ paths.
 * Use this for editor content that users can write alongside uploaded media.
 */
export function sanitizeMediaContent(dirty: string): string {
  if (!dirty) return '';
  return sanitizeHtml(dirty, {
    allowedTags: [
      'p', 'br', 'div', 'span',
      'b', 'i', 'em', 'strong', 'u', 's', 'del', 'mark',
      'a',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4',
      'blockquote', 'pre', 'code',
      'img', 'video', 'audio', 'source',
      'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr',
    ],
    allowedAttributes: {
      a:      ['href', 'target', 'rel'],
      img:    ['src', 'alt', 'style'],
      video:  ['src', 'controls', 'style'],
      audio:  ['src', 'controls', 'style'],
      source: ['src', 'type'],
      '*':    ['class', 'style'],
    },
    allowedSchemes: ['http', 'https', 'data', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      video: ['http', 'https'],
      audio: ['http', 'https'],
      source: ['http', 'https'],
      a: ['http', 'https', 'mailto', 'tel'],
    },
    transformTags: {
      a: (_tag, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      img: (_tag, attribs) => ({
        tagName: 'img',
        attribs: /^(\/uploads\/|https?:\/\/|data:image\/)/i.test(attribs.src ?? '')
          ? attribs
          : { ...attribs, src: '' },
      }),
      video: (_tag, attribs) => ({
        tagName: 'video',
        attribs: /^(\/uploads\/|https?:\/\/)/i.test(attribs.src ?? '')
          ? attribs
          : { ...attribs, src: '' },
      }),
      audio: (_tag, attribs) => ({
        tagName: 'audio',
        attribs: /^(\/uploads\/|https?:\/\/)/i.test(attribs.src ?? '')
          ? attribs
          : { ...attribs, src: '' },
      }),
    },
    disallowedTagsMode: 'discard',
  }).trim();
}
