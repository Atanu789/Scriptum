import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eraser,
  Heading,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Sigma,
  Table2,
  Type,
  Underline,
} from 'lucide-react';
import { FONT_FAMILIES, FONT_SIZES } from './constants';
import type { ViewMode } from './types';

interface Props {
  editor: Editor | null;
  fontFamily: string;
  fontSize: string;
  viewMode: ViewMode;
  onFontFamilyChange: (value: string) => void;
  onFontSizeChange: (value: string) => void;
  onApplyTemplate: () => void;
  onInsertCode: () => void;
  onInsertLatex: () => void;
  onInsertTable: () => void;
  onInsertImage: (url: string) => void;
  onSetViewMode: (mode: ViewMode) => void;
}

export function EditorToolbar({
  editor,
  fontFamily,
  fontSize,
  viewMode,
  onFontFamilyChange,
  onFontSizeChange,
  onApplyTemplate,
  onInsertCode,
  onInsertLatex,
  onInsertTable,
  onInsertImage,
  onSetViewMode,
}: Props) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const markButton = (active: boolean) =>
    `rounded-lg border px-2 py-1 text-xs transition ${
      active
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/85">
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        value={fontFamily}
        onChange={(e) => {
          onFontFamilyChange(e.target.value);
          editor?.chain().focus().setMark('textStyle', { fontFamily: e.target.value }).run();
        }}
      >
        {FONT_FAMILIES.map((family) => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
      </select>

      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        value={fontSize}
        onChange={(e) => {
          onFontSizeChange(e.target.value);
          editor?.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run();
        }}
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <button className={markButton(editor?.isActive('bold') ?? false)} onClick={() => editor?.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(editor?.isActive('italic') ?? false)} onClick={() => editor?.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(editor?.isActive('underline') ?? false)} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
        <Underline className="h-3.5 w-3.5" />
      </button>

      <input
        type="color"
        className="h-7 w-8 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
        onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
        title="Text color"
      />
      <button className={markButton(editor?.isActive('highlight') ?? false)} onClick={() => editor?.chain().focus().toggleHighlight().run()}>
        <Highlighter className="h-3.5 w-3.5" />
      </button>

      <button className={markButton(editor?.isActive({ textAlign: 'left' }) ?? false)} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(editor?.isActive({ textAlign: 'center' }) ?? false)} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(editor?.isActive({ textAlign: 'right' }) ?? false)} onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="h-3.5 w-3.5" />
      </button>

      <button className={markButton(editor?.isActive('bulletList') ?? false)} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(editor?.isActive('orderedList') ?? false)} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </button>

      <button className={markButton(editor?.isActive('codeBlock') ?? false)} onClick={onInsertCode} title="Ctrl+`">
        <Code className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(false)} onClick={onInsertLatex}>
        <Sigma className="h-3.5 w-3.5" />
      </button>
      <button className={markButton(editor?.isActive('table') ?? false)} onClick={onInsertTable}>
        <Table2 className="h-3.5 w-3.5" />
      </button>

      <button
        className={markButton(false)}
        onClick={() => {
          const href = window.prompt('Paste link URL');
          if (href) editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }}
        title="Ctrl+K"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>

      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          onInsertImage(url);
        }}
      />
      <button className={markButton(false)} onClick={() => imageInputRef.current?.click()}>
        <ImagePlus className="h-3.5 w-3.5" />
      </button>

      <button className={markButton(false)} onClick={onApplyTemplate}>
        <Heading className="h-3.5 w-3.5" /> Template
      </button>

      <button className={markButton(false)} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>
        <Eraser className="h-3.5 w-3.5" />
      </button>

      <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-700">
        {(['split', 'editor', 'preview'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onSetViewMode(mode)}
            className={`rounded-md px-2 py-1 text-xs capitalize ${
              viewMode === mode
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="hidden items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 sm:flex dark:bg-amber-950/40 dark:text-amber-300">
        <Type className="h-3 w-3" /> Ctrl+B, Ctrl+K, Ctrl+`
      </div>
    </div>
  );
}
