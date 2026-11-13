import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { IS_MAC } from '@/modules/platform';
import { ShortcutKeys } from '@/modules/shortcuts';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import type { SourceControlPanelState } from './useSourceControlPanel';

const BUTTON_CLASS =
  'h-7 min-w-0 flex-1 rounded-md border text-xs font-medium outline-none transition-[background-color,filter] focus-visible:ring-1 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:opacity-45';
const SECONDARY_CLASS =
  'border-muted-foreground/70 bg-transparent text-foreground hover:bg-accent aria-disabled:hover:bg-transparent';

/** "↑2 ↓1 origin/main": the counts ahead of and behind the upstream, then the upstream. */
function syncLabel(ahead: number, behind: number, upstream: string | null | undefined): string {
  const parts: string[] = [];
  if (ahead > 0) parts.push(`↑${ahead}`);
  if (behind > 0) parts.push(`↓${behind}`);
  parts.push(upstream || 'No upstream');
  return parts.join(' ');
}

/** The commit message, the staged and sync state, and the Commit and Push actions (E10-14 design). */
export function CommitBox({ scm, blocked }: { scm: SourceControlPanelState; blocked: boolean }) {
  // Plain text for the tooltips; the hint under the message draws the keys.
  const shortcut = IS_MAC ? '⌘↩' : 'Ctrl+Enter';
  const shortcutKeys = IS_MAC ? '⌘ ↩' : 'Ctrl Enter';
  const stagedCount = scm.stagedEntries.length;
  const hasMessage = scm.commitMessage.trim().length > 0;
  const canCommit = stagedCount > 0 && hasMessage && !blocked && !scm.actionBusy;
  const commitHint = canCommit
    ? `Commit with ${shortcut}.`
    : scm.actionBusy
      ? 'Wait for the current Git action to finish.'
      : stagedCount === 0
        ? 'Stage changes to enable commit.'
        : !hasMessage
          ? 'Enter a commit message to enable commit.'
          : `Commit with ${shortcut}.`;
  const canPush = scm.canPush && !blocked && !scm.actionBusy;
  const pushHint = blocked
    ? 'Wait for the selected repository to finish loading.'
    : scm.actionBusy
      ? 'Wait for the current Git action to finish.'
      : (scm.pushHint ?? 'Push is unavailable right now.');

  const feedback = useMemo(() => {
    if (scm.actionError) return { tone: 'error', message: scm.actionError } as const;
    if (scm.remoteError) return { tone: 'error', message: scm.remoteError } as const;
    if (scm.actionMessage) return { tone: 'success', message: scm.actionMessage } as const;
    return null;
  }, [scm.actionError, scm.actionMessage, scm.remoteError]);

  const commit = () => {
    if (canCommit) void scm.commit();
  };
  const push = () => {
    if (canPush) void scm.push();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canCommit) {
      event.preventDefault();
      commit();
    }
  };

  return (
    <>
      <div className="rounded-lg border border-muted-foreground/70 bg-background transition-colors focus-within:border-primary">
        <textarea
          aria-label="Commit message"
          placeholder="Commit message"
          value={scm.commitMessage}
          onChange={(event) => scm.setCommitMessage(event.target.value)}
          onKeyDown={onKeyDown}
          className="block h-[46px] w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] leading-[18px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="px-2.5 pt-0.5 pb-1.5 text-[11px] leading-[14px] tabular-nums text-muted-foreground">
          {scm.commitMessage.length > 0 ? (
            `Ch: ${scm.commitMessage.length}`
          ) : (
            <>
              <ShortcutKeys label={shortcutKeys} /> to commit
            </>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        <span
          className={cn('size-1.5 shrink-0 rounded-full', stagedCount > 0 ? 'bg-primary' : 'bg-muted-foreground')}
        />
        <span className="shrink-0 font-medium text-foreground">
          {stagedCount === 0 ? 'Nothing staged' : `${stagedCount} ${stagedCount === 1 ? 'file' : 'files'} staged`}
        </span>
        <span className="min-w-0 flex-1 truncate text-right tabular-nums">
          {syncLabel(scm.status?.ahead ?? 0, scm.status?.behind ?? 0, scm.status?.upstream)}
        </span>
      </div>

      <div className="flex gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled={!canCommit}
              onClick={commit}
              className={cn(
                BUTTON_CLASS,
                canCommit
                  ? 'border-transparent bg-primary text-primary-foreground hover:brightness-108'
                  : SECONDARY_CLASS,
              )}
            >
              {scm.actionBusy === 'commit' ? 'Committing…' : 'Commit'}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{commitHint}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-disabled={!canPush} onClick={push} className={cn(BUTTON_CLASS, SECONDARY_CLASS)}>
              {scm.actionBusy === 'push' ? 'Pushing…' : 'Push'}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {pushHint}
          </TooltipContent>
        </Tooltip>
      </div>

      <CommitFeedback feedback={feedback} />
    </>
  );
}

function CommitFeedback({ feedback }: { feedback: { tone: 'error' | 'success'; message: string } | null }) {
  const [visibleFeedback, setVisibleFeedback] = useState(feedback);
  const [isVisible, setIsVisible] = useState(false);
  // New feedback shows at once; no feedback fades out what is shown.
  const [shownFor, setShownFor] = useState<typeof feedback | undefined>(undefined);
  if (feedback !== shownFor) {
    setShownFor(feedback);
    if (feedback) setVisibleFeedback(feedback);
    setIsVisible(feedback !== null);
  }

  useEffect(() => {
    if (!feedback) return;
    const hideTimer = window.setTimeout(() => setIsVisible(false), 3600);
    const clearTimer = window.setTimeout(() => {
      setVisibleFeedback((current) =>
        current?.message === feedback.message && current.tone === feedback.tone ? null : current,
      );
    }, 3900);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [feedback]);

  if (!visibleFeedback) return null;

  const isError = visibleFeedback.tone === 'error';
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-2.5 top-[calc(100%-0.25rem)] z-20 flex min-w-0 items-center gap-1.5 rounded-md border bg-popover px-2.5 py-1.5 text-[11px] leading-snug shadow-lg shadow-black/15 transition-all duration-200',
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
        isError ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground',
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', isError ? 'bg-destructive' : 'bg-primary')} />
      <span className="min-w-0 flex-1 truncate">{visibleFeedback.message}</span>
    </div>
  );
}
