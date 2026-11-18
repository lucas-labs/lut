import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { GitBranchEntry, GitLogScope } from '@/modules/git';
import { ChevronIcon, DownloadIcon, GitBranchIcon, SearchIcon } from '@lut/lut-icons';

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
          <Button variant="outline-subtle" size="sm" className="max-w-60">
            <GitBranchIcon size="sm" className="shrink-0" />
            <span className="truncate">{scopeLabel}</span>
            <ChevronIcon rotate={90} size="xs" className="shrink-0" />
          </Button>
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

      <div className="relative w-60 min-w-0 shrink-0">
        <SearchIcon
          size="sm"
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          variant="subtle"
          size="sm"
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
          className="pl-[27px]"
        />
      </div>

      <span className="flex-1" />
      {summary ? <span className="truncate text-xs text-muted-foreground">{summary}</span> : null}

      <Button variant="outline-subtle" size="sm" onClick={onFetch} disabled={fetching}>
        {fetching ? <Spinner size="xs" /> : <DownloadIcon size="sm" className="shrink-0" />}
        {fetching ? 'Fetching…' : 'Fetch'}
      </Button>
    </div>
  );
}
