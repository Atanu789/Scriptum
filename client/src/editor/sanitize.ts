import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u',
  'a',
  'img',
  'br', 'blockquote', 'pre', 'code',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div',
];

export function sanitizeEditorHtml(input: string): string {
  return sanitizeHtml(input || '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'loading', 'draggable'],
      div: ['class', 'data-align', 'data-width', 'data-padding'],
      '*': ['class'],
    },
    allowedClasses: {
      div: ['image-wrapper'],
    },
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      a: ['http', 'https', 'mailto', 'tel'],
    },
    disallowedTagsMode: 'discard',
    transformTags: {
      div: (tagName, attribs) => {
        if (attribs.class === 'image-wrapper') {
          return { tagName, attribs };
        }
        return { tagName: 'p', attribs: {} };
      },
      '*': (tagName, attribs) => {
        const cleaned = { ...attribs };
        delete cleaned.style;
        return { tagName, attribs: cleaned };
      },
    },
  });
}

export function normalizeEditorHtml(input: string): string {
  const sanitized = sanitizeEditorHtml(input);

  const normalized = sanitized
    .replace(/<div><br\s*\/?><\/div>/gi, '<p><br></p>')
    .replace(/<br\s*\/?>(\s*<br\s*\/?>)+/gi, '</p><p>')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<p>(\s|&nbsp;)*<\/p>/gi, '')
    .replace(/<p>([^<]*)<p>/gi, '<p>$1</p><p>')
    .trim();

  if (!normalized) return '<p><br></p>';
  if (!/^\s*<(p|h1|h2|h3|ul|ol|blockquote|pre|table|figure|div)\b/i.test(normalized)) {
    return `<p>${normalized}</p>`;
  }

  return normalized;
}

export function htmlToPlainText(input: string): string {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(input || '', 'text/html');
  return (doc.body.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}
