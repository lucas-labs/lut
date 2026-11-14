import { cn } from '@/lib/utils';
import { isPrimaryModifierPressed } from '@/modules/platform';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { memo } from 'react';
import { FileIcon, FolderIcon } from './FileIcon';
import { InlineInput } from './InlineInput';
import { gitStatusTextClass } from './lib/gitStatusColor';
import type { GitStatusCode } from './lib/gitStatusUtils';

export type SelectModifiers = { shift: boolean; mod: boolean };

export type RowActions = {
  toggle: (path: string) => void;
  beginRename: (path: string) => void;
  commitRename: (newName: string) => void | Promise<void>;
  cancelRename: () => void;
};

export type EntryRowProps = {
  path: string;
  name: string;
  isDir: boolean;
  isExpanded: boolean;
  depth: number;
  actions: RowActions;
  renameInProgress: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  isDropTarget?: boolean;
  /** True when more than one row is selected: rename doesn't generalize to
   * a batch, so double-click-to-rename is disabled while it's active. */
  multiSelectActive?: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onSelectPath: (path: string, modifiers: SelectModifiers) => void;
  gitStatusCode?: GitStatusCode | null;
  gitignored?: boolean;
};

/** Left padding of a row at a depth: 8 px, then 12 px a level. */
const rowIndent = (depth: number) => 8 + depth * 12;

const ROW = 'flex h-6 w-full min-w-0 items-center gap-[5px] rounded-sm pr-2 text-left text-[13px] leading-[18px]';

/** The chevron's slot: a folder's chevron, or the same empty width for a file so names line up. */
function Chevron({ isDir, expanded }: { isDir: boolean; expanded: boolean }) {
  return (
    <span className="flex size-3 shrink-0 items-center justify-center text-muted-foreground">
      {isDir ? (
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          strokeWidth={2}
          className={cn('transition-transform', expanded && 'rotate-90')}
        />
      ) : null}
    </span>
  );
}

function EntryIcon({
  name,
  isDir,
  expanded,
  className,
}: {
  name: string;
  isDir: boolean;
  expanded: boolean;
  className?: string;
}) {
  return isDir ? (
    <FolderIcon name={name} expanded={expanded} className={cn('size-3.5 shrink-0', className)} />
  ) : (
    <FileIcon name={name} className={cn('size-3.5 shrink-0', className)} />
  );
}

/**
 * The Git mark at the end of a row: a file's status letter, or a dot on a closed folder with changes inside. An open
 * folder shows its changes on its rows instead.
 */
function GitMark({ code, isDir, expanded }: { code: GitStatusCode | null; isDir: boolean; expanded: boolean }) {
  const mark = !code ? '' : isDir ? (expanded ? '' : '•') : code;
  return (
    <span
      aria-hidden={mark === ''}
      className={cn(
        'w-3 shrink-0 text-center font-mono text-[11px] leading-4',
        isDir ? 'text-warning' : code && gitStatusTextClass(code),
      )}
    >
      {mark}
    </span>
  );
}

function EntryRowImpl(props: EntryRowProps) {
  const {
    path,
    name,
    isDir,
    isExpanded,
    depth,
    actions,
    renameInProgress,
    isSelected,
    isRenaming,
    isDropTarget = false,
    multiSelectActive = false,
    onOpenFile,
    onSelectPath,
    gitStatusCode = null,
    gitignored = false,
  } = props;

  if (isRenaming) {
    return (
      <div className={ROW} style={{ paddingLeft: rowIndent(depth) }}>
        <Chevron isDir={false} expanded={false} />
        <EntryIcon name={name} isDir={isDir} expanded={isExpanded} />
        <InlineInput initial={name} onCommit={actions.commitRename} onCancel={actions.cancelRename} />
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (renameInProgress) return;
    const shift = e.shiftKey;
    const mod = isPrimaryModifierPressed(e);
    if (shift || mod) {
      e.preventDefault();
      onSelectPath(path, { shift, mod });
      return;
    }
    onSelectPath(path, { shift: false, mod: false });
    if (isDir) actions.toggle(path);
    else onOpenFile(path);
  };

  return (
    <button
      type="button"
      data-fs-path={path}
      aria-expanded={isDir ? isExpanded : undefined}
      onClick={handleClick}
      onDoubleClick={() => !isDir && !multiSelectActive && actions.beginRename(path)}
      className={cn(
        ROW,
        'group cursor-pointer outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        isSelected && 'bg-accent',
        gitignored ? 'text-muted-foreground' : 'text-foreground',
        isDropTarget && 'bg-primary/10 ring-1 ring-primary/60 ring-inset',
      )}
      style={{ paddingLeft: rowIndent(depth) }}
    >
      <Chevron isDir={isDir} expanded={isExpanded} />
      <EntryIcon name={name} isDir={isDir} expanded={isExpanded} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          !isSelected && !gitignored && gitStatusCode && gitStatusTextClass(gitStatusCode),
        )}
      >
        {name}
      </span>
      <GitMark code={gitignored ? null : gitStatusCode} isDir={isDir} expanded={isExpanded} />
    </button>
  );
}

export const EntryRow = memo(EntryRowImpl);

export type PendingRowProps = {
  depth: number;
  kind: 'file' | 'dir';
  onCommit: (name: string) => void | Promise<void>;
  onCancel: () => void;
};

export function PendingRow({ depth, kind, onCommit, onCancel }: PendingRowProps) {
  return (
    <div className={ROW} style={{ paddingLeft: rowIndent(depth) }}>
      <Chevron isDir={false} expanded={false} />
      <EntryIcon
        name={kind === 'dir' ? '' : 'untitled'}
        isDir={kind === 'dir'}
        expanded={false}
        className="opacity-70"
      />
      <InlineInput
        initial=""
        placeholder={kind === 'dir' ? 'New folder' : 'New file'}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

export function StatusRow({ depth, message, tone }: { depth: number; message: string; tone: 'muted' | 'error' }) {
  return (
    <div
      className={cn(
        'h-6 truncate pr-2 text-[11px] leading-6',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
      // Lined up with the icons: the indent, then the chevron's 12 px and the 5 px gap.
      style={{ paddingLeft: rowIndent(depth) + 17 }}
    >
      {message}
    </div>
  );
}
