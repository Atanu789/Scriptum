function replaceInTextNodes(container: HTMLElement, original: string, replacement: string): boolean {
  const target = original.trim();
  if (!target) return false;

  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const t = node as Text;
    const source = t.data;
    const idx = source.toLowerCase().indexOf(target.toLowerCase());
    if (idx >= 0) {
      const range = window.document.createRange();
      range.setStart(t, idx);
      range.setEnd(t, idx + target.length);
      range.deleteContents();
      range.insertNode(window.document.createTextNode(replacement));
      return true;
    }
    node = walker.nextNode();
  }

  return false;
}

export function replaceInBlocks(html: string, original: string, replacement: string): { html: string; applied: boolean } {
  const template = window.document.createElement('template');
  template.innerHTML = html;

  const blocks = Array.from(template.content.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote'));
  for (const block of blocks) {
    const text = (block.textContent || '').trim();
    if (!text) continue;
    if (!text.toLowerCase().includes(original.trim().toLowerCase())) continue;

    const applied = replaceInTextNodes(block as HTMLElement, original, replacement);
    if (applied) {
      return { html: template.innerHTML, applied: true };
    }
  }

  const fallbackApplied = replaceInTextNodes(template.content.firstElementChild as HTMLElement || window.document.createElement('div'), original, replacement);
  return { html: template.innerHTML, applied: fallbackApplied };
}
