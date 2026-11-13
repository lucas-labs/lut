import { git, type GitLogEntry, type GitLogScope } from '@/modules/git';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZE = 30;

type CommitLogStatus = 'idle' | 'initial' | 'more' | 'error';

type LogState = {
  /** The repo and scope these commits belong to. */
  key: string;
  commits: GitLogEntry[];
  status: CommitLogStatus;
  error: string | null;
  endReached: boolean;
  totalCount: number | null;
  /**
   * How many commits git has returned for this scope so far, the next page's skip. It counts the duplicates dropped
   * from `commits` too: commits added on top shift git's list, and skipping only the shown ones would ask for them again.
   */
  offset: number;
  /** Which request the error belongs to, so Retry repeats that one. */
  failed: 'first' | 'more' | null;
};

const fresh = (key: string): LogState => ({
  key,
  commits: [],
  status: 'initial',
  error: null,
  endReached: false,
  totalCount: null,
  offset: 0,
  failed: null,
});

export function normalizeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Unknown error';
}

/**
 * The history view's commits for a scope, loaded a page at a time, and the scope's total commit count. A new repo or
 * scope starts over and drops the answers still on their way for the old one.
 */
export function useCommitLog(repoRoot: string, scope: GitLogScope) {
  const key = `${repoRoot}\n${scope.kind === 'branch' ? `branch:${scope.name}` : scope.kind}`;
  const [state, setState] = useState(() => fresh(key));
  const [reloadToken, setReloadToken] = useState(0);
  const inflightMoreRef = useRef(false);

  // A new repo or scope resets the state while rendering, before its first page loads.
  const stale = state.key !== key;
  if (stale) setState(fresh(key));
  const current = stale ? fresh(key) : state;

  useEffect(() => {
    let cancelled = false;
    const apply = (update: (s: LogState) => LogState) => {
      if (!cancelled) setState((s) => (s.key === key ? update(s) : s));
    };
    git
      .commitCount(repoRoot, scope)
      .then((totalCount) => apply((s) => ({ ...s, totalCount })))
      .catch(() => apply((s) => ({ ...s, totalCount: null })));
    git
      .log(repoRoot, { limit: PAGE_SIZE, scope })
      .then((commits) =>
        apply((s) => ({
          ...s,
          commits,
          status: 'idle',
          error: null,
          failed: null,
          endReached: commits.length < PAGE_SIZE,
          offset: commits.length,
        })),
      )
      .catch((err: unknown) =>
        apply((s) => ({ ...s, status: 'error', error: normalizeError(err), failed: 'first' })),
      );
    return () => {
      cancelled = true;
    };
  }, [key, repoRoot, scope, reloadToken]);

  /** Loads the first page again; the commits already shown stay until it arrives. */
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'initial', error: null, failed: null, endReached: false }));
    setReloadToken((t) => t + 1);
  }, []);

  const { status, endReached, offset, failed } = current;
  const loadPage = useCallback(
    async (retrying: boolean) => {
      const ready = status === 'idle' || (retrying && failed === 'more');
      if (inflightMoreRef.current || endReached || !ready || offset === 0) return;
      inflightMoreRef.current = true;
      setState((s) => (s.key === key ? { ...s, status: 'more', error: null, failed: null } : s));
      // A reload or another scope while this page loads moves the state off 'more', and the page is dropped.
      const stillWanted = (s: LogState) => s.key === key && s.status === 'more';
      try {
        const entries = await git.log(repoRoot, { limit: PAGE_SIZE, skip: offset, scope });
        setState((s) => {
          if (!stillWanted(s)) return s;
          const seen = new Set(s.commits.map((c) => c.sha));
          return {
            ...s,
            commits: s.commits.concat(entries.filter((e) => !seen.has(e.sha))),
            status: 'idle',
            endReached: entries.length < PAGE_SIZE,
            offset: s.offset + entries.length,
          };
        });
      } catch (err) {
        const message = normalizeError(err);
        // The offset stays, so the retry asks for the same page.
        setState((s) =>
          stillWanted(s) ? { ...s, status: 'error', error: message, failed: 'more' } : s,
        );
      }
      inflightMoreRef.current = false;
    },
    [endReached, failed, key, offset, repoRoot, scope, status],
  );

  /** Loads the next page. */
  const loadMore = useCallback(() => loadPage(false), [loadPage]);

  /** Repeats the request that failed: the first page, or the page after the ones shown. */
  const retry = useCallback(() => {
    if (failed === 'first') reload();
    else void loadPage(true);
  }, [failed, loadPage, reload]);

  return { ...current, loadMore, reload, retry };
}
