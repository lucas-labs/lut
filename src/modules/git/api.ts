import { currentWorkspaceEnv } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import type {
  GitBranchListResult,
  GitCommitFileChange,
  GitCommitResult,
  GitDiffContentResult,
  GitDiffResult,
  GitDiscardEntry,
  GitLogEntry,
  GitLogScope,
  GitPanelSnapshot,
  GitPushResult,
  GitRepoInfo,
  GitStatusSnapshot,
  GitWatchInfo,
} from './types';

export const git = {
  resolveRepo: (cwd: string) =>
    invoke<GitRepoInfo | null>('git_resolve_repo', {
      cwd,
      workspace: currentWorkspaceEnv(),
    }),
  panelSnapshot: (cwd: string) =>
    invoke<GitPanelSnapshot>('git_panel_snapshot', {
      cwd,
      workspace: currentWorkspaceEnv(),
    }),
  status: (repoRoot: string) =>
    invoke<GitStatusSnapshot>('git_status', {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  diff: (repoRoot: string, path: string | null, staged: boolean) =>
    invoke<GitDiffResult>('git_diff', {
      repoRoot,
      path,
      staged,
      workspace: currentWorkspaceEnv(),
    }),
  diffContent: (repoRoot: string, path: string, staged: boolean, originalPath?: string | null) =>
    invoke<GitDiffContentResult>('git_diff_content', {
      repoRoot,
      path,
      staged,
      originalPath: originalPath ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  stage: (repoRoot: string, paths: string[]) =>
    invoke<void>('git_stage', {
      repoRoot,
      paths,
      workspace: currentWorkspaceEnv(),
    }),
  unstage: (repoRoot: string, paths: string[]) =>
    invoke<void>('git_unstage', {
      repoRoot,
      paths,
      workspace: currentWorkspaceEnv(),
    }),
  discard: (repoRoot: string, entries: GitDiscardEntry[]) =>
    invoke<void>('git_discard', {
      repoRoot,
      entries,
      workspace: currentWorkspaceEnv(),
    }),
  commit: (repoRoot: string, message: string) =>
    invoke<GitCommitResult>('git_commit', {
      repoRoot,
      message,
      workspace: currentWorkspaceEnv(),
    }),
  fetch: (repoRoot: string) =>
    invoke<void>('git_fetch', {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  pullFfOnly: (repoRoot: string) =>
    invoke<void>('git_pull_ff_only', {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  push: (repoRoot: string, options?: { setUpstream?: boolean }) =>
    invoke<GitPushResult>('git_push', {
      repoRoot,
      setUpstream: options?.setUpstream ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  log: (repoRoot: string, options?: { limit?: number; skip?: number; scope?: GitLogScope }) =>
    invoke<GitLogEntry[]>('git_log', {
      repoRoot,
      limit: options?.limit ?? null,
      skip: options?.skip ?? null,
      scope: options?.scope ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  commitCount: (repoRoot: string, scope?: GitLogScope) =>
    invoke<number>('git_commit_count', {
      repoRoot,
      scope: scope ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  commitFiles: (repoRoot: string, sha: string) =>
    invoke<GitCommitFileChange[]>('git_commit_files', {
      repoRoot,
      sha,
      workspace: currentWorkspaceEnv(),
    }),
  commitFileDiff: (repoRoot: string, sha: string, path: string, originalPath?: string | null) =>
    invoke<GitDiffContentResult>('git_commit_file_diff', {
      repoRoot,
      sha,
      path,
      originalPath: originalPath ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  remoteUrl: (repoRoot: string, name?: string) =>
    invoke<string | null>('git_remote_url', {
      repoRoot,
      name: name ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  listBranches: (repoRoot: string) =>
    invoke<GitBranchListResult>('git_list_branches', {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  checkoutBranch: (repoRoot: string, branch: string) =>
    invoke<void>('git_checkout_branch', {
      repoRoot,
      branch,
      workspace: currentWorkspaceEnv(),
    }),

  // ---- change notifications (see ./changes.ts for the subscription helper)
  watch: (repoRoot: string) =>
    invoke<GitWatchInfo>('git_watch', {
      repoRoot,
      workspace: currentWorkspaceEnv(),
    }),
  /** `repo` is the key `watch` returned; it resolves nothing, so it also works once the worktree is gone. */
  unwatch: (repo: string) => invoke<void>('git_unwatch', { repo }),
};
