//! Small imperative helpers over `run_git`: ref-name checks and locating the git
//! directories of an authorized worktree.

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

use crate::modules::git::errors::{GitError, Result};
use crate::modules::git::process::{ensure_git_available, ensure_success, run_git};
use crate::modules::git::refs;
use crate::modules::git::types::{GitOutput, DEFAULT_TIMEOUT_SECS};
use crate::modules::git::utils::{authorized_repo_root, canonical_dir, ResolvedGitDirectory};
use crate::modules::workspace::{WorkspaceEnv, WorkspaceRegistry};

pub fn os_args<I, S>(items: I) -> Vec<OsString>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    items
        .into_iter()
        .map(|item| item.as_ref().to_os_string())
        .collect()
}

/// `git <args>` in `repo`, with the stock timeout.
pub fn run(repo: &ResolvedGitDirectory, args: Vec<OsString>) -> Result<GitOutput> {
    run_git(
        &repo.workspace,
        Some(&repo.git_path),
        args,
        DEFAULT_TIMEOUT_SECS,
    )
}

/// Like `run`, failing with `context` unless git exited with 0.
pub fn run_ok(
    repo: &ResolvedGitDirectory,
    args: Vec<OsString>,
    context: &'static str,
) -> Result<GitOutput> {
    let output = run(repo, args)?;
    ensure_success(&output, context)?;
    Ok(output)
}

pub fn stdout_text(output: &GitOutput) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// `name` as a branch: screened, then judged by `git check-ref-format`.
pub fn check_branch_name(repo: &ResolvedGitDirectory, name: &str) -> Result<()> {
    if !refs::is_plausible_ref_name(name) {
        return Err(GitError::InvalidRef(name.to_string()));
    }
    let output = run(
        repo,
        os_args(["check-ref-format", &format!("refs/heads/{name}")]),
    )?;
    if output.exit_code == Some(0) {
        Ok(())
    } else {
        Err(GitError::InvalidRef(name.to_string()))
    }
}

/// The authorized worktree that contains `path`, always resolved to its
/// top-level so whole-tree commands (`add -A`) cannot silently cover only a
/// subdirectory. The top-level must itself be authorized.
pub fn open_worktree(
    registry: &WorkspaceRegistry,
    path: &str,
    workspace: &WorkspaceEnv,
) -> Result<ResolvedGitDirectory> {
    let start = authorized_repo_root(registry, path, workspace)?;
    ensure_git_available(&start.workspace)?;
    let output = run(&start, os_args(["rev-parse", "--show-toplevel"]))?;
    ensure_success(&output, "not a git repository")?;
    let toplevel = stdout_text(&output);
    if toplevel.is_empty() {
        return Err(GitError::command("not a git repository", path));
    }
    let resolved = canonical_dir(registry, &toplevel, &start.workspace)?;
    if !registry.is_authorized(&resolved.local_path) {
        return Err(GitError::PathOutsideWorkspace(resolved.local_path));
    }
    Ok(resolved)
}

fn absolute_from(repo: &ResolvedGitDirectory, printed: &str) -> PathBuf {
    let path = PathBuf::from(printed);
    if path.is_absolute() {
        path
    } else {
        repo.local_path.join(path)
    }
}

/// This worktree's private git directory (`.git`, or `.git/worktrees/<name>`).
pub fn git_dir(repo: &ResolvedGitDirectory) -> Result<PathBuf> {
    let output = run_ok(
        repo,
        os_args(["rev-parse", "--absolute-git-dir"]),
        "git rev-parse failed",
    )?;
    Ok(absolute_from(repo, &stdout_text(&output)))
}

/// The git directory shared by all worktrees of the repository (refs, config).
pub fn common_dir(repo: &ResolvedGitDirectory) -> Result<PathBuf> {
    let output = run_ok(
        repo,
        os_args(["rev-parse", "--git-common-dir"]),
        "git rev-parse failed",
    )?;
    let printed = stdout_text(&output);
    let path = absolute_from(repo, &printed);
    Ok(std::fs::canonicalize(&path).unwrap_or(path))
}
