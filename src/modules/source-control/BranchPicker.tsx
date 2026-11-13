import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { git, type GitBranchEntry } from '@/modules/git';
import { Folder01Icon, GitBranchIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SourceControlRepositoryTarget } from './repositoryTarget';

const NO_BRANCHES: GitBranchEntry[] = [];

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/** The repository and branch box of the Git view (E10-14 design), opening the branch and worktree menu. */
export function BranchPicker({
  repoRoot,
  repoLabel,
  displayRepoRoot,
  repositoryTarget,
  onFollowRepositoryContext,
  onNavigateToPath,
  onRefresh,
}: {
  repoRoot: string | null;
  repoLabel: string;
  displayRepoRoot: string | null;
  repositoryTarget: SourceControlRepositoryTarget;
  onFollowRepositoryContext: () => void;
  onNavigateToPath?: (path: string) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The branches listed for a repository at this opening of the menu; another repository lists its own.
  const [listing, setListing] = useState<{ root: string; branches: GitBranchEntry[]; error: string | null } | null>(
    null,
  );
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutInFlight = useRef(false);

  useEffect(() => {
    if (!open || !repoRoot) return;
    let current = true;
    git.listBranches(repoRoot).then(
      (result) => {
        if (current) setListing({ root: repoRoot, branches: result.branches, error: null });
      },
      (e) => {
        if (current) setListing({ root: repoRoot, branches: [], error: String(e) });
      },
    );
    return () => {
      current = false;
    };
  }, [open, repoRoot]);

  const listed = listing?.root === repoRoot ? listing : null;
  const branches = listed?.branches ?? NO_BRANCHES;
  const error = listed?.error ?? null;
  const loading = repoRoot !== null && listed === null;

  // Each opening lists the branches afresh.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setListing(null);
  };

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!repoRoot || checkoutInFlight.current) return;
      checkoutInFlight.current = true;
      setCheckingOut(true);
      try {
        await git.checkoutBranch(repoRoot, branch);
        setOpen(false);
        onRefresh();
      } catch (e) {
        toast.error(String(e));
      }
      checkoutInFlight.current = false;
      setCheckingOut(false);
    },
    [repoRoot, onRefresh],
  );

  const localBranches = useMemo(() => branches.filter((b) => b.kind === 'local'), [branches]);
  const worktrees = useMemo(() => branches.filter((b) => b.kind === 'worktree'), [branches]);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={checkingOut}
          title={displayRepoRoot ?? repoLabel}
          className="flex h-[26px] min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-background px-2 text-xs whitespace-nowrap text-muted-foreground outline-none transition-colors hover:border-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-70"
        >
          <HugeiconsIcon icon={GitBranchIcon} size={13} strokeWidth={1.5} className="shrink-0" />
          {displayRepoRoot ? (
            <>
              <span className="max-w-[45%] truncate">{basename(displayRepoRoot)}</span>
              <span>/</span>
            </>
          ) : null}
          <span className="min-w-0 truncate font-medium text-foreground">{repoLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {displayRepoRoot ? (
          <>
            <DropdownMenuLabel>Repository</DropdownMenuLabel>
            <div className="truncate px-2 pb-1.5 text-[11px] text-muted-foreground" title={displayRepoRoot}>
              {displayRepoRoot}
            </div>
            {repositoryTarget.mode === 'fixed' ? (
              <DropdownMenuItem
                onSelect={() => {
                  onFollowRepositoryContext();
                  setOpen(false);
                }}
                className="cursor-pointer"
              >
                Follow Active Context
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Loading branches…
          </div>
        ) : error ? (
          <div className="px-2 py-1.5 text-xs leading-snug text-destructive">{error}</div>
        ) : (
          <>
            {localBranches.length > 0 && (
              <>
                <DropdownMenuLabel>Local Branches</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {localBranches.map((b) => (
                    <DropdownMenuItem
                      key={b.name}
                      onSelect={() => void handleCheckout(b.name)}
                      className="cursor-pointer"
                    >
                      {b.isHead ? (
                        <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={1.5} className="shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            {worktrees.length > 0 && (
              <>
                {localBranches.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {worktrees.map((b) => (
                    <DropdownMenuItem
                      key={b.worktreePath ?? b.name}
                      onSelect={() => {
                        if (b.worktreePath && onNavigateToPath) {
                          onNavigateToPath(b.worktreePath);
                        }
                      }}
                      className="h-auto cursor-pointer py-1"
                    >
                      <HugeiconsIcon
                        icon={Folder01Icon}
                        size={14}
                        strokeWidth={1.5}
                        className="shrink-0 text-muted-foreground"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{b.name}</span>
                        {b.worktreePath && (
                          <span className="truncate text-[11px] text-muted-foreground">{b.worktreePath}</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            {branches.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No branches found.</div>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
