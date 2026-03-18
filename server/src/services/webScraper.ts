import axios from 'axios';
import * as cheerio from 'cheerio';
import { ExtractedContent, DocumentSection } from '../types';
import { htmlToStructuredModel } from './documentStructure';
import { cleanExtractedText } from '../utils/textClean';

/* ─────────────────────────────────────────────────────────────────────────────
   Noise selectors
───────────────────────────────────────────────────────────────────────────── */

const STRIP_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
  'header', 'footer', 'nav', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '.nav', '.navbar', '.navigation', '.header', '.footer', '.sidebar',
  '.advertisement', '.ads', '.ad', '.promo', '.banner',
  '.cookie', '.popup', '.modal', '.overlay', '.newsletter',
  '.social-share', '.share-buttons', '.comments', '#comments',
  '.related-posts', '.recommended', '.suggested',
  '.breadcrumb', '.breadcrumbs',
  '.menu', '#menu', '#main-menu',
  'form', 'button[type="submit"]',
].join(', ');

const CONTENT_SELECTORS = [
  'article[class*="post"]',
  'article[class*="entry"]',
  'article[class*="article"]',
  'article[class*="content"]',
  'article',
  '[role="main"]',
  'main',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.article-body',
  '.story-body',
  '.blog-content',
  '.body-content',
  '.content-body',
  '.post-body',
  '.td-post-content',
  '.article__body',
  '.article__content',
  '.s-content',
  '.entry-body',
  '.post__content',
  '#article-body',
  '#post-content',
  '#story',
  '#content',
  '.content',
];

/* ─────────────────────────────────────────────────────────────────────────────
   Utils
───────────────────────────────────────────────────────────────────────────── */

function cleanWhitespace(s: string): string {
  return cleanExtractedText(s);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#\d+;/g, '');
}

function absolutizeUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function extractEditorHtml(
  $: ReturnType<typeof cheerio.load>,
  root: cheerio.Cheerio,
  pageUrl: string,
): string {
  const cloned = cheerio.load(root.html() || '');

  cloned('*').each((_index, el) => {
    const node = el as cheerio.Element & { tagName?: string; attribs?: Record<string, string> };
    const tag = node.tagName?.toLowerCase();
    if (!tag) return;

    if (!['h1', 'h2', 'h3', 'h4', 'p', 'img', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'strong', 'b', 'em', 'i'].includes(tag)) {
      cloned(el).replaceWith(cloned(el).text());
      return;
    }

    if (tag === 'img') {
      const src = absolutizeUrl(cloned(el).attr('src'), pageUrl);
      if (!src) {
        cloned(el).remove();
        return;
      }
      cloned(el).attr('src', src);
      cloned(el).attr('style', 'max-width:100%;border-radius:8px;display:block;margin:16px auto;');
    }

    if (tag === 'a') {
      const href = absolutizeUrl(cloned(el).attr('href'), pageUrl);
      if (!href) {
        cloned(el).replaceWith(cloned(el).text());
        return;
      }
      cloned(el).attr('href', href);
      cloned(el).attr('target', '_blank');
      cloned(el).attr('rel', 'noopener noreferrer');
    }

    if (tag !== 'a' && tag !== 'img') {
      const allowedAttrs = ['href', 'src', 'alt', 'target', 'rel', 'style'];
      Object.keys(node.attribs || {}).forEach((attr) => {
        if (!allowedAttrs.includes(attr)) cloned(el).removeAttr(attr);
      });
    }
  });

  return (cloned.root().html() || '').trim();
}

/* ─────────────────────────────────────────────────────────────────────────────
   Structured extraction
───────────────────────────────────────────────────────────────────────────── */

function extractStructured(
  $: ReturnType<typeof cheerio.load>,
  root: cheerio.Cheerio
): { text: string; sections: DocumentSection[] } {

  const sections: DocumentSection[] = [];

  let currentSection: DocumentSection = {
    title: 'Introduction',
    paragraphs: [],
    narrationSegments: [],
  };

  const textParts: string[] = [];

  root.find('h1, h2, h3, h4, p, li, blockquote, pre')
    .each((_i: number, el: cheerio.Element) => {

      const tag = (el as any).tagName?.toLowerCase() ?? '';
      const raw = $(el).text() ?? '';
      const text = decodeEntities(cleanWhitespace(raw));

      if (!text || text.length < 3) return;

      if (/^h[1-4]$/.test(tag)) {

        if (currentSection.paragraphs.length > 0) {
          sections.push(currentSection);
          textParts.push(`\n\n${currentSection.title}\n`);
        }

        currentSection = {
          title: text,
          paragraphs: [],
          narrationSegments: [],
        };

      } else {
        currentSection.paragraphs.push(text);
        textParts.push(text);
      }
    });

  if (currentSection.paragraphs.length > 0) {
    sections.push(currentSection);
  }

  if (sections.length === 0 || textParts.join(' ').length < 100) {
    const fallback = decodeEntities(cleanWhitespace(root.text() ?? ''));
    const paras = fallback
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 20);

    sections.push({
      title: 'Content',
      paragraphs: paras,
      narrationSegments: [],
    });

    return { text: fallback, sections };
  }

  return {
    text: cleanWhitespace(textParts.join('\n')),
    sections,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Public entrypoint
───────────────────────────────────────────────────────────────────────────── */

export async function extractFromWebsite(url: string): Promise<ExtractedContent> {

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL. Please enter a full URL including https://');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported.');
  }

  let html: string;

  try {
    const resp = await axios.get<string>(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 20000,
      maxRedirects: 5,
      maxContentLength: 10 * 1024 * 1024, // 10MB limit
      responseType: 'text',
    });

    html = resp.data;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WebScraper] Failed to fetch:', url, msg);
    
    if (msg.includes('maxContentLength')) {
      throw new Error('The webpage is too large to process (max 10MB).');
    }
    if (msg.includes('timeout')) {
      throw new Error('The webpage took too long to respond. Please try again.');
    }
    throw new Error(`Failed to fetch the webpage: ${msg}`);
  }

  const $ = cheerio.load(html);

  const pageTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    parsed.hostname;

  $(STRIP_SELECTORS).remove();

  let contentRoot: cheerio.Cheerio | null = null;

  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length > 0 && el.text().trim().length > 200) {
      contentRoot = el;
      break;
    }
  }

  if (!contentRoot) {
    contentRoot = $('body');
  }

  const { text, sections } = extractStructured($, contentRoot);
  const editorHtml = extractEditorHtml($, contentRoot, url);

  return {
    rawText: text,
    cleanedText: text,
    editorHtml,
    editorModel: htmlToStructuredModel(editorHtml),
    structuredSections: sections,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    sourceType: 'website',
    pageTitle: cleanWhitespace(pageTitle),
    pageUrl: url,
  };
}