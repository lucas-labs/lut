import type { Tab } from '@/modules/navigation';
import { useCallback, useMemo, useState } from 'react';

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
): Result {
  const activeCwd = activeTab?.kind === 'terminal' ? (activeTab.cwd ?? null) : null;
  // The last directory a terminal tab was active in: an editor tab keeps showing (and opening new tabs in) it.
  const [lastTerminalCwd, setLastTerminalCwd] = useState<string | null>(null);
  if (activeCwd && activeCwd !== lastTerminalCwd) setLastTerminalCwd(activeCwd);

  const explorerRoot = useMemo<string | null>(() => {
    if (activeCwd) return activeCwd;
    if (lastTerminalCwd) return lastTerminalCwd;
    const anyTerm = tabs.find((t) => t.kind === 'terminal' && t.cwd);
    if (anyTerm?.kind === 'terminal' && anyTerm.cwd) return anyTerm.cwd;
    return home;
  }, [activeCwd, lastTerminalCwd, tabs, home]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (activeCwd) return activeCwd;
    // Editor tabs inherit the last terminal's cwd (or workspace home), not
    // the file's folder — opening a new terminal from a file shouldn't
    // hijack the user's working directory context.
    return lastTerminalCwd ?? home ?? undefined;
  }, [activeCwd, lastTerminalCwd, home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
