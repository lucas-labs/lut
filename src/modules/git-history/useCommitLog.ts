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
};

const fresh = (key: string): LogState => ({
  key,
  commits: [],
  status: 'initial',
  error: null,
  endReached: false,
  totalCount: null,
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
          endReached: commits.length < PAGE_SIZE,
        })),
      )
      .catch((err: unknown) =>
        apply((s) => ({ ...s, status: 'error', error: normalizeError(err) })),
      );
    return () => {
      cancelled = true;
    };
  }, [key, repoRoot, scope, reloadToken]);

  /** Loads the first page again; the commits already shown stay until it arrives. */
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'initial', error: null, endReached: false }));
    setReloadToken((t) => t + 1);
  }, []);

  const { commits, status, endReached } = current;
  /** Loads the next page; after a failed page this is its retry. */
  const loadMore = useCallback(async () => {
    const ready = status === 'idle' || status === 'error';
    if (inflightMoreRef.current || endReached || !ready || commits.length === 0) return;
    inflightMoreRef.current = true;
    setState((s) => (s.key === key ? { ...s, status: 'more' } : s));
    // A reload or another scope while this page loads moves the state off 'more', and the page is dropped.
    const stillWanted = (s: LogState) => s.key === key && s.status === 'more';
    try {
      const entries = await git.log(repoRoot, { limit: PAGE_SIZE, skip: commits.length, scope });
      setState((s) => {
        if (!stillWanted(s)) return s;
        const seen = new Set(s.commits.map((c) => c.sha));
        return {
          ...s,
          commits: s.commits.concat(entries.filter((e) => !seen.has(e.sha))),
          status: 'idle',
          endReached: entries.length < PAGE_SIZE,
        };
      });
    } catch (err) {
      const message = normalizeError(err);
      setState((s) => (stillWanted(s) ? { ...s, status: 'error', error: message } : s));
    }
    inflightMoreRef.current = false;
  }, [commits.length, endReached, key, repoRoot, scope, status]);

  return { ...current, loadMore, reload };
}
