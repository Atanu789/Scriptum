'use client';

import { useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { cn } from '@/lib/utils';
import { SECTION_TEMPLATE, STARTER_HTML } from './constants';
import { BottomTabs } from './BottomTabs';
import { EditorNavbar } from './EditorNavbar';
import { EditorToolbar } from './EditorToolbar';
import { LivePreview } from './LivePreview';
import type { AssetItem, MetadataForm, TestCase, VersionSnapshot, ViewMode } from './types';
import { exportFile, fileToAsset, importFileToHtml, toMarkdown, uid } from './utils';

const lowlight = createLowlight(common);

export function ProblemEditor() {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showPreview, setShowPreview] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontSize, setFontSize] = useState('16px');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [editorial, setEditorial] = useState('<p>Write editorial notes here...</p>');
  const [testCases, setTestCases] = useState<TestCase[]>([
    { id: uid('tc'), input: '5\n1 2 2 3 3', output: '2', explanation: 'Change 1->2 and 3->2.' },
  ]);
  const [meta, setMeta] = useState<MetadataForm>({
    difficulty: 'Medium',
    tags: ['DP', 'Implementation'],
    timeLimit: '1 sec',
    memoryLimit: '256 MB',
  });
  const [versions, setVersions] = useState<VersionSnapshot[]>([
    {
      id: uid('ver'),
      label: 'Initial Draft',
      createdAt: new Date().toISOString(),
      content: STARTER_HTML,
    },
  ]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Underline,
      TextStyle,
      Color,
      Highlight,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          class: 'text-blue-500 underline',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        allowBase64: true,
        inline: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder:
          'Start writing your problem statement. Try /code, /image, /table, /latex or select a section template.',
      }),
    ],
    editorProps: {
      attributes: {
        class: 'problem-editor-content focus:outline-none',
      },
      handleKeyDown(_view, event) {
        const key = event.key.toLowerCase();
        if (event.ctrlKey && key === 'k') {
          event.preventDefault();
          const href = window.prompt('Paste link URL');
          if (href) {
            editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
          }
          return true;
        }

        if (event.ctrlKey && event.key === '`') {
          event.preventDefault();
          editor?.chain().focus().toggleCodeBlock({ language: 'cpp' }).run();
          return true;
        }

        return false;
      },
      handlePaste(view, event) {
        if (!event.clipboardData) return false;
        const html = event.clipboardData.getData('text/html');
        if (!html) return false;
        const cleaned = html
          .replace(/<!--StartFragment-->|<!--EndFragment-->/g, '')
          .replace(/class="Mso[^"]*"/g, '')
          .replace(/style="[^"]*"/g, '');

        if (cleaned.trim()) {
          event.preventDefault();
          view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.text('')));
          editor?.commands.insertContent(cleaned);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText();
      if (text.includes('/code')) {
        ed.commands.setContent(ed.getHTML().replace('/code', '<pre><code class="language-cpp">// write code</code></pre>'));
      }
      if (text.includes('/table')) {
        ed.commands.setContent(ed.getHTML().replace('/table', ''));
        ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      }
      if (text.includes('/latex')) {
        ed.commands.setContent(ed.getHTML().replace('/latex', '<p>$$a^2 + b^2 = c^2$$</p>'));
      }
      if (text.includes('/image')) {
        ed.commands.setContent(ed.getHTML().replace('/image', '<p><em>Use Insert Image to upload and place an image.</em></p>'));
      }
    },
    content: STARTER_HTML,
    immediatelyRender: false,
  });

  const previewSource = useMemo(() => editor?.getHTML() ?? '', [editor]);

  const applyTemplate = () => {
    if (!editor) return;
    const sections = SECTION_TEMPLATE.split('\n').filter(Boolean);
    sections.forEach((line) => {
      editor.chain().focus().insertContent(`<h2>${line.replace('## ', '')}</h2><p></p>`).run();
    });
  };

  const saveDraft = () => {
    if (!editor) return;
    setVersions((prev) => [
      {
        id: uid('ver'),
        label: `Draft ${prev.length + 1}`,
        createdAt: new Date().toISOString(),
        content: editor.getHTML(),
      },
      ...prev,
    ]);
  };

  const publish = () => {
    saveDraft();
    window.alert('Problem published successfully.');
  };

  const importContent = async (file: File) => {
    if (!editor) return;
    const html = await importFileToHtml(file);
    editor.commands.setContent(html);
    const asset = await fileToAsset(file);
    setAssets((prev) => [asset, ...prev]);
  };

  const exportMarkdown = () => {
    if (!editor) return;
    exportFile('problem-statement.md', toMarkdown(editor.getHTML()), 'text/markdown;charset=utf-8');
  };

  const exportHtml = () => {
    if (!editor) return;
    exportFile('problem-statement.html', editor.getHTML(), 'text/html;charset=utf-8');
  };

  const effectiveViewMode: ViewMode = showPreview ? viewMode : 'editor';

  return (
    <div className={cn(isDark && 'dark')}>
      <div className={cn('min-h-screen bg-[radial-gradient(circle_at_5%_0%,#f5f7ff_0,#f8fafc_45%,#eef2ff_100%)] px-3 py-4 text-slate-900 dark:bg-[radial-gradient(circle_at_5%_0%,#161926_0,#09090f_45%,#0f172a_100%)] dark:text-slate-100 sm:px-5')}>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
        <EditorNavbar
          isDark={isDark}
          onToggleDark={() => setIsDark((prev) => !prev)}
          previewEnabled={showPreview}
          onTogglePreview={() => setShowPreview((prev) => !prev)}
          onSaveDraft={saveDraft}
          onPublish={publish}
          onImport={importContent}
          onExportHtml={exportHtml}
          onExportMarkdown={exportMarkdown}
          versions={versions}
        />

        <EditorToolbar
          editor={editor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          onFontFamilyChange={setFontFamily}
          onFontSizeChange={setFontSize}
          onApplyTemplate={applyTemplate}
          onInsertLatex={() => editor?.chain().focus().insertContent('<p>$$\\int_0^n x^2 dx$$</p>').run()}
          onInsertCode={() => editor?.chain().focus().setCodeBlock({ language: 'cpp' }).run()}
          onInsertTable={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          onInsertImage={(url: string) => editor?.chain().focus().setImage({ src: url, alt: 'Inserted asset' }).run()}
          onSetViewMode={setViewMode}
          viewMode={effectiveViewMode}
        />

        <div className="relative flex min-h-[60vh] flex-col gap-3 lg:flex-row">
          {(effectiveViewMode === 'split' || effectiveViewMode === 'editor') && (
            <section
              className="rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/85"
              style={{ width: effectiveViewMode === 'split' ? `${splitRatio}%` : '100%' }}
            >
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Editor</h3>
              <div
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-inner dark:border-slate-700 dark:bg-slate-950"
                style={{ fontFamily, fontSize }}
              >
                <EditorContent editor={editor} />
              </div>
            </section>
          )}

          {(effectiveViewMode === 'split' || effectiveViewMode === 'preview') && (
            <div style={{ width: effectiveViewMode === 'split' ? `${100 - splitRatio}%` : '100%' }}>
              <LivePreview html={previewSource} />
            </div>
          )}

          {effectiveViewMode === 'split' && (
            <input
              type="range"
              min={25}
              max={75}
              value={splitRatio}
              onChange={(e) => setSplitRatio(Number(e.target.value))}
              className="absolute left-1/2 top-2 z-20 h-[95%] w-2 -translate-x-1/2 appearance-none bg-transparent [writing-mode:vertical-lr]"
              aria-label="Resize panels"
            />
          )}
        </div>

        <BottomTabs
          testCases={testCases}
          onTestCasesChange={setTestCases}
          metadata={meta}
          onMetadataChange={setMeta}
          assets={assets}
          onAssetsChange={setAssets}
          editorial={editorial}
          onEditorialChange={setEditorial}
        />
      </div>
      </div>
    </div>
  );
}
