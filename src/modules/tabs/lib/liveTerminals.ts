import type { Tab, TerminalTab } from '@/modules/navigation';
import type { TerminalStackEntry } from '@/modules/terminal';

/**
 * Terminal tabs that TerminalStack mounts. Cold tabs (restored, not yet
 * activated) are excluded so no PTY is spawned until first activation.
 */
export function selectLiveTerminals(tabs: Tab[]): TerminalStackEntry[] {
  return tabs.filter((t): t is TerminalTab => t.kind === 'terminal' && !t.cold);
}
