import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { currentWorkspaceEnv } from '@/modules/workspace';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { invoke } from '@tauri-apps/api/core';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FileIcon, FolderIcon } from './FileIcon';
import { copyToClipboard, revealInFinder } from './lib/contextActions';

type SearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

type SearchResult = {
  hits: SearchHit[];
  truncated: boolean;
};

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;

type Props = {
  rootPath: string;
  onOpenFile: (path: string) => void;
  open: boolean;
  onRequestClose: () => void;
  onActiveChange?: (active: boolean) => void;
  onRevealInTerminal?: (path: string) => void;
  onOpenInSourceControl?: (path: string) => void;
  onOpenGitHistory?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
};

type Found = { key: string; hits: SearchHit[]; truncated: boolean };
const NO_HITS: SearchHit[] = [];

/** A line about the search itself, set like the tree's loading and error rows. */
function SearchStatus({ children }: { children: ReactNode }) {
  return <div className="h-6 truncate px-2 text-[11px] leading-6 text-muted-foreground">{children}</div>;
}

export type ExplorerSearchHandle = {
  focus: () => void;
  isFocused: () => boolean;
};

export const ExplorerSearch = forwardRef<ExplorerSearchHandle, Props>(function ExplorerSearch(
  {
    rootPath,
    onOpenFile,
    open,
    onRequestClose,
    onActiveChange,
    onRevealInTerminal,
    onOpenInSourceControl,
    onOpenGitHistory,
    onAttachToAgent,
  }: Props,
  ref,
) {
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const [query, setQuery] = useState('');
  /** The last search's answer, with the search it answers; the results stay shown while the next one runs. */
  const [found, setFound] = useState<Found | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastKeyboardNavAt = useRef(0);

  const q = query.trim();
  const active = q.length > 0;
  const searchKey = q.length >= MIN_QUERY_LEN ? `${rootPath}\n${showHidden}\n${q}` : null;
  const results = searchKey && found ? found.hits : NO_HITS;
  const truncated = searchKey !== null && !!found?.truncated;
  const searching = searchKey !== null && found?.key !== searchKey;

  // Closing clears the search, while rendering, so it opens empty next time.
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (!open) {
      setQuery('');
      setFound(null);
      setSelectedIndex(0);
    }
  }

  /** A query too short to search drops the last answer, so a new search starts from "Searching…". */
  const changeQuery = (next: string) => {
    setQuery(next);
    if (next.trim().length < MIN_QUERY_LEN) {
      setFound(null);
      setSelectedIndex(0);
    }
  };

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!searchKey) return;
    let alive = true;
    const handle = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult>('fs_search', {
          root: rootPath,
          query: q,
          limit: 200,
          showHidden,
          requestKey: 'explorer-search',
          workspace: currentWorkspaceEnv(),
        });
        if (alive) setFound({ key: searchKey, hits: res.hits, truncated: res.truncated });
      } catch (e) {
        if (alive) {
          console.error('fs_search failed:', e);
          setFound({ key: searchKey, hits: [], truncated: false });
        }
      }
      if (alive) setSelectedIndex(0);
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [searchKey, q, rootPath, showHidden]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
      isFocused: () => document.activeElement === inputRef.current,
    }),
    [],
  );

  useEffect(() => {
    if (active && results.length > 0) {
      const el = scrollRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results, active]);

  const handleSelect = (hit: SearchHit) => {
    if (!hit.is_dir) {
      onOpenFile(hit.path);
    }
  };

  return (
    <div className={cn('flex flex-col', active && 'min-h-0 flex-1')}>
      {open ? (
        <div className="relative shrink-0 px-1.5 pb-1.5 animate-in fade-in-0 slide-in-from-top-3 duration-200 ease-out">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-3.5 left-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onRequestClose();
                return;
              }
              if (results.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  lastKeyboardNavAt.current = Date.now();
                  setSelectedIndex((prev) => (prev + 1) % results.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  lastKeyboardNavAt.current = Date.now();
                  setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSelect(results[selectedIndex]);
                }
              }
            }}
            placeholder="Search files…"
            aria-label="Search files"
            spellCheck={false}
            className="pr-7 pl-[27px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => changeQuery('')}
              className="absolute top-3.5 right-2.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : null}

      {active ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-1.5 pb-1.5" ref={scrollRef}>
            {searching && results.length === 0 ? (
              <SearchStatus>Searching…</SearchStatus>
            ) : results.length === 0 ? (
              <SearchStatus>No matches</SearchStatus>
            ) : (
              results.map((hit, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <ContextMenu key={hit.path}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        data-index={index}
                        onClick={() => handleSelect(hit)}
                        onMouseEnter={() => {
                          if (Date.now() - lastKeyboardNavAt.current > 250) {
                            setSelectedIndex(index);
                          }
                        }}
                        className={cn(
                          'flex h-6 w-full min-w-0 items-center gap-[5px] rounded-sm px-2 text-left text-[13px] leading-[18px] text-foreground',
                          isSelected && 'bg-accent',
                        )}
                        title={hit.path}
                      >
                        {hit.is_dir ? (
                          <FolderIcon name={hit.name} className="size-3.5 shrink-0" />
                        ) : (
                          <FileIcon name={hit.name} className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">{hit.name}</span>
                        <span className="ml-auto truncate text-[11px] text-muted-foreground">{hit.rel}</span>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {!hit.is_dir && <ContextMenuItem onSelect={() => onOpenFile(hit.path)}>Open</ContextMenuItem>}
                      {hit.is_dir && onRevealInTerminal && (
                        <ContextMenuItem onSelect={() => onRevealInTerminal(hit.path)}>
                          Open in Terminal
                        </ContextMenuItem>
                      )}
                      {hit.is_dir && onOpenInSourceControl && (
                        <ContextMenuItem onSelect={() => onOpenInSourceControl(hit.path)}>
                          Open in Source Control
                        </ContextMenuItem>
                      )}
                      {hit.is_dir && onOpenGitHistory && (
                        <ContextMenuItem onSelect={() => onOpenGitHistory(hit.path)}>Open Git History</ContextMenuItem>
                      )}
                      <ContextMenuItem onSelect={() => void revealInFinder(hit.path)}>Reveal in Finder</ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => void copyToClipboard(hit.path)}>Copy Path</ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => onAttachToAgent?.(hit.path)}>Attach to Agent</ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            )}
            {truncated && results.length > 0 ? (
              <SearchStatus>Showing partial results — refine your query.</SearchStatus>
            ) : null}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
});
