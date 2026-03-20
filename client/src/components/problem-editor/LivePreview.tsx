import markdownit from 'markdown-it';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import hljs from 'highlight.js';
import { useMemo } from 'react';
import { toMarkdown } from './utils';

interface Props {
  html: string;
}

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      const highlighted = hljs.highlight(code, { language: lang }).value;
      return `<pre class="language-${lang}"><code>${highlighted}</code></pre>`;
    }
    const auto = hljs.highlightAuto(code).value;
    return `<pre><code>${auto || escapeHtml(code)}</code></pre>`;
  },
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function LivePreview({ html }: Props) {
  const rendered = useMemo(() => {
    const markdown = toMarkdown(html);
    let output = md.render(markdown);

    output = output.replace(/\$\$([\s\S]+?)\$\$/g, (_match: string, expr: string) => {
      try {
        return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: true });
      } catch {
        return `<pre>${expr}</pre>`;
      }
    });

    output = output.replace(/\$(.+?)\$/g, (_match: string, expr: string) => {
      try {
        return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: false });
      } catch {
        return `$${expr}$`;
      }
    });

    output = output.replace(/<a\s+/g, '<a target="_blank" rel="noopener noreferrer" class="text-blue-500 underline" ');

    return output;
  }, [html]);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/85">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Live Preview</h3>
      <div
        className="preview-pane min-h-[420px] rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </section>
  );
}
