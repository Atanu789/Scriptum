import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  StructuredBlockNode,
  StructuredContent,
  StructuredInlineNode,
} from '../types';

export type ExportBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; text: string; inlines?: StructuredInlineNode[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'blockquote'; text: string }
  | { type: 'table'; rows: string[][] };

export interface ExportSource {
  editorModel?: { content?: unknown[] } | null;
  structuredContent?: StructuredContent | null;
}

export interface ResolvedImage {
  buffer: Buffer;
  mimeType: string;
}

function normalizeText(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function flattenInline(nodes: StructuredInlineNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      const text = normalizeText(node.text || '');
      const url = normalizeText(node.url || '');
      if (!text) return url;
      if (!url) return text;
      return `${text} (${url})`;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromEditorBlocks(content: StructuredBlockNode[]): ExportBlock[] {
  const blocks: ExportBlock[] = [];

  for (const node of content) {
    if (node.type === 'heading') {
      const text = normalizeText(node.text);
      if (text) blocks.push({ type: 'heading', level: node.level, text });
      continue;
    }

    if (node.type === 'paragraph') {
      const text = flattenInline(node.content);
      if (text) blocks.push({ type: 'paragraph', text, inlines: node.content });
      continue;
    }

    if (node.type === 'image') {
      const src = (node.src || '').trim();
      if (src) blocks.push({ type: 'image', src, alt: node.alt });
      continue;
    }

    if (node.type === 'list') {
      const items = (node.items || []).map((item) => normalizeText(item)).filter(Boolean);
      if (items.length > 0) blocks.push({ type: 'list', ordered: node.ordered, items });
      continue;
    }

    if (node.type === 'blockquote') {
      const text = normalizeText(node.text);
      if (text) blocks.push({ type: 'blockquote', text });
      continue;
    }

    if (node.type === 'table') {
      const rows = (node.rows || [])
        .map((row) => row.map((cell) => normalizeText(cell)))
        .filter((row) => row.some((cell) => cell.length > 0));
      if (rows.length > 0) blocks.push({ type: 'table', rows });
      continue;
    }

    if (node.type === 'slide') {
      const title = normalizeText(node.title);
      if (title) blocks.push({ type: 'heading', level: 2, text: title });
      const body = flattenInline(node.content);
      if (body) blocks.push({ type: 'paragraph', text: body, inlines: node.content });
    }
  }

  return blocks;
}

function fromStructuredContent(structuredContent: StructuredContent): ExportBlock[] {
  const blocks: ExportBlock[] = [];

  for (const section of structuredContent.sections || []) {
    const title = normalizeText(section.title || '');
    if (title) blocks.push({ type: 'heading', level: 2, text: title });

    for (const paragraph of section.paragraphs || []) {
      const text = normalizeText(paragraph);
      if (text) blocks.push({ type: 'paragraph', text });
    }
  }

  return blocks;
}

export function buildExportBlocks(source: ExportSource): ExportBlock[] {
  const editorContent = Array.isArray(source.editorModel?.content)
    ? (source.editorModel?.content as StructuredBlockNode[])
    : [];

  const fromEditor = editorContent.length
    ? fromEditorBlocks(editorContent)
    : [];

  if (fromEditor.length > 0) return fromEditor;

  if (source.structuredContent?.sections?.length) {
    return fromStructuredContent(source.structuredContent);
  }

  return [];
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function absolutePathFromSrc(src: string): string {
  if (path.isAbsolute(src)) return src;

  const normalized = src.replace(/\\/g, '/');
  const cwd = process.cwd();
  const workspaceRoot = path.resolve(cwd, '..');
  const relative = normalized.replace(/^\//, '');

  const candidates = [
    path.join(cwd, relative),
    path.join(workspaceRoot, relative),
    path.join(workspaceRoot, 'uploads', relative.replace(/^uploads\//, '')),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

export async function resolveImage(src: string): Promise<ResolvedImage | null> {
  const value = (src || '').trim();
  if (!value) return null;

  if (value.startsWith('data:image/')) {
    const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return null;
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], 'base64'),
    };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const response = await axios.get<ArrayBuffer>(value, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      const contentType = String(response.headers['content-type'] || 'image/png').split(';')[0].trim();
      return {
        mimeType: contentType || 'image/png',
        buffer: Buffer.from(response.data),
      };
    } catch {
      return null;
    }
  }

  const imagePath = absolutePathFromSrc(value);
  if (!fs.existsSync(imagePath)) return null;

  try {
    return {
      mimeType: mimeFromPath(imagePath),
      buffer: fs.readFileSync(imagePath),
    };
  } catch {
    return null;
  }
}

export function imageToDataUri(image: ResolvedImage): string {
  return `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;
}
