import { basename } from '../tabTitles';
import type { EditorTab, GitDiffOpenInput, GitDiffTab, GitHistoryTab, Tab } from '../types';

export function planMarkdownTabOpen(
  tabs: Tab[],
  path: string,
  spaceId: string,
  allocId: () => number,
): { tabs: Tab[]; tabId: number } {
  const pathKey = path.replace(/\\/g, '/');
  const existing = tabs.find(
    (tab) =>
      tab.kind === 'markdown' &&
      tab.spaceId === spaceId &&
      tab.path.replace(/\\/g, '/') === pathKey,
  );
  if (existing) return { tabs, tabId: existing.id };

  const tabId = allocId();
  return {
    tabs: [
      ...tabs,
      {
        id: tabId,
        kind: 'markdown',
        spaceId,
        title: basename(path),
        path,
      },
    ],
    tabId,
  };
}

export function planFileTabOpen(
  tabs: Tab[],
  path: string,
  pin: boolean,
  spaceId: string,
  allocId: () => number,
): { tabs: Tab[]; tabId: number } {
  if (pin) {
    const existing = tabs.find(
      (tab) => tab.kind === 'editor' && tab.spaceId === spaceId && tab.path === path,
    );
    if (existing?.kind === 'editor') {
      return {
        tabs: existing.preview
          ? tabs.map((tab) => (tab.id === existing.id ? { ...tab, preview: false } : tab))
          : tabs,
        tabId: existing.id,
      };
    }

    const tabId = allocId();
    return {
      tabs: [
        ...tabs,
        {
          id: tabId,
          kind: 'editor',
          spaceId,
          title: basename(path),
          path,
          dirty: false,
          preview: false,
        },
      ],
      tabId,
    };
  }

  const persistent = tabs.find(
    (tab) => tab.kind === 'editor' && tab.spaceId === spaceId && tab.path === path && !tab.preview,
  );
  if (persistent) return { tabs, tabId: persistent.id };

  const existingPreview = tabs.find(
    (tab) => tab.kind === 'editor' && tab.spaceId === spaceId && tab.path === path && tab.preview,
  );
  if (existingPreview) return { tabs, tabId: existingPreview.id };

  const previewIndex = tabs.findIndex(
    (tab) => tab.kind === 'editor' && tab.spaceId === spaceId && tab.preview,
  );
  const tabId = allocId();
  const tab: EditorTab = {
    id: tabId,
    kind: 'editor',
    spaceId,
    title: basename(path),
    path,
    dirty: false,
    preview: true,
  };
  if (previewIndex === -1) return { tabs: [...tabs, tab], tabId };

  const next = [...tabs];
  next[previewIndex] = tab;
  return { tabs: next, tabId };
}

export function planGitDiffOpen(
  tabs: Tab[],
  input: GitDiffOpenInput,
  spaceId: string,
  pin: boolean,
  allocId: () => number,
): { tabs: Tab[]; targetId: number } {
  const title = input.title ?? `${basename(input.path)} (${input.mode})`;
  const originalPath = input.originalPath ?? null;
  const matches = (tab: Tab): tab is GitDiffTab =>
    tab.kind === 'git-diff' &&
    tab.spaceId === spaceId &&
    tab.repoRoot === input.repoRoot &&
    tab.path === input.path &&
    tab.mode === input.mode;
  const matchingTabs = tabs.filter(matches);
  const existing = matchingTabs.find((tab) => !tab.preview) ?? matchingTabs[0];

  if (existing) {
    const preview = pin ? false : existing.preview;
    if (
      existing.title === title &&
      existing.originalPath === originalPath &&
      existing.preview === preview
    ) {
      return { tabs, targetId: existing.id };
    }
    return {
      tabs: tabs.map((tab) =>
        tab.id === existing.id ? { ...existing, title, originalPath, preview } : tab,
      ),
      targetId: existing.id,
    };
  }

  const id = allocId();
  const tab = {
    id,
    kind: 'git-diff',
    spaceId,
    title,
    path: input.path,
    repoRoot: input.repoRoot,
    mode: input.mode,
    originalPath,
    preview: !pin,
  } satisfies GitDiffTab;

  if (pin) return { tabs: [...tabs, tab], targetId: id };

  const previewIndex = tabs.findIndex(
    (candidate) =>
      candidate.kind === 'git-diff' && candidate.spaceId === spaceId && candidate.preview,
  );
  if (previewIndex === -1) return { tabs: [...tabs, tab], targetId: id };

  const next = [...tabs];
  next[previewIndex] = tab;
  return { tabs: next, targetId: id };
}

export function planCommitHistoryOpen(
  tabs: Tab[],
  input: { repoRoot: string; branch?: string | null },
  spaceId: string,
  allocId: () => number,
): { tabs: Tab[]; targetId: number } {
  const existing = tabs.find(
    (tab) =>
      tab.kind === 'git-history' && tab.spaceId === spaceId && tab.repoRoot === input.repoRoot,
  );
  const title = input.branch ? `History · ${input.branch}` : 'Git History';
  if (existing) {
    if (existing.title === title) return { tabs, targetId: existing.id };
    return {
      tabs: tabs.map((tab) => (tab.id === existing.id ? { ...existing, title } : tab)),
      targetId: existing.id,
    };
  }

  const id = allocId();
  return {
    tabs: [
      ...tabs,
      {
        id,
        kind: 'git-history',
        spaceId,
        title,
        repoRoot: input.repoRoot,
      } satisfies GitHistoryTab,
    ],
    targetId: id,
  };
}
