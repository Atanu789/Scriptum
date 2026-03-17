import { useRef } from 'react';
import { Download, Eye, FileUp, History, Moon, Save, Sun, Upload, WandSparkles } from 'lucide-react';
import type { VersionSnapshot } from './types';

interface Props {
  isDark: boolean;
  previewEnabled: boolean;
  versions: VersionSnapshot[];
  onToggleDark: () => void;
  onTogglePreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onImport: (file: File) => Promise<void>;
  onExportMarkdown: () => void;
  onExportHtml: () => void;
}

export function EditorNavbar({
  isDark,
  previewEnabled,
  versions,
  onToggleDark,
  onTogglePreview,
  onSaveDraft,
  onPublish,
  onImport,
  onExportHtml,
  onExportMarkdown,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <div className="flex items-center gap-2">
        <button onClick={onSaveDraft} className="btn-secondary px-3 py-2 text-xs">
          <Save className="h-3.5 w-3.5" /> Save Draft
        </button>
        <button onClick={onTogglePreview} className="btn-secondary px-3 py-2 text-xs">
          <Eye className="h-3.5 w-3.5" /> {previewEnabled ? 'Hide Preview' : 'Show Preview'}
        </button>
        <button onClick={onPublish} className="btn-primary px-3 py-2 text-xs">
          <WandSparkles className="h-3.5 w-3.5" /> Publish
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await onImport(file);
          }}
        />

        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary px-3 py-2 text-xs">
          <Upload className="h-3.5 w-3.5" /> Import
        </button>
        <button onClick={onExportMarkdown} className="btn-secondary px-3 py-2 text-xs">
          <Download className="h-3.5 w-3.5" /> Export MD
        </button>
        <button onClick={onExportHtml} className="btn-secondary px-3 py-2 text-xs">
          <FileUp className="h-3.5 w-3.5" /> Export HTML
        </button>

        <details className="relative">
          <summary className="btn-secondary list-none px-3 py-2 text-xs">
            <History className="h-3.5 w-3.5" /> Version History
          </summary>
          <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <p className="px-2 py-1 text-xs font-semibold text-slate-500">Snapshots</p>
            <ul className="max-h-52 overflow-auto">
              {versions.map((version) => (
                <li key={version.id} className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  <p className="font-medium">{version.label}</p>
                  <p className="text-[11px] opacity-70">{new Date(version.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>

        <button onClick={onToggleDark} className="btn-secondary px-3 py-2 text-xs">
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {isDark ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  );
}
