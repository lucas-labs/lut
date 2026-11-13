import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { FileIcon } from '@/modules/explorer/FileIcon';
import type { GitCommitFileChange, GitLogEntry } from '@/modules/git';
import { Copy01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { memo, type ReactNode, useEffect, useState } from 'react';
import { RefChip } from './CommitRow';
import { commitWebUrl, hostLabel, type RemoteWebInfo } from './lib/remoteWebUrl';

export type FilesEntry =
  { state: 'loading' } | { state: 'loaded'; files: GitCommitFileChange[] } | { state: 'error'; error: string };

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
}

function absoluteTime(secs: number): string {
  if (!secs) return '';
  return new Date(secs * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(code: string): string {
  switch (code.toUpperCase()) {
    case 'A':
      return 'text-[var(--terminal-ansi-green)]';
    case 'M':
      return 'text-warning';
    case 'D':
      return 'text-[var(--terminal-ansi-red)]';
    case 'R':
    case 'C':
      return 'text-[var(--terminal-ansi-blue)]';
    default:
      return 'text-muted-foreground';
  }
}

type Props = {
  commit: GitLogEntry;
  filesEntry: FilesEntry | null;
  remoteWeb: RemoteWebInfo | null;
  onCopySha: (value: string) => Promise<void> | void;
  onOpenFile: (commit: GitLogEntry, file: GitCommitFileChange) => Promise<void> | void;
  onRetryFiles: () => void;
};

/** A commit's details and changed files, shown in a popover from its row. */
export function CommitDetail({ commit, filesEntry, remoteWeb, onCopySha, onOpenFile, onRetryFiles }: Props) {
  const webUrl = remoteWeb ? commitWebUrl(remoteWeb, commit.sha) : null;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1100);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex max-h-[60vh] min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 pt-3 pb-2">
        <div className="text-[13px] leading-[18px] font-medium text-foreground">
          {commit.subject || <span className="text-muted-foreground">(no subject)</span>}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-[14px] text-muted-foreground">
          <span className="font-mono text-foreground">{commit.shortSha}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{commit.author || 'Unknown'}</span>
          {commit.authorEmail ? (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{commit.authorEmail}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0">{absoluteTime(commit.timestampSecs)}</span>
        </div>
        {commit.refs.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {commit.refs.map((r) => (
              <RefChip key={`${r.kind}:${r.name}`} gitRef={r} />
            ))}
          </div>
        ) : null}
        <div className="mt-2 -ml-1.5 flex items-center gap-1">
          <DetailAction
            onClick={() => {
              void onCopySha(commit.sha);
              setCopied(true);
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.5} />
            {copied ? 'Copied' : 'Copy SHA'}
          </DetailAction>
          {webUrl && remoteWeb ? (
            <DetailAction onClick={() => void openUrl(webUrl).catch(console.error)}>
              <HugeiconsIcon icon={LinkSquare02Icon} size={13} strokeWidth={1.5} />
              {hostLabel(remoteWeb)}
            </DetailAction>
          ) : null}
        </div>
      </div>
      <CommitFiles commit={commit} filesEntry={filesEntry} onOpenFile={onOpenFile} onRetry={onRetryFiles} />
    </div>
  );
}

function DetailAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function CommitFiles({
  commit,
  filesEntry,
  onOpenFile,
  onRetry,
}: {
  commit: GitLogEntry;
  filesEntry: FilesEntry | null;
  onOpenFile: (commit: GitLogEntry, file: GitCommitFileChange) => Promise<void> | void;
  onRetry: () => void;
}) {
  if (!filesEntry || filesEntry.state === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        Loading files…
      </div>
    );
  }
  if (filesEntry.state === 'error') {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-destructive">
        <span className="truncate">{filesEntry.error}</span>
        <DetailAction onClick={onRetry}>Retry</DetailAction>
      </div>
    );
  }
  if (filesEntry.files.length === 0) {
    return <div className="px-3 py-3 text-xs text-muted-foreground">No file changes.</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] leading-[14px] text-muted-foreground">
        Files
        <span className="font-mono">{filesEntry.files.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 pb-1 [scrollbar-gutter:stable]">
        {filesEntry.files.map((file) => (
          <li key={file.path}>
            <FileRow file={file} onOpen={() => void onOpenFile(commit, file)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const FileRow = memo(function FileRow({ file, onOpen }: { file: GitCommitFileChange; onOpen: () => void }) {
  const fileName = basename(file.path);
  const dir = dirname(file.path);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-7 w-full items-center gap-2 rounded-[5px] px-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
    >
      <FileIcon name={fileName} className="size-3.5 shrink-0" />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-[13px] text-foreground">{fileName}</span>
        {dir ? <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{dir}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
        {file.isBinary ? (
          <span className="text-muted-foreground">binary</span>
        ) : (
          <>
            {file.added > 0 ? <span className="text-[var(--terminal-ansi-green)]">+{file.added}</span> : null}
            {file.removed > 0 ? <span className="text-[var(--terminal-ansi-red)]">−{file.removed}</span> : null}
          </>
        )}
      </span>
      <span
        className={cn('w-3 shrink-0 text-center font-mono text-[11px] font-medium', statusClass(file.status))}
        title={file.statusLabel}
      >
        {file.status.toUpperCase()}
      </span>
    </button>
  );
});
