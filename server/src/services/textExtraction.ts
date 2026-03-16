import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import JSZip from 'jszip';
import { htmlToStructuredModel, plainTextToEditorHtml } from './documentStructure';
import {
  ExtractedContent,
  DocumentSection,
  PptParagraph,
  PptPresentationContent,
  PptSlideContent,
  PptTextRun,
  PptTextRunStyle,
  PptMediaReference,
} from '../types';

// ─── Text Cleaning ─────────────────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')            // Normalise line endings
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n')        // Max two consecutive newlines
    .replace(/^\s+|\s+$/g, '')         // Trim outer whitespace
    .trim();
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\s*<p>\s*<\/p>\s*/g, '')
    .trim();
}

async function saveDocxImageToUploads(element: { contentType: string; read: (format: string) => Promise<Buffer> }): Promise<string> {
  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };

  const ext = extMap[element.contentType] || 'png';
  const filename = `docx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const absolutePath = path.join(uploadDir, filename);
  const buffer = await element.read('buffer');
  fs.writeFileSync(absolutePath, buffer);
  return `/uploads/${filename}`;
}

// ─── Structuring ──────────────────────────────────────────────────────────────

function structureText(cleanedText: string): DocumentSection[] {
  const lines = cleanedText.split('\n');
  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;

  const isHeading = (line: string): boolean => {
    const trimmed = line.trim();
    // Heuristic: short line (< 80 chars), no terminal punctuation, possibly ALL_CAPS or title case
    if (!trimmed || trimmed.length > 80) return false;
    if (/[.!?]$/.test(trimmed)) return false;
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) return true;
    if (/^#+\s/.test(trimmed)) return true;                          // Markdown heading
    if (/^\d+\.\s+[A-Z]/.test(trimmed)) return true;                // Numbered heading
    if (/^[A-Z][A-Za-z\s,:-]{5,60}$/.test(trimmed) && !/,\s/.test(trimmed)) return true;
    return false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isHeading(trimmed)) {
      // Save previous section
      if (currentSection && currentSection.paragraphs.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        title: trimmed.replace(/^#+\s*/, ''),
        paragraphs: [],
        narrationSegments: [],
      };
    } else {
      if (!currentSection) {
        currentSection = {
          title: 'Introduction',
          paragraphs: [],
          narrationSegments: [],
        };
      }
      currentSection.paragraphs.push(trimmed);
    }
  }

  if (currentSection && currentSection.paragraphs.length > 0) {
    sections.push(currentSection);
  }

  // Fallback: single section if nothing was structured
  if (sections.length === 0 && cleanedText.trim().length > 0) {
    sections.push({
      title: 'Content',
      paragraphs: cleanedText
        .split('\n\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      narrationSegments: [],
    });
  }

  return sections;
}

// ─── Extraction Functions ──────────────────────────────────────────────────────

export async function extractFromDocx(filePath: string): Promise<ExtractedContent> {
  const buffer = fs.readFileSync(filePath);
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (element: { contentType: string; read: (format: string) => Promise<string> }) => {
          const src = await saveDocxImageToUploads(element as unknown as { contentType: string; read: (format: string) => Promise<Buffer> });
          return {
            src,
          };
        }),
      }
    ),
  ]);
  const rawText = textResult.value;

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('No text could be extracted from the DOCX file');
  }

  const cleanedText = cleanText(rawText);
  const structuredSections = structureText(cleanedText);
  const editorHtml = normalizeHtml(htmlResult.value || plainTextToEditorHtml(cleanedText));

  return {
    rawText,
    cleanedText,
    editorHtml,
    editorModel: htmlToStructuredModel(editorHtml),
    structuredSections,
    wordCount: countWords(cleanedText),
    sourceType: 'docx',
  };
}

export async function extractFromPdf(filePath: string): Promise<ExtractedContent> {
  const buffer = fs.readFileSync(filePath);
  const result = await pdfParse(buffer);
  const rawText = result.text;

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('No text could be extracted from the PDF file');
  }

  const cleanedText = cleanText(rawText);
  const structuredSections = structureText(cleanedText);

  return {
    rawText,
    cleanedText,
    editorHtml: plainTextToEditorHtml(cleanedText),
    editorModel: htmlToStructuredModel(plainTextToEditorHtml(cleanedText)),
    structuredSections,
    wordCount: countWords(cleanedText),
    sourceType: 'pdf',
  };
}

export async function extractFromTxt(filePath: string): Promise<ExtractedContent> {
  const rawText = fs.readFileSync(filePath, 'utf-8');

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('The text file appears to be empty');
  }

  const cleanedText = cleanText(rawText);
  const structuredSections = structureText(cleanedText);

  return {
    rawText,
    cleanedText,
    editorHtml: plainTextToEditorHtml(cleanedText),
    editorModel: htmlToStructuredModel(plainTextToEditorHtml(cleanedText)),
    structuredSections,
    wordCount: countWords(cleanedText),
    sourceType: 'txt',
  };
}

export async function extractFromYouTube(youtubeUrl: string): Promise<ExtractedContent> {
  const videoIdMatch = youtubeUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );

  if (!videoIdMatch?.[1]) {
    throw new Error('Invalid YouTube URL. Could not extract video ID.');
  }

  const videoId = videoIdMatch[1];

  // ── Step 1: Fetch the YouTube watch page ─────────────────────────────────
  let pageHtml: string;
  try {
    const { data } = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15_000,
    });
    pageHtml = data as string;
  } catch (err) {
    throw new Error('Could not reach YouTube. Check your internet connection.');
  }

  // ── Step 2: Extract ytInitialPlayerResponse ───────────────────────────────
  const playerMatch = pageHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*(?:var\s+|window\[))/s)
    ?? pageHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);

  if (!playerMatch?.[1]) {
    throw new Error(
      'Could not parse YouTube player data. The video may be age-restricted or unavailable.'
    );
  }

  let playerResponse: Record<string, unknown>;
  try {
    playerResponse = JSON.parse(playerMatch[1]);
  } catch {
    throw new Error('Failed to parse YouTube player response.');
  }

  // ── Step 3: Find a caption track ─────────────────────────────────────────
  const captions =
    (playerResponse as any)?.captions?.playerCaptionsTracklistRenderer?.captionTracks as
    { baseUrl: string; languageCode: string; name: { simpleText: string } }[] | undefined;

  if (!captions || captions.length === 0) {
    throw new Error(
      'This YouTube video has no transcript/captions available. ' +
      'Please try a video that has auto-generated or manually added subtitles.'
    );
  }

  // Prefer English; fall back to first available
  const track =
    captions.find((t) => t.languageCode.startsWith('en')) ?? captions[0];

  // ── Step 4: Fetch the caption XML ─────────────────────────────────────────
  let captionXml: string;
  try {
    const { data } = await axios.get(track.baseUrl + '&fmt=json3', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15_000,
    });

    // json3 format: { events: [{ segs: [{ utf8 }] }] }
    if (typeof data === 'object' && (data as any).events) {
      const events = (data as any).events as { segs?: { utf8: string }[]; aAppend?: number }[];
      captionXml = events
        .filter((e) => e.segs)
        .flatMap((e) => e.segs!.map((s) => s.utf8 ?? ''))
        .join(' ');
    } else {
      captionXml = data as string;
    }
  } catch {
    // Fallback: fetch as plain XML
    try {
      const { data } = await axios.get(track.baseUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15_000,
      });
      captionXml = data as string;
    } catch (err2) {
      throw new Error('Could not fetch caption track from YouTube.');
    }
  }

  // ── Step 5: Parse text from XML or plain string ───────────────────────────
  let rawText: string;

  if (typeof captionXml === 'string' && captionXml.trim().startsWith('<')) {
    // XML format: <text start="..." dur="...">...</text>
    rawText = captionXml
      .replace(/<text[^>]*>/g, '')
      .replace(/<\/text>/g, ' ')
      .replace(/<[^>]+>/g, '');
  } else {
    rawText = captionXml;
  }

  // Decode HTML entities
  rawText = rawText
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!rawText) {
    throw new Error('The transcript was empty after parsing. The video may not have readable subtitles.');
  }

  const cleanedText = cleanText(rawText);
  const structuredSections = structureText(cleanedText);

  return {
    rawText,
    cleanedText,
    editorHtml: plainTextToEditorHtml(cleanedText),
    editorModel: htmlToStructuredModel(plainTextToEditorHtml(cleanedText)),
    structuredSections,
    wordCount: countWords(cleanedText),
    sourceType: 'youtube',
  };
}

// ─── Auto-detect and extract ──────────────────────────────────────────────────

export async function extractContent(
  source: { filePath?: string; youtubeUrl?: string; mimeType?: string; originalname?: string }
): Promise<ExtractedContent> {
  if (source.youtubeUrl) {
    return extractFromYouTube(source.youtubeUrl);
  }

  if (!source.filePath) {
    throw new Error('No file path or YouTube URL provided');
  }

  const ext = source.originalname
    ? source.originalname.split('.').pop()?.toLowerCase()
    : source.filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'docx':
      return extractFromDocx(source.filePath);
    case 'pdf':
      return extractFromPdf(source.filePath);
    case 'txt':
      return extractFromTxt(source.filePath);
    case 'ppt':
    case 'pptx':
      return extractFromPptx(source.filePath);
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return extractFromImage(source.filePath, ext);
    case 'mp3':
    case 'm4a':
      return extractFromAudio(source.filePath, ext);
    case 'mp4':
    case 'mov':
    case 'webm':
    case 'avi':
      return extractFromVideo(source.filePath, ext);
    default:
      throw new Error(`Unsupported file extension: .${ext}`);
  }
}

// ─── PPTX text extraction ─────────────────────────────────────────────────────

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#xA;/gi, '\n')
    .replace(/&#10;/g, '\n');
}

function getAttrValue(tagFragment: string, attrName: string): string | undefined {
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}="([^"]+)"`);
  const m = tagFragment.match(re);
  return m?.[1];
}

function parseRunStyle(runTag: string, runPropsTag?: string): PptTextRunStyle | undefined {
  const style: PptTextRunStyle = {};
  const src = runPropsTag ?? runTag;

  const bold = getAttrValue(src, 'b');
  const italic = getAttrValue(src, 'i');
  const underline = getAttrValue(src, 'u');
  const latinTypeface = src.match(/<a:latin[^>]*typeface="([^"]+)"/i)?.[1];
  const sizeVal = getAttrValue(src, 'sz');
  const colorVal = src.match(/<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"/i)?.[1];

  if (bold === '1') style.bold = true;
  if (italic === '1') style.italic = true;
  if (underline && underline !== 'none') style.underline = true;
  if (latinTypeface) style.fontFamily = latinTypeface;
  if (sizeVal) {
    const sizeHundredths = Number.parseInt(sizeVal, 10);
    if (Number.isFinite(sizeHundredths) && sizeHundredths > 0) {
      style.fontSizePt = sizeHundredths / 100;
    }
  }
  if (colorVal) style.colorHex = `#${colorVal.toUpperCase()}`;

  return Object.keys(style).length > 0 ? style : undefined;
}

function parseParagraph(paragraphXml: string): PptParagraph {
  const paragraph: PptParagraph = { runs: [] };
  const pPrTag = paragraphXml.match(/<a:pPr([^>]*)\/>|<a:pPr([^>]*)>/i);
  const pPrAttrs = pPrTag ? (pPrTag[1] ?? pPrTag[2] ?? '') : '';

  if (pPrAttrs) {
    const level = getAttrValue(pPrAttrs, 'lvl');
    const align = getAttrValue(pPrAttrs, 'algn');
    const spcBef = getAttrValue(pPrAttrs, 'spcBef');
    const spcAft = getAttrValue(pPrAttrs, 'spcAft');
    const lnSpc = getAttrValue(pPrAttrs, 'lnSpc');

    if (level) paragraph.level = Number.parseInt(level, 10);
    if (align) paragraph.alignment = align;
    if (spcBef) paragraph.spacingBeforePt = Number.parseInt(spcBef, 10) / 100;
    if (spcAft) paragraph.spacingAfterPt = Number.parseInt(spcAft, 10) / 100;
    if (lnSpc) paragraph.lineSpacingPt = Number.parseInt(lnSpc, 10) / 100;
  }

  const runRe = /<a:r>([\s\S]*?)<\/a:r>/g;
  let runMatch: RegExpExecArray | null;
  while ((runMatch = runRe.exec(paragraphXml)) !== null) {
    const runXml = runMatch[1];
    const text = decodeXmlEntities(runXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/)?.[1] ?? '').trim();
    if (!text) continue;

    const runPropsTag = runXml.match(/<a:rPr([^>]*)\/>|<a:rPr([^>]*)>/i);
    const runProps = runPropsTag ? (runPropsTag[0] ?? '') : undefined;
    const style = parseRunStyle(runXml, runProps);
    const run: PptTextRun = { text };
    if (style) run.style = style;
    paragraph.runs.push(run);
  }

  if (paragraph.runs.length === 0) {
    const fieldTextRe = /<a:fld[^>]*>([\s\S]*?)<\/a:fld>/g;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldTextRe.exec(paragraphXml)) !== null) {
      const text = decodeXmlEntities(fieldMatch[1].match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/)?.[1] ?? '').trim();
      if (!text) continue;
      paragraph.runs.push({ text });
    }
  }

  return paragraph;
}

function parseSlideMediaReferences(slideXml: string, relTargets: Map<string, string>): PptMediaReference[] {
  const refs: PptMediaReference[] = [];
  const seen = new Set<string>();
  const relIdRe = /r:(?:embed|link)="([^"]+)"/g;
  let relMatch: RegExpExecArray | null;

  while ((relMatch = relIdRe.exec(slideXml)) !== null) {
    const relationshipId = relMatch[1];
    if (seen.has(relationshipId)) continue;
    seen.add(relationshipId);

    const target = relTargets.get(relationshipId) ?? '';
    const lowerTarget = target.toLowerCase();
    let type: PptMediaReference['type'] = 'other';

    if (/\.(png|jpg|jpeg|gif|bmp|tif|tiff|svg|webp)$/i.test(lowerTarget)) type = 'image';
    else if (/\.(mp3|wav|m4a|aac|ogg|wma)$/i.test(lowerTarget)) type = 'audio';
    else if (/\.(mp4|mov|avi|wmv|mkv|webm|mpeg|mpg)$/i.test(lowerTarget)) type = 'video';

    refs.push({
      relationshipId,
      target,
      type,
    });
  }

  return refs;
}

async function parseSlideRelationships(zip: JSZip, slidePath: string): Promise<Map<string, string>> {
  const relPath = slidePath
    .replace('ppt/slides/', 'ppt/slides/_rels/')
    .replace(/\.xml$/, '.xml.rels');

  const relFile = zip.files[relPath];
  if (!relFile) return new Map();

  const relXml = await relFile.async('string');
  const rels = new Map<string, string>();

  const relRe = /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>(?:<\/Relationship>)?/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRe.exec(relXml)) !== null) {
    const id = relMatch[1];
    const target = relMatch[2];
    rels.set(id, target);
  }

  return rels;
}

function parseSlide(slideXml: string, slideNumber: number, media: PptMediaReference[]): PptSlideContent {
  const paragraphs: PptParagraph[] = [];

  const pRe = /<a:p>([\s\S]*?)<\/a:p>/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRe.exec(slideXml)) !== null) {
    const pXml = pMatch[0];
    const paragraph = parseParagraph(pXml);
    if (paragraph.runs.length > 0) paragraphs.push(paragraph);
  }

  const paragraphTexts = paragraphs
    .map((p) => p.runs.map((r) => r.text).join(' ').trim())
    .filter(Boolean);

  const title = paragraphTexts[0] ?? `Slide ${slideNumber}`;
  const text = paragraphTexts.join('\n').trim();

  return {
    slideNumber,
    title,
    text,
    paragraphs,
    media,
  };
}

function presentationToStructuredSections(presentation: PptPresentationContent): DocumentSection[] {
  const sections: DocumentSection[] = presentation.slides.map((slide) => {
    const paragraphs = slide.paragraphs
      .map((p) => p.runs.map((r) => r.text).join(' ').trim())
      .filter(Boolean);

    return {
      title: slide.title || `Slide ${slide.slideNumber}`,
      paragraphs: paragraphs.length > 0 ? paragraphs : (slide.text ? [slide.text] : []),
      narrationSegments: [],
    };
  }).filter((section) => section.paragraphs.length > 0);

  return sections.length > 0 ? sections : [{
    title: 'Presentation',
    paragraphs: ['No readable text found in slides.'],
    narrationSegments: [],
  }];
}

function presentationToEditorHtml(presentation: PptPresentationContent): string {
  return presentation.slides.map((slide) => {
    const parts: string[] = [`<section data-slide="${slide.slideNumber}">`, `<h2>${slide.title || `Slide ${slide.slideNumber}`}</h2>`];

    for (const paragraph of slide.paragraphs) {
      const text = paragraph.runs.map((run) => run.text).join('').trim();
      if (!text) continue;

      if ((paragraph.level ?? 0) > 0) {
        parts.push(`<ul><li>${text}</li></ul>`);
      } else {
        parts.push(`<p>${text}</p>`);
      }
    }

    if (parts.length === 2 && slide.text.trim()) {
      parts.push(`<p>${slide.text}</p>`);
    }

    parts.push('</section>');
    return parts.join('');
  }).join('');
}

export async function extractFromPptx(filePath: string): Promise<ExtractedContent> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const getNum = (s: string) => Number.parseInt(s.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
      return getNum(a) - getNum(b);
    });

  if (slideFiles.length === 0) {
    throw new Error('No slides were found in the PowerPoint file');
  }

  const slides: PptSlideContent[] = [];
  let hasMedia = false;
  let hasAudio = false;

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideXml = await zip.files[slidePath].async('string');
    const rels = await parseSlideRelationships(zip, slidePath);
    const media = parseSlideMediaReferences(slideXml, rels);
    if (media.length > 0) hasMedia = true;
    if (media.some((m) => m.type === 'audio')) hasAudio = true;

    const slide = parseSlide(slideXml, i + 1, media);
    slides.push(slide);
  }

  const presentationContent: PptPresentationContent = {
    totalSlides: slides.length,
    hasMedia,
    hasAudio,
    slides,
  };

  const slideTextBlocks = slides
    .map((slide) => slide.text)
    .filter((t) => t.trim().length > 0)
    .map((t, i) => `Slide ${i + 1}\n${t}`);

  if (slideTextBlocks.length === 0) {
    throw new Error('No text could be extracted from the PowerPoint file');
  }

  const rawText = slideTextBlocks.join('\n\n');
  const cleanedText = cleanText(rawText);
  const structuredSections = presentationToStructuredSections(presentationContent);

  return {
    rawText,
    cleanedText,
    editorHtml: presentationToEditorHtml(presentationContent),
    editorModel: htmlToStructuredModel(presentationToEditorHtml(presentationContent)),
    structuredSections,
    wordCount: countWords(cleanedText),
    sourceType: 'pptx',
    presentationContent,
  };
}

// ─── Media pass-throughs ──────────────────────────────────────────────────────
// For images, audio, and video we don't extract narration text — they are stored
// as media assets on the document. We return a minimal stub so the upload
// controller can create the document record without errors.

function mediaStub(sourceType: string, note: string): ExtractedContent {
  const cleanedText = note;
  return {
    rawText: cleanedText,
    cleanedText,
    editorHtml: `<p>${cleanedText}</p>`,
    editorModel: htmlToStructuredModel(`<p>${cleanedText}</p>`),
    structuredSections: [{
      title: 'Media',
      paragraphs: [cleanedText],
      narrationSegments: [],
    }],
    wordCount: countWords(cleanedText),
    sourceType: sourceType as any,
  };
}

export async function extractFromImage(filePath: string, ext: string): Promise<ExtractedContent> {
  if (!fs.existsSync(filePath)) throw new Error('Image file not found');
  return mediaStub('image', `[Image file: .${ext}]`);
}

export async function extractFromAudio(filePath: string, ext: string): Promise<ExtractedContent> {
  if (!fs.existsSync(filePath)) throw new Error('Audio file not found');
  return mediaStub('audio', `[Audio file: .${ext}]`);
}

export async function extractFromVideo(filePath: string, ext: string): Promise<ExtractedContent> {
  if (!fs.existsSync(filePath)) throw new Error('Video file not found');
  return mediaStub('video', `[Video file: .${ext}]`);
}
