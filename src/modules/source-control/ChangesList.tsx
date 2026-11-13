import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileIcon } from '@/modules/explorer/FileIcon';
import { copyToClipboard, revealInFinder } from '@/modules/explorer/lib/contextActions';
import { joinPath } from '@/modules/explorer/lib/useFileTree';
import { IS_MAC } from '@/modules/platform';
import { Alert02Icon, RemoveSquareIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CheckState, SourceControlFileEntry } from './useSourceControlPanel';

const ROW_HEIGHT = 26;

type Props = {
  entries: SourceControlFileEntry[];
  diverged: boolean;
  headerCheckState: CheckState;
  selectedPath: string | null;
  actionBusy: string | null;
  repoRoot: string | null;
  onToggleAll: () => Promise<void> | void;
  onSelectFile: (entry: SourceControlFileEntry) => Promise<void>;
  onToggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
  onDiscardFile: (entry: SourceControlFileEntry) => void;
  onOpenFile?: (absolutePath: string) => void;
  onRefresh: () => void;
};

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
}

function entryPathLabel(entry: SourceControlFileEntry): string {
  if (entry.originalPath) return `${entry.originalPath} → ${entry.path}`;
  return dirname(entry.path);
}

/** The colour of a status letter: modified in the attention colour, added green, deleted red, renamed blue. */
function statusClass(code: string): string {
  switch (code) {
    case 'M':
      return 'text-warning';
    case 'A':
    case 'U':
      return 'text-[var(--terminal-ansi-green)]';
    case 'D':
      return 'text-[var(--terminal-ansi-red)]';
    case 'R':
      return 'text-[var(--terminal-ansi-blue)]';
    default:
      return 'text-muted-foreground';
  }
}

function checkboxValue(state: CheckState): boolean | 'indeterminate' {
  if (state === 'checked') return true;
  if (state === 'indeterminate') return 'indeterminate';
  return false;
}

/** The Git view's changed files (E10-13 design): the Changes header with stage-all, then one row per file. */
export function ChangesList({
  entries,
  diverged,
  headerCheckState,
  selectedPath,
  actionBusy,
  repoRoot,
  onToggleAll,
  onSelectFile,
  onToggleStageFile,
  onDiscardFile,
  onOpenFile,
  onRefresh,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focusedIndex = focusedKey === null ? -1 : entries.findIndex((e) => e.key === focusedKey);

  useEffect(() => {
    if (focusedKey !== null && focusedIndex === -1) setFocusedKey(null);
  }, [focusedIndex, focusedKey]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns a mutable instance the compiler cannot memoize, so this component stays uncompiled.
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => entries[index]?.key ?? index,
  });

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      if (entries.length === 0) return;
      const from = focusedIndex === -1 ? (direction > 0 ? -1 : entries.length) : focusedIndex;
      const next = Math.min(entries.length - 1, Math.max(0, from + direction));
      setFocusedKey(entries[next].key);
      virtualizer.scrollToIndex(next, { align: 'auto' });
    },
    [entries, focusedIndex, virtualizer],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.closest('button'))) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        onRefresh();
        return;
      }
      const entry = focusedIndex === -1 ? null : entries[focusedIndex];
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveFocus(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveFocus(-1);
          break;
        case 'Enter':
          if (entry) {
            event.preventDefault();
            void onSelectFile(entry);
          }
          break;
        case ' ':
        case 's':
        case 'S':
          if (!meta && entry) {
            event.preventDefault();
            void onToggleStageFile(entry);
          }
          break;
        case 'd':
        case 'D':
          if (!meta && entry?.unstaged) {
            event.preventDefault();
            onDiscardFile(entry);
          }
          break;
      }
    },
    [entries, focusedIndex, moveFocus, onDiscardFile, onRefresh, onSelectFile, onToggleStageFile],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {diverged ? (
        <div className="mx-2.5 mt-2 flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 text-[11px] leading-none text-muted-foreground">
          <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.5} className="shrink-0 text-warning" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">Diverged from upstream</span>
            <span className="ml-1">— resolve in terminal</span>
          </span>
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-1.5 pt-2.5 pr-3 pb-1 pl-4 text-[11px] leading-[14px] text-muted-foreground">
        <span>Changes</span>
        <span className="rounded-full bg-accent px-[5px] text-[10px] leading-[15px] tabular-nums">
          {entries.length}
        </span>
        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 select-none hover:text-foreground">
          <span>All</span>
          <Checkbox
            aria-label="Stage all changes"
            checked={checkboxValue(headerCheckState)}
            disabled={actionBusy !== null}
            onCheckedChange={() => void onToggleAll()}
            className="size-3.5"
          />
        </label>
      </div>
      <div
        tabIndex={0}
        role="listbox"
        aria-label="Changed files"
        aria-activedescendant={focusedKey ? `scm-row-${focusedKey}` : undefined}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <div
          ref={scrollRef}
          className="h-full overflow-x-hidden overflow-y-auto px-1.5 pb-1.5 [scrollbar-gutter:stable]"
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = entries[item.index];
              if (!entry) return null;
              return (
                <div
                  key={item.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <ChangeRow
                    entry={entry}
                    focused={focusedKey === entry.key}
                    selected={selectedPath === entry.path}
                    actionBusy={actionBusy}
                    repoRoot={repoRoot}
                    onFocus={setFocusedKey}
                    onSelectFile={onSelectFile}
                    onToggleStageFile={onToggleStageFile}
                    onDiscardFile={onDiscardFile}
                    onOpenFile={onOpenFile}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  entry: SourceControlFileEntry;
  focused: boolean;
  selected: boolean;
  actionBusy: string | null;
  repoRoot: string | null;
  onFocus: (key: string) => void;
  onSelectFile: (entry: SourceControlFileEntry) => Promise<void>;
  onToggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
  onDiscardFile: (entry: SourceControlFileEntry) => void;
  onOpenFile?: (absolutePath: string) => void;
};

const ChangeRow = memo(function ChangeRow({
  entry,
  focused,
  selected,
  actionBusy,
  repoRoot,
  onFocus,
  onSelectFile,
  onToggleStageFile,
  onDiscardFile,
  onOpenFile,
}: RowProps) {
  const fileName = basename(entry.path);
  const pathLabel = entryPathLabel(entry);
  const stageBusy = actionBusy === `stage:${entry.path}` || actionBusy === `unstage:${entry.path}`;
  const discardBusy = actionBusy === `discard:${entry.path}`;
  const disabled = actionBusy !== null;
  const absolutePath = repoRoot ? joinPath(repoRoot.replace(/\\/g, '/'), entry.path.replace(/\\/g, '/')) : null;
  const isDeleted = entry.statusCode === 'D';
  const open = () => {
    onFocus(entry.key);
    void onSelectFile(entry);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`scm-row-${entry.key}`}
          role="option"
          aria-selected={selected}
          data-focused={focused || undefined}
          onMouseDown={() => onFocus(entry.key)}
          className={cn(
            'group flex h-[26px] items-center gap-1.5 rounded-sm pr-1.5 pl-2 text-[13px] leading-[18px] whitespace-nowrap',
            focused || selected ? 'bg-accent' : 'hover:bg-accent',
          )}
        >
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
          >
            <FileIcon name={fileName} className="size-3.5 shrink-0" />
            <span className="min-w-0 shrink truncate text-foreground">{fileName}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{pathLabel}</span>
          </button>
          {entry.unstaged ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Discard ${entry.path}`}
                  disabled={disabled}
                  onClick={() => onDiscardFile(entry)}
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none',
                    focused || selected || discardBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  {discardBusy ? (
                    <Spinner className="size-3" />
                  ) : (
                    <HugeiconsIcon icon={RemoveSquareIcon} size={12} strokeWidth={1.5} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{`Discard ${entry.path}`}</TooltipContent>
            </Tooltip>
          ) : null}
          <span
            title={entry.statusLabel}
            className={cn('w-3 shrink-0 text-center font-mono text-[11px] leading-4', statusClass(entry.statusCode))}
          >
            {entry.statusCode}
          </span>
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {stageBusy ? (
              <Spinner className="size-3" />
            ) : (
              <Checkbox
                aria-label={`Stage ${entry.path}`}
                checked={checkboxValue(entry.checkState)}
                disabled={disabled}
                onCheckedChange={() => void onToggleStageFile(entry)}
                className="size-3.5"
              />
            )}
          </span>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={open}>Open Diff</ContextMenuItem>
        {!isDeleted && onOpenFile && absolutePath ? (
          <ContextMenuItem onSelect={() => onOpenFile(absolutePath)}>Open File</ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled} onSelect={() => void onToggleStageFile(entry)}>
          {entry.checkState === 'checked' ? 'Unstage' : 'Stage'}
        </ContextMenuItem>
        {entry.unstaged ? (
          <ContextMenuItem variant="destructive" disabled={disabled} onSelect={() => onDiscardFile(entry)}>
            Discard Changes
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, '/'))}>
          Copy Relative Path
        </ContextMenuItem>
        {absolutePath ? (
          <ContextMenuItem onSelect={() => void copyToClipboard(absolutePath)}>Copy Absolute Path</ContextMenuItem>
        ) : null}
        {!isDeleted && absolutePath ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void revealInFinder(absolutePath)}>
              {IS_MAC ? 'Reveal in Finder' : 'Reveal in File Manager'}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});
