export type GitRepoInfo = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
};

export type GitChangedFile = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
};

export type GitStatusSnapshot = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  truncated: boolean;
  changedFiles: GitChangedFile[];
};

export type GitDiffResult = {
  diffText: string;
  truncated: boolean;
};

export type GitDiffContentResult = {
  originalContent: string;
  modifiedContent: string;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
};

export type GitCommitResult = {
  commitSha: string;
  summary: string;
};

export type GitPushResult = {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
};

/** Which commits the history view walks: the checked-out branch, local and remote branches, or one local branch. */
export type GitLogScope = { kind: 'head' } | { kind: 'all' } | { kind: 'branch'; name: string };

/** `head` is the checked-out branch, or `HEAD` itself when detached. */
type GitLogRefKind = 'head' | 'branch' | 'remote' | 'tag';

export type GitLogRef = {
  name: string;
  kind: GitLogRefKind;
};

export type GitLogEntry = {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestampSecs: number;
  parents: string[];
  refs: GitLogRef[];
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type GitCommitFileChange = {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
};

export type GitPanelSnapshot = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
};

export type GitDiscardEntry = {
  path: string;
  untracked: boolean;
};

export type GitBranchEntry = {
  name: string;
  kind: 'local' | 'worktree';
  worktreePath: string | null;
  isHead: boolean;
  isDetached: boolean;
};

export type GitBranchListResult = {
  branches: GitBranchEntry[];
};

// ---------------------------------------------------------------- watch

export type GitChangeKind = 'head' | 'index' | 'refs' | 'worktree';

export type GitWatchInfo = {
  watching: boolean;
  repo: string;
  watchedDirs: number;
  truncated: boolean;
  reason: string | null;
};

export type GitChangedEvent = { repo: string; kinds: GitChangeKind[] };
