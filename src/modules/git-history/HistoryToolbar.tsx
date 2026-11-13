import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import type { GitBranchEntry, GitLogScope } from '@/modules/git';
import { ArrowDown01Icon, Download01Icon, GitBranchIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

type Props = {
  scope: GitLogScope;
  onScopeChange: (scope: GitLogScope) => void;
  /** Local branches, or null while they load. */
  branches: GitBranchEntry[] | null;
  query: string;
  onQueryChange: (query: string) => void;
  totalCount: number | null;
  fetching: boolean;
  onFetch: () => void;
};

const TOOL =
  'flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs whitespace-nowrap outline-none';

function scopeKey(scope: GitLogScope): string {
  return scope.kind === 'branch' ? `branch:${scope.name}` : scope.kind;
}

function scopeFromKey(key: string): GitLogScope {
  if (key === 'all') return { kind: 'all' };
  if (key.startsWith('branch:')) return { kind: 'branch', name: key.slice('branch:'.length) };
  return { kind: 'head' };
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** The history view's toolbar: which branches to walk, the commit filter, the counts and Fetch. */
export function HistoryToolbar({
  scope,
  onScopeChange,
  branches,
  query,
  onQueryChange,
  totalCount,
  fetching,
  onFetch,
}: Props) {
  const local = (branches ?? []).filter((b) => b.kind === 'local' && !b.isDetached);
  const current = (branches ?? []).find((b) => b.isHead);
  const scopeLabel =
    scope.kind === 'all'
      ? 'All branches'
      : scope.kind === 'branch'
        ? scope.name
        : current?.isDetached
          ? 'Detached HEAD'
          : (current?.name ?? 'Current branch');
  const summary = [
    totalCount === null ? null : plural(totalCount, 'commit', 'commits'),
    branches === null ? null : plural(local.length, 'branch', 'branches'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`${TOOL} max-w-60 text-foreground hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring`}
          >
            <HugeiconsIcon icon={GitBranchIcon} size={13} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">{scopeLabel}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.75} className="shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-56">
          <DropdownMenuRadioGroup value={scopeKey(scope)} onValueChange={(key) => onScopeChange(scopeFromKey(key))}>
            <DropdownMenuRadioItem value="all">All branches</DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Branches</DropdownMenuLabel>
            {current?.isDetached ? <DropdownMenuRadioItem value="head">Detached HEAD</DropdownMenuRadioItem> : null}
            {local.map((b) => (
              <DropdownMenuRadioItem key={b.name} value={b.isHead ? 'head' : `branch:${b.name}`}>
                <span className="min-w-0 truncate">{b.name}</span>
                {b.isHead ? <span className="ml-auto pl-3 text-[11px] text-muted-foreground">current</span> : null}
              </DropdownMenuRadioItem>
            ))}
            {branches === null ? <DropdownMenuLabel>Loading branches…</DropdownMenuLabel> : null}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <label
        className={`${TOOL} w-60 min-w-0 text-muted-foreground focus-within:border-primary focus-within:text-foreground`}
      >
        <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={1.75} className="shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              onQueryChange('');
            }
          }}
          placeholder="Filter by message, author or SHA"
          aria-label="Filter commits"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <span className="flex-1" />
      {summary ? <span className="truncate text-xs text-muted-foreground">{summary}</span> : null}

      <button
        type="button"
        onClick={onFetch}
        disabled={fetching}
        className={`${TOOL} text-foreground hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60`}
      >
        {fetching ? (
          <Spinner className="size-3" />
        ) : (
          <HugeiconsIcon icon={Download01Icon} size={13} strokeWidth={1.5} className="shrink-0" />
        )}
        {fetching ? 'Fetching…' : 'Fetch'}
      </button>
    </div>
  );
}
