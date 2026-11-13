import { usePreferencesStore } from '@/modules/settings/preferences';
import { currentWorkspaceEnv, useWorkspaceEnvStore, workspaceScopeKey } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { excludeNestedSources, executeBatchMove, type FsMoveResult } from './batchMove';
import { listenFsChanged, watchAdd, watchRemove } from './watch';
import { createWatchRegistry, planVisibilityEdge } from './watchRegistry';

export type DirEntry = {
  name: string;
  kind: 'file' | 'dir' | 'symlink';
  size: number;
  mtime: number;
  gitignored: boolean;
};

type DeleteBatchResult = { deleted: string[]; failed: number };

type ChildrenState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; entries: DirEntry[] }
  | { status: 'error'; message: string };

type TreeState = Record<string, ChildrenState>;

export type PendingCreate = {
  parentPath: string;
  kind: 'file' | 'dir';
};

export function joinPath(parent: string, name: string): string {
  if (parent.endsWith('/')) return `${parent}${name}`;
  return `${parent}/${name}`;
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  if (i <= 0) return '/';
  return path.slice(0, i);
}

const EXPANSION_CACHE_LIMIT = 8;
const expansionCache = new Map<string, string[]>();

function rememberExpansion(root: string, expanded: Set<string>): void {
  expansionCache.delete(root);
  if (expanded.size > 0) expansionCache.set(root, [...expanded]);
  while (expansionCache.size > EXPANSION_CACHE_LIMIT) {
    const oldest = expansionCache.keys().next().value;
    if (oldest === undefined) break;
    expansionCache.delete(oldest);
  }
}

function recallExpansion(root: string): string[] {
  const v = expansionCache.get(root);
  if (!v) return [];
  expansionCache.delete(root);
  expansionCache.set(root, v);
  return v;
}

/**
 * Whether a listing read with `showHidden` can include `child`: with hidden entries off, the backend leaves out every
 * dot-prefixed name, so such a child missing from the listing is not gone.
 */
function listingCovers(child: string, showHidden: boolean): boolean {
  return showHidden || !child.slice(child.lastIndexOf('/') + 1).startsWith('.');
}

function isUnder(key: string, root: string): boolean {
  return key === root || key.startsWith(`${root}/`);
}

// mtime/size are ignored on purpose: the tree never renders them, so a watcher
// refetch that only bumps mtime (saving a file) must not count as a change.
function sameDirListing(a: DirEntry[], b: DirEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].kind !== b[i].kind || a[i].gitignored !== b[i].gitignored)
      return false;
  }
  return true;
}

type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathsDeleted?: (paths: string[]) => void;
  canReplacePath?: (path: string) => boolean;
  /**
   * The explorer is on screen (default true). While false it holds no native
   * watchers, ignores `fs:changed` and skips reloads; showing it again
   * re-registers its watchers and reloads every loaded directory once.
   */
  active?: boolean;
};

export function useFileTree(rootPath: string | null, options?: Options) {
  const workspace = useWorkspaceEnvStore((s) => s.env);
  const workspaceKey = workspaceScopeKey(workspace);
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const gitDecorations = usePreferencesStore((s) => s.explorerGitDecorations);
  const gitDecorationsRef = useRef(gitDecorations);
  const [nodes, setNodes] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const active = options?.active ?? true;
  const activeRef = useRef(active);
  // Loaded data may predate changes nobody was watching for: reload on show.
  const staleRef = useRef(false);
  const rootPathRef = useRef(rootPath);
  const [watches] = useState(() =>
    createWatchRegistry({ add: watchAdd, remove: watchRemove }, active),
  );
  const expandedRef = useRef(expanded);
  const nodesRef = useRef(nodes);
  const optionsRef = useRef(options);
  const scopeKey = `${workspaceKey}\u0000${rootPath ?? ''}`;
  const scopeKeyRef = useRef(scopeKey);
  const scopeGenerationRef = useRef(0);
  // The newest read started for each directory.
  const readsRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const conflictPromptsRef = useRef<Map<string | number, () => void>>(new Map());

  const cancelConflictPrompts = useCallback(() => {
    for (const cancel of [...conflictPromptsRef.current.values()]) cancel();
    conflictPromptsRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useLayoutEffect(() => {
    activeRef.current = active;
    rootPathRef.current = rootPath;
  }, [active, rootPath]);

  useLayoutEffect(() => {
    if (scopeKeyRef.current !== scopeKey) {
      cancelConflictPrompts();
      scopeGenerationRef.current += 1;
    }
    scopeKeyRef.current = scopeKey;
  }, [scopeKey, cancelConflictPrompts]);

  useEffect(
    () => () => {
      scopeKeyRef.current = '';
      scopeGenerationRef.current += 1;
      cancelConflictPrompts();
    },
    [cancelConflictPrompts],
  );

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    gitDecorationsRef.current = gitDecorations;
  }, [gitDecorations]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const addWatch = watches.add;
  const removeWatch = watches.remove;

  /**
   * Reads one directory and applies its listing. `isLatest` says whether this is still the newest read of the
   * directory; a superseded read applies nothing and answers with the newer read's result, whichever lands first.
   */
  const readChildren = useCallback(
    async (path: string, isLatest: () => boolean): Promise<boolean> => {
      if (scopeKeyRef.current !== scopeKey) return false;
      const generation = scopeGenerationRef.current;
      const isCurrent = () => generation === scopeGenerationRef.current;
      const superseded = () => readsRef.current.get(path) ?? false;
      const showHidden = showHiddenRef.current;
      if (nodesRef.current[path]?.status !== 'loaded') {
        setNodes((s) => ({ ...s, [path]: { status: 'loading' } }));
      }
      let entries: DirEntry[];
      try {
        entries = await invoke<DirEntry[]>('fs_read_dir', {
          path,
          showHidden,
          gitDecorations: gitDecorationsRef.current,
          workspace,
        });
      } catch (e) {
        if (!isCurrent()) return false;
        if (!isLatest()) return superseded();
        const message = String(e);
        setNodes((s) => ({
          ...s,
          [path]: { status: 'error', message },
        }));
        return false;
      }
      if (!isCurrent()) return false;
      if (!isLatest()) return superseded();

      const liveDirs = new Set(
        entries.filter((e) => e.kind === 'dir').map((e) => joinPath(path, e.name)),
      );
      const removedRoots: string[] = [];
      for (const key of Object.keys(nodesRef.current)) {
        if (dirname(key) === path && !liveDirs.has(key) && listingCovers(key, showHidden))
          removedRoots.push(key);
      }
      // Same listing and nothing to drop: nothing changed. A child the listing now covers can still be gone (a hidden
      // folder deleted while hidden entries were off).
      const prev = nodesRef.current[path];
      if (
        removedRoots.length === 0 &&
        prev?.status === 'loaded' &&
        sameDirListing(prev.entries, entries)
      ) {
        return true;
      }
      const dead = new Set<string>();
      if (removedRoots.length > 0) {
        const candidates = new Set<string>([
          ...Object.keys(nodesRef.current),
          ...expandedRef.current,
          ...watches.paths(),
        ]);
        for (const k of candidates) {
          if (removedRoots.some((r) => isUnder(k, r))) dead.add(k);
        }
      }

      setNodes((s) => {
        const next: TreeState = {};
        for (const [k, v] of Object.entries(s)) if (!dead.has(k)) next[k] = v;
        next[path] = { status: 'loaded', entries };
        return next;
      });

      if (dead.size > 0) {
        setExpanded((c) => {
          let changed = false;
          const n = new Set(c);
          for (const d of dead) if (n.delete(d)) changed = true;
          return changed ? n : c;
        });
        watches.removeMany([...dead]);
      }
      return true;
    },
    [scopeKey, workspace, watches],
  );

  const fetchChildren = useCallback(
    (path: string): Promise<boolean> => {
      const read: Promise<boolean> = readChildren(path, () => readsRef.current.get(path) === read);
      readsRef.current.set(path, read);
      return read;
    },
    [readChildren],
  );

  // A new scope (root or workspace) starts empty, with the root's cached expansion; the same root keeps what is
  // expanded.
  const [scopeShown, setScopeShown] = useState<{ key: string; root: string | null } | null>(null);
  if (scopeShown?.key !== scopeKey) {
    setScopeShown({ key: scopeKey, root: rootPath });
    setNodes({});
    setPendingCreate(null);
    setRenaming(null);
    if (!rootPath) setExpanded(new Set());
    else if (scopeShown?.root !== rootPath) setExpanded(new Set(recallExpansion(rootPath)));
  }

  // Root change → load the root and its restored expansion, re-scope watches,
  // and persist the outgoing root's expansion on the way out.
  useEffect(() => {
    if (!rootPath) return;
    const restored = recallExpansion(rootPath);
    // Sync the ref synchronously: nodesRef only updates after the next render,
    // so without this a fast (cached) fetchChildren below would read the stale
    // pre-clear "loaded" node, hit the sameDirListing early-return, and skip
    // re-populating — leaving a valid root with an empty tree when rootPath
    // changes rapidly (e.g. switching folders in quick succession).
    nodesRef.current = {};

    // The desired watch set is always tracked; it only reaches the native
    // watcher while the explorer is on screen.
    watches.addMany([rootPath, ...restored]);
    if (activeRef.current) {
      void fetchChildren(rootPath);
      for (const d of restored) void fetchChildren(d);
    } else {
      staleRef.current = true;
    }

    return () => {
      rememberExpansion(rootPath, expandedRef.current);
      watches.clear();
    };
  }, [rootPath, fetchChildren, watches]);

  // Visibility edge: release the native watchers while hidden, and on show
  // re-register them and reload everything that is loaded (or should be) once.
  useEffect(() => {
    const plan = planVisibilityEdge({
      active,
      stale: staleRef.current,
      hasRoot: rootPathRef.current !== null,
    });
    staleRef.current = plan.stale;
    if (plan.arm) watches.arm();
    else watches.disarm();
    if (!plan.resync) return;
    const targets = new Set(watches.paths());
    for (const [path, state] of Object.entries(nodesRef.current)) {
      if (state.status === 'loaded') targets.add(path);
    }
    for (const path of targets) void fetchChildren(path);
  }, [active, watches, fetchChildren]);

  useEffect(() => {
    // No subscription while hidden: nothing would be shown, and the show edge
    // above reloads whatever changed in the meantime.
    if (!active) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listenFsChanged((paths) => {
      const current = nodesRef.current;
      const dirs = new Set<string>();
      for (const p of paths) {
        const parent = dirname(p);
        if (current[parent]?.status === 'loaded') dirs.add(parent);
        if (current[p]?.status === 'loaded') dirs.add(p);
      }
      for (const d of dirs) void fetchChildren(d);
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [active, fetchChildren]);

  // Re-list loaded directories when the visibility or git-decoration prefs
  // change. Keyed on the prefs only: a root change already loads its own
  // tree, and re-reading the *previous* root's directories would be wasted IPC.
  // While hidden the change is just remembered; the show edge reloads.
  useEffect(() => {
    if (!rootPathRef.current) return;
    if (!activeRef.current) {
      staleRef.current = true;
      return;
    }
    for (const [path, state] of Object.entries(nodesRef.current)) {
      if (state.status === 'loaded') void fetchChildren(path);
    }
  }, [showHidden, gitDecorations, fetchChildren]);

  const toggle = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.delete(path);
          return next;
        });
        removeWatch(path);
      } else {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.add(path);
          return next;
        });
        addWatch(path);
        void fetchChildren(path);
      }
    },
    [fetchChildren, addWatch, removeWatch],
  );

  const expand = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) return;
      setExpanded((curr) => {
        const next = new Set(curr);
        next.add(path);
        return next;
      });
      addWatch(path);
      void fetchChildren(path);
    },
    [fetchChildren, addWatch],
  );

  const refresh = useCallback(
    (path: string, reveal = false) => {
      if (scopeKeyRef.current !== scopeKey) return Promise.resolve(false);
      if (reveal && path !== rootPath && !expandedRef.current.has(path)) {
        setExpanded((curr) => new Set(curr).add(path));
        addWatch(path);
      }
      return fetchChildren(path);
    },
    [fetchChildren, addWatch, rootPath, scopeKey],
  );

  // --- mutations ---

  const beginCreate = useCallback(
    (parentPath: string, kind: 'file' | 'dir') => {
      setRenaming(null);
      setPendingCreate({ parentPath, kind });
      // Ensure the parent is expanded so the input row is visible.
      if (rootPath && parentPath !== rootPath) {
        setExpanded((curr) => {
          if (curr.has(parentPath)) return curr;
          const next = new Set(curr);
          next.add(parentPath);
          return next;
        });
        addWatch(parentPath);
      }
      setNodes((curr) => {
        if (!curr[parentPath]) void fetchChildren(parentPath);
        return curr;
      });
    },
    [rootPath, fetchChildren, addWatch],
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      if (!pendingCreate) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const path = joinPath(pendingCreate.parentPath, trimmed);
      const cmd = pendingCreate.kind === 'dir' ? 'fs_create_dir' : 'fs_create_file';
      try {
        await invoke(cmd, { path, workspace: currentWorkspaceEnv() });
        await fetchChildren(pendingCreate.parentPath);
      } catch (e) {
        console.error(`${cmd} failed:`, e);
      }
      setPendingCreate(null);
    },
    [pendingCreate, fetchChildren],
  );

  const beginRename = useCallback((path: string) => {
    setPendingCreate(null);
    setRenaming(path);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      const trimmed = newName.trim();
      const parent = dirname(renaming);
      const oldName = renaming.slice(parent === '/' ? 1 : parent.length + 1);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = joinPath(parent, trimmed);
      const renamed = await invoke('fs_rename', { from: renaming, to, workspace }).then(
        () => true,
        (e: unknown) => {
          console.error('fs_rename failed:', e);
          return false;
        },
      );
      if (renamed) {
        optionsRef.current?.onPathRenamed?.(renaming, to);
        if (scopeKeyRef.current === scopeKey) await fetchChildren(parent);
      }
      setRenaming(null);
    },
    [renaming, workspace, scopeKey, fetchChildren],
  );

  const deletePath = useCallback(
    async (path: string) => {
      const deleted = await invoke('fs_delete', { path, workspace }).then(
        () => true,
        (e: unknown) => {
          console.error('fs_delete failed:', e);
          return false;
        },
      );
      if (!deleted) return;
      optionsRef.current?.onPathsDeleted?.([path]);
      if (scopeKeyRef.current === scopeKey) await fetchChildren(dirname(path));
    },
    [workspace, scopeKey, fetchChildren],
  );

  const deletePaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const topLevelPaths = excludeNestedSources(paths);
      const run = async () => {
        if (scopeKeyRef.current !== scopeKey) return;
        const { deleted, failed } = await invoke<DeleteBatchResult>('fs_delete_batch', {
          paths: topLevelPaths,
          root: rootPath ?? '',
          workspace,
        });
        if (deleted.length > 0) {
          optionsRef.current?.onPathsDeleted?.(deleted);
        }
        if (scopeKeyRef.current === scopeKey) {
          const parents = new Set(deleted.map(dirname));
          await Promise.all([...parents].map((path) => fetchChildren(path)));
        }
        if (failed > 0) toast.error('Delete failed for one or more items');
      };
      await run();
    },
    [workspace, rootPath, scopeKey, fetchChildren],
  );

  const resolveMoveConflict = useCallback(
    (name: string) =>
      new Promise<'replace' | 'skip'>((resolve) => {
        let settled = false;
        let id: string | number;
        const finish = (resolution: 'replace' | 'skip', dismiss: boolean) => {
          if (settled) return;
          settled = true;
          conflictPromptsRef.current.delete(id);
          resolve(resolution);
          if (dismiss) toast.dismiss(id);
        };
        id = toast.warning(`"${name}" already exists`, {
          duration: Infinity,
          action: {
            label: 'Replace',
            onClick: () => finish('replace', true),
          },
          cancel: { label: 'Skip', onClick: () => finish('skip', true) },
          onDismiss: () => finish('skip', false),
        });
        conflictPromptsRef.current.set(id, () => finish('skip', true));
      }),
    [],
  );

  const movePaths = useCallback(
    async (sources: string[], toDir: string) => {
      if (sources.length === 0) return;
      const run = async () => {
        if (scopeKeyRef.current !== scopeKey) return;
        const parents = new Set<string>([toDir]);
        const outcome = await executeBatchMove(sources, toDir, {
          move: (item, expectedConflict) =>
            invoke<FsMoveResult>('fs_move', {
              from: item.from,
              to: item.to,
              root: rootPath ?? '',
              expectedConflict,
              workspace,
            }),
          resolveConflict: (item) => resolveMoveConflict(item.name),
          canReplace: (item) => optionsRef.current?.canReplacePath?.(item.to) ?? true,
          onMoved: (item) => {
            parents.add(dirname(item.from));
            optionsRef.current?.onPathRenamed?.(item.from, item.to);
          },
          isCurrent: () => scopeKeyRef.current === scopeKey,
        });

        if (scopeKeyRef.current === scopeKey && outcome.moved > 0) {
          await Promise.all([...parents].map((path) => fetchChildren(path)));
        }
        if (outcome.blocked > 0) {
          toast.warning('Close destination before replacing');
        }
        if (outcome.failures > 0) {
          toast.error(outcome.moved > 0 ? 'Some items could not be moved' : 'Move failed');
        }
      };
      await run();
    },
    [workspace, rootPath, scopeKey, resolveMoveConflict, fetchChildren],
  );

  return {
    nodes,
    expanded,
    pendingCreate,
    renaming,
    toggle,
    expand,
    refresh,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    deletePaths,
    movePaths,
    joinPath,
  };
}
