import { findLeaf } from '@/modules/terminal/lib/panes';
import type { Tab } from './types';

/** Whether the shell of a pane opened with `profileId` (none: the default profile) may name its tab. */
export type ShellTitlePolicy = (profileId: string | undefined) => boolean;

const NO_SHELL_TITLES: ShellTitlePolicy = () => false;

/**
 * The label shown on a tab. Non-terminal tabs use their stored title. A terminal tab takes, in order: the user's
 * custom name; the title its active pane's shell set, when `allowsShellTitle` lets that pane's profile name the tab;
 * the last segment of its cwd. Keeping this pure makes the "custom name survives a cd" invariant testable without
 * rendering the bar.
 */
export function labelFor(t: Tab, allowsShellTitle: ShellTitlePolicy = NO_SHELL_TITLES): string {
  if (t.kind === 'editor') return t.title;
  if (t.kind === 'preview') return t.title;
  if (t.kind === 'markdown') return t.title;
  if (t.kind === 'git-diff') return t.title;
  if (t.kind === 'git-history') return t.title;
  if (t.kind === 'git-commit-file') return t.title;
  if (t.customTitle) return t.customTitle;
  const pane = findLeaf(t.paneTree, t.activeLeafId);
  if (pane?.shellTitle && allowsShellTitle(pane.profileId)) return pane.shellTitle;
  if (!t.cwd) return t.title;
  const parts = t.cwd.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '/';
}
