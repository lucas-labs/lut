import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useHoldTitleBar } from '@/lib/titleBarHold';
import { AgentLauncherPanel } from '@/modules/agents/components/AgentLauncherPanel';
import type { AgentLaunchRequest } from '@/modules/agents/lib/launcher';
import { ShortcutKeys, useShortcutLabel } from '@/modules/shortcuts';
import {
  ChevronIcon,
  FileEditIcon,
  GitBranchIcon,
  GlobeIcon,
  IncognitoIcon,
  PlusIcon,
  SparklesIcon,
  TerminalIcon,
} from '@lut/lut-icons';
import { useRef, useState } from 'react';

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
  const terminalHint = useShortcutLabel('tab.new');
  const privateHint = useShortcutLabel('tab.newPrivate');
  const editorHint = useShortcutLabel('tab.newEditor');
  const previewHint = useShortcutLabel('tab.newPreview');
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
              <Button variant="ghost" size="icon-sm" aria-label="New tab" title="New tab">
                <PlusIcon size={size === 'rail' ? 'md' : 'sm'} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-56"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!openLauncherAfterMenuClose.current) return;

                openLauncherAfterMenuClose.current = false;
                requestAnimationFrame(() => setLauncherOpen(true));
              }}
            >
              <DropdownMenuItem onSelect={onNew}>
                <TerminalIcon size="sm" />
                <span className="flex-1">Terminal</span>
                <DropdownMenuShortcut>
                  <ShortcutKeys label={terminalHint} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openLauncher}>
                <SparklesIcon size="sm" />
                <span className="flex-1">Agents</span>
                <ChevronIcon size="sm" className="text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewPrivate}>
                <IncognitoIcon size="sm" />
                <span className="flex-1">Privacy</span>
                <DropdownMenuShortcut>
                  <ShortcutKeys label={privateHint} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewEditor}>
                <FileEditIcon size="sm" />
                <span className="flex-1">Editor</span>
                <DropdownMenuShortcut>
                  <ShortcutKeys label={editorHint} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewPreview}>
                <GlobeIcon size="sm" />
                <span className="flex-1">Preview</span>
                <DropdownMenuShortcut>
                  <ShortcutKeys label={previewHint} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewGitGraph}>
                <GitBranchIcon size="sm" />
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
