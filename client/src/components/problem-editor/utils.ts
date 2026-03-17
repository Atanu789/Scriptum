import TurndownService from 'turndown';
import mammoth from 'mammoth';
import type { AssetItem } from './types';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toMarkdown(html: string) {
  return turndownService.turndown(html);
}

export function htmlToBlobUrl(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(blob);
}

export async function fileToAsset(file: File): Promise<AssetItem> {
  const url = URL.createObjectURL(file);
  return {
    id: uid('asset'),
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url,
  };
}

export async function importFileToHtml(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || file.type === 'text/plain') {
    const text = await file.text();
    return text
      .split('\n\n')
      .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }

  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value;
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const text = await importPdfText(file);
    return `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
  }

  throw new Error('Unsupported file type. Use PDF, DOCX, or TXT.');
}

async function importPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = `https://unpkg.com/pdfjs-dist@${(pdfjs as { version?: string }).version ?? '4.10.38'}/build/pdf.worker.min.mjs`;
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = (pdfjs as unknown as {
    getDocument: (args: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
  }).getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = (await pdf.getPage(i)) as {
      getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    };
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str ?? '').join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}

export function exportFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
