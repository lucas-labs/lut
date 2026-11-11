import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useHoldTitleBar } from '@/lib/titleBarHold';
import { cn } from '@/lib/utils';
import { AgentLauncherPanel } from '@/modules/agents/components/AgentLauncherPanel';
import type { AgentLaunchRequest } from '@/modules/agents/lib/launcher';
import { useShortcutHint } from '@/modules/shortcuts';
import {
  AiBrowserIcon,
  ArrowRight01Icon,
  ComputerTerminal02Icon,
  GitBranchIcon,
  Globe02Icon,
  IncognitoIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useRef, useState } from 'react';
import { MENU_CONTENT, MENU_HINT, MENU_ITEM } from './navigatorMenu';

type Props = {
  /** The strip's 22px button or the rail's 24px one. */
  size: 'strip' | 'rail';
  onNew: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onLaunchAgents: (request: AgentLaunchRequest) => void;
};

export function NewTabMenu({
  size,
  onNew,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onLaunchAgents,
}: Props) {
  const terminalHint = useShortcutHint('tab.new');
  const privateHint = useShortcutHint('tab.newPrivate');
  const editorHint = useShortcutHint('tab.newEditor');
  const previewHint = useShortcutHint('tab.newPreview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const openLauncherAfterMenuClose = useRef(false);
  const openMenuAfterLauncherClose = useRef(false);
  useHoldTitleBar(menuOpen || launcherOpen);

  const onMenuOpenChange = (next: boolean) => {
    if (next) {
      openLauncherAfterMenuClose.current = false;
      setLauncherOpen(false);
    }
    setMenuOpen(next);
  };

  const openLauncher = () => {
    openLauncherAfterMenuClose.current = true;
  };

  const backToMenu = () => {
    openMenuAfterLauncherClose.current = true;
    setLauncherOpen(false);
  };

  return (
    <Popover open={launcherOpen} onOpenChange={setLauncherOpen}>
      <PopoverAnchor asChild>
        <span className="inline-flex">
          <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent',
                  size === 'rail' ? 'size-6' : 'size-[22px]',
                )}
                aria-label="New tab"
                title="New tab"
              >
                <HugeiconsIcon icon={PlusSignIcon} size={size === 'rail' ? 16 : 14} strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={MENU_CONTENT}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!openLauncherAfterMenuClose.current) return;

                openLauncherAfterMenuClose.current = false;
                requestAnimationFrame(() => setLauncherOpen(true));
              }}
            >
              <DropdownMenuItem className={MENU_ITEM} onSelect={onNew}>
                <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Terminal</span>
                <span className={MENU_HINT}>{terminalHint}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onSelect={openLauncher}>
                <HugeiconsIcon icon={AiBrowserIcon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Agents</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} className="text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onSelect={onNewPrivate}>
                <HugeiconsIcon icon={IncognitoIcon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Privacy</span>
                <span className={MENU_HINT}>{privateHint}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onSelect={onNewEditor}>
                <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Editor</span>
                <span className={MENU_HINT}>{editorHint}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onSelect={onNewPreview}>
                <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Preview</span>
                <span className={MENU_HINT}>{previewHint}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onSelect={onNewGitGraph}>
                <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Git Graph</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openMenuAfterLauncherClose.current) return;

          openMenuAfterLauncherClose.current = false;
          requestAnimationFrame(() => setMenuOpen(true));
        }}
        className="w-[340px] gap-0 overflow-hidden rounded-2xl p-1.5"
      >
        <AgentLauncherPanel
          onBack={backToMenu}
          onLaunch={(request) => {
            setLauncherOpen(false);
            onLaunchAgents(request);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
