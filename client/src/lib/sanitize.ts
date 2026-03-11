import DOMPurify from 'dompurify';

/**
 * Strip all HTML — returns safe plain text.
 * Use before rendering any user-provided or server-fetched text.
 */
export function sanitize(dirty: string): string {
  if (typeof window === 'undefined') return dirty; // SSR fallback
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}

/**
 * Allow basic formatting tags for rich content display.
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') return dirty;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code'],
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize editor content that may contain embedded media.
 * Allows formatting + img/video/audio whose src is restricted to /uploads/ paths only.
 */
export function sanitizeContent(dirty: string): string {
  if (typeof window === 'undefined') return dirty;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span',
      'b', 'i', 'em', 'strong', 'u', 's', 'del', 'mark',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4',
      'blockquote', 'pre', 'code',
      'img', 'video', 'audio', 'source',
      'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr',
    ],
    ALLOWED_ATTR: ['src', 'alt', 'controls', 'style', 'type', 'class'],
    // Only permit server-generated /uploads/ paths — blocks external URLs / injections
    ALLOWED_URI_REGEXP: /^\/uploads\//i,
  });
}
