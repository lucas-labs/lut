import { cn } from '@/lib/utils';
import type { GitLogEntry, GitLogRef } from '@/modules/git';
import { File02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { memo, type MouseEvent, type ReactNode } from 'react';
import { GraphRail } from './GraphRail';
import type { GraphRow } from './lib/graph';
import { splitSubject } from './lib/subject';

export const ROW_HEIGHT = 32;

/** graph | SHA | subject | author | date | changes (the design's columns). */
export function gridTemplate(railColumnPx: number): string {
  return `${railColumnPx}px 76px minmax(0, 1fr) 160px 104px 128px`;
}

function authorInitials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function compactDate(secs: number): string {
  if (!secs) return '';
  const d = new Date(secs * 1000);
  const now = new Date();
  const month = d.toLocaleString(undefined, { month: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${month} ${day} ${hh}:${mm}`;
  }
  return `${month} ${day} ${d.getFullYear()}`;
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/25 px-0.5 text-foreground">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function RefChip({ gitRef }: { gitRef: GitLogRef }) {
  return (
    <span
      title={gitRef.kind === 'tag' ? `Tag ${gitRef.name}` : gitRef.name}
      className={cn(
        'inline-flex h-[18px] max-w-40 shrink-0 items-center truncate rounded-[4px] border border-border px-1.5 text-[11px] leading-[14px] text-muted-foreground',
        gitRef.kind === 'head' && 'border-transparent bg-primary/15 font-medium text-primary',
        gitRef.kind === 'remote' && 'border-dashed',
      )}
    >
      {gitRef.name}
    </span>
  );
}

type Props = {
  commit: GitLogEntry;
  query: string;
  active: boolean;
  graphRow: GraphRow | null;
  maxLaneCount: number;
  gridTemplate: string;
  onClick: (sha: string, event: MouseEvent<HTMLElement>) => void;
};

/** One commit of the history table. */
export const CommitRow = memo(function CommitRow({
  commit,
  query,
  active,
  graphRow,
  maxLaneCount,
  gridTemplate,
  onClick,
}: Props) {
  const { type, message } = splitSubject(commit.subject);
  const totalStat = commit.insertions + commit.deletions;
  const isHead = commit.refs.some((r) => r.kind === 'head');
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={active}
      onClick={(event) => onClick(commit.sha, event)}
      className={cn(
        'grid h-full w-full cursor-default items-center gap-x-3 pr-4 text-left text-[13px] leading-[18px] whitespace-nowrap text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
        active ? 'bg-accent' : 'hover:bg-card',
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <span className="flex h-full items-center">
        {graphRow ? (
          <GraphRail row={graphRow} rowHeight={ROW_HEIGHT} maxLaneCount={maxLaneCount} head={isHead} />
        ) : null}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{commit.shortSha}</span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {commit.refs.map((r) => (
          <RefChip key={`${r.kind}:${r.name}`} gitRef={r} />
        ))}
        {type ? <span className="shrink-0 text-muted-foreground">{type}</span> : null}
        <span className="min-w-0 truncate">
          {message ? highlight(message, query) : <span className="text-muted-foreground">(no subject)</span>}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={commit.authorEmail}>
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-foreground">
          {authorInitials(commit.author)}
        </span>
        <span className="min-w-0 truncate">{commit.author ? highlight(commit.author, query) : 'Unknown'}</span>
      </span>
      <span className="font-mono text-xs text-muted-foreground">{compactDate(commit.timestampSecs)}</span>
      <span className="flex items-center justify-end gap-1.5 font-mono text-xs text-muted-foreground">
        {commit.filesChanged > 0 ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={`${commit.filesChanged} ${commit.filesChanged === 1 ? 'file' : 'files'} changed`}
          >
            <HugeiconsIcon icon={File02Icon} size={12} strokeWidth={1.5} />
            {commit.filesChanged}
          </span>
        ) : null}
        {commit.insertions > 0 ? <span className="text-[var(--terminal-ansi-green)]">+{commit.insertions}</span> : null}
        {commit.deletions > 0 ? <span className="text-[var(--terminal-ansi-red)]">−{commit.deletions}</span> : null}
        {commit.filesChanged === 0 && totalStat === 0 ? <span className="text-muted-foreground/50">—</span> : null}
      </span>
    </button>
  );
});
