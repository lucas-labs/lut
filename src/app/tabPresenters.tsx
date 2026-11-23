import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALL_LANGUAGES, EXPOSED_LANGUAGES } from '@/modules/editor/lib/languageDefinitions';
import { resolveDisplayName } from '@/modules/editor/lib/languageResolver';
import { FileIcon } from '@/modules/explorer/FileIcon';
import { registerTabPresenter, type Tab, type TerminalTab, useNavigationStore } from '@/modules/navigation';
import { ProfileIcon, useProfiles } from '@/modules/profiles';
import { selectTabAgentStatus } from '@/modules/tabs';
import { findLeaf, leafIds, ptyIdForLeaf, useAgentActivityStore } from '@/modules/terminal';
import {
  AlertFilledIcon,
  CheckmarkCircleIcon,
  CheckmarkIcon,
  ClockIcon,
  GitCompareIcon,
  GlobeIcon,
  IncognitoIcon,
  SpinnerIcon,
  TerminalIcon,
} from '@lut/lut-icons';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

/** Live pty ids behind a terminal tab; resolved at read time, not render time. */
function terminalPtyIds(tab: TerminalTab): number[] {
  const ptyIds: number[] = [];
  for (const leaf of leafIds(tab.paneTree)) {
    const id = ptyIdForLeaf(leaf);
    if (id !== null) ptyIds.push(id);
  }
  return ptyIds;
}

/**
 * A private terminal is marked by its icon; another shows the icon of its active pane's profile, the default one for
 * a pane opened without a profile.
 */
function TerminalTabIcon({ tab }: { tab: Tab }) {
  const profiles = useProfiles();
  if (tab.kind !== 'terminal') return null;
  if (tab.private) return <IncognitoIcon size="sm" className="shrink-0 text-muted-foreground" />;
  const id = findLeaf(tab.paneTree, tab.activeLeafId)?.profileId ?? profiles?.defaultProfileId;
  const profile = profiles?.profiles.find((p) => p.id === id);
  if (!profile) return <TerminalIcon size="sm" className="shrink-0 text-muted-foreground" />;
  return <ProfileIcon profile={profile} className="shrink-0 text-muted-foreground" />;
}

/**
 * A terminal's agent state after its title. The selector reduces the global activity maps to this tab's own
 * `{ state, agent }`, and `useShallow` keeps that result stable, so an agent signal on one tab re-renders only
 * that tab's indicator.
 */
function TerminalTabStatus({ tab }: { tab: Tab }) {
  const terminal = tab as TerminalTab;
  const { state } = useAgentActivityStore(useShallow((s) => selectTabAgentStatus(s, terminalPtyIds(terminal))));
  if (state === 'working') {
    return (
      <>
        <SpinnerIcon size="xs" className="shrink-0 animate-spin text-primary" />
        <span className="sr-only">Working</span>
      </>
    );
  }
  if (state === 'attention') {
    return (
      <>
        <AlertFilledIcon size="xs" className="shrink-0 text-warning" />
        <span className="sr-only">Needs attention</span>
      </>
    );
  }
  if (state === 'finished') {
    return (
      <>
        <CheckmarkCircleIcon size="xs" className="shrink-0 text-success" />
        <span className="sr-only">Finished</span>
      </>
    );
  }
  return null;
}

function FileTabIcon({ tab }: { tab: Tab }) {
  return (
    <FileIcon
      name={tab.kind === 'editor' && tab.overrideLanguage ? `dummy.${tab.overrideLanguage}` : tab.title}
      className="size-3.5 shrink-0 object-contain"
    />
  );
}

/** An editor tab's icon as the trigger of its language picker. */
function EditorTabLanguageMenu({ tab }: { tab: Tab }) {
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  if (tab.kind !== 'editor') return <FileTabIcon tab={tab} />;
  const setLanguage = (lang: string | null) => useNavigationStore.getState().setOverrideLanguage(tab.id, lang);
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setShowAllLanguages(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* span, not button: a button nested in the TabsTrigger button is invalid DOM and breaks WebKit focus. */}
        <span
          role="button"
          tabIndex={-1}
          data-no-drag
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-1 -m-1 transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FileTabIcon tab={tab} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        alignOffset={-4}
        className="max-h-75 w-48 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => setLanguage(null)}>
          <FileIcon name={tab.title} className="size-3.5 shrink-0 object-contain" />
          <span className="flex-1">Auto Detect</span>
          <span className="truncate text-[11px] text-muted-foreground">Mode: {resolveDisplayName(tab.title)}</span>
          {!tab.overrideLanguage && <CheckmarkIcon size="sm" className="text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setShowAllLanguages((v) => !v);
          }}
          className="text-muted-foreground"
        >
          {showAllLanguages ? '↑ Fewer languages' : '↓ All languages'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {(showAllLanguages ? ALL_LANGUAGES : EXPOSED_LANGUAGES).map((lang) => (
          <DropdownMenuItem key={lang.ext} onSelect={() => setLanguage(lang.ext)}>
            <FileIcon name={`dummy.${lang.ext}`} className="size-3.5 shrink-0 object-contain" />
            <span className="flex-1">{lang.name}</span>
            {tab.overrideLanguage === lang.ext && <CheckmarkIcon size="sm" className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PreviewTabIcon = () => <GlobeIcon size="sm" className="shrink-0 text-muted-foreground" />;
const GitDiffTabIcon = () => <GitCompareIcon size="sm" className="shrink-0 text-muted-foreground" />;
const GitHistoryTabIcon = () => <ClockIcon size="sm" className="shrink-0 text-muted-foreground" />;

/** How each tab kind looks in the tab strip, the column, the switcher and the Spaces view. */
export function registerTabPresenters() {
  registerTabPresenter('terminal', { Icon: TerminalTabIcon, Status: TerminalTabStatus });
  registerTabPresenter('editor', { Icon: FileTabIcon, IconMenu: EditorTabLanguageMenu });
  registerTabPresenter('markdown', { Icon: FileTabIcon });
  registerTabPresenter('preview', { Icon: PreviewTabIcon });
  registerTabPresenter('git-diff', { Icon: GitDiffTabIcon });
  registerTabPresenter('git-commit-file', { Icon: GitDiffTabIcon });
  registerTabPresenter('git-history', { Icon: GitHistoryTabIcon });
}
