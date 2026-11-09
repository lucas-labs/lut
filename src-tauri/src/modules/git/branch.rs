//! The remote a push should target, and the branch and remotes it is chosen from.

use crate::modules::git::errors::Result;
use crate::modules::git::plumbing::{os_args, run, run_ok, stdout_text};
use crate::modules::git::refs;
use crate::modules::git::utils::ResolvedGitDirectory;

/// The remote a first push should go to: the one git is configured to push this
/// branch to (`branch.<name>.pushRemote`, then `remote.pushDefault`), and only
/// when none is configured `origin` if it exists, otherwise the only remote.
/// A configured name that is not a remote yields `None` instead of a guess: the
/// branch would otherwise be published somewhere the user did not choose.
pub fn choose_push_remote(
    branch_push_remote: Option<&str>,
    push_default: Option<&str>,
    remotes: &[String],
) -> Option<String> {
    fn set(value: Option<&str>) -> Option<&str> {
        value.filter(|r| !r.is_empty())
    }
    match set(branch_push_remote).or(set(push_default)) {
        Some(configured) => remotes
            .iter()
            .any(|r| r == configured)
            .then(|| configured.to_string()),
        None => pick_remote(remotes),
    }
}

/// `choose_push_remote` with the configuration read from the repository.
pub fn push_remote_for(
    repo: &ResolvedGitDirectory,
    branch: &str,
    remotes: &[String],
) -> Result<Option<String>> {
    let branch_push = config_value(repo, &format!("branch.{branch}.pushRemote"))?;
    let push_default = config_value(repo, "remote.pushDefault")?;
    Ok(choose_push_remote(
        branch_push.as_deref(),
        push_default.as_deref(),
        remotes,
    ))
}

/// The fallback remote when nothing is configured: `origin` when it exists,
/// otherwise the only remote, otherwise none.
pub fn pick_remote(remotes: &[String]) -> Option<String> {
    if remotes.iter().any(|r| r == "origin") {
        return Some("origin".to_string());
    }
    match remotes {
        [only] => Some(only.clone()),
        _ => None,
    }
}

fn config_value(repo: &ResolvedGitDirectory, key: &str) -> Result<Option<String>> {
    let output = run(repo, os_args(["config", "--get", key]))?;
    if output.exit_code != Some(0) {
        return Ok(None);
    }
    let value = stdout_text(&output);
    Ok((!value.is_empty()).then_some(value))
}

pub fn list_remotes(repo: &ResolvedGitDirectory) -> Result<Vec<String>> {
    let output = run_ok(repo, os_args(["remote"]), "git remote failed")?;
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|r| refs::is_plausible_ref_name(r))
        .map(str::to_string)
        .collect())
}

/// The checked-out branch, or `None` on a detached HEAD. The full name is
/// shortened here: `--short` prints `heads/topic` when a tag is also called
/// `topic`, which names no branch at all.
pub fn current_branch(repo: &ResolvedGitDirectory) -> Result<Option<String>> {
    let output = run(repo, os_args(["symbolic-ref", "-q", "HEAD"]))?;
    if output.exit_code != Some(0) {
        return Ok(None);
    }
    let full = stdout_text(&output);
    Ok(full
        .strip_prefix("refs/heads/")
        .filter(|name| !name.is_empty())
        .map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_choice_prefers_origin_then_a_sole_remote() {
        let names = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            pick_remote(&names(&["fork", "origin"])).as_deref(),
            Some("origin")
        );
        assert_eq!(pick_remote(&names(&["fork"])).as_deref(), Some("fork"));
        assert_eq!(pick_remote(&names(&["a", "b"])), None);
        assert_eq!(pick_remote(&[]), None);
    }

    #[test]
    fn a_configured_push_remote_beats_origin_and_a_bogus_one_beats_nothing() {
        let names = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let remotes = names(&["origin", "fork"]);
        let choose = |branch: Option<&str>, default: Option<&str>| {
            choose_push_remote(branch, default, &remotes)
        };
        assert_eq!(choose(None, None).as_deref(), Some("origin"));
        assert_eq!(choose(None, Some("fork")).as_deref(), Some("fork"));
        assert_eq!(choose(Some("fork"), None).as_deref(), Some("fork"));
        assert_eq!(
            choose(Some("origin"), Some("fork")).as_deref(),
            Some("origin"),
            "the branch's own setting wins over the repository default"
        );
        assert_eq!(
            choose(Some(""), Some("fork")).as_deref(),
            Some("fork"),
            "an empty setting is no setting"
        );
        // A configured name that is not a remote is never replaced by a guess.
        assert_eq!(choose(Some("gone"), None), None);
        assert_eq!(choose(None, Some("gone")), None);
        assert_eq!(
            choose_push_remote(None, None, &names(&["a", "b"])),
            None,
            "nothing configured and nothing obvious"
        );
    }
}
