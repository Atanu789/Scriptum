export interface SavedSelection {
  start: number;
  end: number;
}

function getTextNodes(container: HTMLElement): Text[] {
  const walker = window.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

export function saveSelection(container: HTMLElement): SavedSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;

  const preStartRange = range.cloneRange();
  preStartRange.selectNodeContents(container);
  preStartRange.setEnd(range.startContainer, range.startOffset);

  const preEndRange = range.cloneRange();
  preEndRange.selectNodeContents(container);
  preEndRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: preStartRange.toString().length,
    end: preEndRange.toString().length,
  };
}

export function restoreSelection(container: HTMLElement, saved: SavedSelection | null): void {
  if (!saved) return;
  const selection = window.getSelection();
  if (!selection) return;

  const textNodes = getTextNodes(container);
  if (textNodes.length === 0) return;

  const range = window.document.createRange();
  let startSet = false;
  let endSet = false;
  let cursor = 0;

  for (const node of textNodes) {
    const next = cursor + node.data.length;

    if (!startSet && saved.start >= cursor && saved.start <= next) {
      range.setStart(node, Math.max(0, saved.start - cursor));
      startSet = true;
    }

    if (!endSet && saved.end >= cursor && saved.end <= next) {
      range.setEnd(node, Math.max(0, saved.end - cursor));
      endSet = true;
      break;
    }

    cursor = next;
  }

  if (!startSet) {
    range.setStart(textNodes[0], 0);
  }
  if (!endSet) {
    const last = textNodes[textNodes.length - 1];
    range.setEnd(last, last.data.length);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}
