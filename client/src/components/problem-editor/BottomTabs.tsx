import { useState } from 'react';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import type { AssetItem, MetadataForm, TestCase } from './types';
import { TAG_OPTIONS } from './constants';
import { fileToAsset, uid } from './utils';

interface Props {
  testCases: TestCase[];
  metadata: MetadataForm;
  editorial: string;
  assets: AssetItem[];
  onTestCasesChange: (next: TestCase[]) => void;
  onMetadataChange: (next: MetadataForm) => void;
  onEditorialChange: (next: string) => void;
  onAssetsChange: (next: AssetItem[]) => void;
}

type TabId = 'testcases' | 'metadata' | 'editorial' | 'assets';

export function BottomTabs({
  testCases,
  metadata,
  editorial,
  assets,
  onTestCasesChange,
  onMetadataChange,
  onEditorialChange,
  onAssetsChange,
}: Props) {
  const [active, setActive] = useState<TabId>('testcases');

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-700">
        {(['testcases', 'metadata', 'editorial', 'assets'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${
              active === tab
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-3">
        {active === 'testcases' && (
          <div className="space-y-3">
            <button
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() =>
                onTestCasesChange([
                  ...testCases,
                  { id: uid('tc'), input: '', output: '', explanation: '' },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add Test Case
            </button>

            {testCases.map((testCase, index) => (
              <div key={testCase.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-3">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Input #{index + 1}
                  <textarea
                    className="input mt-1 min-h-24"
                    value={testCase.input}
                    onChange={(e) =>
                      onTestCasesChange(
                        testCases.map((item) => (item.id === testCase.id ? { ...item, input: e.target.value } : item)),
                      )
                    }
                  />
                </label>

                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Output
                  <textarea
                    className="input mt-1 min-h-24"
                    value={testCase.output}
                    onChange={(e) =>
                      onTestCasesChange(
                        testCases.map((item) => (item.id === testCase.id ? { ...item, output: e.target.value } : item)),
                      )
                    }
                  />
                </label>

                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Explanation
                  <textarea
                    className="input mt-1 min-h-24"
                    value={testCase.explanation}
                    onChange={(e) =>
                      onTestCasesChange(
                        testCases.map((item) =>
                          item.id === testCase.id ? { ...item, explanation: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>

                <button
                  className="btn-danger mt-1 w-fit px-3 py-1.5 text-xs"
                  onClick={() => onTestCasesChange(testCases.filter((item) => item.id !== testCase.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {active === 'metadata' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Difficulty
              <select
                className="input mt-1"
                value={metadata.difficulty}
                onChange={(e) => onMetadataChange({ ...metadata, difficulty: e.target.value as MetadataForm['difficulty'] })}
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </label>

            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Tags
              <select
                className="input mt-1"
                value={metadata.tags[0] ?? TAG_OPTIONS[0]}
                onChange={(e) => onMetadataChange({ ...metadata, tags: [e.target.value] })}
              >
                {TAG_OPTIONS.map((tag) => (
                  <option key={tag}>{tag}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Time limit
              <input
                className="input mt-1"
                value={metadata.timeLimit}
                onChange={(e) => onMetadataChange({ ...metadata, timeLimit: e.target.value })}
              />
            </label>

            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Memory limit
              <input
                className="input mt-1"
                value={metadata.memoryLimit}
                onChange={(e) => onMetadataChange({ ...metadata, memoryLimit: e.target.value })}
              />
            </label>
          </div>
        )}

        {active === 'editorial' && (
          <div>
            <textarea
              className="input min-h-40"
              value={editorial.replace(/<[^>]*>/g, '')}
              onChange={(e) => onEditorialChange(`<p>${e.target.value}</p>`)}
              placeholder="Write the editorial here..."
            />
          </div>
        )}

        {active === 'assets' && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60">
              <UploadCloud className="h-4 w-4" /> Upload Asset
              <input
                type="file"
                className="hidden"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  const next = await Promise.all(files.map(fileToAsset));
                  onAssetsChange([...next, ...assets]);
                }}
              />
            </label>

            <ul className="space-y-2">
              {assets.length === 0 && <li className="text-xs text-slate-500">No assets uploaded yet.</li>}
              {assets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                >
                  <span className="truncate">
                    {asset.name} ({Math.ceil(asset.size / 1024)} KB)
                  </span>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => onAssetsChange(assets.filter((item) => item.id !== asset.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
