export { subscribeAgentSignals, useAgentActivityStore } from './lib/agentActivity';
export { findLeafCwd, hasLeaf, leafIds, type PaneBounds, type PaneNode } from './lib/panes';
export {
  clearFocusedTerminal,
  disposeSession,
  leafHasForegroundProcess,
  leafIdForPty,
  ptyIdForLeaf,
  whenSessionReady,
  writeToSession,
} from './lib/terminalSessionApi';
export { isTerminalSurfaceTarget } from './lib/terminalSurfaceTarget';
export { type TerminalPathDropTarget, useTerminalFileDrop } from './lib/useTerminalFileDrop';
export type { TerminalPaneHandle } from './TerminalPane';
export { TerminalStack, type TerminalStackEntry } from './TerminalStack';
