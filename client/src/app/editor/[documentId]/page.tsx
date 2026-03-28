'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AnalysisPanel from '@/components/AnalysisPanel';
import ShareMenu from '@/components/ShareMenu';
import { HumanizeRewriteModal } from '@/components/HumanizeRewriteModal';
import { useDocument } from '@/hooks/useDocument';
import { useSubscription } from '@/hooks/useSubscription';
import {
  Save, BarChart2, Loader2, ExternalLink,
  ChevronLeft, FileText, AlertCircle,
  Image as ImageIcon, Video, Music, X, Library, AlignLeft, AlignCenter, AlignRight, WrapText, GitCompare,
  Bold, Italic, Underline, List, ListOrdered, Link2, Table2, Upload, Download, History, Eye, EyeOff, MoreHorizontal, PanelRightClose,
} from 'lucide-react';
import { formatWordCount, cn } from '@/lib/utils';
import { documentApi } from '@/lib/api';
import { DocumentSummary, GrammarIssue } from '@/types';
import toast from 'react-hot-toast';
import { exportFile, importFileToHtml, toMarkdown, uid } from '@/components/problem-editor/utils';
import { normalizeEditorHtml, htmlToPlainText } from '@/editor/sanitize';
import { SavedSelection, restoreSelection as restoreEditorSelection, saveSelection as saveEditorSelection } from '@/editor/selection';
import { applyCommand as applyExecCommand } from '@/editor/commands';
import { replaceInBlocks } from '@/editor/aiReplace';
import { applyImageWrapperLayout, buildImageWrapperHtml, ensureImageWrappers } from '@/editor/imageHandler';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

interface LocalVersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  html: string;
}

interface LocalTestCase {
  id: string;
  input: string;
  output: string;
  explanation: string;
}

function grammarIssueKey(issue: {
  rule?: { id?: string };
  offset?: number;
  length?: number;
  message?: string;
}): string {
  return `${issue.rule?.id || 'rule'}|${issue.offset ?? -1}|${issue.length ?? -1}|${issue.message || ''}`;
}

// ������ Convert plain text ��� editor HTML ������������������������������������������������������������������������������������������������������������������������
// Documents stored as plain text (newline-separated) need to be wrapped in
// proper block elements so the typography styles render correctly.
function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeHyperlinkUrl(input: string): string {
  const value = input.trim();
  if (!value) return '';
  if (/^(https?:|mailto:|tel:|\/)/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return `https://${value}`;
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
  // Already has block-level HTML ��� use as-is
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
    // Check for bullet lists from common editors (dash, star, bullet glyphs).
    if (lines.every((l) => /^(?:[-*•●▪◦‣⁃–—])\s+/.test(l))) {
      const items = lines.map((l) => `<li>${escHtml(l.replace(/^(?:[-*•●▪◦‣⁃–—])\s+/, ''))}</li>`).join('');
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

function wrapMediaHtml(url: string, alt: string, options?: { align?: 'left' | 'center' | 'right'; width?: number; padding?: number }): string {
  return buildImageWrapperHtml(url, alt, options);
}

function sanitizeAndNormalizeEditorHtml(input: string): string {
  return normalizeEditorHtml(input);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countVisualLines(el: HTMLElement): number {
  const styles = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const safeLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 28;
  const contentHeight = Math.max(0, el.scrollHeight - paddingTop - paddingBottom);
  return Math.max(1, Math.ceil(contentHeight / safeLineHeight));
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

function getDropRangeFromPoint(x: number, y: number): Range | null {
  const doc = window.document as Document & {
    caretPositionFromPoint?: (xPos: number, yPos: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (xPos: number, yPos: number) => Range | null;
  };

  if (typeof doc.caretPositionFromPoint === 'function') {
    const caret = doc.caretPositionFromPoint(x, y);
    if (!caret) return null;
    const range = window.document.createRange();
    range.setStart(caret.offsetNode, caret.offset);
    range.collapse(true);
    return range;
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y);
  }

  return null;
}

export default function EditorPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;

  const { document: doc, isLoading, isAnalyzing, isHumanizing, error, analysis, analyze, humanize, updateContent } =
    useDocument(documentId);
  const {
    canUseGrammarFix,
    canUseHumanizeText,
    isPremium,
    aiUsed,
    aiLimit,
    aiBlocked,
  } = useSubscription();
  const goPremium = useCallback(() => {
    window.location.href = '/pricing';
  }, []);

  // ������ contentEditable ref & init ���������������������������������������������������������������������������������������������������������������������������������
  const editorRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<SavedSelection | null>(null);
  const inputDebounceRef = useRef<number | null>(null);
  const isApplyingStateRef = useRef(false);
  const lastLoadedSignatureRef = useRef<string>('');
  const [editorHtml, setEditorHtml] = useState<string>('<p><br></p>');
  const [wordCount, setWordCount] = useState(0);
  const [editorLineCount, setEditorLineCount] = useState(1);
  const [editorLineHeight, setEditorLineHeight] = useState(28);
  const [activeVisualLine, setActiveVisualLine] = useState(1);
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [isDirty, setIsDirty]     = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'analysis'>('edit');
  const [rightPanelMode, setRightPanelMode] = useState<'analysis' | 'preview'>('analysis');
  const [isAnalysisCollapsed, setIsAnalysisCollapsed] = useState(false);
  const [compareSnapshot, setCompareSnapshot] = useState<{
    title: string;
    before: string;
    after: string;
  } | null>(null);
  const [showRewriteModal, setShowRewriteModal] = useState(false);
  const [rewriteData, setRewriteData] = useState<Array<{ original: string; replacement: string }>>([]);
  const [versions, setVersions] = useState<LocalVersionSnapshot[]>([]);
  const [metadataDifficulty, setMetadataDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [metadataTags, setMetadataTags] = useState('DP, Graph');
  const [metadataTimeLimit, setMetadataTimeLimit] = useState('1 sec');
  const [metadataMemoryLimit, setMetadataMemoryLimit] = useState('256 MB');
  const [editorialNotes, setEditorialNotes] = useState('');
  const [assets, setAssets] = useState<Array<{ id: string; name: string; size: number }>>([]);
  const [bottomTab, setBottomTab] = useState<'testcases' | 'metadata' | 'editorial' | 'assets'>('testcases');
  const [pendingFixedGrammarIssueKeys, setPendingFixedGrammarIssueKeys] = useState<string[]>([]);
  const [testCases, setTestCases] = useState<LocalTestCase[]>([
    { id: uid('tc'), input: '', output: '', explanation: '' },
  ]);
  const importInputRef = useRef<HTMLInputElement>(null);

  // ������ Image formatting controls ������������������������������������������������������������������������������������������������������������������������������������
  const [selectedImageEl, setSelectedImageEl] = useState<HTMLImageElement | null>(null);
  const [imageAlign, setImageAlign] = useState<'left' | 'center' | 'right'>('center');
  const [imageWrap, setImageWrap] = useState(false);
  const [imageWidthPct, setImageWidthPct] = useState(70);
  const [imagePaddingPx, setImagePaddingPx] = useState(8);
  const draggedImageRef = useRef<HTMLImageElement | null>(null);
  const resizeStateRef = useRef<{
    img: HTMLImageElement;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    aspectRatio: number;
    maxWidth: number;
    maxHeight: number;
  } | null>(null);
  const compareRows = compareSnapshot
    ? buildSideBySideRows(compareSnapshot.before, compareSnapshot.after)
    : [];

  const saveSelectionRange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    selectionRangeRef.current = saveEditorSelection(el);
  }, []);

  const restoreSelectionRange = useCallback(() => {
    const el = editorRef.current;
    const saved = selectionRangeRef.current;
    if (!el) return;
    restoreEditorSelection(el, saved);
  }, []);

  const commitEditorHtml = useCallback((nextRawHtml: string, options?: { restoreSelection?: boolean }) => {
    const el = editorRef.current;
    if (!el) return;

    const nextClean = sanitizeAndNormalizeEditorHtml(nextRawHtml);
    setEditorHtml(nextClean);

    if (el.innerHTML !== nextClean) {
      isApplyingStateRef.current = true;
      el.innerHTML = nextClean;
      isApplyingStateRef.current = false;
      if (options?.restoreSelection) {
        restoreSelectionRange();
      }
    }
  }, [restoreSelectionRange]);

  const prepareEditorImages = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    ensureImageWrappers(editor);
    editor.querySelectorAll('img').forEach((img) => {
      img.classList.add('editor-image-draggable');
      img.addEventListener('error', () => {
        const parent = img.closest('.image-wrapper');
        if (parent) parent.remove();
      }, { once: true });
    });
  }, []);

  const parsePxStyle = useCallback((value: string | undefined, fallback = 0): number => {
    if (!value || !value.endsWith('px')) return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }, []);

  const clearImageSelection = useCallback(() => {
    if (selectedImageEl) selectedImageEl.classList.remove('editor-image-selected');
    setSelectedImageEl(null);
  }, [selectedImageEl]);

  const syncImageControlsFromElement = useCallback((img: HTMLImageElement) => {
    const widthRaw = img.style.width;
    let widthPct = 70;
    if (widthRaw.endsWith('%')) {
      widthPct = Number.parseInt(widthRaw, 10);
    } else if (widthRaw.endsWith('px') && editorRef.current) {
      const px = Number.parseFloat(widthRaw);
      const parentWidth = editorRef.current.clientWidth || 1;
      widthPct = Math.round((px / parentWidth) * 100);
    }
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

    const wrapper = img.closest('.image-wrapper') as HTMLDivElement | null;
    if (!wrapper) return;

    applyImageWrapperLayout(img, {
      align,
      width: Math.max(20, Math.min(100, widthPct)),
      padding: Math.max(0, Math.min(32, paddingPx)),
    });

    if (wrap && (align === 'left' || align === 'right')) {
      wrapper.style.float = align;
      wrapper.style.display = 'block';
      wrapper.style.marginTop = `${paddingPx}px`;
      wrapper.style.marginBottom = `${paddingPx}px`;
      wrapper.style.marginLeft = align === 'left' ? '0' : `${paddingPx}px`;
      wrapper.style.marginRight = align === 'right' ? '0' : `${paddingPx}px`;
    } else {
      wrapper.style.float = 'none';
      wrapper.style.display = 'block';
      wrapper.style.marginTop = `${paddingPx}px`;
      wrapper.style.marginBottom = `${paddingPx}px`;
      if (align === 'left') {
        wrapper.style.marginLeft = '0';
        wrapper.style.marginRight = 'auto';
      } else if (align === 'right') {
        wrapper.style.marginLeft = 'auto';
        wrapper.style.marginRight = '0';
      } else {
        wrapper.style.marginLeft = 'auto';
        wrapper.style.marginRight = 'auto';
      }
    }

    wrapper.style.width = `${Math.max(20, Math.min(100, widthPct))}%`;

    setImageAlign(align);
    setImageWrap(wrap && (align === 'left' || align === 'right'));
    setImageWidthPct(Math.max(20, Math.min(100, widthPct)));
    setImagePaddingPx(Math.max(0, Math.min(32, paddingPx)));
    setIsDirty(true);
    commitEditorHtml(editorRef.current?.innerHTML || '<p><br></p>', { restoreSelection: true });
  }, [commitEditorHtml, imageAlign, imagePaddingPx, imageWidthPct, imageWrap, selectedImageEl]);

  // ������ Media library ������������������������������������������������������������������������������������������������������������������������������������������������������������������������
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
      html = wrapMediaHtml(url, item.originalFileName, { align: 'center', width: 70, padding: 8 });
    } else if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
      html = `<video src="${url}" controls style="max-width:100%;border-radius:8px;display:block;margin:8px 0;"></video>`;
    } else if (['mp3', 'm4a'].includes(ext)) {
      html = `<audio src="${url}" controls style="width:100%;display:block;margin:8px 0;"></audio>`;
    }
    if (html) {
      editorRef.current.focus();
      applyExecCommand({
        container: editorRef.current,
        command: 'insertHTML',
        value: html,
        before: saveSelectionRange,
        after: restoreSelectionRange,
      });
      prepareEditorImages();
      setIsDirty(true);
      commitEditorHtml(editorRef.current?.innerHTML || '<p><br></p>', { restoreSelection: true });
      setShowMediaLib(false);
    }
  }, [commitEditorHtml, prepareEditorImages, restoreSelectionRange, saveSelectionRange]);

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
    applyExecCommand({
      container: editorRef.current,
      command: 'insertHTML',
      value: wrapMediaHtml(safe, 'Inserted image'),
      before: saveSelectionRange,
      after: restoreSelectionRange,
    });
    prepareEditorImages();
    setIsDirty(true);
    commitEditorHtml(editorRef.current?.innerHTML || '<p><br></p>', { restoreSelection: true });
  }, [commitEditorHtml, prepareEditorImages, restoreSelectionRange, saveSelectionRange]);

  // Hydrate editor when a new/updated document arrives; do not overwrite active edits.
  const recalcEditorMetrics = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || '';
    const styles = window.getComputedStyle(el);
    const parsedLineHeight = Number.parseFloat(styles.lineHeight);
    const safeLineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
      ? parsedLineHeight
      : 28;
    const nextLineCount = countVisualLines(el);
    setWordCount(countWords(text));
    setEditorLineHeight(safeLineHeight);
    setEditorLineCount(nextLineCount);
    setActiveVisualLine((prev) => Math.max(1, Math.min(nextLineCount, prev)));
  }, []);

  const updateActiveLineFromSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    if (!selection.anchorNode || !el.contains(selection.anchorNode)) return;

    const range = selection.getRangeAt(0);
    const rangeRect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    const editorRect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const topInside = rangeRect.top - editorRect.top + el.scrollTop - paddingTop;
    const line = Math.floor(topInside / editorLineHeight) + 1;
    const bounded = Math.max(1, Math.min(editorLineCount, line));
    setActiveVisualLine(bounded);
  }, [editorLineCount, editorLineHeight]);

  useEffect(() => {
    if (!doc || !editorRef.current) return;
    const signature = `${doc._id}:${doc.updatedAt}:${doc.editorHtml?.length ?? 0}:${doc.cleanedText?.length ?? 0}`;
    if (signature === lastLoadedSignatureRef.current) return;

    const editorText = editorRef.current.innerText.trim();
    const canHydrate = !isDirty || editorText.length === 0;
    if (!canHydrate) return;

    const hydratedHtml = sanitizeAndNormalizeEditorHtml(doc.editorHtml || toEditorHtml(doc.cleanedText || ''));
    editorRef.current.innerHTML = hydratedHtml;
    setEditorHtml(hydratedHtml);
    prepareEditorImages();
    recalcEditorMetrics();
    editorRef.current.scrollTop = 0;
    setEditorScrollTop(0);
    setActiveVisualLine(1);
    if (gutterRef.current) gutterRef.current.scrollTop = 0;
    lastLoadedSignatureRef.current = signature;
  }, [doc, isDirty, prepareEditorImages, recalcEditorMetrics]);

  useEffect(() => {
    return () => {
      if (selectedImageEl) selectedImageEl.classList.remove('editor-image-selected');
    };
  }, [selectedImageEl]);

  const handleInput = useCallback(() => {
    if (isApplyingStateRef.current) return;
    saveSelectionRange();
    recalcEditorMetrics();
    updateActiveLineFromSelection();
    if (inputDebounceRef.current) {
      window.clearTimeout(inputDebounceRef.current);
    }
    inputDebounceRef.current = window.setTimeout(() => {
      const html = editorRef.current?.innerHTML || '<p><br></p>';
      commitEditorHtml(html);
    }, 300);
    if (!isDirty) setIsDirty(true);
  }, [commitEditorHtml, isDirty, recalcEditorMetrics, saveSelectionRange, updateActiveLineFromSelection]);

  const handleEditorScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    setEditorScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t && t.tagName === 'A') {
      const href = (t as HTMLAnchorElement).getAttribute('href') || '';
      const shouldOpen = e.metaKey || e.ctrlKey;
      if (shouldOpen && href) {
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
    }

    if (t && t.tagName === 'IMG') {
      saveSelectionRange();
      const img = t as HTMLImageElement;
      if (selectedImageEl && selectedImageEl !== img) selectedImageEl.classList.remove('editor-image-selected');
      img.classList.add('editor-image-selected');
      setSelectedImageEl(img);
      syncImageControlsFromElement(img);
      updateActiveLineFromSelection();
      return;
    }
    clearImageSelection();
    updateActiveLineFromSelection();
  }, [clearImageSelection, saveSelectionRange, selectedImageEl, syncImageControlsFromElement, updateActiveLineFromSelection]);

  const stopImageResize = useCallback(() => {
    resizeStateRef.current = null;
    window.document.body.style.userSelect = '';
  }, []);

  const handleImageResizeMove = useCallback((event: MouseEvent) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;

    let nextWidth = Math.max(80, Math.min(state.maxWidth, state.startWidth + deltaX));
    let nextHeight = Math.max(48, Math.min(state.maxHeight, state.startHeight + deltaY));

    if (event.shiftKey && state.aspectRatio > 0) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        nextHeight = nextWidth / state.aspectRatio;
      } else {
        nextWidth = nextHeight * state.aspectRatio;
      }
      nextWidth = Math.max(80, Math.min(state.maxWidth, nextWidth));
      nextHeight = Math.max(48, Math.min(state.maxHeight, nextHeight));
    }

    const wrapper = state.img.closest('.image-wrapper') as HTMLDivElement | null;
    if (wrapper && editorRef.current) {
      const parentWidth = editorRef.current.clientWidth || 1;
      const widthPct = Math.max(20, Math.min(100, Math.round((nextWidth / parentWidth) * 100)));
      wrapper.dataset.width = String(widthPct);
      wrapper.style.width = `${widthPct}%`;
    }

    state.img.style.width = '100%';
    state.img.style.height = `${Math.round(nextHeight)}px`;
    state.img.style.maxWidth = '100%';
    syncImageControlsFromElement(state.img);
    setIsDirty(true);
  }, [syncImageControlsFromElement]);

  const handleImageResizeEnd = useCallback(() => {
    window.removeEventListener('mousemove', handleImageResizeMove);
    window.removeEventListener('mouseup', handleImageResizeEnd);
    stopImageResize();
  }, [handleImageResizeMove, stopImageResize]);

  const handleEditorMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target || target.tagName !== 'IMG') return;

    const img = target as HTMLImageElement;
    const rect = img.getBoundingClientRect();
    const handleSize = 16;
    const overResizeHandle = e.clientX >= rect.right - handleSize && e.clientY >= rect.bottom - handleSize;
    if (!overResizeHandle) return;

    e.preventDefault();
    e.stopPropagation();

    const editorWidth = editorRef.current?.clientWidth ?? rect.width;
    const editorHeight = editorRef.current?.clientHeight ?? rect.height;
    resizeStateRef.current = {
      img,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      aspectRatio: rect.height > 0 ? rect.width / rect.height : 1,
      maxWidth: Math.max(80, editorWidth - 12),
      maxHeight: Math.max(80, editorHeight * 2),
    };

    window.document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleImageResizeMove);
    window.addEventListener('mouseup', handleImageResizeEnd);
  }, [handleImageResizeEnd, handleImageResizeMove]);

  const handleEditorDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target || target.tagName !== 'IMG') return;

    const img = target as HTMLImageElement;
    draggedImageRef.current = img;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', img.src || 'image');
  }, []);

  const handleEditorDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedImageRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleEditorDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const dragged = draggedImageRef.current;
    if (!dragged || !editorRef.current) return;
    e.preventDefault();

    const range = getDropRangeFromPoint(e.clientX, e.clientY);
    if (!range || !editorRef.current.contains(range.startContainer)) {
      draggedImageRef.current = null;
      return;
    }

    range.insertNode(dragged);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const after = window.document.createRange();
      after.setStartAfter(dragged);
      after.collapse(true);
      selection.addRange(after);
    }
    draggedImageRef.current = null;
    setIsDirty(true);
    commitEditorHtml(editorRef.current?.innerHTML || '<p><br></p>', { restoreSelection: true });
  }, [commitEditorHtml]);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const href = window.prompt('Paste link URL');
      if (!href || !editorRef.current) return;
      const safeHref = normalizeHyperlinkUrl(href);
      if (!safeHref) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() || '';

      editorRef.current.focus();
      if (selectedText) {
        applyExecCommand({
          container: editorRef.current,
          command: 'createLink',
          value: safeHref,
          before: saveSelectionRange,
          after: restoreSelectionRange,
        });
      } else {
        const label = window.prompt('Link text', safeHref) || safeHref;
        applyExecCommand({
          container: editorRef.current,
          command: 'insertHTML',
          value: `<a href="${safeHref.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${label.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`,
          before: saveSelectionRange,
          after: restoreSelectionRange,
        });
      }
      setIsDirty(true);
      recalcEditorMetrics();
      return;
    }

    const img = selectedImageEl;
    if (!img) return;

    const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (!isArrow) return;

    e.preventDefault();
    e.stopPropagation();

    const step = e.shiftKey ? 5 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

    const wrapper = img.closest('.image-wrapper') as HTMLDivElement | null;
    if (!wrapper) return;
    wrapper.style.position = 'relative';
    const currentLeft = parsePxStyle(wrapper.style.left, 0);
    const currentTop = parsePxStyle(wrapper.style.top, 0);
    wrapper.style.left = `${Math.round(currentLeft + dx)}px`;
    wrapper.style.top = `${Math.round(currentTop + dy)}px`;
    setIsDirty(true);
    commitEditorHtml(editorRef.current?.innerHTML || '<p><br></p>', { restoreSelection: true });
  }, [commitEditorHtml, parsePxStyle, recalcEditorMetrics, restoreSelectionRange, saveSelectionRange, selectedImageEl]);

  useEffect(() => {
    return () => {
      if (inputDebounceRef.current) {
        window.clearTimeout(inputDebounceRef.current);
      }
      window.removeEventListener('mousemove', handleImageResizeMove);
      window.removeEventListener('mouseup', handleImageResizeEnd);
      stopImageResize();
    };
  }, [handleImageResizeEnd, handleImageResizeMove, stopImageResize]);

  const applyCommand = useCallback((command: string, value?: string) => {
    if (!editorRef.current) return;
    applyExecCommand({
      container: editorRef.current,
      command,
      value,
      before: saveSelectionRange,
      after: restoreSelectionRange,
    });
    prepareEditorImages();
    commitEditorHtml(editorRef.current.innerHTML, { restoreSelection: true });
    recalcEditorMetrics();
    updateActiveLineFromSelection();
    setIsDirty(true);
  }, [commitEditorHtml, prepareEditorImages, recalcEditorMetrics, restoreSelectionRange, saveSelectionRange, updateActiveLineFromSelection]);

  const handleEditorPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const plainText = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');

    // Keep browser default when clipboard is empty.
    if (!plainText && !html) return;

    e.preventDefault();

    const hasStructuredHtml = /<(p|h[1-6]|ul|ol|li|blockquote|pre|table|figure|div)\b/i.test(html || '');
    const normalizedHtml = hasStructuredHtml
      ? sanitizeAndNormalizeEditorHtml(html)
      : sanitizeAndNormalizeEditorHtml(toEditorHtml(plainText || ''));

    if (!normalizedHtml) return;

    applyCommand('insertHTML', normalizedHtml);
  }, [applyCommand]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const html = sanitizeAndNormalizeEditorHtml(editorHtml || editorRef.current?.innerHTML || '<p><br></p>');
      setEditorHtml(html);
      await updateContent(html, pendingFixedGrammarIssueKeys);
      setIsDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString());
      if (pendingFixedGrammarIssueKeys.length > 0) {
        setPendingFixedGrammarIssueKeys([]);
      }
    } finally {
      setIsSaving(false);
    }
  }, [editorHtml, pendingFixedGrammarIssueKeys, updateContent]);

  useEffect(() => {
    if (!isDirty || isSaving) return;
    const timer = window.setTimeout(() => {
      void handleSave();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [handleSave, isDirty, isSaving]);

  const snapshotVersion = useCallback((label = 'Draft Snapshot') => {
    if (!editorRef.current) return;
    setVersions((prev) => [
      {
        id: uid('version'),
        label,
        createdAt: new Date().toISOString(),
        html: editorHtml || editorRef.current?.innerHTML || '<p><br></p>',
      },
      ...prev,
    ]);
  }, [editorHtml]);

  const runEditorCommand = useCallback((command: string, value?: string) => {
    applyCommand(command, value);
  }, [applyCommand]);

  const insertSectionTemplate = useCallback(() => {
    if (!editorRef.current) return;
    const html = [
      '<h2>Problem Statement</h2><p></p>',
      '<h2>Input Format</h2><p></p>',
      '<h2>Output Format</h2><p></p>',
      '<h2>Constraints</h2><p></p>',
      '<h2>Sample Input</h2><p></p>',
      '<h2>Sample Output</h2><p></p>',
      '<h2>Explanation</h2><p></p>',
    ].join('');
    runEditorCommand('insertHTML', html);
  }, [runEditorCommand]);

  const insertTable = useCallback(() => {
    const rows = Math.max(2, Number.parseInt(window.prompt('Rows', '3') || '3', 10));
    const cols = Math.max(2, Number.parseInt(window.prompt('Columns', '3') || '3', 10));
    const bodyRows = Array.from({ length: rows })
      .map((_, r) => {
        const cells = Array.from({ length: cols })
          .map((__, c) => `<${r === 0 ? 'th' : 'td'} style="border:1px solid #cbd5e1;padding:6px;">${r === 0 ? `H${c + 1}` : ''}</${r === 0 ? 'th' : 'td'}>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    runEditorCommand('insertHTML', `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${bodyRows}</table><p></p>`);
  }, [runEditorCommand]);

  const insertHyperlink = useCallback(() => {
    const href = window.prompt('Paste link URL');
    if (!href) return;
    const safeHref = normalizeHyperlinkUrl(href);
    if (!safeHref) return;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';

    if (selectedText) {
      runEditorCommand('createLink', safeHref);
      return;
    }

    const label = window.prompt('Link text', safeHref) || safeHref;
    runEditorCommand(
      'insertHTML',
      `<a href="${safeHref.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${label.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`
    );
  }, [runEditorCommand]);

  const handleImport = useCallback(async (file: File) => {
    if (!editorRef.current) return;
    try {
      const html = await importFileToHtml(file);
      const cleaned = sanitizeAndNormalizeEditorHtml(html);
      editorRef.current.innerHTML = cleaned;
      setEditorHtml(cleaned);
      prepareEditorImages();
      setIsDirty(true);
      recalcEditorMetrics();
      toast.success('Imported content successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    }
  }, [prepareEditorImages, recalcEditorMetrics]);

  const handleImportImage = useCallback((file: File) => {
    if (!editorRef.current) return;
    const url = URL.createObjectURL(file);
    editorRef.current.focus();
    // eslint-disable-next-line deprecation/deprecation
    applyCommand('insertHTML', wrapMediaHtml(url, 'Imported image'));
    prepareEditorImages();
    setIsDirty(true);
    recalcEditorMetrics();
    toast.success('Image imported');
  }, [applyCommand, prepareEditorImages, recalcEditorMetrics]);

  const handleExportMarkdown = useCallback(() => {
    if (!editorRef.current) return;
    const filename = `${doc?.originalFileName || 'document'}.md`;
    exportFile(filename, toMarkdown(editorHtml || editorRef.current.innerHTML), 'text/markdown;charset=utf-8');
  }, [doc?.originalFileName, editorHtml]);

  const handleExportHtml = useCallback(() => {
    if (!editorRef.current) return;
    const filename = `${doc?.originalFileName || 'document'}.html`;
    exportFile(filename, editorHtml || editorRef.current.innerHTML, 'text/html;charset=utf-8');
  }, [doc?.originalFileName, editorHtml]);

  // Insert the document's media at the current cursor position
  const isMediaDoc = doc?.sourceType && ['image', 'audio', 'video'].includes(doc.sourceType);

  const insertMedia = useCallback(() => {
    if (!doc?.mediaUrl || !editorRef.current) return;
    const url = doc.mediaUrl;
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    let html = '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      html = wrapMediaHtml(url, doc.originalFileName, { align: 'center', width: 70, padding: 8 });
    } else if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) {
      html = `<video src="${url}" controls style="max-width:100%;border-radius:8px;display:block;margin:8px 0;"></video>`;
    } else if (['mp3', 'm4a'].includes(ext)) {
      html = `<audio src="${url}" controls style="width:100%;display:block;margin:8px 0;"></audio>`;
    }
    if (html) {
      editorRef.current.focus();
      applyCommand('insertHTML', html);
      prepareEditorImages();
      setIsDirty(true);
      commitEditorHtml(editorRef.current?.innerHTML || '<p><br></p>', { restoreSelection: true });
    }
  }, [applyCommand, commitEditorHtml, doc, prepareEditorImages]);

  // Apply a humanization suggestion by replacing the original text in the editor
  const handleApplySuggestion = useCallback((original: string, replacement: string) => {
    if (!editorRef.current) return;
    const beforeText = editorRef.current.innerText || '';
    const replaced = replaceInBlocks(editorRef.current.innerHTML, original, replacement);
    if (replaced.applied) {
      editorRef.current.innerHTML = replaced.html;
      commitEditorHtml(replaced.html, { restoreSelection: true });
      setIsDirty(true);
      const afterText = editorRef.current.innerText || '';
      setCompareSnapshot({
        title: 'Humanize Suggestion Applied',
        before: beforeText,
        after: afterText,
      });
      toast.success('Suggestion applied');
    } else {
      navigator.clipboard.writeText(replacement).then(() =>
        toast.success('Could not locate text ��� suggestion copied to clipboard'),
      );
    }
  }, [commitEditorHtml]);

  // One-click grammar correction
  const handleApplyGrammarFix = useCallback((issue: GrammarIssue, replacement: string) => {
    if (!editorRef.current) return;
    const beforeText = editorRef.current.innerText || '';

    const appliedByOffset = Number.isInteger(issue.offset) && Number.isInteger(issue.length)
      ? replaceByOffset(editorRef.current, issue.offset, issue.length, replacement)
      : false;

    if (appliedByOffset) {
      setIsDirty(true);
      recalcEditorMetrics();
      commitEditorHtml(editorRef.current.innerHTML, { restoreSelection: true });
      const key = grammarIssueKey(issue);
      setPendingFixedGrammarIssueKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      const text = editorRef.current.innerText;
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
      const replaced = replaceInBlocks(editorRef.current.innerHTML, contextText, replacement);
      if (replaced.applied) {
        editorRef.current.innerHTML = replaced.html;
        setIsDirty(true);
        recalcEditorMetrics();
        commitEditorHtml(replaced.html, { restoreSelection: true });
        const key = grammarIssueKey(issue);
        setPendingFixedGrammarIssueKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
        const text = editorRef.current.innerText;
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
      toast.success('Could not auto-apply ��� replacement copied to clipboard');
    });
  }, [commitEditorHtml, recalcEditorMetrics]);

  const handleHumanizeAction = useCallback(async () => {
    const beforeText = htmlToPlainText(editorHtml || editorRef.current?.innerHTML || doc?.cleanedText || '');
    const result = await humanize();
    if (!result || !editorRef.current) return;

    const nextHumanized = sanitizeAndNormalizeEditorHtml(toEditorHtml(result.cleanedText || ''));
    editorRef.current.innerHTML = nextHumanized;
    setEditorHtml(nextHumanized);
    const afterText = editorRef.current.innerText || '';
    setWordCount(countWords(afterText));
    recalcEditorMetrics();
    setIsDirty(false);
    setCompareSnapshot({
      title: 'Humanize Completed',
      before: beforeText,
      after: afterText,
    });
    
    // Show rewrite modal if appliedRewrites are available
    if (result.appliedRewrites && result.appliedRewrites.length > 0) {
      setRewriteData(result.appliedRewrites);
      setShowRewriteModal(true);
    }
  }, [doc?.cleanedText, editorHtml, humanize, recalcEditorMetrics]);

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

  /* ������ Loading ������ */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  /* ������ Error ������ */
  if (!doc) {
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
            <input
              ref={importInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportImage(file);
                e.currentTarget.value = '';
              }}
            />
            <ShareMenu
              title={doc.originalFileName}
              buttonClassName="py-1.5 px-3"
            />
            <details className="relative">
              <summary className="btn-secondary cursor-pointer list-none py-1.5 px-3 text-xs">
                <Upload className="h-3.5 w-3.5" /> Media & Import
              </summary>
              <div className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Upload className="h-3.5 w-3.5" /> Import Image
                </button>
                <button
                  onClick={insertImageByUrl}
                  className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Insert Image by URL
                </button>
                <button
                  onClick={openMediaLib}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Library className="h-3.5 w-3.5" /> Open Media Library
                </button>
              </div>
            </details>

            <details className="relative">
              <summary className="btn-secondary cursor-pointer list-none py-1.5 px-3 text-xs">
                <Download className="h-3.5 w-3.5" /> Export
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={handleExportMarkdown}
                  className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Download className="h-3.5 w-3.5" /> Export Markdown
                </button>
                <button
                  onClick={handleExportHtml}
                  className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Download className="h-3.5 w-3.5" /> Export HTML
                </button>
                <Link
                  href={`/export/${documentId}`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Advanced Export
                  <span className="ml-auto rounded bg-amber-500 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Premium</span>
                </Link>
              </div>
            </details>
            <details className="relative">
              <summary className="btn-secondary cursor-pointer list-none py-1.5 px-3 text-xs">
                <History className="h-3.5 w-3.5" /> Versions
              </summary>
              <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={() => snapshotVersion()}
                  className="mb-2 w-full rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white"
                >
                  Save Snapshot
                </button>
                {versions.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-500">No snapshots yet</p>
                ) : (
                  <ul className="max-h-44 overflow-auto">
                    {versions.map((v) => (
                      <li key={v.id} className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-800">
                        <p className="font-medium">{v.label}</p>
                        <p className="text-[11px] opacity-70">{new Date(v.createdAt).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
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
              {isAnalyzing ? 'Analysing�Ǫ' : 'Analyse'}
            </button>
            <button
              onClick={() => setRightPanelMode((prev) => prev === 'analysis' ? 'preview' : 'analysis')}
              className="btn-secondary py-1.5 px-3 text-xs"
              title="Toggle preview"
            >
              {rightPanelMode === 'preview' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {rightPanelMode === 'preview' ? 'Hide Preview' : 'Preview'}
            </button>
            {!isAnalysisCollapsed && rightPanelMode === 'analysis' && (
              <button
                onClick={() => setIsAnalysisCollapsed(true)}
                className="btn-secondary py-1.5 px-3 text-xs"
                title="Squeeze analysis panel"
              >
                <PanelRightClose className="h-3.5 w-3.5" /> Squeeze
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="animate-page-in mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        {/* Left ��� Editor */}
        <div className={cn('flex flex-1 flex-col', activeTab === 'analysis' && 'hidden md:flex')}>
          <div className="card flex flex-1 flex-col p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <FileText className="h-4 w-4" /> Document Editor
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800">
                  <button onClick={() => runEditorCommand('bold')} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Bold">
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runEditorCommand('italic')} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Italic">
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runEditorCommand('underline')} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Underline">
                    <Underline className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runEditorCommand('insertUnorderedList')} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Bullet List">
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runEditorCommand('insertOrderedList')} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Numbered List">
                    <ListOrdered className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={insertHyperlink} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Insert Link">
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={insertTable} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Insert Table">
                    <Table2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={insertSectionTemplate} className="rounded px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700" title="Insert problem section template">
                    Template
                  </button>
                </div>
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
                    <span className="text-[10px] text-slate-500/90 dark:text-zinc-400">Drag to move, corner-drag to resize, Shift+drag locks ratio, arrow keys nudge</span>
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
                  <span className="text-xs text-amber-500">Unsaved changes</span>
                )}
                {!isDirty && lastSavedAt && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved at {lastSavedAt}</span>
                )}
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden bg-white dark:bg-zinc-900">
              <div
                ref={gutterRef}
                aria-hidden
                className="w-14 flex-shrink-0 overflow-hidden border-r border-slate-100 bg-slate-50/90 text-[11px] text-slate-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500"
              >
                <div className="h-full overflow-hidden">
                  <div className="py-8">
                    {Array.from({ length: editorLineCount }).map((_, i) => (
                      <div
                        key={`ln-${i}`}
                        className={cn(
                          'h-7 pr-2.5 text-right font-mono tabular-nums leading-7 transition-colors',
                          i + 1 === activeVisualLine
                            ? 'bg-indigo-100/80 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                            : 'text-slate-500 dark:text-zinc-500',
                        )}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative flex-1 overflow-hidden bg-white dark:bg-zinc-900">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-0 border-y border-indigo-200/80 bg-indigo-100/50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                  style={{
                    top: `${32 + (activeVisualLine - 1) * editorLineHeight - editorScrollTop}px`,
                    height: `${editorLineHeight}px`,
                  }}
                />

                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleInput}
                  onClick={handleEditorClick}
                  onMouseDown={handleEditorMouseDown}
                  onScroll={handleEditorScroll}
                  onDragStart={handleEditorDragStart}
                  onDragOver={handleEditorDragOver}
                  onDrop={handleEditorDrop}
                  onPaste={handleEditorPaste}
                  onKeyDown={handleEditorKeyDown}
                  onMouseUp={updateActiveLineFromSelection}
                  onKeyUp={updateActiveLineFromSelection}
                  onFocus={updateActiveLineFromSelection}
                  className={cn(
                  'relative z-10 flex-1 overflow-y-auto bg-transparent p-8 focus:outline-none',
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
                  '[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline [&_a]:underline-offset-2',
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
                  '[&_.image-wrapper]:my-2 [&_.image-wrapper]:w-[70%] [&_.image-wrapper]:max-w-full [&_.image-wrapper]:relative [&_.image-wrapper]:clear-both',
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
        </div>

        {/* Right ��� Analysis */}
        {!isAnalysisCollapsed && (
        <div className={cn(
          'w-full md:w-96 flex-shrink-0',
          activeTab === 'edit' && 'hidden md:block',
        )}>
          {rightPanelMode === 'analysis' ? (
            <AnalysisPanel
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              isHumanizing={isHumanizing}
              onAnalyze={analyze}
              onHumanize={canUseHumanizeText ? handleHumanizeAction : undefined}
              onGoPremium={goPremium}
              canUseHumanizeFeature={canUseHumanizeText}
              canUseGrammarFixFeature={canUseGrammarFix}
              canUseToneBiasFeature={isPremium}
              aiUsageLabel={aiLimit === -1 ? `${aiUsed}/∞` : `${aiUsed}/${aiLimit}`}
              isAiUsageBlocked={aiBlocked}
              onSave={isDirty ? handleSave : undefined}
              documentStatus={doc.status}
              onApplySuggestion={handleApplySuggestion}
              onApplyGrammarFix={canUseGrammarFix ? handleApplyGrammarFix : undefined}
              getGrammarIssueLine={getIssueLineNumber}
              documentText={editorRef.current?.innerText || doc?.cleanedText || ''}
            />
          ) : (
            <div className="card h-full overflow-hidden p-0">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-zinc-800 dark:text-zinc-200">
                Live Preview
              </div>
              <div
                className="max-h-[calc(100vh-220px)] overflow-auto p-4 text-sm leading-7 text-slate-700 dark:text-zinc-200"
                dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || '' }}
              />
            </div>
          )}
        </div>
        )}
      </div>

      {isAnalysisCollapsed && rightPanelMode === 'analysis' && (
        <button
          onClick={() => setIsAnalysisCollapsed(false)}
          className="fixed right-3 top-1/2 z-40 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-lg transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Expand analysis panel"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      

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

            {error && (
              <div className="mx-auto mt-3 w-full max-w-7xl px-4 sm:px-6">
                <ErrorBanner message={error} />
              </div>
            )}
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

      <HumanizeRewriteModal
        isOpen={showRewriteModal}
        onClose={() => setShowRewriteModal(false)}
        rewrites={rewriteData}
        totalCount={rewriteData.length}
      />
    </div>
  );
}

