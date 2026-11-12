import { Toaster } from '@/components/ui/sonner';
import { AgentNotificationsBridge } from '@/modules/agents';
import { CommandPalette, type OpenFileTarget } from '@/modules/command-palette';
import { NewEditorDialog } from '@/modules/editor';
import { type TabNavigatorItem, useNavigationStore } from '@/modules/navigation';
import { IS_MAC } from '@/modules/platform';
import { type Tab, TabSwitcher } from '@/modules/tabs';
import { bindTerminalWindowFocus } from '@/modules/terminal/ghostty/renderScheduling';
import { subscribeWindowPresentation } from '@/modules/terminal/ghostty/windowPresentation';
import { LivePageResizeBridge, WindowActivityBridge, WindowVibrancyBridge } from '@/modules/theme';
import { lazy, Suspense, useCallback } from 'react';
import type { useAppCloseGuard } from '../hooks/useAppCloseGuard';
import type { useCommandPalette } from '../hooks/useCommandPalette';
import type { useTabCloseGuards } from '../hooks/useTabCloseGuards';
import type { useTabCommands } from '../hooks/useTabCommands';
import { CloseDialogs } from './CloseDialogs';

// Real-application benchmark driver (scripts/app-lab). `__LUT_BENCH__` is the literal `false`
// in a normal build, so this is `null` and neither the import nor its chunk is emitted.
const BenchBridge = __LUT_BENCH__ ? lazy(() => import('@/bench/BenchBridge')) : null;

type Props = {
  tabs: Tab[];
  activeId: number;
  booted: boolean;
  /** A terminal pane's last lines, for the benchmark driver. */
  readBuffer: (leafId: number, maxLines?: number) => string | null;
  navigatorItems: TabNavigatorItem[];
  switcherState: ReturnType<typeof useTabCommands>['switcherState'];
  onActivateAgent: (tabId: number, leafId: number) => void;
  palette: ReturnType<typeof useCommandPalette>;
  explorerRoot: string | null;
  home: string | null;
  openFile: (path: string, pin?: boolean) => void;
  openFileAtLine: (path: string, line: number) => void;
  newEditorOpen: boolean;
  setNewEditorOpen: (open: boolean) => void;
  closeGuards: ReturnType<typeof useTabCloseGuards>;
  appClose: ReturnType<typeof useAppCloseGuard>;
};

/**
 * What the window shows over the shell (E09-08): the window bridges, notifications and toasts, the Ctrl+Tab
 * switcher, the command palette, the new-file dialog and the close confirmations.
 */
export function AppOverlays({
  tabs,
  activeId,
  booted,
  readBuffer,
  navigatorItems,
  switcherState,
  onActivateAgent,
  palette,
  explorerRoot,
  home,
  openFile,
  openFileAtLine,
  newEditorOpen,
  setNewEditorOpen,
  closeGuards,
  appClose,
}: Props) {
  const store = useNavigationStore.getState();
  // `target.side` (open to the side) has no host support yet: plain open.
  const openPaletteFile = useCallback(
    (path: string, target: OpenFileTarget) => {
      if (target.line !== undefined) openFileAtLine(path, target.line);
      else openFile(path, true);
    },
    [openFileAtLine, openFile],
  );

  return (
    <>
      {BenchBridge && (
        <Suspense fallback={null}>
          <BenchBridge
            tabs={tabs}
            activeId={activeId}
            booted={booted}
            setActiveId={store.setActiveId}
            newTab={store.newTab}
            newAgentGroupTab={store.newAgentGroupTab}
            splitActivePane={store.splitActivePane}
            closeTab={store.closeTab}
            readBuffer={readBuffer}
          />
        </Suspense>
      )}
      <WindowVibrancyBridge />
      {IS_MAC ? <LivePageResizeBridge /> : null}
      <WindowActivityBridge bindFocus={bindTerminalWindowFocus} subscribePresentation={subscribeWindowPresentation} />

      <AgentNotificationsBridge tabs={tabs} activeId={activeId} onActivate={onActivateAgent} />
      <Toaster position="bottom-right" />

      {switcherState && <TabSwitcher items={navigatorItems} state={switcherState} />}

      <CommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        initialMode={palette.initialMode}
        commandItems={palette.commandItems}
        workspaceRoot={explorerRoot}
        onOpenContentHit={openFileAtLine}
        onOpenFile={openPaletteFile}
      />

      <NewEditorDialog
        open={newEditorOpen}
        onOpenChange={setNewEditorOpen}
        rootPath={explorerRoot ?? home}
        onCreated={(path) => store.openFileTab(path)}
      />

      <CloseDialogs
        tabs={tabs}
        pendingCloseTab={closeGuards.pendingCloseTab}
        onCancelClose={closeGuards.cancelClose}
        onConfirmClose={closeGuards.confirmClose}
        pendingTerminalCloseTab={closeGuards.pendingTerminalCloseTab}
        onCancelTerminalClose={closeGuards.cancelTerminalClose}
        onConfirmTerminalClose={closeGuards.confirmTerminalClose}
        pendingDeleteTabs={closeGuards.pendingDeleteTabs}
        onCancelDeleteClose={closeGuards.cancelDeleteClose}
        onConfirmDeleteClose={closeGuards.confirmDeleteClose}
        pendingCloseMany={closeGuards.pendingCloseMany}
        closeManyConfirming={closeGuards.closeManyConfirming}
        onCancelCloseMany={closeGuards.cancelCloseMany}
        onConfirmCloseMany={closeGuards.confirmCloseMany}
        pendingAppClose={appClose.pendingAppClose}
        onCancelAppClose={appClose.cancelAppClose}
        onConfirmAppClose={appClose.confirmAppClose}
      />
    </>
  );
}
