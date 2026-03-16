import {
  DocumentSection,
  StructuredBlockNode,
  StructuredContent,
  StructuredDocumentModel,
  StructuredInlineNode,
} from '../types';
import * as cheerio from 'cheerio';

// ─── Sentence splitting ───────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  // Handle abbreviations and decimals heuristically
  return text
    .replace(/(\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|etc|e\.g|i\.e|vs|Fig|No))\.\s/g, '$1<dot> ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.replace(/<dot>/g, '.').trim())
    .filter((s) => s.length > 0);
}

// ─── Section flattening ───────────────────────────────────────────────────────

function buildNarrationSegments(
  paragraphs: string[]
): StructuredContent['sections'][0]['narrationSegments'] {
  const sentences: string[] = [];
  for (const para of paragraphs) {
    sentences.push(...splitIntoSentences(para));
  }
  return sentences.map((s) => ({ text: s, audioUrl: undefined, duration: undefined }));
}

// ─── Main structuring function ────────────────────────────────────────────────

export function structureDocument(
  cleanedText: string,
  existingSections?: DocumentSection[]
): StructuredContent {
  // If sections are already provided (from extraction), enrich them
  if (existingSections && existingSections.length > 0) {
    return {
      sections: existingSections.map((section) => ({
        ...section,
        narrationSegments:
          section.narrationSegments.length > 0
            ? section.narrationSegments
            : buildNarrationSegments(section.paragraphs),
      })),
    };
  }

  // Re-structure from cleaned text
  const blocks = cleanedText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection = {
    title: 'Introduction',
    paragraphs: [],
    narrationSegments: [],
  };

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    const isHeadingLike =
      firstLine.length < 80 &&
      !/[.!?]$/.test(firstLine) &&
      lines.length === 1;

    if (isHeadingLike && currentSection.paragraphs.length > 0) {
      currentSection.narrationSegments = buildNarrationSegments(currentSection.paragraphs);
      sections.push(currentSection);
      currentSection = {
        title: firstLine,
        paragraphs: [],
        narrationSegments: [],
      };
    } else {
      currentSection.paragraphs.push(block);
    }
  }

  if (currentSection.paragraphs.length > 0) {
    currentSection.narrationSegments = buildNarrationSegments(currentSection.paragraphs);
    sections.push(currentSection);
  }

  return { sections };
}

export function extractPlainTextFromHtml(html: string): string {
  if (!html || !html.trim()) return '';

  const $ = cheerio.load(html);
  const blocks: string[] = [];

  $('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, figcaption').each((_, el) => {
    const text = $(el).text().replace(/[ \t]+/g, ' ').trim();
    if (text) blocks.push(text);
  });

  if (blocks.length > 0) {
    return blocks.join('\n\n').trim();
  }

  return $.root().text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function plainTextToEditorHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return '';

    const firstLine = lines[0];
    const isHeading =
      firstLine.length < 90 &&
      !/[.!?]$/.test(firstLine) &&
      (lines.length === 1 || /^[A-Z][A-Za-z\s,:-]+$/.test(firstLine));

    if (isHeading) {
      const rest = lines.slice(1).join('<br>');
      return `<h2>${firstLine}</h2>${rest ? `<p>${rest}</p>` : ''}`;
    }

    if (lines.every((line) => /^[-*•]\s/.test(line))) {
      return `<ul>${lines.map((line) => `<li>${line.replace(/^[-*•]\s*/, '')}</li>`).join('')}</ul>`;
    }

    if (lines.every((line) => /^\d+[.)]\s/.test(line))) {
      return `<ol>${lines.map((line) => `<li>${line.replace(/^\d+[.)]\s*/, '')}</li>`).join('')}</ol>`;
    }

    return `<p>${lines.join('<br>')}</p>`;
  }).join('');
}

function inlineNodesFromElement(el: cheerio.Cheerio, $: ReturnType<typeof cheerio.load>): StructuredInlineNode[] {
  const nodes: StructuredInlineNode[] = [];

  el.contents().each((_, child) => {
    if (child.type === 'text') {
      const value = (child.data || '').replace(/\s+/g, ' ');
      if (value.trim()) {
        nodes.push({ type: 'text', value });
      }
      return;
    }

    if (child.type !== 'tag') return;
    const childEl = $(child);
    const tag = child.tagName.toLowerCase();

    if (tag === 'a') {
      const text = childEl.text().trim();
      const url = (childEl.attr('href') || '').trim();
      if (text && url) {
        nodes.push({ type: 'link', text, url });
      }
      return;
    }

    const text = childEl.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    nodes.push({
      type: 'text',
      value: text,
      bold: tag === 'strong' || tag === 'b',
      italic: tag === 'em' || tag === 'i',
      underline: tag === 'u',
    });
  });

  return nodes;
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function htmlToStructuredModel(html: string): StructuredDocumentModel {
  if (!html || !html.trim()) return { content: [] };

  const $ = cheerio.load(html);
  const content: StructuredBlockNode[] = [];

  $('h1, h2, h3, h4, h5, h6, p, img, ul, ol, blockquote, table, section[data-slide]').each((_, node) => {
    const typedNode = node as cheerio.Element & { tagName?: string };
    const tag = typedNode.tagName?.toLowerCase();
    if (!tag) return;
    const el = $(node);

    if (tag === 'section' && el.attr('data-slide')) {
      const title = normalizeText(el.find('h1,h2,h3').first().text()) || `Slide ${el.attr('data-slide')}`;
      const slideText = normalizeText(el.find('p,li').map((__, n) => $(n).text()).get().join(' '));
      content.push({
        type: 'slide',
        title,
        content: slideText ? [{ type: 'text', value: slideText }] : [],
      });
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      const text = normalizeText(el.text());
      if (!text) return;
      content.push({ type: 'heading', level: Number.parseInt(tag[1], 10) as 1 | 2 | 3 | 4 | 5 | 6, text });
      return;
    }

    if (tag === 'p') {
      const nodes = inlineNodesFromElement(el, $);
      if (nodes.length > 0) content.push({ type: 'paragraph', content: nodes });
      return;
    }

    if (tag === 'img') {
      const src = (el.attr('src') || '').trim();
      if (!src) return;
      const alt = (el.attr('alt') || '').trim() || undefined;
      const style = el.attr('style') || '';
      const alignment = /margin-left:\s*auto/i.test(style) && /margin-right:\s*auto/i.test(style)
        ? 'center'
        : /float:\s*right/i.test(style)
          ? 'right'
          : /float:\s*left/i.test(style)
            ? 'left'
            : 'center';
      content.push({ type: 'image', src, alt, alignment });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = el.find('li').map((__, li) => normalizeText($(li).text())).get().filter(Boolean);
      if (items.length > 0) content.push({ type: 'list', ordered: tag === 'ol', items });
      return;
    }

    if (tag === 'blockquote') {
      const text = normalizeText(el.text());
      if (text) content.push({ type: 'blockquote', text });
      return;
    }

    if (tag === 'table') {
      const rows = el.find('tr').map((__, tr) => (
        $(tr).find('th,td').map((___, cell) => normalizeText($(cell).text())).get()
      )).get().filter((row) => row.length > 0);
      if (rows.length > 0) content.push({ type: 'table', rows });
    }
  });

  return { content };
}

// ─── Flatten to plain text ────────────────────────────────────────────────────

export function flattenStructuredContent(content: StructuredContent): string {
  return content.sections
    .map((s) => `${s.title}\n\n${s.paragraphs.join('\n\n')}`)
    .join('\n\n---\n\n');
}

// ─── Extract all narration sentences ─────────────────────────────────────────

export function extractAllSentences(content: StructuredContent): string[] {
  return content.sections.flatMap((section) =>
    section.narrationSegments.map((seg) => seg.text)
  );
}
