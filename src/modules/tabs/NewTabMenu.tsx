import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useHoldTitleBar } from '@/lib/titleBarHold';
import { AgentLauncherPanel } from '@/modules/agents/components/AgentLauncherPanel';
import type { AgentLaunchRequest } from '@/modules/agents/lib/launcher';
import { ProfileMenuItems, useProfiles } from '@/modules/profiles';
import { type ShortcutId, ShortcutKeys, useShortcutLabel } from '@/modules/shortcuts';
import {
  ChevronIcon,
  createLutIcon,
  FileEditIcon,
  GitBranchIcon,
  GlobeIcon,
  IncognitoIcon,
  type LutIconComponent,
  PlusIcon,
  SparklesIcon,
  TerminalIcon,
  TwoSidesLayoutIcon,
} from '@lut/lut-icons';
import { TwoSidesLayoutIconData } from '@lut/lut-icons/data';
import { useRef, useState } from 'react';

const RowsLayoutIcon = createLutIcon('RowsLayoutIcon', TwoSidesLayoutIconData, { rotate: 90 });

/** What the new-tab menu opens; the title bar and the tab rail pass it through. */
export type NewTabMenuActions = {
  /** A terminal with the default profile. */
  onNew: () => void;
  onNewWithProfile: (profileId: string) => void;
  /** Splits the active pane, the new one opening with `profileId`. */
  onSplit: (dir: 'row' | 'col', profileId: string) => void;
  /** The active tab is a terminal with room for another pane. */
  canSplit: boolean;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onLaunchAgents: (request: AgentLaunchRequest) => void;
};

type Props = NewTabMenuActions & {
  /** The strip's 22px button or the rail's 24px one. */
  size: 'strip' | 'rail';
};

const SPLITS = [
  { dir: 'row', label: 'Split right', icon: TwoSidesLayoutIcon, shortcut: 'pane.splitRight' },
  { dir: 'col', label: 'Split down', icon: RowsLayoutIcon, shortcut: 'pane.splitDown' },
] as const satisfies readonly { dir: 'row' | 'col'; label: string; icon: LutIconComponent; shortcut: ShortcutId }[];

/** The "+" menu (E11-04 design): the profiles to open a tab with, the other tabs, and splits by profile. */
export function NewTabMenu({
  size,
  onNew,
  onNewWithProfile,
  onSplit,
  canSplit,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onLaunchAgents,
}: Props) {
  const profiles = useProfiles();
  const terminalHint = useShortcutLabel('tab.new');
  const splitRightHint = useShortcutLabel('pane.splitRight');
  const splitDownHint = useShortcutLabel('pane.splitDown');
  const splitHints = { 'pane.splitRight': splitRightHint, 'pane.splitDown': splitDownHint };
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
              <DropdownMenuLabel>New tab</DropdownMenuLabel>
              {profiles && profiles.profiles.length > 0 ? (
                <ProfileMenuItems
                  list={profiles}
                  onPick={onNewWithProfile}
                  defaultHint={<ShortcutKeys label={terminalHint} />}
                />
              ) : (
                // Until the profiles are listed, or when they cannot be: the default one.
                <DropdownMenuItem onSelect={onNew}>
                  <TerminalIcon size="sm" />
                  <span className="flex-1">Terminal</span>
                  <DropdownMenuShortcut>
                    <ShortcutKeys label={terminalHint} />
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
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
              <DropdownMenuSeparator />
              {SPLITS.map(({ dir, label, icon: Icon, shortcut }) => (
                <DropdownMenuSub key={dir}>
                  <DropdownMenuSubTrigger disabled={!canSplit}>
                    <Icon size="sm" />
                    <span className="flex-1">{label}</span>
                    <DropdownMenuShortcut>
                      <ShortcutKeys label={splitHints[shortcut]} />
                    </DropdownMenuShortcut>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-56">
                    {profiles && profiles.profiles.length > 0 ? (
                      <ProfileMenuItems list={profiles} onPick={(id) => onSplit(dir, id)} />
                    ) : (
                      <DropdownMenuItem disabled>
                        <span className="flex-1 text-muted-foreground">No profiles</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
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
