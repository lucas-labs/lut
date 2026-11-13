import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { git, type GitBranchEntry, type GitCommitFileChange, type GitLogEntry, type GitLogScope } from '@/modules/git';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CommitDetail, type FilesEntry } from './CommitDetail';
import { CommitRow, gridTemplate as makeGridTemplate, ROW_HEIGHT } from './CommitRow';
import { railWidth } from './GraphRail';
import { HistoryToolbar } from './HistoryToolbar';
import { EMPTY_GRAPH_STATE, type GraphRow, type GraphState, layoutGraph } from './lib/graph';
import { parseRemoteWebUrl, type RemoteWebInfo } from './lib/remoteWebUrl';
import { normalizeError, useCommitLog } from './useCommitLog';

/** The design's graph column; it widens when more lanes need room. */
const MIN_RAIL_COLUMN_PX = 64;
const NEAR_BOTTOM_PX = 240;
const FILES_CACHE_LIMIT = 16;
const POPOVER_WIDTH = 420;

type CommitFileDiffOpenInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

export type GitHistorySearchHandle = {
  setQuery: (query: string) => void;
  clearQuery: () => void;
};

type Props = {
  repoRoot: string;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  /** Lets the header search bar drive commit filtering for the active pane. */
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

type GraphCache = {
  byCommit: Map<string, GraphRow>;
  tail: GraphState;
  len: number;
  /** The last commit laid out: a longer list extends the layout only while it still holds this commit there. */
  last: GitLogEntry | null;
  maxLaneCount: number;
};

/** The Git history tab (E10-15 design): scope, filter and Fetch, then the commit graph and table. */
export function GitHistoryPane({ repoRoot, onOpenCommitFile, onSearchHandle }: Props) {
  const [scope, setScope] = useState<GitLogScope>({ kind: 'head' });
  const {
    commits,
    status: loadStatus,
    error,
    endReached,
    totalCount,
    loadMore,
    reload,
  } = useCommitLog(repoRoot, scope);

  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput.trim());
  // Require at least 2 characters before filtering to avoid noisy single-char
  // matches and pointless full-list scans on every keystroke.
  const activeSearch = deferredSearch.length >= 2 ? deferredSearch : '';

  useEffect(() => {
    onSearchHandle?.({
      setQuery: (query: string) => setSearchInput(query),
      clearQuery: () => setSearchInput(''),
    });
    return () => onSearchHandle?.(null);
  }, [onSearchHandle]);

  const [branches, setBranches] = useState<GitBranchEntry[] | null>(null);
  const [branchesToken, setBranchesToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    git
      .listBranches(repoRoot)
      .then((result) => {
        if (!cancelled) setBranches(result.branches);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoRoot, branchesToken]);

  const [fetching, setFetching] = useState(false);
  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      await git.fetch(repoRoot);
      reload();
      setBranchesToken((t) => t + 1);
    } catch (err) {
      toast.error('Fetch failed', { description: normalizeError(err) });
    }
    setFetching(false);
  }, [reload, repoRoot]);

  const [openAnchor, setOpenAnchor] = useState<{ sha: string; top: number; left: number } | null>(null);
  const [remoteWeb, setRemoteWeb] = useState<RemoteWebInfo | null>(null);
  // Each opened commit's changed files, newest last, at most FILES_CACHE_LIMIT.
  const [filesCache, setFilesCache] = useState<ReadonlyMap<string, FilesEntry>>(() => new Map());
  const cacheFiles = useCallback((sha: string, entry: FilesEntry) => {
    setFilesCache((prev) => {
      const next = new Map(prev);
      next.delete(sha);
      next.set(sha, entry);
      while (next.size > FILES_CACHE_LIMIT) {
        const oldest = next.keys().next().value;
        if (oldest === undefined || oldest === sha) break;
        next.delete(oldest);
      }
      return next;
    });
  }, []);

  const filesInflightRef = useRef(new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const graphCacheRef = useRef<GraphCache>({
    byCommit: new Map(),
    tail: EMPTY_GRAPH_STATE,
    len: 0,
    last: null,
    maxLaneCount: 1,
  });

  // Loading more pages extends the layout from where it stopped; any other change (a reload, another scope) lays the
  // whole list out again.
  const { graphByCommit, maxLaneCount } = useMemo(() => {
    const cache = graphCacheRef.current;
    const lastOf = (len: number) => (len > 0 ? commits[len - 1] : null);
    const unchanged = commits.length === cache.len && lastOf(cache.len) === cache.last;
    if (!unchanged) {
      const appends = cache.len > 0 && commits.length > cache.len && lastOf(cache.len) === cache.last;
      const { rows, state } = appends ? layoutGraph(commits.slice(cache.len), cache.tail) : layoutGraph(commits);
      if (!appends) {
        cache.byCommit = new Map();
        cache.maxLaneCount = 1;
      }
      for (const row of rows) {
        cache.byCommit.set(row.sha, row);
        if (row.laneCount > cache.maxLaneCount) cache.maxLaneCount = row.laneCount;
      }
      cache.tail = state;
      cache.len = commits.length;
      cache.last = lastOf(commits.length);
    }
    return { graphByCommit: cache.byCommit, maxLaneCount: cache.maxLaneCount };
  }, [commits]);
  const gridTemplate = makeGridTemplate(Math.max(MIN_RAIL_COLUMN_PX, railWidth(maxLaneCount)));

  const filtered = useMemo(() => {
    const q = activeSearch.toLowerCase();
    if (!q) return commits;
    return commits.filter((c) => {
      const subject = c.subject.toLowerCase();
      const author = c.author.toLowerCase();
      const email = c.authorEmail.toLowerCase();
      return subject.includes(q) || author.includes(q) || email.includes(q) || c.shortSha.includes(q);
    });
  }, [commits, activeSearch]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns a mutable instance the compiler cannot memoize, so this component stays uncompiled.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => filtered[index]?.sha ?? index,
  });

  useEffect(() => {
    let cancelled = false;
    git
      .remoteUrl(repoRoot)
      .then((url) => {
        if (!cancelled) setRemoteWeb(parseRemoteWebUrl(url));
      })
      .catch(() => {
        if (!cancelled) setRemoteWeb(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repoRoot]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOpenAnchor((prev) => (prev ? null : prev));
    if (activeSearch || loadStatus !== 'idle') return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < NEAR_BOTTOM_PX) void loadMore();
  }, [activeSearch, loadMore, loadStatus]);

  // Auto-fill: if the list doesn't fill the viewport (no scroll possible)
  // after a load, keep pulling pages until it does or the end is reached.
  // Scheduled async so we don't fight ongoing state transitions.
  useEffect(() => {
    if (loadStatus !== 'idle' || endReached || activeSearch || commits.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight > NEAR_BOTTOM_PX) return;
    const id = window.setTimeout(() => void loadMore(), 0);
    return () => window.clearTimeout(id);
  }, [commits.length, activeSearch, endReached, loadMore, loadStatus]);

  const handleScopeChange = useCallback((next: GitLogScope) => {
    setOpenAnchor(null);
    setScope(next);
  }, []);

  const fetchFiles = useCallback(
    async (sha: string) => {
      if (filesInflightRef.current.has(sha)) return;
      const existing = filesCache.get(sha);
      if (existing && existing.state !== 'error') return;
      filesInflightRef.current.add(sha);
      cacheFiles(sha, { state: 'loading' });
      try {
        const files = await git.commitFiles(repoRoot, sha);
        cacheFiles(sha, { state: 'loaded', files });
      } catch (err) {
        cacheFiles(sha, { state: 'error', error: normalizeError(err) });
      }
      filesInflightRef.current.delete(sha);
    },
    [repoRoot, filesCache, cacheFiles],
  );

  const handleRowClick = useCallback(
    (sha: string, event: MouseEvent<HTMLElement>) => {
      if (openAnchor?.sha === sha) {
        setOpenAnchor(null);
        return;
      }
      // Anchor at the cursor so the popover opens where the user clicked,
      // but clamp X so it never gets pushed off-screen on the right.
      const PADDING = 16;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - PADDING;
      setOpenAnchor({ sha, top: event.clientY, left: Math.max(PADDING, Math.min(event.clientX, maxLeft)) });
      void fetchFiles(sha);
    },
    [fetchFiles, openAnchor?.sha],
  );

  const handleFileOpen = useCallback(
    (commit: GitLogEntry, file: GitCommitFileChange) => {
      onOpenCommitFile({
        repoRoot,
        sha: commit.sha,
        shortSha: commit.shortSha,
        subject: commit.subject,
        path: file.path,
        originalPath: file.originalPath,
      });
      setOpenAnchor(null);
    },
    [onOpenCommitFile, repoRoot],
  );

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* noop */
    }
  }, []);

  const openCommit = openAnchor ? commits.find((c) => c.sha === openAnchor.sha) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background [contain:layout_style]">
      <HistoryToolbar
        scope={scope}
        onScopeChange={handleScopeChange}
        branches={branches}
        query={searchInput}
        onQueryChange={setSearchInput}
        totalCount={totalCount}
        fetching={fetching}
        onFetch={() => void handleFetch()}
      />
      {loadStatus === 'initial' && commits.length === 0 ? (
        <CenterPlaceholder>
          <Spinner className="size-4" />
          <span className="text-xs text-muted-foreground">Loading commits…</span>
        </CenterPlaceholder>
      ) : loadStatus === 'error' && commits.length === 0 ? (
        <CenterPlaceholder>
          <div className="text-[13px] font-medium">Could not load history</div>
          <div className="max-w-md text-[11px] leading-relaxed text-muted-foreground">{error ?? 'Unknown error'}</div>
          <Button size="sm" onClick={reload}>
            Retry
          </Button>
        </CenterPlaceholder>
      ) : commits.length === 0 ? (
        <CenterPlaceholder>
          <div className="text-[13px] font-medium">No commits yet</div>
          <div className="max-w-md text-[11px] leading-relaxed text-muted-foreground">This branch has no commits.</div>
        </CenterPlaceholder>
      ) : (
        <>
          <div
            className="grid h-[30px] shrink-0 items-center gap-x-3 overflow-hidden border-b border-border pr-4 text-[11px] leading-[14px] text-muted-foreground [scrollbar-gutter:stable]"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <span />
            <span>SHA</span>
            <span>Subject</span>
            <span>Author</span>
            <span>Date</span>
            <span className="text-right">Changes</span>
          </div>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
          >
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const commit = filtered[virtualRow.index];
                if (!commit) return null;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <CommitRow
                      commit={commit}
                      query={activeSearch}
                      active={openAnchor?.sha === commit.sha}
                      graphRow={graphByCommit.get(commit.sha) ?? null}
                      maxLaneCount={maxLaneCount}
                      gridTemplate={gridTemplate}
                      onClick={handleRowClick}
                    />
                  </div>
                );
              })}
            </div>

            {loadStatus === 'more' ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                Loading more…
              </div>
            ) : null}
            {endReached && !activeSearch ? (
              <div className="py-3 text-center text-[11px] text-muted-foreground">End of history</div>
            ) : null}
            {loadStatus === 'error' ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-destructive">
                {error ?? 'Failed to load more'}
                <Button size="xs" variant="ghost" onClick={() => void loadMore()}>
                  Retry
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <Popover
        open={!!openCommit}
        onOpenChange={(next) => {
          if (!next) setOpenAnchor(null);
        }}
      >
        {createPortal(
          <PopoverAnchor asChild>
            <div
              aria-hidden
              style={{
                position: 'fixed',
                top: openAnchor?.top ?? -9999,
                left: openAnchor?.left ?? -9999,
                width: 1,
                height: 1,
                pointerEvents: 'none',
              }}
            />
          </PopoverAnchor>,
          document.body,
        )}
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-[420px] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[8px] border border-border p-0 shadow-[0_12px_32px_rgba(0,0,0,0.4)] ring-0 dark:ring-0"
        >
          {openCommit ? (
            <CommitDetail
              commit={openCommit}
              filesEntry={filesCache.get(openCommit.sha) ?? null}
              remoteWeb={remoteWeb}
              onCopySha={copyToClipboard}
              onOpenFile={handleFileOpen}
              onRetryFiles={() => void fetchFiles(openCommit.sha)}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CenterPlaceholder({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">{children}</div>;
}
