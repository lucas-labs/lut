import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHoldTitleBar } from '@/lib/titleBarHold';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { currentWorkspaceEnv } from '@/modules/workspace';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  Home03Icon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { invoke } from '@tauri-apps/api/core';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { type Segment, segmentsFromCwd } from './lib/pathUtils';

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
};

/**
 * Props for a segment menu: closing it from the keyboard returns focus to its segment, as menus do;
 * closing it with the pointer (a click outside or on an item) does not, so the segment is not left
 * wearing a focus ring the user never asked for.
 */
function useMenuCloseFocus() {
  const byPointer = useRef(false);
  return {
    onPointerDown: () => {
      byPointer.current = true;
    },
    onPointerDownOutside: () => {
      byPointer.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (byPointer.current) event.preventDefault();
      byPointer.current = false;
    },
  };
}

/** A long folder name is cut short rather than pushing the rest of the header aside. */
const LABEL_CLASS = 'max-w-40 truncate';

const SEGMENT_CLASS =
  'flex h-5.5 shrink-0 items-center gap-1 rounded-sm px-1.25 text-xs whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground';

function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (i <= 0) return '/';
  return path.slice(0, i);
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * The header's path: the active terminal's directory, or the active file's. It shows at most
 * `… > parent > current`, so a deep path never crowds out the window's drag area: `…` opens a
 * menu of the ancestors above the parent. Each ancestor `cd`s there; the current directory
 * opens a menu of its subfolders.
 */
export function CwdBreadcrumb({ cwd, filePath, home, onCd }: Props) {
  if (filePath) {
    const segments = segmentsFromCwd(dirname(filePath), home);
    return (
      <Trail first={firstShown(segments, null)}>
        <Parents segments={segments} onCd={onCd} />
        <Item first={false}>
          <span className={cn(SEGMENT_CLASS, 'text-foreground hover:bg-transparent')}>
            <span className={LABEL_CLASS}>{basename(filePath)}</span>
          </span>
        </Item>
      </Trail>
    );
  }

  if (!cwd) {
    return <span className="ml-1.5 shrink-0 text-xs text-muted-foreground">no directory</span>;
  }

  const segments = segmentsFromCwd(cwd, home);
  const current = segments[segments.length - 1];
  return (
    <Trail first={firstShown(segments.slice(0, -1), current)}>
      <Parents segments={segments.slice(0, -1)} onCd={onCd} />
      <Item first={segments.length === 1}>
        <CurrentSegmentDropdown segment={current} onCd={onCd} />
      </Item>
    </Trail>
  );
}

/**
 * The first segment the trail shows: the parent when there is no `…` before it, else the current one. Null when
 * the trail starts with `…`. `parents` are the segments before `current` (all of them for a file's folder).
 */
function firstShown(parents: Segment[], current: Segment | null): Segment | null {
  if (parents.length > 1) return null;
  return parents[0] ?? current;
}

/** The trail, led by a folder icon, or a house when it starts at the home folder. */
function Trail({ first, children }: { first: Segment | null; children: ReactNode }) {
  return (
    <nav
      aria-label="Current directory"
      className="ml-1.5 flex max-w-[42%] min-w-0 shrink items-center gap-px overflow-hidden text-xs whitespace-nowrap text-muted-foreground"
    >
      <HugeiconsIcon
        icon={first?.isHome ? Home03Icon : Folder01Icon}
        size={13}
        strokeWidth={1.5}
        className="mr-1 shrink-0"
      />
      {children}
    </nav>
  );
}

/** One segment, after a separator unless it is the first. */
function Item({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-px">
      {first ? null : (
        <HugeiconsIcon icon={ArrowRight01Icon} size={10} strokeWidth={2} className="shrink-0 opacity-55" />
      )}
      {children}
    </span>
  );
}

function SegmentLabel({ segment }: { segment: Segment }) {
  // The home folder reads "Home"; its house leads the trail instead of sitting next to the name.
  return <span className={LABEL_CLASS}>{segment.isHome ? 'Home' : segment.label}</span>;
}

/** The ancestors of the current segment: the nearest one, the rest folded into a `…` menu. */
function Parents({ segments, onCd }: { segments: Segment[]; onCd: (path: string) => void }) {
  const parent = segments[segments.length - 1];
  if (!parent) return null;
  const hidden = segments.slice(0, -1);
  return (
    <>
      {hidden.length > 0 ? <CollapsedSegments segments={hidden} onCd={onCd} /> : null}
      <Item first={hidden.length === 0}>
        <button type="button" className={SEGMENT_CLASS} onClick={() => onCd(parent.fullPath)}>
          <SegmentLabel segment={parent} />
        </button>
      </Item>
    </>
  );
}

function CurrentSegmentDropdown({ segment, onCd }: { segment: Segment; onCd: (p: string) => void }) {
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const closeFocus = useMenuCloseFocus();
  const [open, setOpen] = useState(false);
  useHoldTitleBar(open);
  const [children, setChildren] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = segment.fullPath;

  const load = useCallback(async () => {
    setError(null);
    try {
      const dirs = await invoke<string[]>('list_subdirs', {
        path,
        showHidden,
        workspace: currentWorkspaceEnv(),
      });
      setChildren(dirs);
    } catch (e) {
      setError(String(e));
      setChildren([]);
    }
  }, [path, showHidden]);

  // The folders are listed each time the menu opens.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-current="location" className={cn(SEGMENT_CLASS, 'text-foreground')}>
          <SegmentLabel segment={segment} />
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 opacity-70" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto" {...closeFocus}>
        {children === null ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
        ) : children.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{error ?? 'No subfolders'}</div>
        ) : (
          children.map((name) => (
            <DropdownMenuItem
              key={name}
              onSelect={() => onCd(path.endsWith('/') ? `${path}${name}` : `${path}/${name}`)}
            >
              <HugeiconsIcon icon={Folder01Icon} className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              {name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CollapsedSegments({ segments, onCd }: { segments: Segment[]; onCd: (p: string) => void }) {
  const closeFocus = useMenuCloseFocus();
  const [open, setOpen] = useState(false);
  useHoldTitleBar(open);
  return (
    <span className="contents">
      <Item first>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Show hidden folders" className={SEGMENT_CLASS}>
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44" {...closeFocus}>
            {segments.map((s) => (
              <DropdownMenuItem key={s.fullPath} onSelect={() => onCd(s.fullPath)}>
                <HugeiconsIcon
                  icon={s.isHome ? Home03Icon : Folder01Icon}
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <span className="truncate">{s.isHome ? 'Home' : s.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Item>
    </span>
  );
}
