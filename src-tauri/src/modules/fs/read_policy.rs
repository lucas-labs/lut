use regex::RegexSetBuilder;
use serde::Deserialize;
use std::path::Path;
use std::sync::OnceLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PathPolicy {
    secret_basenames: Vec<String>,
    protected_dirs: Vec<String>,
}

pub(super) fn readable(path: &Path) -> Result<(), String> {
    if let Some(cache) = dirs::cache_dir() {
        // lut's own control token and launcher, and Terax's: neither is readable from lut.
        deny_runtime_directory(path, &terax_control_protocol::runtime_dir(&cache))?;
        deny_runtime_directory(
            path,
            &cache.join(terax_control_protocol::TERAX_RUNTIME_DIR_NAME),
        )?;
    }
    static POLICY: OnceLock<(regex::RegexSet, Vec<String>)> = OnceLock::new();
    let (patterns, directories) = POLICY.get_or_init(|| {
        let policy: PathPolicy =
            serde_json::from_str(include_str!("../../../../src/lib/security/pathPolicy.json"))
                .expect("valid path policy");
        (
            RegexSetBuilder::new(policy.secret_basenames)
                .case_insensitive(true)
                .build()
                .expect("valid secret patterns"),
            policy.protected_dirs,
        )
    });
    let path = path.to_str().ok_or("refused non-UTF-8 AI path")?;
    if path.is_empty() || path.chars().any(|c| c < ' ') {
        return Err("refused invalid AI path".into());
    }
    let normalized = path.replace('\\', "/");
    let basename = normalized.rsplit('/').next().unwrap_or("");
    if patterns.is_match(&basename.replace('\u{feff}', " ")) {
        return Err("refused sensitive AI file".into());
    }
    let comparison = normalized
        .split('/')
        .map(|part| {
            part.split(':')
                .next()
                .unwrap_or("")
                .trim_end_matches(|c: char| c == '.' || c == '\u{feff}' || c.is_whitespace())
                .to_lowercase()
        })
        .collect::<Vec<_>>()
        .join("/");
    let comparison = format!("{comparison}/");
    if directories
        .iter()
        .any(|dir| comparison.contains(&format!("{dir}/")))
    {
        return Err("refused protected AI directory".into());
    }
    Ok(())
}

fn inside_directory(path: &Path, directory: &Path) -> bool {
    #[cfg(windows)]
    {
        windows_inside_directory(path, directory)
    }
    #[cfg(not(windows))]
    {
        path.starts_with(directory)
    }
}

#[cfg(any(windows, test))]
fn windows_inside_directory(path: &Path, directory: &Path) -> bool {
    let (Some(path), Some(directory)) = (path.to_str(), directory.to_str()) else {
        return false;
    };
    Path::new(&super::strip_verbatim(path)).starts_with(super::strip_verbatim(directory))
}

fn deny_runtime_directory(path: &Path, directory: &Path) -> Result<(), String> {
    if inside_directory(path, directory)
        || std::fs::canonicalize(directory)
            .is_ok_and(|canonical| inside_directory(path, &canonical))
    {
        return Err("refused application credential directory".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lut_and_terax_runtime_directories_are_denied() {
        let Some(cache) = dirs::cache_dir() else {
            return;
        };
        let lut = terax_control_protocol::runtime_dir(&cache);
        let terax = cache.join(terax_control_protocol::TERAX_RUNTIME_DIR_NAME);
        assert_eq!(lut.file_name().unwrap(), "dev.lucode.lut");
        for dir in [&lut, &terax] {
            assert!(
                readable(&dir.join("control.json")).is_err(),
                "{}",
                dir.display()
            );
            assert!(
                readable(&dir.join("run").join("1").join("bin")).is_err(),
                "{}",
                dir.display()
            );
        }
        assert!(readable(&cache.join("unrelated-app").join("state.txt")).is_ok());
    }

    #[test]
    fn relocated_runtime_credentials_are_protected() {
        let tmp = tempfile::tempdir().unwrap();
        let relocated = terax_control_protocol::runtime_dir(&tmp.path().join("custom-cache"));
        std::fs::create_dir_all(&relocated).unwrap();
        let actual = std::fs::canonicalize(&relocated).unwrap();
        assert!(deny_runtime_directory(&actual.join("control.json"), &relocated).is_err());
        assert!(deny_runtime_directory(&actual.join("control.json.tmp-abc"), &relocated).is_err());
        assert!(deny_runtime_directory(&tmp.path().join("source.ts"), &relocated).is_ok());
        #[cfg(unix)]
        {
            let alias = tmp.path().join("cache-alias");
            std::os::unix::fs::symlink(&relocated, &alias).unwrap();
            assert!(deny_runtime_directory(&actual.join("control.json"), &alias).is_err());
        }
    }

    #[test]
    fn windows_runtime_paths_match_across_verbatim_prefixes() {
        for (path, directory) in [
            (r"C:\project\state\control.json", r"\\?\C:\project\state"),
            (r"\\?\C:\project\state\control.json", r"C:\project\state"),
            (
                r"\\server\share\state\control.json",
                r"\\?\UNC\server\share\state",
            ),
        ] {
            assert!(windows_inside_directory(
                Path::new(path),
                Path::new(directory)
            ));
        }
        assert!(!windows_inside_directory(
            Path::new("C:/project/state-other/file"),
            Path::new("C:/project/state")
        ));
        assert!(!windows_inside_directory(
            Path::new("//wsl.localhost/Ubuntu/home/me/State/file"),
            Path::new("//wsl.localhost/Ubuntu/home/me/state")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_relocated_cache_is_denied_after_opened_path_normalization() {
        use std::os::windows::process::CommandExt;
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp
            .path()
            .join("authorized-project")
            .join("application-state");
        let alias = terax_control_protocol::runtime_dir(&tmp.path().join("relocated-cache"));
        std::fs::create_dir_all(&target).unwrap();
        std::fs::create_dir_all(alias.parent().unwrap()).unwrap();
        std::fs::write(target.join("control.json"), "SYNTHETIC_CREDENTIAL").unwrap();
        // Quote fixture paths for cmd; percent expansion cannot be quoted away.
        for path in [&alias, &target] {
            assert!(!path.to_str().unwrap().contains(['%', '"', '\r', '\n']));
        }
        let result = std::process::Command::new("cmd.exe")
            .args(["/D", "/V:OFF", "/C"])
            .raw_arg(format!(
                "mklink /J \"{}\" \"{}\"",
                alias.display(),
                target.display()
            ))
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let actual = std::fs::canonicalize(target.join("control.json")).unwrap();
        let opened = std::path::PathBuf::from(super::super::to_canon(actual));
        assert!(deny_runtime_directory(&opened, &alias).is_err());
        std::fs::remove_dir(alias).unwrap();
    }

    #[test]
    fn javascript_bom_whitespace_is_also_sensitive_natively() {
        for path in [
            "/repo/.env\u{feff}x",
            "/repo/.ssh\u{feff}/key",
            "/repo/secrets.json.tmp-abc",
        ] {
            assert!(readable(Path::new(path)).is_err(), "{path}");
        }
        assert!(readable(Path::new("/repo/environment.ts")).is_ok());
    }

    #[test]
    fn shared_policy_protects_secrets_and_control_descriptors() {
        for path in [
            "/repo/.env",
            "/repo/file.pem",
            "/repo/.git/config",
            "/Users/me/Library/Caches/terax/control.json",
            "/home/me/.cache/terax/control.json",
            "C:/Users/me/AppData/Local/terax/control.json",
            "/Users/me/Library/Caches/dev.lucode.lut/control.json",
            "/home/me/.cache/dev.lucode.lut/control.json",
            "C:/Users/me/AppData/Local/dev.lucode.lut/control.json",
            "//wsl.localhost/Ubuntu/home/me/.ssh/id_rsa",
        ] {
            assert!(readable(Path::new(path)).is_err(), "{path}");
        }
        for path in ["/repo/src/main.ts", "/repo/environment.ts", "/repo/.envoy"] {
            assert!(readable(Path::new(path)).is_ok(), "{path}");
        }
    }
}
