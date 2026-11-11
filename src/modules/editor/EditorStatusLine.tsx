import { LspStatusPill } from '@/modules/lsp';
import type { ViewUpdate } from '@codemirror/view';
import { File01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSyncExternalStore } from 'react';
import { DiagnosticsBadge } from './DiagnosticsBadge';

/** 1-based line and column of an editor's main cursor. */
export type CursorPosition = { readonly line: number; readonly column: number };

/**
 * An editor's cursor position, kept outside React state so moving the cursor re-renders the
 * status line alone, never the editor.
 */
export class CursorStore {
  private position: CursorPosition = { line: 1, column: 1 };
  private readonly listeners = new Set<() => void>();

  readonly get = (): CursorPosition => this.position;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** CodeMirror `onUpdate`: records where the main cursor is after a move or an edit. */
  readonly update = (update: ViewUpdate): void => {
    if (!update.selectionSet && !update.docChanged) return;
    const { state } = update;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const column = head - line.from + 1;
    if (this.position.line === line.number && this.position.column === column) return;
    this.position = { line: line.number, column };
    for (const listener of [...this.listeners]) listener();
  };
}

type Props = {
  path: string;
  cursor: CursorStore;
};

/** The strip under an editor: the file, its diagnostics, the cursor and the language server. */
export function EditorStatusLine({ path, cursor }: Props) {
  const { line, column } = useSyncExternalStore(cursor.subscribe, cursor.get);
  return (
    <div
      role="status"
      aria-label="Editor status"
      className="flex h-5 shrink-0 items-center gap-3.5 border-t border-border bg-card pr-2 pl-3 text-[11px] leading-3.5 whitespace-nowrap text-muted-foreground"
    >
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <HugeiconsIcon icon={File01Icon} size={12} strokeWidth={1.5} className="shrink-0" />
        <span className="truncate">{path}</span>
      </span>
      <span className="flex-1" />
      <DiagnosticsBadge filePath={path} />
      <span className="flex shrink-0 items-center tabular-nums">
        Ln {line}, Col {column}
      </span>
      <LspStatusPill filePath={path} />
    </div>
  );
}
