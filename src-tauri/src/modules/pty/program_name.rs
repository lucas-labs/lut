//! The name a program goes by in a terminal: what a user types to run it.

/// Extensions a launcher shim or native binary carries on Windows.
const LAUNCHER_EXTENSIONS: &[&str] = &[".exe", ".cmd", ".bat", ".ps1", ".com"];

/// A program's name from its path or file name: no directory, no launcher extension, lowercase.
/// `C:\tools\NVim.exe`, `/usr/bin/nvim` and `nvim` are all `nvim`.
pub(crate) fn program_name(path: &str) -> String {
    let base = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let lower = base.to_ascii_lowercase();
    LAUNCHER_EXTENSIONS
        .iter()
        .find_map(|extension| lower.strip_suffix(extension))
        .map(str::to_owned)
        .unwrap_or(lower)
}

#[cfg(test)]
mod tests {
    use super::program_name;

    #[test]
    fn drops_the_directory_the_launcher_extension_and_case() {
        assert_eq!(program_name("nvim"), "nvim");
        assert_eq!(program_name("/usr/local/bin/nvim"), "nvim");
        assert_eq!(
            program_name(r"C:\Program Files\Neovim\bin\NVim.EXE"),
            "nvim"
        );
        assert_eq!(program_name("claude.cmd"), "claude");
        assert_eq!(program_name("script.ps1"), "script");
    }

    #[test]
    fn keeps_any_other_extension() {
        assert_eq!(program_name("python3.12"), "python3.12");
        assert_eq!(program_name("archive.tar"), "archive.tar");
    }
}
