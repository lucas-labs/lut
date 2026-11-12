import { currentWorkspaceEnv } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileHit } from '../lib/quickOpen';

const LIMIT = 100;
const REQUEST_KEY = 'palette-files';
const WARM_REQUEST_KEY = 'palette-files-warm';

type SearchResponse = {
  hits: FileHit[];
  truncated: boolean;
  cancelled: boolean;
};

export type FileSearchState = {
  hits: FileHit[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

type Snapshot = Omit<FileSearchState, 'retry'>;

const IDLE: Snapshot = { hits: [], loading: false, error: null };

/**
 * Fuzzy file search over the Rust-side cached index. No debounce: every
 * keystroke asks, the backend drops the superseded query, and a reply for an
 * older query is ignored here as well. The previous hits stay on screen until
 * the new ones land so the list never blanks between keystrokes.
 */
export function useFileSearch(
  root: string | null,
  query: string,
  enabled: boolean,
  showHidden: boolean,
): FileSearchState {
  const [state, setState] = useState<Snapshot>(IDLE);
  const requestIdRef = useRef(0);

  /** Asks the backend; the caller has already marked the search as loading. */
  const request = useCallback(
    (q: string) => {
      if (!root) return;
      const requestId = ++requestIdRef.current;
      invoke<SearchResponse>('fs_search', {
        root,
        query: q,
        limit: LIMIT,
        showHidden,
        filesOnly: true,
        withIndices: true,
        requestKey: REQUEST_KEY,
        workspace: currentWorkspaceEnv(),
      })
        .then((res) => {
          if (requestId !== requestIdRef.current) return;
          if (res.cancelled) setState((s) => ({ ...s, loading: false }));
          else setState({ hits: res.hits, loading: false, error: null });
        })
        .catch((e) => {
          if (requestId !== requestIdRef.current) return;
          setState({ hits: [], loading: false, error: String(e) });
        });
    },
    [root, showHidden],
  );

  // Without a query there is nothing to show; a reply still in flight is ignored (request id). A new search
  // loads, and keeps the previous hits on screen until its own land.
  const idle = !enabled || !root || !query;
  const search = idle ? null : { root, query, showHidden };
  const [shownSearch, setShownSearch] = useState<typeof search>(null);
  if (
    search?.root !== shownSearch?.root ||
    search?.query !== shownSearch?.query ||
    search?.showHidden !== shownSearch?.showHidden
  ) {
    setShownSearch(search);
    setState(search ? (s) => ({ ...s, loading: true, error: null }) : IDLE);
  }

  useEffect(() => {
    requestIdRef.current += 1;
    if (!enabled || !root || !query) {
      if (enabled && root) {
        void invoke('fs_search', {
          root,
          query: '',
          requestKey: REQUEST_KEY,
        }).catch(() => {});
      }
      return;
    }
    request(query);
    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, root, query, request]);

  // Building the index is the slow part of the first search in a project; do
  // it while the user is still typing the first character.
  useEffect(() => {
    if (!enabled || !root) return;
    const args = {
      root,
      showHidden,
      workspace: currentWorkspaceEnv(),
      requestKey: WARM_REQUEST_KEY,
    };
    void invoke('fs_warm_index', args).catch(() => {});
    return () => {
      void invoke('fs_search', {
        root,
        query: '',
        requestKey: REQUEST_KEY,
      }).catch(() => {});
      void invoke('fs_warm_index', { ...args, cancel: true }).catch(() => {});
    };
  }, [enabled, root, showHidden]);

  const retry = useCallback(() => {
    if (!enabled || !root || !query) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    request(query);
  }, [enabled, root, query, request]);

  return { ...state, retry };
}
