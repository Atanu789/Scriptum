import { restoreSelection, saveSelection, SavedSelection } from './selection';

interface ApplyCommandOptions {
  container: HTMLElement;
  command: string;
  value?: string;
  before?: () => void;
  after?: () => void;
}

export function applyCommand({
  container,
  command,
  value,
  before,
  after,
}: ApplyCommandOptions): SavedSelection | null {
  const saved = saveSelection(container);
  before?.();
  container.focus();
  restoreSelection(container, saved);
  // eslint-disable-next-line deprecation/deprecation
  window.document.execCommand(command, false, value);
  after?.();
  return saved;
}
