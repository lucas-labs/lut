import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogWarning,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { IS_WINDOWS } from '@/modules/platform';
import { SidebarHeaderButton, SidebarViewHeader } from '@/modules/sidebar';
import {
  ArrowDown02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Download01Icon,
  GitCommitIcon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { BranchPicker } from './BranchPicker';
import { ChangesList } from './ChangesList';
import { CommitBox } from './CommitBox';
import { repositoryTargetIsPending, type SourceControlRepositoryTarget } from './repositoryTarget';
import type { SourceControlSummary } from './useSourceControl';
import { useSourceControlPanel } from './useSourceControlPanel';

type Props = {
  open: boolean;
  sourceControl: SourceControlSummary;
  onOpenGitGraph?: () => void;
  onOpenDiff: (input: {
    path: string;
    repoRoot: string;
    mode: '+' | '-';
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenFile?: (absolutePath: string) => void;
  onNavigateToPath?: (path: string) => void;
  repositoryTarget: SourceControlRepositoryTarget;
  onFollowRepositoryContext: () => void;
};

/** The sidebar's Git view (E10-13, E10-14 design): sync actions, repository and commit box, then the changes. */
export const GitPanel = memo(function GitPanel({
  open,
  sourceControl,
  onOpenGitGraph,
  onOpenDiff,
  onOpenFile,
  onNavigateToPath,
  repositoryTarget,
  onFollowRepositoryContext,
}: Props) {
  const scm = useSourceControlPanel(open, sourceControl, onOpenDiff);
  const refreshAnimationRef = useRef<number | null>(null);
  const [refreshAnimating, setRefreshAnimating] = useState(false);

  useEffect(() => {
    return () => {
      if (refreshAnimationRef.current) window.clearTimeout(refreshAnimationRef.current);
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshAnimating(true);
    if (refreshAnimationRef.current) window.clearTimeout(refreshAnimationRef.current);
    void scm.refresh().finally(() => {
      refreshAnimationRef.current = window.setTimeout(() => {
        setRefreshAnimating(false);
        refreshAnimationRef.current = null;
      }, 450);
    });
  }, [scm]);

  if (!open) return null;

  const fixedTargetPending = repositoryTargetIsPending({
    target: repositoryTarget,
    loadedContextPath: sourceControl.contextPath,
    loadedRepoRoot: sourceControl.repo?.repoRoot ?? null,
    isLoading: sourceControl.isLoading,
  });
  const panelState = fixedTargetPending ? 'loading' : scm.panelState;
  const isRefreshing = panelState === 'loading';
  const status = scm.status;
  const repoLabel = fixedTargetPending
    ? 'Loading'
    : !status
      ? 'Source Control'
      : status.isDetached
        ? 'detached'
        : status.branch;
  const hasUpstream = !!status?.upstream;
  const behind = status?.behind ?? 0;
  const isDiverged = !!status && status.ahead > 0 && status.behind > 0;
  const remoteBlocked = fixedTargetPending || !!scm.actionBusy || !!sourceControl.busyAction;
  const canFetch = hasUpstream && !remoteBlocked;
  const canPull = hasUpstream && behind > 0 && !isDiverged && !remoteBlocked;
  const fetchBusy = sourceControl.busyAction === 'fetch';
  const pullBusy = sourceControl.busyAction === 'pull';
  const pullLabel = pullBusy
    ? 'Pulling…'
    : isDiverged
      ? 'Branch diverged — resolve in terminal'
      : !hasUpstream
        ? 'No upstream configured'
        : behind === 0
          ? 'Already up to date'
          : `Pull ${behind} commits (fast-forward)`;

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <aside className="flex h-full min-w-0 flex-col [contain:layout_style]">
        <SidebarViewHeader title="Source control">
          <HeaderAction
            label={fetchBusy ? 'Fetching…' : 'Fetch from remote'}
            disabled={!canFetch}
            onClick={() => void sourceControl.runRemoteAction('fetch')}
          >
            {fetchBusy ? (
              <Spinner className="size-3" />
            ) : (
              <HugeiconsIcon icon={Download01Icon} size={15} strokeWidth={1.5} />
            )}
          </HeaderAction>
          <HeaderAction
            label={pullLabel}
            disabled={!canPull}
            onClick={() => void sourceControl.runRemoteAction('pull')}
          >
            {pullBusy ? (
              <Spinner className="size-3" />
            ) : (
              <HugeiconsIcon icon={ArrowDown02Icon} size={15} strokeWidth={1.5} />
            )}
          </HeaderAction>
          <HeaderAction
            label="Refresh source control"
            disabled={isRefreshing || !!scm.actionBusy}
            onClick={handleRefresh}
          >
            {isRefreshing ? (
              <Spinner className="size-3.5" />
            ) : (
              <HugeiconsIcon
                icon={Refresh01Icon}
                size={15}
                strokeWidth={1.5}
                className={cn(refreshAnimating && 'animate-spin')}
              />
            )}
          </HeaderAction>
        </SidebarViewHeader>

        {panelState === 'loading' ? <PanelCenter title="Loading repository" /> : null}
        {panelState === 'no-repo' ? (
          <PanelCenter title="No repository" body="The active workspace is not inside a Git repository." />
        ) : null}
        {panelState === 'error' ? (
          <PanelCenter
            title="Source control error"
            body={scm.statusError ?? 'Unknown source control error'}
            action={
              <Button size="sm" onClick={() => void scm.refresh()}>
                Retry
              </Button>
            }
          />
        ) : null}

        {panelState === 'ready' && status ? (
          <>
            <div className="relative flex shrink-0 flex-col gap-2 border-b border-border px-2.5 pt-0.5 pb-2.5">
              <BranchPicker
                repoRoot={fixedTargetPending ? null : (scm.repo?.repoRoot ?? null)}
                repoLabel={repoLabel}
                displayRepoRoot={
                  repositoryTarget.mode === 'fixed' ? repositoryTarget.repoRoot : (scm.repo?.repoRoot ?? null)
                }
                repositoryTarget={repositoryTarget}
                onFollowRepositoryContext={onFollowRepositoryContext}
                onNavigateToPath={onNavigateToPath}
                onRefresh={handleRefresh}
              />
              {onOpenGitGraph ? (
                <button
                  type="button"
                  onClick={() => onOpenGitGraph()}
                  className="-mx-1 flex h-7 items-center gap-2 rounded-md px-1.5 text-left text-[13px] text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <HugeiconsIcon
                    icon={GitCommitIcon}
                    size={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="flex-1">Commit Graph</span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={12}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted-foreground"
                  />
                </button>
              ) : null}
              <CommitBox scm={scm} blocked={fixedTargetPending} />
            </div>

            {scm.allClean ? (
              <CleanTreeHint repoLabel={repoLabel} />
            ) : (
              <ChangesList
                entries={scm.fileEntries}
                diverged={isDiverged}
                headerCheckState={scm.headerCheckState}
                selectedPath={scm.selected?.path ?? null}
                actionBusy={scm.actionBusy}
                repoRoot={scm.repo?.repoRoot ?? null}
                onToggleAll={scm.toggleAll}
                onSelectFile={scm.selectFile}
                onToggleStageFile={scm.toggleStageFile}
                onDiscardFile={scm.requestDiscardFile}
                onOpenFile={onOpenFile}
                onRefresh={handleRefresh}
              />
            )}
          </>
        ) : null}
      </aside>

      <AlertDialog
        open={scm.pendingDiscard !== null}
        onOpenChange={(o) => {
          if (!o) scm.cancelPendingDiscard();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogWarning />
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {scm.pendingDiscard?.scope === 'all'
                ? `This will discard ${scm.pendingDiscard.label} and cannot be undone.`
                : scm.pendingDiscard
                  ? `Discard changes in "${scm.pendingDiscard.label}"? This cannot be undone.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter actionFirst={IS_WINDOWS}>
            <AlertDialogCancel onClick={() => scm.cancelPendingDiscard()}>Cancel</AlertDialogCancel>
            <AlertDialogAction tone="danger" onClick={() => void scm.confirmPendingDiscard()}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
});

function HeaderAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarHeaderButton aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </SidebarHeaderButton>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function PanelCenter({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {body ? <div className="max-w-64 text-[11px] leading-relaxed text-muted-foreground">{body}</div> : null}
      {action}
    </div>
  );
}

function CleanTreeHint({ repoLabel }: { repoLabel: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-4 text-center">
      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={18} strokeWidth={1.5} className="text-muted-foreground" />
      <div className="text-xs font-medium text-foreground">Working tree clean</div>
      <div className="text-[11px] leading-snug text-muted-foreground">
        on <span className="font-mono text-foreground">{repoLabel}</span>
      </div>
    </div>
  );
}
