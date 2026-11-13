import type { Tab } from '@/modules/tabs';

/** `path` under `repoRoot`, with one slash between them. */
function inRepository(repoRoot: string, path: string): string {
  const root = repoRoot.replace(/[\\/]+$/, '');
  const rel = path.replace(/^[\\/]+/, '');
  return `${root}/${rel}`;
}

/** The file the header's breadcrumb shows for a tab: an editor's file or a diff's, null for any other tab. */
export function breadcrumbFilePath(tab: Tab | undefined): string | null {
  if (tab?.kind === 'editor') return tab.path;
  if (tab?.kind === 'git-diff') {
    if (/^([A-Za-z]:|\/|\\)/.test(tab.path)) return tab.path;
    return inRepository(tab.repoRoot, tab.path);
  }
  if (tab?.kind === 'git-commit-file') return inRepository(tab.repoRoot, tab.path);
  return null;
}

/** The file the explorer marks for a tab: an editor's or a markdown tab's, null for any other tab. */
export function explorerFilePath(tab: Tab | undefined): string | null {
  return tab?.kind === 'editor' || tab?.kind === 'markdown' ? tab.path : null;
}
