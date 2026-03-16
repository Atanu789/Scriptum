'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AnalysisPanel from '@/components/AnalysisPanel';
import ShareMenu from '@/components/ShareMenu';
import { useDocument } from '@/hooks/useDocument';
import { useSubscription } from '@/hooks/useSubscription';
import {
  Save, BarChart2, Loader2, Tv2, ExternalLink,
  ChevronLeft, FileText, AlertCircle,
  Image as ImageIcon, Video, Music, X, Library, AlignLeft, AlignCenter, AlignRight, WrapText, GitCompare,
} from 'lucide-react';
import { formatWordCount, cn } from '@/lib/utils';
import { documentApi } from '@/lib/api';
import { DocumentSummary, GrammarIssue } from '@/types';
import toast from 'react-hot-toast';

// ── Convert plain text → editor HTML ────────────────────────────────────────
// Documents stored as plain text (newline-separated) need to be wrapped in
// proper block elements so the typography styles render correctly.
function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 100) return false;
  if (/[.!?]$/.test(t) && !t.match(/^[A-Z\s]{3,}$/)) return false; // allow ALL CAPS with punct
  if (/^#{1,4}\s/.test(t)) return true;                              // # Markdown headings
  if (/^\d+\.\s+[A-Z]/.test(t)) return true;                        // 1. Numbered headings
  if (t === t.toUpperCase() && t.length > 3 && /[A-Z]/.test(t)) return true; // ALL CAPS
  if (/^[A-Z][A-Za-z\s,:-]{4,70}$/.test(t) && !/,\s/.test(t)) return true;  // Title Case
  return false;
}

function headingTag(line: string): string {
  const t = line.trim();
  if (/^#{4}\s/.test(t)) return 'h4';
  if (/^#{3}\s/.test(t)) return 'h3';
  if (/^#{2}\s/.test(t)) return 'h2';
  if (/^#{1}\s/.test(t)) return 'h1';
  if (t === t.toUpperCase() && t.length < 50) return 'h2';
  if (/^\d+\.\s+[A-Z]/.test(t)) return 'h3';
  return 'h2';
}

function toEditorHtml(text: string): string {
  // Already has block-level HTML — use as-is
  if (/<(p|h[1-6]|ul|ol|figure|blockquote|pre|div)\b/i.test(text)) return text;

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && isHeadingLine(lines[0])) {
      const tag = headingTag(lines[0]);
      const content = lines[0].replace(/^#{1,4}\s*/, '');
      return `<${tag}>${escHtml(content)}</${tag}>`;
    }
    if (lines.length > 0 && isHeadingLine(lines[0])) {
      const tag = headingTag(lines[0]);
      const heading = `<${tag}>${escHtml(lines[0].replace(/^#{1,4}\s*/, ''))}</${tag}>`;
      const rest = lines.slice(1).map(escHtml).join('<br>');
      return heading + (rest ? `<p>${rest}</p>` : '');
    }
    // Check for bullet lists (lines starting with - or * or •)
    if (lines.every((l) => /^[-*•]\s/.test(l))) {
      const items = lines.map((l) => `<li>${escHtml(l.replace(/^[-*•]\s*/, ''))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    // Check for numbered lists
    if (lines.every((l) => /^\d+[.)]\s/.test(l))) {
      const items = lines.map((l) => `<li>${escHtml(l.replace(/^\d+[.)]\s*/, ''))}</li>`).join('');
      return `<ol>${items}</ol>`;
    }
    return `<p>${lines.map(escHtml).join('<br>')}</p>`;
  }).join('');
}

function replaceByOffset(
  container: HTMLElement,
  offset: number,
  length: number,
  replacement: string,
): boolean {
  if (offset < 0 || length <= 0) return false;

  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  let cursor = 0;
  const end = offset + length;

  for (const t of textNodes) {
    const next = cursor + t.data.length;
    if (!startNode && offset >= cursor && offset <= next) {
      startNode = t;
      startOffset = offset - cursor;
    }
    if (!endNode && end >= cursor && end <= next) {
      endNode = t;
      endOffset = end - cursor;
    }
    cursor = next;
  }

  if (!startNode || !endNode) return false;

  const range = window.document.createRange();
  range.setStart(startNode, Math.max(0, startOffset));
  range.setEnd(endNode, Math.max(0, endOffset));
  range.deleteContents();
  range.insertNode(window.document.createTextNode(replacement));
  return true;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countLines(text: string): number {
  return Math.max(1, text.split('\n').length);
}

function tokenizeWithWhitespace(line: string): string[] {
  if (!line) return [];
  return line.split(/(\s+)/).filter((t) => t.length > 0);
}

interface DiffRow {
  left: string;
  right: string;
  changed: boolean;
}

function buildSideBySideRows(before: string, after: string): DiffRow[] {
  const leftLines = before.split('\n');
  const rightLines = after.split('\n');
  const count = Math.max(leftLines.length, rightLines.length);
  const rows: DiffRow[] = [];
  for (let i = 0; i < count; i++) {
    const left = leftLines[i] ?? '';
    const right = rightLines[i] ?? '';
    rows.push({ left, right, changed: left !== right });
  }
  return rows;
}

function renderInlineWordDiff(left: string, right: string, side: 'left' | 'right') {
  const leftTokens = tokenizeWithWhitespace(left);
  const rightTokens = tokenizeWithWhitespace(right);
  const maxLen = Math.max(leftTokens.length, rightTokens.length);

  if (maxLen === 0) return ' ';

  const out: JSX.Element[] = [];
  for (let i = 0; i < maxLen; i++) {
    const current = side === 'left' ? (leftTokens[i] ?? '') : (rightTokens[i] ?? '');
    const opposite = side === 'left' ? (rightTokens[i] ?? '') : (leftTokens[i] ?? '');
    if (!current) continue;

    const isWhitespace = /^\s+$/.test(current);
    const changed = !isWhitespace && current !== opposite;

    out.push(
      <span
        key={`${side}-${i}-${current}`}
        className={cn(
          changed && side === 'left' && 'rounded bg-red-200/80 px-0.5 text-red-900 dark:bg-red-900/50 dark:text-red-100',
          changed && side === 'right' && 'rounded bg-emerald-200/80 px-0.5 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
        )}
      >
        {current}
      </span>,
    );
  }

  return out.length > 0 ? out : ' ';
}

export default function EditorPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;

  const { document: doc, isLoading, isAnalyzing, isHumanizing, error, analysis, analyze, humanize, updateContent } =
    useDocument(documentId);
  const { canUseGrammarFix, canUseHumanizeText } = useSubscription();

  // ── contentEditable ref & init ───────────────────────────────────────────
  const editorRef      = useRef<HTMLDivElement>(null);
  const lastLoadedSignatureRef = useRef<string>('');
  const [wordCount, setWordCount] = useState(0);
  const [editorLineCount, setEditorLineCount] = useState(1);
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [isDirty, setIsDirty]     = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'analysis'>('edit');
  const [compareSnapshot, setCompareSnapshot] = useState<{
    title: string;
    before: string;
    after: string;
  } | null>(null);

  // ── Image formatting controls ────────────────────────────────────────────
  const [selectedImageEl, setSelectedImageEl] = useState<HTMLImageElement | null>(null);
  const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center');
  const [imageWrap, setImageWrap] = useState(false);
  const [imageWidthPct, setImageWidthPct] = useState(70);
  const [imagePaddingPx, setImagePaddingPx] = useState(8);
  const compareRows = compareSnapshot
    ? buildSideBySideRows(compareSnapshot.before, compareSnapshot.after)
    : [];

  const clearImageSelection = useCallback(() => {
    if (selectedImageEl) selectedImageEl.classList.remove('editor-image-selected');
    setSelectedImageEl(null);
  }, [selectedImageEl]);

  const syncImageControlsFromElement = useCallback((img: HTMLImageElement) => {
    const widthRaw = img.style.width;
    const widthPct = widthRaw.endsWith('%') ? Number.parseInt(widthRaw, 10) : 70;
    setImageWidthPct(Number.isFinite(widthPct) ? Math.max(20, Math.min(100, widthPct)) : 70);

    const isWrapped = img.style.float === 'left' || img.style.float === 'right';
    setImageWrap(isWrapped);

    if (img.style.float === 'left') setImageAlign('left');
    else if (img.style.float === 'right') setImageAlign('right');
    else {
      const ml = img.style.marginLeft;
      const mr = img.style.marginRight;
      if (ml === '0px' || ml === '0') setImageAlign('left');
      else if (mr === '0px' || mr === '0') setImageAlign('right');
      else setImageAlign('center');
    }

    const parsedMargin = Number.parseInt(img.style.marginTop || img.style.marginBottom || '8', 10);
    setImagePaddingPx(Number.isFinite(parsedMargin) ? Math.max(0, Math.min(32, parsedMargin)) : 8);
  }, []);

  const applyImageFormatting = useCallback((next: {
    align?: 'left' | 'center' | 'right';
    wrap?: boolean;
    widthPct?: number;
    paddingPx?: number;
  }) => {
    const img = selectedImageEl;
    if (!img) return;

    const align = next.align ?? imageAlign;
    const wrap = next.wrap ?? imageWrap;
    const widthPct = next.widthPct ?? imageWidthPct;
    const paddingPx = next.paddingPx ?? imagePaddingPx;

    img.style.maxWidth = '100%';
    img.style.width = `${Math.max(20, Math.min(100, widthPct))}%`;
    img.style.borderRadius = '8px';

    if (wrap && (align === 'left' || align === 'right')) {
      img.style.display = 'block';
      img.style.float = align;
      img.style.marginTop = `${paddingPx}px`;
      img.style.marginBottom = `${paddingPx}px`;
      img.style.marginLeft = align === 'left' ? '0' : `${paddingPx}px`;
      img.style.marginRight = align === 'right' ? '0' : `${paddingPx}px`;
    } else {
      img.style.float = 'none';
      img.style.display = 'block';
      img.style.marginTop = `${paddingPx}px`;
      img.style.marginBottom = `${paddingPx}px`;
      if (align === 'left') {
        img.style.marginLeft = '0';
        img.style.marginRight = 'auto';
      } else if (align === 'right') {
        img.style.marginLeft = 'auto';
        img.style.marginRight = '0';
      } else {
        img.style.marginLeft = 'auto';
        img.style.marginRight = 'auto';
      }
    }

    setImageAlign(align);
    setImageWrap(wrap && (align === 'left' || align === 'right'));
    setImageWidthPct(Math.max(20, Math.min(100, widthPct)));
    setImagePaddingPx(Math.max(0, Math.min(32, paddingPx)));
    setIsDirty(true);
  }, [imageAlign, imagePaddingPx, imageWidthPct, imageWrap, selectedImageEl]);

  // ── Media library ────────────────────────────────────────────────────────
  const [showMediaLib, setShowMediaLib]     = useState(false);
  const [mediaItems, setMediaItems]         = useState<DocumentSummary[]>([]);
  const [mediaLibLoading, setMediaLibLoading] = useState(false);

  const openMediaLib = async () => {
    setShowMediaLib(true);
    if (mediaItems.length > 0) return;
    setMediaLibLoading(true);
    try {
      const { documents } = await documentApi.list(1, 100);
      setMediaItems(documents.filter((d) => ['image', 'audio', 'video'].includes(d.sourceType)));
    } catch {
      toast.error('Failed to load media library');
    } finally {
      setMediaLibLoading(false);
    }
  };

  const insertMediaFromLib = useCallback((item: DocumentSummary) => {
    if (!item.mediaUrl || !editorRef.current) return;
    const url = item.mediaUrl;
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    let html = '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      html = `<img src="${url}" alt="${item.originalFileName}" style="max-width:100%;border-radius:8px;display:block;margin:8px 0;" />`;
    } else if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
      html = `<video src="${url}" controls style="max-width:100%;border-radius:8px;display:block;margin:8px 0;"></video>`;
    } else if (['mp3', 'm4a'].includes(ext)) {
      html = `<audio src="${url}" controls style="width:100%;display:block;margin:8px 0;"></audio>`;
    }
    if (html) {
      editorRef.current.focus();
      // eslint-disable-next-line deprecation/deprecation
      window.document.execCommand('insertHTML', false, html);
      setIsDirty(true);
      setShowMediaLib(false);
    }
  }, []);

  const insertImageByUrl = useCallback(() => {
    if (!editorRef.current) return;
    const url = window.prompt('Enter image URL');
    if (!url) return;
    const safe = url.trim();
    if (!/^https?:\/\//i.test(safe) && !safe.startsWith('/')) {
      toast.error('Use a valid http(s) URL or /uploads path');
      return;
    }
    editorRef.current.focus();
    // eslint-disable-next-line deprecation/deprecation
    window.document.execCommand(
      'insertHTML',
      false,
      `<img src="${safe.replace(/"/g, '%22')}" alt="Inserted image" style="max-width:100%;width:70%;border-radius:8px;display:block;margin:8px auto;" />`
    );
    setIsDirty(true);
  }, []);

  // Hydrate editor when a new/updated document arrives; do not overwrite active edits.
  useEffect(() => {
    if (!doc || !editorRef.current) return;
    const signature = `${doc._id}:${doc.updatedAt}:${doc.cleanedText?.length ?? 0}`;
    if (signature === lastLoadedSignatureRef.current) return;

    const editorText = editorRef.current.innerText.trim();
    const canHydrate = !isDirty || editorText.length === 0;
    if (!canHydrate) return;

    editorRef.current.innerHTML = toEditorHtml(doc.cleanedText || '');
    const text = editorRef.current.innerText;
    setWordCount(countWords(text));
    setEditorLineCount(countLines(text));
    setEditorScrollTop(0);
    lastLoadedSignatureRef.current = signature;
  }, [doc, isDirty]);

  useEffect(() => {
    return () => {
      if (selectedImageEl) selectedImageEl.classList.remove('editor-image-selected');
    };
  }, [selectedImageEl]);

  const handleInput = useCallback(() => {
    const text = editorRef.current?.innerText || '';
    setWordCount(countWords(text));
    setEditorLineCount(countLines(text));
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);

  const handleEditorScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setEditorScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t && t.tagName === 'IMG') {
      const img = t as HTMLImageElement;
      if (selectedImageEl && selectedImageEl !== img) selectedImageEl.classList.remove('editor-image-selected');
      img.classList.add('editor-image-selected');
      setSelectedImageEl(img);
      syncImageControlsFromElement(img);
      return;
    }
    clearImageSelection();
  }, [clearImageSelection, selectedImageEl, syncImageControlsFromElement]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const html = editorRef.current?.innerHTML || '';
      await updateContent(html);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Insert the document's media at the current cursor position
  const isMediaDoc = doc?.sourceType && ['image', 'audio', 'video'].includes(doc.sourceType);

  const insertMedia = useCallback(() => {
    if (!doc?.mediaUrl || !editorRef.current) return;
    const url = doc.mediaUrl;
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    let html = '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      html = `<img src="${url}" alt="${doc.originalFileName}" style="max-width:100%;border-radius:8px;display:block;margin:8px 0;" />`;
    } else if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
      html = `<video src="${url}" controls style="max-width:100%;border-radius:8px;display:block;margin:8px 0;"></video>`;
    } else if (['mp3', 'm4a'].includes(ext)) {
      html = `<audio src="${url}" controls style="width:100%;display:block;margin:8px 0;"></audio>`;
    }
    if (html) {
      editorRef.current.focus();
      // eslint-disable-next-line deprecation/deprecation
      window.document.execCommand('insertHTML', false, html);
      setIsDirty(true);
    }
  }, [doc]);

  // Apply a humanization suggestion by replacing the original text in the editor
  const handleApplySuggestion = useCallback((original: string, replacement: string) => {
    if (!editorRef.current) return;
    const beforeText = editorRef.current.innerText || '';
    const html = editorRef.current.innerHTML;
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updated = html.replace(new RegExp(escaped, 'i'), replacement);
    if (updated !== html) {
      editorRef.current.innerHTML = updated;
      setIsDirty(true);
      const afterText = editorRef.current.innerText || '';
      setCompareSnapshot({
        title: 'Humanize Suggestion Applied',
        before: beforeText,
        after: afterText,
      });
      toast.success('Suggestion applied!');
    } else {
      navigator.clipboard.writeText(replacement).then(() =>
        toast.success('Could not locate text — suggestion copied to clipboard'),
      );
    }
  }, []);

  // One-click grammar correction
  const handleApplyGrammarFix = useCallback((issue: GrammarIssue, replacement: string) => {
    if (!editorRef.current) return;
    const beforeText = editorRef.current.innerText || '';

    const appliedByOffset = Number.isInteger(issue.offset) && Number.isInteger(issue.length)
      ? replaceByOffset(editorRef.current, issue.offset, issue.length, replacement)
      : false;

    if (appliedByOffset) {
      setIsDirty(true);
      const text = editorRef.current.innerText;
      setWordCount(countWords(text));
      setEditorLineCount(countLines(text));
      setCompareSnapshot({
        title: 'Grammar Fix Applied',
        before: beforeText,
        after: text,
      });
      toast.success('Grammar fix applied');
      return;
    }

    // Fallback: try replacing the first occurrence from issue context snippet.
    const contextText = (issue.context || '').replace(/^\.\.\.|\.\.\.$/g, '').trim();
    if (contextText) {
      const html = editorRef.current.innerHTML;
      const escaped = contextText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const updated = html.replace(new RegExp(escaped, 'i'), replacement);
      if (updated !== html) {
        editorRef.current.innerHTML = updated;
        setIsDirty(true);
        const text = editorRef.current.innerText;
        setWordCount(countWords(text));
        setEditorLineCount(countLines(text));
        setCompareSnapshot({
          title: 'Grammar Fix Applied',
          before: beforeText,
          after: text,
        });
        toast.success('Grammar fix applied');
        return;
      }
    }

    navigator.clipboard.writeText(replacement).then(() => {
      toast.success('Could not auto-apply — replacement copied to clipboard');
    });
  }, []);

  const handleHumanizeAction = useCallback(async () => {
    const beforeText = editorRef.current?.innerText || doc?.cleanedText || '';
    const result = await humanize();
    if (!result || !editorRef.current) return;

    editorRef.current.innerHTML = toEditorHtml(result.cleanedText || '');
    const afterText = editorRef.current.innerText || '';
    setWordCount(countWords(afterText));
    setEditorLineCount(countLines(afterText));
    setIsDirty(false);
    setCompareSnapshot({
      title: 'Humanize Completed',
      before: beforeText,
      after: afterText,
    });
  }, [doc?.cleanedText, humanize]);

  const getIssueLineNumber = useCallback((issue: GrammarIssue) => {
    if (!Number.isInteger(issue.offset)) return null;
    const sourceText = editorRef.current?.innerText || doc?.cleanedText || '';
    if (!sourceText) return null;

    const safeOffset = Math.max(0, Math.min(issue.offset, sourceText.length));
    let line = 1;
    for (let i = 0; i < safeOffset; i++) {
      if (sourceText.charCodeAt(i) === 10) line += 1;
    }
    return line;
  }, [doc?.cleanedText]);

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  /* ── Error ── */
  if (error || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-medium">{error || 'Document not found'}</p>
        <Link href="/dashboard" className="btn-secondary">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Editor toolbar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/dashboard" className="btn-ghost p-2">
            <ChevronLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
              {doc.originalFileName}
            </p>
            <p className="text-xs text-slate-400">{formatWordCount(wordCount)}</p>
          </div>

          {/* Tabs (mobile) */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-zinc-800 md:hidden">
            <button
              onClick={() => setActiveTab('edit')}
              className={cn('rounded px-3 py-1 text-xs font-medium transition-all',
                activeTab === 'edit' ? 'bg-brand-600 text-white' : 'text-slate-500')}
            >
              Edit
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={cn('rounded px-3 py-1 text-xs font-medium transition-all',
                activeTab === 'analysis' ? 'bg-brand-600 text-white' : 'text-slate-500')}
            >
              Analysis
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ShareMenu
              title={doc.originalFileName}
              buttonClassName="py-1.5 px-3"
            />
            <button
              onClick={insertImageByUrl}
              className="btn-secondary py-1.5 px-3 text-xs"
              title="Insert image by URL"
            >
              <ImageIcon className="h-3.5 w-3.5" /> Insert Image
            </button>
            {isDirty && (
              <button onClick={handleSave} disabled={isSaving} className="btn-primary py-1.5 px-3 text-xs">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            )}
            <button
              onClick={analyze}
              disabled={isAnalyzing}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              {isAnalyzing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <BarChart2 className="h-3.5 w-3.5" />}
              {isAnalyzing ? 'Analysing…' : 'Analyse'}
            </button>
            <button
              onClick={openMediaLib}
              className="btn-secondary py-1.5 px-3 text-xs"
              title="Browse and insert uploaded media"
            >
              <Library className="h-3.5 w-3.5" /> Media
            </button>
            <Link href={`/teleprompter/${documentId}`} className="btn-secondary py-1.5 px-3 text-xs">
              <Tv2 className="h-3.5 w-3.5" /> Teleprompter
            </Link>
            <Link href={`/export/${documentId}`} className="btn-secondary py-1.5 px-3 text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> Export
            </Link>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="animate-page-in mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        {/* Left – Editor */}
        <div className={cn('flex flex-1 flex-col', activeTab === 'analysis' && 'hidden md:flex')}>
          <div className="card flex flex-1 flex-col p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <FileText className="h-4 w-4" /> Document Editor
              </div>
              <div className="flex items-center gap-2">
                {isMediaDoc && doc?.mediaUrl && (
                  <button
                    onClick={insertMedia}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                    title="Insert media at cursor position"
                  >
                    {doc.sourceType === 'image' && <ImageIcon className="h-3.5 w-3.5" />}
                    {doc.sourceType === 'video' && <Video className="h-3.5 w-3.5" />}
                    {doc.sourceType === 'audio' && <Music className="h-3.5 w-3.5" />}
                    Insert Media
                  </button>
                )}
                {selectedImageEl && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800">
                    <span className="text-[10px] font-semibold text-slate-500">Image</span>
                    <button
                      onClick={() => applyImageFormatting({ align: 'left' })}
                      className={cn('rounded p-1', imageAlign === 'left' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700')}
                      title="Align left"
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => applyImageFormatting({ align: 'center' })}
                      className={cn('rounded p-1', imageAlign === 'center' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700')}
                      title="Align center"
                    >
                      <AlignCenter className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => applyImageFormatting({ align: 'right' })}
                      className={cn('rounded p-1', imageAlign === 'right' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700')}
                      title="Align right"
                    >
                      <AlignRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => applyImageFormatting({ wrap: !imageWrap })}
                      className={cn('rounded p-1', imageWrap ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700')}
                      title="Toggle text wrapping (works with left/right align)"
                    >
                      <WrapText className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500">W</span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={imageWidthPct}
                        onChange={(e) => applyImageFormatting({ widthPct: Number.parseInt(e.target.value, 10) })}
                        className="h-1 w-20 accent-brand-600"
                      />
                      <span className="w-8 text-right text-[10px] text-slate-500">{imageWidthPct}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500">Pad</span>
                      <input
                        type="range"
                        min={0}
                        max={32}
                        step={1}
                        value={imagePaddingPx}
                        onChange={(e) => applyImageFormatting({ paddingPx: Number.parseInt(e.target.value, 10) })}
                        className="h-1 w-16 accent-brand-600"
                      />
                      <span className="w-7 text-right text-[10px] text-slate-500">{imagePaddingPx}px</span>
                    </div>
                  </div>
                )}
                {isDirty && (
                  <span className="text-xs text-amber-500">● Unsaved changes</span>
                )}
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden bg-white dark:bg-zinc-900">
              <div className="w-12 flex-shrink-0 border-r border-slate-100 bg-slate-50/80 text-[11px] text-slate-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                <div className="h-full overflow-hidden">
                  <div className="py-8" style={{ transform: `translateY(-${editorScrollTop}px)` }}>
                    {Array.from({ length: editorLineCount }).map((_, i) => (
                      <div
                        key={`ln-${i}`}
                        className="h-7 pr-2 text-right font-mono leading-7"
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onClick={handleEditorClick}
                onScroll={handleEditorScroll}
                className={cn(
                  'flex-1 overflow-y-auto bg-white p-8 focus:outline-none dark:bg-zinc-900',
                  // base text
                  'text-base leading-7 text-slate-800 dark:text-zinc-100',
                  // headings
                  '[&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:text-slate-900 [&_h1]:dark:text-white [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:leading-tight',
                  '[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:dark:text-zinc-100 [&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:leading-snug',
                  '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:dark:text-zinc-200 [&_h3]:mt-6 [&_h3]:mb-2',
                  '[&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-slate-700 [&_h4]:dark:text-zinc-300 [&_h4]:mt-5 [&_h4]:mb-2',
                  // paragraph
                  '[&_p]:mb-4 [&_p]:leading-7',
                  // lists
                  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:space-y-1.5',
                  '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:space-y-1.5',
                  '[&_li]:leading-7 [&_li]:text-slate-700 [&_li]:dark:text-zinc-300',
                  // inline
                  '[&_strong]:font-bold [&_b]:font-bold',
                  '[&_em]:italic [&_i]:italic',
                  '[&_u]:underline [&_u]:underline-offset-2',
                  '[&_a]:text-indigo-600 [&_a]:dark:text-indigo-400 [&_a]:underline [&_a]:underline-offset-2',
                  // blockquote
                  '[&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:dark:border-indigo-600 [&_blockquote]:pl-4 [&_blockquote]:my-5 [&_blockquote]:italic [&_blockquote]:text-slate-500 [&_blockquote]:dark:text-zinc-400',
                  // code
                  '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:dark:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:font-mono [&_code]:text-rose-600 [&_code]:dark:text-rose-400',
                  '[&_pre]:my-4 [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:overflow-x-auto',
                  '[&_pre_code]:bg-transparent [&_pre_code]:text-slate-100 [&_pre_code]:dark:text-slate-200 [&_pre_code]:p-0',
                  // hr
                  '[&_hr]:my-8 [&_hr]:border-slate-200 [&_hr]:dark:border-zinc-700',
                  // media
                  '[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4',
                  '[&_video]:max-w-full [&_video]:rounded-lg [&_video]:my-4',
                  '[&_audio]:w-full [&_audio]:my-4',
                  '[&_figure]:my-6',
                  '[&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-slate-400',
                )}
                style={{ minHeight: 'calc(100vh - 280px)' }}
                spellCheck
              />
            </div>
          </div>
        </div>

        {/* Right – Analysis */}
        <div className={cn(
          'w-full md:w-96 flex-shrink-0',
          activeTab === 'edit' && 'hidden md:block',
        )}>
          <AnalysisPanel
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            isHumanizing={isHumanizing}
            onAnalyze={analyze}
            onHumanize={canUseHumanizeText ? handleHumanizeAction : undefined}
            onSave={isDirty ? handleSave : undefined}
            documentStatus={doc.status}
            onApplySuggestion={handleApplySuggestion}
            onApplyGrammarFix={canUseGrammarFix ? handleApplyGrammarFix : undefined}
            getGrammarIssueLine={getIssueLineNumber}
          />
        </div>
      </div>

      {compareSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setCompareSnapshot(null)}
          />
          <div className="relative z-10 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                  {compareSnapshot.title}
                </h3>
              </div>
              <button
                onClick={() => setCompareSnapshot(null)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid max-h-[70vh] grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
              <div className="border-b border-slate-200 dark:border-zinc-800 md:border-b-0 md:border-r">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">Before</div>
                <div className="max-h-[62vh] overflow-auto font-mono text-xs">
                  {compareRows.map((row, idx) => (
                    <div key={`l-${idx}`} className={cn('flex border-b border-slate-100 dark:border-zinc-800', row.changed ? 'bg-red-50/60 dark:bg-red-950/20' : 'bg-transparent')}>
                      <span className="w-10 flex-shrink-0 select-none border-r border-slate-100 px-2 py-1 text-right text-[10px] text-slate-400 dark:border-zinc-800">{idx + 1}</span>
                      <span className="flex-1 whitespace-pre-wrap px-2 py-1 text-slate-700 dark:text-zinc-200">
                        {row.changed ? renderInlineWordDiff(row.left, row.right, 'left') : (row.left || ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">After</div>
                <div className="max-h-[62vh] overflow-auto font-mono text-xs">
                  {compareRows.map((row, idx) => (
                    <div key={`r-${idx}`} className={cn('flex border-b border-slate-100 dark:border-zinc-800', row.changed ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : 'bg-transparent')}>
                      <span className="w-10 flex-shrink-0 select-none border-r border-slate-100 px-2 py-1 text-right text-[10px] text-slate-400 dark:border-zinc-800">{idx + 1}</span>
                      <span className="flex-1 whitespace-pre-wrap px-2 py-1 text-slate-700 dark:text-zinc-200">
                        {row.changed ? renderInlineWordDiff(row.left, row.right, 'right') : (row.right || ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Library slide-out panel */}
      {showMediaLib && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMediaLib(false)}
          />

          {/* Panel */}
          <div className="relative z-10 flex w-80 flex-col bg-white dark:bg-zinc-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Media Library</h2>
              </div>
              <button
                onClick={() => setShowMediaLib(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="px-4 py-2 text-[11px] text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-zinc-800">
              Click an item to insert it at the cursor
            </p>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {mediaLibLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : mediaItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                  <ImageIcon className="h-8 w-8 text-slate-200 dark:text-zinc-700" />
                  <p className="text-sm text-slate-400 dark:text-zinc-500">No media uploaded yet</p>
                  <p className="text-[11px] text-slate-300 dark:text-zinc-600">Upload images, videos or audio from the upload page</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {mediaItems.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => insertMediaFromLib(item)}
                      className="group relative rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors text-left"
                    >
                      {/* Thumbnail */}
                      <div className="h-20 bg-slate-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                        {item.sourceType === 'image' && item.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.mediaUrl} alt={item.originalFileName} className="w-full h-full object-cover" />
                        ) : item.sourceType === 'video' && item.mediaUrl ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video src={item.mediaUrl} className="w-full h-full object-cover" muted preload="metadata" />
                        ) : (
                          <Music className="h-8 w-8 text-slate-300 dark:text-zinc-600" />
                        )}
                      </div>

                      {/* Label */}
                      <div className="px-1.5 py-1.5">
                        <p className="text-[10px] font-medium text-slate-700 dark:text-zinc-300 truncate">{item.originalFileName}</p>
                      </div>

                      {/* Insert overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/0 group-hover:bg-indigo-500/15 transition-colors opacity-0 group-hover:opacity-100">
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-white/90 dark:bg-zinc-800/90">
                          Insert
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

