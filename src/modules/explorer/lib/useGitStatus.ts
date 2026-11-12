import type { GitStatusSnapshot } from '@/modules/git';
import { workspaceNative } from '@/modules/workspace';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bubbleUpDirectoryStatuses,
  buildGitStatusMap,
  type GitStatusCode,
  lookupGitStatus,
  normalizePath,
} from './gitStatusUtils';

const EMPTY = new Map<string, GitStatusCode>();

// Decorations ride the always-resident SC snapshot: no fetch, no watcher. When
// the shared status does not cover the explorer root, nothing is shown rather
// than triggering git work of our own.
export function useGitStatus(
  workspaceRoot: string | null,
  status: GitStatusSnapshot | null | undefined,
  enabled: boolean,
) {
  // The root's canonical form, kept with the root it belongs to: it only counts for that root.
  const [resolved, setResolved] = useState<{ root: string; canonical: string | null } | null>(null);
  const canonicalRoot =
    enabled && workspaceRoot && resolved?.root === workspaceRoot ? resolved.canonical : null;
  const reqRef = useRef(0);

  useEffect(() => {
    if (!enabled || !workspaceRoot) {
      reqRef.current += 1;
      return;
    }
    const req = ++reqRef.current;
    void workspaceNative
      .canonicalize(workspaceRoot)
      .then((c) => {
        if (req === reqRef.current) setResolved({ root: workspaceRoot, canonical: c });
      })
      .catch(() => {
        if (req === reqRef.current) setResolved({ root: workspaceRoot, canonical: null });
      });
  }, [enabled, workspaceRoot]);

  const aliases = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const r of [workspaceRoot, canonicalRoot]) {
      if (!r) continue;
      const n = normalizePath(r);
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(r);
    }
    return out;
  }, [workspaceRoot, canonicalRoot]);

  // The explorer root and the snapshot's repo overlap in either nesting
  // direction; lookups still return null for paths outside the repo.
  const repoRoot0 = status ? normalizePath(status.repoRoot) : null;
  const covers =
    enabled &&
    !!status &&
    !!repoRoot0 &&
    aliases.some((a) => {
      const t = normalizePath(a);
      return t === repoRoot0 || t.startsWith(`${repoRoot0}/`) || repoRoot0.startsWith(`${t}/`);
    });

  const map = useMemo(() => {
    if (!covers || !status) return EMPTY;
    const m = buildGitStatusMap(status);
    bubbleUpDirectoryStatuses(m);
    return m;
  }, [covers, status]);
  const repoRoot = covers && status ? status.repoRoot : null;

  const lookup = useCallback(
    (path: string): GitStatusCode | null =>
      repoRoot ? lookupGitStatus(map, repoRoot, path, aliases) : null,
    [repoRoot, map, aliases],
  );

  return { lookup };
}
