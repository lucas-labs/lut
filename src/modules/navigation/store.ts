import { isMarkdownPath } from '@/lib/utils';
import { type AgentInstanceCount, createAgentPanePlan } from '@/modules/agents/lib/launcher';
import {
  canAddPane,
  detachLeaf,
  findLeafCwd,
  hasLeaf,
  insertLeaf,
  leafIds,
  nextLeafId,
  type PaneBounds,
  type PaneDirection,
  removeLeaf,
  setLeafCwd as setLeafCwdInTree,
  setSplitRatios as setSplitRatiosInTree,
  siblingLeafOf,
  type SplitDir,
  splitLeaf,
  swapLeafInDirection,
} from '@/modules/terminal/lib/panes';
import { create } from 'zustand';
import { applyCloseTabsPlan, nextActiveInSpace, planSingleTabClose } from './planners/close';
import {
  planCommitHistoryOpen,
  planFileTabOpen,
  planGitDiffOpen,
  planMarkdownTabOpen,
} from './planners/open';
import { pickTabBySpaceIndex, reorderTabsByGap } from './planners/order';
import { planSpaceRemoval } from './planners/spaces';
import { basename, titleFromUrl } from './tabTitles';
import {
  type CloseTabsPlan,
  DEFAULT_SPACE_ID,
  type EditorTab,
  type GitCommitFileDiffTab,
  type GitDiffOpenInput,
  type OpenFileTabOptions,
  type Tab,
  type TabPatch,
  type TerminalTab,
} from './types';

type NavigationData = {
  /** Every tab of every space, in strip order. */
  tabs: Tab[];
  activeId: number;
  /** Gates warming until boot resolves the restore, so no shell spawns before it. */
  booted: boolean;
  /** One counter for tab, split and leaf ids. */
  nextId: number;
  /** The space new tabs open in. */
  activeSpaceId: string;
  /** The launch tab has been given the launch directory (see `seedLaunchTab`). */
  seeded: boolean;
};

type NavigationActions = {
  /** Gives the first tab the launch directory, once, before anything else touched the store. */
  seedLaunchTab: (initial?: Partial<TerminalTab>) => void;
  setActiveId: (action: number | ((prev: number) => number)) => void;
  allocId: () => number;
  markBooted: () => void;
  setActiveSpaceForNewTabs: (spaceId: string) => void;
  replaceTabs: (next: Tab[], nextActiveId: number) => void;
  newTabInSpace: (spaceId: string, cwd?: string) => number;
  moveTabToSpace: (tabId: number, targetSpaceId: string) => boolean;
  reorderTab: (tabId: number, targetTabId: number, edge: 'top' | 'bottom') => boolean;
  reorderTabByGap: (fromId: number, toGapIndex: number) => void;
  removeTabsForSpace: (spaceId: string, fallbackSpaceId: string, fallbackCwd?: string) => void;
  newTab: (cwd?: string) => number;
  newAgentGroupTab: (
    cwd: string | undefined,
    title: string,
    instances: AgentInstanceCount,
  ) => { tabId: number; leafIds: number[] };
  newAgentTab: (cwd: string | undefined, title: string) => { tabId: number; leafId: number };
  newPrivateTab: (cwd?: string) => number;
  openFileTab: (path: string, pin?: boolean, options?: OpenFileTabOptions) => number;
  pinTab: (id: number) => void;
  newPreviewTab: (url: string) => number;
  newMarkdownTab: (path: string) => number;
  setOverrideLanguage: (id: number, lang: string | null) => void;
  setMarkdownView: (id: number, mode: 'rendered' | 'raw') => void;
  openGitDiffTab: (input: GitDiffOpenInput, pin?: boolean) => number;
  openCommitHistoryTab: (input: { repoRoot: string; branch?: string | null }) => number;
  openCommitFileDiffTab: (input: CommitFileDiffInput) => number;
  closeTab: (id: number) => void;
  closeTabs: (anchorId: number, plan: CloseTabsPlan) => number[];
  updateTab: (id: number, patch: TabPatch) => void;
  selectByIndex: (idx: number, spaceId?: string) => void;
  setLeafCwd: (leafId: number, cwd: string) => void;
  focusPane: (tabId: number, leafId: number) => void;
  focusNextPaneInTab: (tabId: number, delta: 1 | -1) => void;
  swapActivePaneInDirection: (
    tabId: number,
    direction: PaneDirection,
    bounds?: PaneBounds[],
  ) => void;
  splitActivePane: (tabId: number, dir: SplitDir) => number | null;
  /**
   * Moves a pane, session and all, to another terminal tab of its space (next to that tab's
   * focused pane) or to a new tab after its own. An emptied source tab closes. Returns the
   * tab the pane landed in, or null when the move is refused: an unknown pane or target, a
   * target in another space or already at the pane limit, or a lone pane to a new tab.
   */
  movePane: (leafId: number, target: number | 'new') => number | null;
  /** Records the shares of one split of a terminal tab, after a user resize. */
  setSplitRatios: (tabId: number, splitId: number, ratios: number[]) => void;
  closePaneByLeaf: (leafId: number) => void;
  closeActivePane: (tabId: number) => boolean;
};

export type NavigationState = NavigationData & NavigationActions;

type CommitFileDiffInput = {
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

/** The state a window starts with: one cold terminal (tab 1, leaf 2) in the default space. */
export function initialNavigationData(): NavigationData {
  return {
    tabs: [
      {
        id: 1,
        kind: 'terminal',
        spaceId: DEFAULT_SPACE_ID,
        cold: true,
        title: 'shell',
        paneTree: { kind: 'leaf', id: 2 },
        activeLeafId: 2,
      },
    ],
    activeId: 1,
    booted: false,
    nextId: 3,
    activeSpaceId: DEFAULT_SPACE_ID,
    seeded: false,
  };
}

/** Activating a cold tab warms it: one choke point for every activation path. */
function warmActive(tabs: Tab[], activeId: number, booted: boolean): Tab[] {
  if (!booted) return tabs;
  const active = tabs.find((t) => t.id === activeId);
  if (!active?.cold) return tabs;
  return tabs.map((t) => (t.id === activeId ? { ...t, cold: false } : t));
}

/** Applies a patch to one tab by kind; an editor leaves the preview slot the moment it turns dirty. */
function patchTab(tab: Tab, patch: TabPatch): Tab {
  if (tab.kind === 'terminal') {
    return {
      ...tab,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.cwd !== undefined && { cwd: patch.cwd }),
      ...(patch.customTitle !== undefined && {
        customTitle: patch.customTitle === '' ? undefined : patch.customTitle,
      }),
    };
  }
  if (tab.kind === 'preview') {
    return {
      ...tab,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.url !== undefined && {
        url: patch.url,
        title: patch.title ?? titleFromUrl(patch.url),
      }),
    };
  }
  if (tab.kind === 'markdown') {
    return {
      ...tab,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.path !== undefined && { path: patch.path }),
    };
  }
  const autoPin = patch.dirty === true && (tab as EditorTab).preview ? { preview: false } : {};
  return {
    ...tab,
    ...autoPin,
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.dirty !== undefined && { dirty: patch.dirty }),
    ...(patch.path !== undefined && { path: patch.path }),
    ...(patch.overrideLanguage !== undefined && {
      overrideLanguage: patch.overrideLanguage,
    }),
  } as Tab;
}

/** Swaps a markdown file between its rendered tab and an editor; a dirty editor stays raw. */
function switchMarkdownView(tab: Tab, mode: 'rendered' | 'raw'): Tab {
  if (!isMarkdownPath((tab as { path?: string }).path ?? '')) return tab;
  if (mode === 'raw' && tab.kind === 'markdown') {
    return {
      ...tab,
      kind: 'editor' as const,
      dirty: false,
      preview: false,
      overrideLanguage: (tab as { overrideLanguage?: string | null }).overrideLanguage ?? null,
    };
  }
  if (mode === 'rendered' && tab.kind === 'editor') {
    if (tab.dirty) return tab;
    return {
      id: tab.id,
      kind: 'markdown' as const,
      spaceId: tab.spaceId,
      cold: tab.cold,
      title: tab.title,
      path: tab.path,
      overrideLanguage: tab.overrideLanguage ?? null,
    } as Tab;
  }
  return tab;
}

/**
 * Removes one leaf from a terminal tab. Its last leaf closes the tab, handing activation to
 * `fallback`; null when that tab is the last of its space, which refuses the close.
 */
function planPaneClose(
  tabs: Tab[],
  tab: TerminalTab,
  leafId: number,
): { tabs: Tab[]; closedTab: boolean; fallback: number | null } | null {
  const newTree = removeLeaf(tab.paneTree, leafId);
  if (newTree === null) {
    const fallback = nextActiveInSpace(tabs, tab.id);
    if (fallback === null) return null;
    return { tabs: tabs.filter((t) => t.id !== tab.id), closedTab: true, fallback };
  }
  const remaining = leafIds(newTree);
  let activeLeafId = tab.activeLeafId;
  if (tab.activeLeafId === leafId) {
    const sibling = siblingLeafOf(tab.paneTree, leafId);
    activeLeafId = sibling && remaining.includes(sibling) ? sibling : remaining[0];
  }
  return {
    tabs: tabs.map((t) => (t.id === tab.id ? { ...t, paneTree: newTree, activeLeafId } : t)),
    closedTab: false,
    fallback: null,
  };
}

/**
 * The window's navigation: its tabs, their order and spaces, and the active tab. Actions are
 * pure state updates and read the latest state, so several in a row compose before React
 * renders. They never open or close a PTY: a terminal tab only names its leaves; the terminal
 * module opens a session when a leaf mounts and the sessions reconciler disposes it once no
 * tab holds the leaf.
 */
export const useNavigationStore = create<NavigationState>()((set, get) => {
  /** Writes tabs/active/booted and warms the active tab when it is cold. */
  const commit = (patch: Partial<Pick<NavigationData, 'tabs' | 'activeId' | 'booted'>>) =>
    set((s) => {
      const tabs = patch.tabs ?? s.tabs;
      const activeId = patch.activeId ?? s.activeId;
      const booted = patch.booted ?? s.booted;
      return { ...patch, tabs: warmActive(tabs, activeId, booted) };
    });
  const setTabs = (update: (tabs: Tab[]) => Tab[]) => {
    const curr = get().tabs;
    const next = update(curr);
    if (next !== curr) commit({ tabs: next });
  };
  const alloc = () => {
    const id = get().nextId;
    set({ nextId: id + 1 });
    return id;
  };
  const openTerminal = (tab: Omit<TerminalTab, 'id' | 'spaceId'>, tabId: number) => {
    const { tabs, activeSpaceId } = get();
    commit({
      tabs: [...tabs, { ...tab, id: tabId, spaceId: activeSpaceId } as TerminalTab],
      activeId: tabId,
    });
  };
  const mapTerminal = (tabId: number, update: (tab: TerminalTab) => TerminalTab) =>
    setTabs((tabs) => {
      let changed = false;
      const next = tabs.map((t) => {
        if (t.id !== tabId || t.kind !== 'terminal') return t;
        const updated = update(t);
        if (updated !== t) changed = true;
        return updated;
      });
      return changed ? next : tabs;
    });

  return {
    ...initialNavigationData(),

    seedLaunchTab: (initial) => {
      const s = get();
      if (s.seeded) return;
      set({ seeded: true });
      if (!initial) return;
      const first = s.tabs[0];
      if (s.tabs.length !== 1 || first.kind !== 'terminal' || first.id !== 1) return;
      const cwd = initial.cwd;
      commit({
        tabs: [
          {
            ...first,
            title: initial.title ?? first.title,
            cwd,
            paneTree: { kind: 'leaf', id: first.activeLeafId, cwd },
          },
        ],
      });
    },

    setActiveId: (action) => {
      const next = typeof action === 'function' ? action(get().activeId) : action;
      commit({ activeId: next });
    },

    allocId: alloc,

    markBooted: () => commit({ booted: true }),

    setActiveSpaceForNewTabs: (spaceId) => set({ activeSpaceId: spaceId }),

    replaceTabs: (next, nextActiveId) => {
      if (next.length === 0) return;
      commit({ tabs: next, activeId: nextActiveId });
    },

    // Appends a cold terminal tab to a space without stealing focus, so the
    // overview can populate a space in place; it spawns when first opened.
    newTabInSpace: (spaceId, cwd) => {
      const tabId = alloc();
      const leafId = alloc();
      setTabs((curr) => [
        ...curr,
        {
          id: tabId,
          kind: 'terminal',
          spaceId,
          cold: true,
          title: cwd ? basename(cwd) : 'shell',
          cwd,
          paneTree: { kind: 'leaf', id: leafId, cwd },
          activeLeafId: leafId,
        },
      ]);
      return tabId;
    },

    // Reassigns a tab to another space. Returns true when the moved tab was active
    // and emptied its source space, so the caller should follow it into the target.
    moveTabToSpace: (tabId, targetSpaceId) => {
      const { tabs: curr, activeId } = get();
      const tab = curr.find((t) => t.id === tabId);
      if (!tab || tab.spaceId === targetSpaceId) return false;
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? ({ ...t, spaceId: targetSpaceId } as Tab) : t)),
      );
      if (activeId !== tabId) return false;
      const fallback = nextActiveInSpace(curr, tabId);
      if (fallback !== null) {
        commit({ activeId: fallback });
        return false;
      }
      return true;
    },

    // Positions a tab next to a target tab, inheriting the target's space. Returns
    // true when the active tab crossed into the target space and emptied its
    // source, so the caller should follow it.
    reorderTab: (tabId, targetTabId, edge) => {
      if (tabId === targetTabId) return false;
      const { tabs: curr, activeId } = get();
      const moved = curr.find((t) => t.id === tabId);
      const target = curr.find((t) => t.id === targetTabId);
      if (!moved || !target) return false;
      const crossSpace = moved.spaceId !== target.spaceId;
      setTabs((prev) => {
        const without = prev.filter((t) => t.id !== tabId);
        let idx = without.findIndex((t) => t.id === targetTabId);
        if (idx < 0) return prev;
        if (edge === 'bottom') idx += 1;
        const next: Tab = crossSpace ? ({ ...moved, spaceId: target.spaceId } as Tab) : moved;
        without.splice(idx, 0, next);
        return without;
      });
      if (!crossSpace || activeId !== tabId) return false;
      const fallback = nextActiveInSpace(curr, tabId);
      if (fallback !== null) {
        commit({ activeId: fallback });
        return false;
      }
      return true;
    },

    reorderTabByGap: (fromId, toGapIndex) =>
      setTabs((prev) => reorderTabsByGap(prev, fromId, toGapIndex)),

    removeTabsForSpace: (spaceId, fallbackSpaceId, fallbackCwd) => {
      const { tabs, activeId } = get();
      const plan = planSpaceRemoval(tabs, activeId, spaceId, fallbackSpaceId, fallbackCwd, alloc);
      if (!plan) return;
      commit({ tabs: plan.tabs, activeId: plan.activeId });
    },

    newTab: (cwd) => {
      const tabId = alloc();
      const leafId = alloc();
      openTerminal(
        {
          kind: 'terminal',
          title: 'shell',
          cwd,
          paneTree: { kind: 'leaf', id: leafId, cwd },
          activeLeafId: leafId,
        },
        tabId,
      );
      return tabId;
    },

    newAgentGroupTab: (cwd, title, instances) => {
      const tabId = alloc();
      const { paneTree, leafIds: agentLeafIds } = createAgentPanePlan(instances, alloc, cwd);
      openTerminal(
        {
          kind: 'terminal',
          title,
          customTitle: title,
          cwd,
          paneTree,
          activeLeafId: agentLeafIds[0],
        },
        tabId,
      );
      return { tabId, leafIds: agentLeafIds };
    },

    newAgentTab: (cwd, title) => {
      const { tabId, leafIds: agentLeafIds } = get().newAgentGroupTab(cwd, title, 1);
      return { tabId, leafId: agentLeafIds[0] };
    },

    newPrivateTab: (cwd) => {
      const tabId = alloc();
      const leafId = alloc();
      openTerminal(
        {
          kind: 'terminal',
          title: 'private',
          cwd,
          paneTree: { kind: 'leaf', id: leafId, cwd },
          activeLeafId: leafId,
          private: true,
        },
        tabId,
      );
      return tabId;
    },

    /**
     * Opens a file in an editor tab.
     *
     * - `pin = true` (default) — opens or activates a **persistent** tab.
     *   If the path is currently in the preview slot it is promoted in-place.
     *   Use this for programmatic opens (New File dialog, etc.).
     * - `pin = false` — VSCode-style **preview** tab. A single shared slot is
     *   reused: if a persistent tab for the path already exists it is activated;
     *   otherwise the current preview slot is replaced with the new path.
     */
    openFileTab: (path, pin = true, options = {}) => {
      const { tabs, activeSpaceId } = get();
      const plan = planFileTabOpen(tabs, path, pin, options.spaceId ?? activeSpaceId, alloc);
      commit(
        (options.activate ?? true)
          ? { tabs: plan.tabs, activeId: plan.tabId }
          : { tabs: plan.tabs },
      );
      return plan.tabId;
    },

    /**
     * Promotes a preview tab to a persistent one. Called on double-click of the
     * tab title in the tab bar. Dirty editor tabs also auto-promote.
     */
    pinTab: (id) =>
      setTabs((curr) =>
        curr.map((t) => {
          if (t.id !== id) return t;
          if ((t.kind === 'editor' || t.kind === 'git-diff') && t.preview) {
            return { ...t, preview: false };
          }
          return t;
        }),
      ),

    newPreviewTab: (url) => {
      const id = alloc();
      const { tabs, activeSpaceId } = get();
      commit({
        tabs: [
          ...tabs,
          { id, kind: 'preview', spaceId: activeSpaceId, title: titleFromUrl(url), url },
        ],
        activeId: id,
      });
      return id;
    },

    newMarkdownTab: (path) => {
      const { tabs, activeSpaceId } = get();
      const plan = planMarkdownTabOpen(tabs, path, activeSpaceId, alloc);
      commit({ tabs: plan.tabs, activeId: plan.tabId });
      return plan.tabId;
    },

    setOverrideLanguage: (id, lang) =>
      setTabs((curr) =>
        curr.map((t) =>
          t.id !== id || t.kind !== 'editor' ? t : { ...t, overrideLanguage: lang },
        ),
      ),

    setMarkdownView: (id, mode) =>
      setTabs((curr) => curr.map((t) => (t.id === id ? switchMarkdownView(t, mode) : t))),

    openGitDiffTab: (input, pin = false) => {
      const { tabs, activeSpaceId } = get();
      const plan = planGitDiffOpen(tabs, input, activeSpaceId, pin, alloc);
      commit({ tabs: plan.tabs, activeId: plan.targetId });
      return plan.targetId;
    },

    openCommitHistoryTab: (input) => {
      const { tabs, activeSpaceId } = get();
      const plan = planCommitHistoryOpen(tabs, input, activeSpaceId, alloc);
      commit({ tabs: plan.tabs, activeId: plan.targetId });
      return plan.targetId;
    },

    openCommitFileDiffTab: (input) => {
      const { tabs: curr, activeSpaceId } = get();
      const existing = curr.find(
        (t) =>
          t.kind === 'git-commit-file' &&
          t.repoRoot === input.repoRoot &&
          t.sha === input.sha &&
          t.path === input.path,
      );
      const title = `${basename(input.path)} @ ${input.shortSha}`;
      if (existing) {
        commit({
          tabs: curr.map((t) =>
            t.id === existing.id
              ? { ...t, title, subject: input.subject, originalPath: input.originalPath }
              : t,
          ),
          activeId: existing.id,
        });
        return existing.id;
      }
      const id = alloc();
      commit({
        tabs: [
          ...curr,
          {
            id,
            kind: 'git-commit-file',
            spaceId: activeSpaceId,
            title,
            repoRoot: input.repoRoot,
            sha: input.sha,
            shortSha: input.shortSha,
            subject: input.subject,
            path: input.path,
            originalPath: input.originalPath,
          } satisfies GitCommitFileDiffTab,
        ],
        activeId: id,
      });
      return id;
    },

    closeTab: (id) => {
      const { tabs, activeId } = get();
      const result = planSingleTabClose(tabs, id, activeId);
      if (!result) return;
      commit({ tabs: result.tabs, activeId: result.nextActiveId });
    },

    closeTabs: (anchorId, plan) => {
      const result = applyCloseTabsPlan(get().tabs, anchorId, plan);
      if (!result) return [];
      commit({ tabs: result.tabs, activeId: result.nextActiveId });
      return result.closeIds;
    },

    updateTab: (id, patch) =>
      setTabs((curr) => curr.map((t) => (t.id === id ? patchTab(t, patch) : t))),

    selectByIndex: (idx, spaceId) => {
      const { tabs } = get();
      const t = spaceId ? pickTabBySpaceIndex(tabs, idx, spaceId) : tabs[idx];
      if (t) commit({ activeId: t.id });
    },

    /** Update a leaf's cwd; mirror to the tab's `cwd` when the leaf is active.
     * Bails out without an update when nothing actually changed — shell integration
     * re-emits OSC 7 on every prompt, including empty Enters, so this fires at
     * keystroke rate. Always updating there cascades a paneTree re-render across
     * every open tab. */
    setLeafCwd: (leafId, cwd) =>
      setTabs((curr) => {
        let changed = false;
        const next = curr.map((t) => {
          if (t.kind !== 'terminal' || !hasLeaf(t.paneTree, leafId)) return t;
          const paneTree = setLeafCwdInTree(t.paneTree, leafId, cwd);
          const cwdChanged = t.activeLeafId === leafId && t.cwd !== cwd;
          if (paneTree === t.paneTree && !cwdChanged) return t;
          changed = true;
          return { ...t, paneTree, ...(cwdChanged && { cwd }) };
        });
        return changed ? next : curr;
      }),

    focusPane: (tabId, leafId) =>
      mapTerminal(tabId, (t) => {
        if (!hasLeaf(t.paneTree, leafId) || t.activeLeafId === leafId) return t;
        const cwd = findLeafCwd(t.paneTree, leafId);
        return { ...t, activeLeafId: leafId, ...(cwd !== undefined && { cwd }) };
      }),

    focusNextPaneInTab: (tabId, delta) =>
      mapTerminal(tabId, (t) => {
        const next = nextLeafId(t.paneTree, t.activeLeafId, delta);
        if (next === t.activeLeafId) return t;
        const cwd = findLeafCwd(t.paneTree, next);
        return { ...t, activeLeafId: next, ...(cwd !== undefined && { cwd }) };
      }),

    swapActivePaneInDirection: (tabId, direction, bounds) =>
      mapTerminal(tabId, (t) => {
        const paneTree = swapLeafInDirection(t.paneTree, t.activeLeafId, direction, bounds);
        return paneTree === t.paneTree ? t : { ...t, paneTree };
      }),

    /** Split the active leaf of `tabId` along `dir`. Returns the new leaf id. */
    splitActivePane: (tabId, dir) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (tab?.kind !== 'terminal' || !canAddPane(tab.paneTree)) {
        return null;
      }
      const splitId = alloc();
      const leafId = alloc();
      mapTerminal(tabId, (t) => ({
        ...t,
        paneTree: splitLeaf(t.paneTree, t.activeLeafId, splitId, leafId, dir, t.cwd),
        activeLeafId: leafId,
      }));
      return leafId;
    },

    movePane: (leafId, target) => {
      const { tabs } = get();
      const source = tabs.find(
        (t): t is TerminalTab => t.kind === 'terminal' && hasLeaf(t.paneTree, leafId),
      );
      if (!source || target === source.id) return null;
      const detached = detachLeaf(source.paneTree, leafId);
      if (!detached) return null;
      const { leaf, rest } = detached;

      let destination: TerminalTab;
      if (target === 'new') {
        if (rest === null) return null;
        destination = {
          id: alloc(),
          kind: 'terminal',
          spaceId: source.spaceId,
          title: leaf.cwd ? basename(leaf.cwd) : 'shell',
          cwd: leaf.cwd,
          paneTree: leaf,
          activeLeafId: leaf.id,
        };
      } else {
        const found = tabs.find((t) => t.id === target);
        if (found?.kind !== 'terminal' || found.spaceId !== source.spaceId) return null;
        if (!canAddPane(found.paneTree)) return null;
        destination = {
          ...found,
          paneTree: insertLeaf(found.paneTree, found.activeLeafId, alloc(), leaf, 'row'),
          activeLeafId: leaf.id,
          ...(leaf.cwd !== undefined && { cwd: leaf.cwd }),
        };
      }

      // One update: the leaf is never missing from every tab, so its session stays.
      const next: Tab[] = [];
      for (const t of tabs) {
        if (t.id === source.id) {
          if (rest !== null) {
            const remaining = leafIds(rest);
            const sibling = siblingLeafOf(source.paneTree, leafId);
            const activeLeafId =
              source.activeLeafId !== leafId
                ? source.activeLeafId
                : sibling && remaining.includes(sibling)
                  ? sibling
                  : remaining[0];
            next.push({ ...source, paneTree: rest, activeLeafId });
          }
          if (target === 'new') next.push(destination);
        } else {
          next.push(t.id === destination.id ? destination : t);
        }
      }
      commit({ tabs: next, activeId: destination.id });
      return destination.id;
    },

    setSplitRatios: (tabId, splitId, ratios) =>
      mapTerminal(tabId, (t) => {
        const paneTree = setSplitRatiosInTree(t.paneTree, splitId, ratios);
        return paneTree === t.paneTree ? t : { ...t, paneTree };
      }),

    closePaneByLeaf: (leafId) => {
      const { tabs, activeId } = get();
      const tab = tabs.find((t) => t.kind === 'terminal' && hasLeaf(t.paneTree, leafId));
      if (tab?.kind !== 'terminal') return;
      const plan = planPaneClose(tabs, tab, leafId);
      if (!plan) return;
      commit({
        tabs: plan.tabs,
        activeId: plan.fallback !== null && activeId === tab.id ? plan.fallback : activeId,
      });
    },

    closeActivePane: (tabId) => {
      const { tabs, activeId } = get();
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.kind !== 'terminal') return false;
      const leafId = tab.activeLeafId;
      const plan = planPaneClose(tabs, tab, leafId);
      if (!plan) return false;
      commit({
        tabs: plan.tabs,
        activeId: plan.fallback !== null && activeId === tabId ? plan.fallback : activeId,
      });
      return plan.closedTab;
    },
  };
});
