import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u',
  'a',
  'img',
  'video', 'audio', 'source',
  'span',
  'br', 'blockquote', 'pre', 'code',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr',
  'div',
];

export function sanitizeEditorHtml(input: string): string {
  return sanitizeHtml(input || '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'loading', 'draggable', 'style', 'width', 'height'],
      video: ['src', 'controls', 'style'],
      audio: ['src', 'controls', 'style'],
      source: ['src', 'type'],
      span: ['class', 'style'],
      div: ['class', 'data-align', 'data-width', 'data-padding', 'style'],
      '*': ['class'],
    },
    allowedClasses: {
      div: ['image-wrapper'],
    },
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      video: ['http', 'https'],
      audio: ['http', 'https'],
      source: ['http', 'https'],
      a: ['http', 'https', 'mailto', 'tel'],
    },
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      div: (tagName, attribs) => {
        if (attribs.class === 'image-wrapper') {
          return { tagName, attribs };
        }
        return { tagName: 'p', attribs: {} };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: /^(\/uploads\/|https?:\/\/|data:image\/)/i.test(attribs.src ?? '')
          ? attribs
          : { ...attribs, src: '' },
      }),
      video: (tagName, attribs) => ({
        tagName,
        attribs: /^(\/uploads\/|https?:\/\/)/i.test(attribs.src ?? '')
          ? attribs
          : { ...attribs, src: '' },
      }),
      audio: (tagName, attribs) => ({
        tagName,
        attribs: /^(\/uploads\/|https?:\/\/)/i.test(attribs.src ?? '')
          ? attribs
          : { ...attribs, src: '' },
      }),
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
  if (!/^\s*<(p|h1|h2|h3|h4|h5|h6|ul|ol|blockquote|pre|table|figure|div|video|audio|hr)\b/i.test(normalized)) {
    return `<p>${normalized}</p>`;
  }

  return normalized;
}

export function htmlToPlainText(input: string): string {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(input || '', 'text/html');
  return (doc.body.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}
