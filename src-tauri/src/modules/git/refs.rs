//! Pure validation and naming for refs, revisions, task ids and slugs. These
//! are the cheap, conservative pre-filters that run before anything reaches a
//! git argument list; `git check-ref-format` stays the authority for branch
//! names (see `plumbing::check_branch_name`).

const MAX_REF_BYTES: usize = 255;

/// Characters git forbids anywhere in a ref name, plus whitespace and control
/// characters, which no legitimate name needs and which would corrupt line
/// oriented plumbing output.
fn is_forbidden_ref_char(c: char) -> bool {
    c.is_control() || c.is_whitespace() || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
}

/// A necessary condition for a valid branch or ref name. A name that passes is
/// still checked by git; one that fails never reaches it.
pub fn is_plausible_ref_name(name: &str) -> bool {
    if name.is_empty() || name.len() > MAX_REF_BYTES || name == "@" {
        return false;
    }
    if name.starts_with('-') || name.starts_with('/') || name.ends_with('/') || name.ends_with('.')
    {
        return false;
    }
    if name.contains("..") || name.contains("@{") || name.contains("//") {
        return false;
    }
    if name.chars().any(is_forbidden_ref_char) {
        return false;
    }
    name.split('/')
        .all(|part| !part.starts_with('.') && !part.ends_with(".lock"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plausible_ref_names() {
        for ok in [
            "main",
            "feature/x",
            "fix-1_2.3",
            "release/v1.0",
            "a/b/c",
            "caf\u{e9}",
        ] {
            assert!(is_plausible_ref_name(ok), "{ok}");
        }
        for bad in [
            "",
            "@",
            "-rf",
            "--force",
            "a..b",
            "a b",
            "a\tb",
            "a\nb",
            "a~1",
            "a^",
            "a:b",
            "a?",
            "a*",
            "a[0]",
            "a\\b",
            "/lead",
            "trail/",
            "dot.",
            "a//b",
            "a@{u}",
            ".hidden",
            "a/.hidden",
            "x.lock",
            "a/x.lock/b",
        ] {
            assert!(!is_plausible_ref_name(bad), "{bad:?}");
        }
        assert!(!is_plausible_ref_name(&"a".repeat(256)));
    }
}
