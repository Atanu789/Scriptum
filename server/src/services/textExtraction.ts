import fs from 'fs';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import JSZip from 'jszip';
import { ExtractedContent, DocumentSection } from '../types';

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
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value;

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('No text could be extracted from the DOCX file');
  }

  const cleanedText = cleanText(rawText);
  const structuredSections = structureText(cleanedText);

  return {
    rawText,
    cleanedText,
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

export async function extractFromPptx(filePath: string): Promise<ExtractedContent> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const textParts: string[] = [];

  // pptx stores slides under ppt/slides/slide*.xml
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    const xmlContent = await zip.files[slideFile].async('string');
    // Extract text from <a:t> tags (DrawingML text runs)
    const texts: string[] = [];
    const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xmlContent)) !== null) {
      const t = m[1].trim();
      if (t) texts.push(t);
    }
    if (texts.length > 0) {
      textParts.push(texts.join(' '));
    }
  }

  if (textParts.length === 0) {
    throw new Error('No text could be extracted from the PowerPoint file');
  }

  const rawText = textParts.join('\n\n');
  const cleanedText = cleanText(rawText);
  const structuredSections = structureText(cleanedText);

  return {
    rawText,
    cleanedText,
    structuredSections,
    wordCount: countWords(cleanedText),
    sourceType: 'pptx' as any,
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
