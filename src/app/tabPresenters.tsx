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
import { selectTabAgentStatus } from '@/modules/tabs';
import { leafIds, ptyIdForLeaf, useAgentActivityStore } from '@/modules/terminal';
import {
  CheckmarkCircle01Icon,
  Clock01Icon,
  GitCompareIcon,
  Globe02Icon,
  IncognitoIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
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

/** A private terminal is marked by its icon; other terminals have none until profiles give them one. */
function TerminalTabIcon({ tab }: { tab: Tab }) {
  if (tab.kind !== 'terminal' || !tab.private) return null;
  return <HugeiconsIcon icon={IncognitoIcon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />;
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
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-3 shrink-0 animate-spin"
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="8" className="stroke-info/25" />
          <path d="M12 4a8 8 0 0 1 8 8" className="stroke-info" />
          <title>Working</title>
        </svg>
        <span className="sr-only">Working</span>
      </>
    );
  }
  if (state === 'attention') {
    return (
      <>
        <svg viewBox="0 0 24 24" aria-hidden className="size-3 shrink-0">
          <title>Needs attention</title>
          <path d="M12 3 2 20h20L12 3z" className="fill-warning" />
          <path d="M12 10v4M12 17h.01" className="stroke-background" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
        <span className="sr-only">Needs attention</span>
      </>
    );
  }
  if (state === 'finished') {
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle01Icon}
        size={12}
        strokeWidth={2}
        aria-label="Finished"
        className="shrink-0 text-success"
      />
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
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-1 -m-1 transition-all hover:bg-accent hover:text-accent-foreground hover:ring-1 hover:ring-primary/30 hover:shadow-[0_0_4px_var(--color-popover-foreground)]"
        >
          <FileTabIcon tab={tab} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        alignOffset={-4}
        className="max-h-75 w-48 overflow-y-auto rounded-xl border border-border/40 bg-popover p-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          onSelect={() => setLanguage(null)}
          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-default focus:bg-accent focus:text-accent-foreground"
        >
          <FileIcon name={tab.title} className="size-3.5 shrink-0 object-contain" />
          <div className="flex flex-1 flex-col">
            <span>Auto Detect</span>
            <span className="text-[10px] text-muted-foreground italic">Mode: {resolveDisplayName(tab.title)}</span>
          </div>
          {!tab.overrideLanguage && <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setShowAllLanguages((v) => !v);
          }}
          className="w-full px-2.5 py-1.5 text-left text-xs text-primary/60 hover:text-primary rounded-lg transition-colors hover:bg-accent"
        >
          {showAllLanguages ? '↑ Fewer languages' : '↓ All languages'}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 border-t border-border/30" />
        {(showAllLanguages ? ALL_LANGUAGES : EXPOSED_LANGUAGES).map((lang) => (
          <DropdownMenuItem
            key={lang.ext}
            onSelect={() => setLanguage(lang.ext)}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-default focus:bg-accent focus:text-accent-foreground"
          >
            <FileIcon name={`dummy.${lang.ext}`} className="size-3.5 shrink-0 object-contain" />
            <span className="flex-1">{lang.name}</span>
            {tab.overrideLanguage === lang.ext && <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PreviewTabIcon = () => (
  <HugeiconsIcon icon={Globe02Icon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
);
const GitDiffTabIcon = () => (
  <HugeiconsIcon icon={GitCompareIcon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
);
const GitHistoryTabIcon = () => (
  <HugeiconsIcon icon={Clock01Icon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
);

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
