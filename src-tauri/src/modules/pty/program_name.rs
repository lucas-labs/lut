//! The name a program goes by in a terminal: what a user types to run it.

/// Extensions a launcher shim or native binary carries on Windows.
const LAUNCHER_EXTENSIONS: &[&str] = &[".exe", ".cmd", ".bat", ".ps1", ".com"];

/// A program's name from its path or file name: no directory, no launcher extensions, lowercase.
/// `C:\tools\NVim.exe`, `/usr/bin/nvim` and `nvim` are all `nvim`. Every launcher extension
/// goes, so a name keeps its form when it is named again.
pub(crate) fn program_name(path: &str) -> String {
    let base = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let mut name = base.to_ascii_lowercase();
    while let Some(len) = LAUNCHER_EXTENSIONS
        .iter()
        .find_map(|extension| name.strip_suffix(extension).map(str::len))
    {
        name.truncate(len);
    }
    name
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
    fn names_a_name_the_same_again() {
        assert_eq!(program_name("tool.exe.cmd"), "tool");
        assert_eq!(program_name(&program_name("Tool.EXE.cmd")), "tool");
    }

    #[test]
    fn keeps_any_other_extension() {
        assert_eq!(program_name("python3.12"), "python3.12");
        assert_eq!(program_name("archive.tar"), "archive.tar");
    }
}
