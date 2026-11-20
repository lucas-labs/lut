use std::path::{Path, PathBuf};

use portable_pty::CommandBuilder;

use crate::modules::control::ShellControlEnv;
use crate::modules::workspace::{self, WorkspaceEnv};

#[cfg(windows)]
const BASHRC_SCRIPT: &str = include_str!("scripts/bashrc.bash");
#[cfg(windows)]
const ZSHENV_SCRIPT: &str = include_str!("scripts/zshenv.zsh");
#[cfg(windows)]
const ZPROFILE_SCRIPT: &str = include_str!("scripts/zprofile.zsh");
#[cfg(windows)]
const ZLOGIN_SCRIPT: &str = include_str!("scripts/zlogin.zsh");
#[cfg(windows)]
const ZSHRC_SCRIPT: &str = include_str!("scripts/zshrc.zsh");
#[cfg(windows)]
const FISH_INIT_SCRIPT: &str = include_str!("scripts/init.fish");
const FISH_REINSTALL_PROMPT: &str = "functions -q __lut_install_prompt; and __lut_install_prompt";

#[cfg(windows)]
fn bashrc_script() -> &'static str {
    BASHRC_SCRIPT
}

#[cfg(windows)]
fn zshenv_script() -> &'static str {
    ZSHENV_SCRIPT
}

#[cfg(windows)]
fn zprofile_script() -> &'static str {
    ZPROFILE_SCRIPT
}

#[cfg(windows)]
fn zlogin_script() -> &'static str {
    ZLOGIN_SCRIPT
}

#[cfg(windows)]
fn zshrc_script() -> &'static str {
    ZSHRC_SCRIPT
}

#[cfg(windows)]
fn fish_init_script() -> &'static str {
    FISH_INIT_SCRIPT
}

/// What a PTY starts: a program and its arguments, each passed to the child on its own and never
/// joined into one shell string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchSpec {
    /// An absolute path, or a bare name looked up on `PATH`.
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchError {
    /// The program is not a file, or a bare name not found on `PATH`.
    ExecutableNotFound {
        program: String,
    },
    Failed(String),
}

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ExecutableNotFound { program } => write!(f, "executable not found: {program}"),
            Self::Failed(reason) => f.write_str(reason),
        }
    }
}

impl std::error::Error for LaunchError {}

/// Builds the command for `launch`, or for the default shell when it is `None`.
pub fn build_command(
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    launch: Option<LaunchSpec>,
    control: Option<ShellControlEnv>,
) -> Result<CommandBuilder, LaunchError> {
    #[cfg(unix)]
    {
        let _ = workspace;
        unix::build(cwd, launch, control)
    }
    #[cfg(windows)]
    {
        windows::build(cwd, workspace, launch, control)
    }
}

/// Finds the file a launch names: an absolute path as is, a bare name on `PATH`. A relative path
/// with folders has nothing to resolve against and is not found.
fn resolve_program(program: &str) -> Result<PathBuf, LaunchError> {
    let not_found = || LaunchError::ExecutableNotFound {
        program: program.to_string(),
    };
    let path = Path::new(program);
    if path.is_absolute() {
        return if path.is_file() {
            Ok(path.to_path_buf())
        } else {
            Err(not_found())
        };
    }
    if program.trim().is_empty() || path.components().count() != 1 {
        return Err(not_found());
    }
    which_in_path(program).ok_or_else(not_found)
}

/// The first file `name` names in the `PATH` directories. On Windows a name without an extension
/// is tried with each `PATHEXT` extension, as `cmd.exe` does.
fn which_in_path(name: &str) -> Option<PathBuf> {
    let extensions = if cfg!(windows) {
        std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
    } else {
        String::new()
    };
    find_in_dirs(
        name,
        std::env::split_paths(&std::env::var_os("PATH")?),
        &extensions,
    )
}

/// `extensions` is a `PATHEXT`-style list; empty means the name is tried only as written.
fn find_in_dirs(
    name: &str,
    dirs: impl IntoIterator<Item = PathBuf>,
    extensions: &str,
) -> Option<PathBuf> {
    let candidates: Vec<String> = if extensions.is_empty() || Path::new(name).extension().is_some()
    {
        vec![name.to_string()]
    } else {
        extensions
            .split(';')
            .map(str::trim)
            .filter(|ext| !ext.is_empty())
            .map(|ext| format!("{name}{}", ext.to_ascii_lowercase()))
            .collect()
    };
    dirs.into_iter().find_map(|dir| {
        candidates
            .iter()
            .map(|candidate| dir.join(candidate))
            .find(|path| path.is_file())
    })
}

/// The shells lut knows, by the program's file name (any case, with or without `.exe`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ShellKind {
    /// PowerShell 7 or Windows PowerShell.
    Pwsh,
    Bash,
    Zsh,
    Fish,
    Cmd,
    Other,
}

impl ShellKind {
    pub(crate) fn classify(program: &str) -> Self {
        let name = program
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        match name.strip_suffix(".exe").unwrap_or(&name) {
            "pwsh" | "powershell" => Self::Pwsh,
            "bash" => Self::Bash,
            "zsh" => Self::Zsh,
            "fish" => Self::Fish,
            "cmd" => Self::Cmd,
            _ => Self::Other,
        }
    }

    /// Whether lut has integration for this shell on the host: PowerShell, Git Bash and cmd on
    /// Windows; zsh, bash and fish on Unix.
    fn integrated_on(self, windows: bool) -> bool {
        if windows {
            matches!(self, Self::Pwsh | Self::Bash | Self::Cmd)
        } else {
            matches!(self, Self::Bash | Self::Zsh | Self::Fish)
        }
    }
}

/// Whether a launch gets lut's integration: a shell lut integrates on the host, started with no
/// arguments or only with flags its integrated launch already covers. Any other argument (a
/// `-Command`, a script, `--rcfile`) would clash with the arguments lut adds, so that launch runs
/// as the user wrote it, without integration. cmd's integration is its `PROMPT` variable, which
/// no argument clashes with.
fn uses_integration(kind: ShellKind, args: &[String], windows: bool) -> bool {
    if !kind.integrated_on(windows) {
        return false;
    }
    let covered = |arg: &String| match kind {
        ShellKind::Pwsh => arg.eq_ignore_ascii_case("-NoLogo"),
        ShellKind::Bash | ShellKind::Zsh | ShellKind::Fish => {
            matches!(arg.as_str(), "-l" | "--login" | "-i")
        }
        ShellKind::Cmd => true,
        ShellKind::Other => false,
    };
    args.iter().all(covered)
}

/// The arguments of an integrated launch. `file` is lut's prepared integration file (the
/// PowerShell profile, the bash rcfile), `None` when preparing it failed. The user's covered
/// flags are kept where the integrated launch does not already imply them: bash's rcfile runs the
/// login files itself (`--login` would make bash skip it), zsh already starts with `-l`, and
/// PowerShell with `-NoLogo`.
fn integrated_args(kind: ShellKind, user_args: &[String], file: Option<&str>) -> Vec<String> {
    let asked = |flags: &[&str]| user_args.iter().any(|arg| flags.contains(&arg.as_str()));
    let mut args: Vec<String> = Vec::new();
    match kind {
        ShellKind::Pwsh => match file {
            Some(profile) => {
                args.extend(
                    ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-File"].map(String::from),
                );
                args.push(profile.to_string());
            }
            None => args.extend(user_args.iter().cloned()),
        },
        ShellKind::Bash => {
            if let Some(rcfile) = file {
                args.push("--rcfile".into());
                args.push(rcfile.to_string());
            }
            // bash ignores --rcfile under -l, so we use -i and source /etc/profile from inside
            // our rcfile to emulate login init.
            args.push("-i".into());
        }
        ShellKind::Zsh => {
            // Login shell so /etc/zprofile runs path_helper on macOS — without this, GUI-launched
            // apps get a minimal PATH missing Homebrew.
            args.push("-l".into());
            if asked(&["-i"]) {
                args.push("-i".into());
            }
        }
        ShellKind::Fish => {
            if asked(&["-l", "--login"]) {
                args.push("-l".into());
            }
            args.push("-i".into());
            // Re-assert our prompt after config.fish (-C runs last), so a framework prompt
            // (starship etc.) loaded there can't override the markers and break cwd tracking.
            args.push("-C".into());
            args.push(FISH_REINSTALL_PROMPT.into());
        }
        ShellKind::Cmd | ShellKind::Other => args.extend(user_args.iter().cloned()),
    }
    args
}

/// Preserve the shell behind the WSL launcher for shell-specific input quoting.
pub fn launched_shell(cmd: &mut CommandBuilder) -> String {
    let program = cmd
        .get_argv()
        .first()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if program.eq_ignore_ascii_case("wsl.exe") {
        let shell = cmd
            .get_env("LUT_WSL_LOGIN_SHELL")
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        cmd.env_remove("LUT_WSL_LOGIN_SHELL");
        shell
    } else {
        program
    }
}

#[cfg(test)]
mod launched_shell_tests {
    use super::*;

    #[test]
    fn wsl_preserves_the_resolved_shell_instead_of_the_launcher() {
        for shell in [
            "/usr/bin/pwsh",
            "/bin/bash",
            "/usr/bin/fish",
            "/usr/bin/unknown",
        ] {
            let mut cmd = CommandBuilder::new("wsl.exe");
            cmd.env("LUT_WSL_LOGIN_SHELL", shell);
            assert_eq!(launched_shell(&mut cmd), shell);
            assert!(cmd.get_env("LUT_WSL_LOGIN_SHELL").is_none());
        }
        let mut direct = CommandBuilder::new("powershell.exe");
        assert_eq!(launched_shell(&mut direct), "powershell.exe");
    }
}

#[derive(serde::Serialize)]
pub struct ShellInfo {
    /// Stable key of the shell's source (`pwsh`, `git-bash`, `shell:/bin/zsh`), the base of its
    /// detected profile id. Internal: the UI keys shells by path.
    #[serde(skip)]
    pub id: String,
    pub name: String,
    pub path: String,
    /// True when lut injects OSC 7/133 integration for this shell (cwd
    /// tracking, agent detection). Others spawn bare.
    pub integrated: bool,
}

/// The shell paths in `/etc/shells`: one per line, `#` comments and blank lines skipped.
#[cfg_attr(not(unix), allow(dead_code))]
fn parse_etc_shells(content: &str) -> impl Iterator<Item = String> + '_ {
    content
        .lines()
        .map(|line| line.split('#').next().unwrap_or("").trim())
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

/// Each shell once, the login shell first, spelled as `listed` first names it: the same shell
/// often has two paths (`/bin/zsh`, `/usr/bin/zsh`), and its id must not depend on which one the
/// login shell uses. `key` names the shell behind a path, `None` when there is none.
#[cfg_attr(not(unix), allow(dead_code))]
fn unique_shell_paths<K: Eq + std::hash::Hash>(
    login: &str,
    listed: &[String],
    key: impl Fn(&str) -> Option<K>,
) -> Vec<String> {
    use std::collections::{HashMap, HashSet};
    let mut spelling = HashMap::new();
    for path in listed {
        if let Some(k) = key(path) {
            spelling.entry(k).or_insert(path);
        }
    }
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for path in std::iter::once(login).chain(listed.iter().map(String::as_str)) {
        let Some(k) = key(path) else { continue };
        let stable = spelling.get(&k).map_or(path, |listed| listed.as_str());
        if seen.insert(k) {
            out.push(stable.to_string());
        }
    }
    out
}

pub fn list_shells() -> Vec<ShellInfo> {
    #[cfg(unix)]
    {
        unix::list_shells()
    }
    #[cfg(windows)]
    {
        windows::list_shells()
    }
}

fn ensure_utf8_locale(cmd: &mut CommandBuilder) {
    let is_utf8 = |v: &str| {
        let up = v.to_ascii_uppercase();
        up.contains("UTF-8") || up.contains("UTF8")
    };
    let already_utf8 = ["LC_ALL", "LC_CTYPE", "LANG"]
        .iter()
        .any(|k| std::env::var(k).ok().as_deref().is_some_and(is_utf8));
    if already_utf8 {
        return;
    }
    #[cfg(target_os = "macos")]
    let fallback = "en_US.UTF-8";
    #[cfg(all(unix, not(target_os = "macos")))]
    let fallback = "C.UTF-8";
    #[cfg(windows)]
    let fallback = "en_US.UTF-8";
    cmd.env("LANG", fallback);
}

fn apply_common(cmd: &mut CommandBuilder, cwd: Option<String>, control: Option<&ShellControlEnv>) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LUT_TERMINAL", "1");
    // A lut started from a Terax pane inherits Terax's control address, token and CLI: never pass
    // them on, so Terax tooling cannot attach to lut panes.
    for key in std::env::vars_os().map(|(key, _)| key) {
        if key.to_string_lossy().starts_with("TERAX_") {
            cmd.env_remove(key);
        }
    }
    let appimage_overrides = workspace::appimage_env_overrides();
    let clean_path = match appimage_overrides.iter().find(|(key, _)| *key == "PATH") {
        Some((_, value)) => value.clone(),
        None => std::env::var_os("PATH"),
    };
    for (key, value) in appimage_overrides {
        match value {
            Some(v) => {
                cmd.env(key, v);
            }
            None => {
                cmd.env_remove(key);
            }
        }
    }
    if let Some(control) = control {
        cmd.env("LUT_CONTROL_ADDR", &control.address);
        cmd.env("LUT_CONTROL_TOKEN", &control.token);
        cmd.env("LUT_PANE_ID", control.pane_id.to_string());
        if let Some(path) = &control.cli_path {
            cmd.env("LUT_CLI", path);
        }
        if let Some(bin_dir) = &control.cli_bin_dir {
            let paths = std::iter::once(bin_dir.clone()).chain(
                clean_path
                    .as_deref()
                    .into_iter()
                    .flat_map(std::env::split_paths),
            );
            if let Ok(path) = std::env::join_paths(paths) {
                cmd.env("PATH", path);
            }
        }
    }
    ensure_utf8_locale(cmd);

    let resolved_cwd = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| workspace::launch_cwd_snapshot().filter(|p| p.is_dir()))
        .or_else(|| dirs::home_dir().filter(|p| p.is_dir()));
    if let Some(cwd) = resolved_cwd {
        #[cfg(windows)]
        let cwd = PathBuf::from(cwd.to_string_lossy().replace('/', "\\"));
        log::info!("pty cwd: {}", cwd.display());
        cmd.cwd(cwd);
    } else {
        log::warn!("pty cwd: no usable directory, inheriting from process");
    }
}

#[cfg(unix)]
mod unix {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use portable_pty::CommandBuilder;

    const ZSHENV: &str = include_str!("scripts/zshenv.zsh");
    const ZPROFILE: &str = include_str!("scripts/zprofile.zsh");
    const ZLOGIN: &str = include_str!("scripts/zlogin.zsh");
    const ZSHRC: &str = include_str!("scripts/zshrc.zsh");
    const BASHRC: &str = include_str!("scripts/bashrc.bash");
    const FISH_INIT: &str = include_str!("scripts/init.fish");

    use super::ShellKind;

    /// The user's login shell: passwd, then `$SHELL`, then zsh.
    fn default_shell() -> String {
        login_shell()
            .or_else(|| std::env::var("SHELL").ok())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "/bin/zsh".into())
    }

    fn login_shell() -> Option<String> {
        use std::ffi::CStr;
        unsafe {
            let uid = libc::getuid();
            let pw = libc::getpwuid(uid);
            if pw.is_null() {
                return None;
            }
            let shell_ptr = (*pw).pw_shell;
            if shell_ptr.is_null() {
                return None;
            }
            CStr::from_ptr(shell_ptr).to_str().ok().map(String::from)
        }
    }

    pub fn list_shells() -> Vec<super::ShellInfo> {
        let login = default_shell();
        let mut listed = Vec::new();
        if let Ok(content) = fs::read_to_string("/etc/shells") {
            listed.extend(super::parse_etc_shells(&content));
        }
        // Homebrew shells are often missing from /etc/shells.
        for prefix in ["/opt/homebrew/bin", "/usr/local/bin"] {
            for name in ["bash", "zsh", "fish", "nu", "pwsh"] {
                listed.push(format!("{prefix}/{name}"));
            }
        }
        // Symlinks (/bin -> /usr/bin, Homebrew links) name the same shell twice. The name is part
        // of the key: a shell reads it (bash run as `sh` is a POSIX shell with other startup
        // files), so `/bin/sh` linked to bash stays apart from `/bin/bash`.
        let binary = |path: &str| {
            let name = Path::new(path).file_name()?.to_os_string();
            Path::new(path).is_file().then(|| {
                let target = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
                (target, name)
            })
        };
        let mut out = Vec::new();
        for path in super::unique_shell_paths(&login, &listed, binary) {
            let integrated = ShellKind::classify(&path).integrated_on(false);
            let name = path.rsplit('/').next().unwrap_or(&path).to_string();
            out.push(super::ShellInfo {
                id: format!("shell:{path}"),
                name,
                path,
                integrated,
            });
        }
        out
    }

    pub fn build(
        cwd: Option<String>,
        launch: Option<super::LaunchSpec>,
        control: Option<super::ShellControlEnv>,
    ) -> Result<CommandBuilder, super::LaunchError> {
        let (program, user_args) = match launch {
            Some(spec) => (
                super::resolve_program(&spec.program)?
                    .to_string_lossy()
                    .into_owned(),
                spec.args,
            ),
            None => (default_shell(), Vec::new()),
        };
        let mut cmd = CommandBuilder::new(&program);
        super::apply_common(&mut cmd, cwd, control.as_ref());
        let kind = ShellKind::classify(&program);
        if super::uses_integration(kind, &user_args, false) {
            apply_shell_init(&mut cmd, kind, &user_args);
        } else {
            log::info!("spawning '{program}' without shell integration");
            cmd.args(&user_args);
        }
        Ok(cmd)
    }

    /// What the child zsh gets as `LUT_USER_ZDOTDIR`.
    #[derive(Debug, PartialEq, Eq)]
    enum UserZdotdir {
        /// The inherited `ZDOTDIR` is the user's own.
        Set(String),
        /// This app was started from a zsh that lut integrated: `ZDOTDIR` is
        /// the integration directory and the inherited variable still names
        /// the user's.
        Keep,
        /// No `ZDOTDIR`: a left-over value must not outlive what it described.
        Clear,
    }

    fn user_zdotdir_for(inherited_zdotdir: Option<&str>, integration: &Path) -> UserZdotdir {
        match inherited_zdotdir.filter(|value| !value.is_empty()) {
            Some(user) if Path::new(user) != integration => UserZdotdir::Set(user.to_string()),
            Some(_) => UserZdotdir::Keep,
            None => UserZdotdir::Clear,
        }
    }

    /// Environment and arguments of an integrated launch of zsh, bash or fish.
    fn apply_shell_init(cmd: &mut CommandBuilder, kind: ShellKind, user_args: &[String]) {
        let mut file = None;
        match kind {
            ShellKind::Zsh => {
                match prepare_zdotdir() {
                    Ok(zdotdir) => {
                        // Guard against lut-in-lut :)
                        match user_zdotdir_for(std::env::var("ZDOTDIR").ok().as_deref(), &zdotdir) {
                            UserZdotdir::Set(user) => {
                                cmd.env("LUT_USER_ZDOTDIR", user);
                            }
                            UserZdotdir::Keep => {}
                            UserZdotdir::Clear => {
                                cmd.env_remove("LUT_USER_ZDOTDIR");
                            }
                        }
                        cmd.env("ZDOTDIR", &zdotdir);
                    }
                    Err(e) => {
                        log::warn!("zsh shell integration disabled: {e}");
                    }
                }
            }
            ShellKind::Bash => match prepare_bash_rcfile() {
                Ok(rc) => file = Some(rc.to_string_lossy().into_owned()),
                Err(e) => {
                    log::warn!("bash shell integration disabled: {e}");
                }
            },
            ShellKind::Fish => {
                if let Err(e) = prepare_fish_conf_d() {
                    log::warn!("fish shell integration disabled: {e}");
                }
                // fish 4.0+ writes its own OSC 133 A/B; ours would double it.
                cmd.env("fish_features", "no-mark-prompt");
            }
            ShellKind::Pwsh | ShellKind::Cmd | ShellKind::Other => {}
        }
        cmd.args(super::integrated_args(kind, user_args, file.as_deref()));
    }

    fn integration_root() -> Result<PathBuf, String> {
        // lut's runtime dir, never Terax's `~/.cache/terax` (E02-10).
        let cache = dirs::cache_dir().ok_or_else(|| "could not resolve cache dir".to_string())?;
        let root = lut_control_protocol::runtime_dir(&cache).join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_zdotdir() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("zsh");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join(".zshenv"), ZSHENV)?;
        write_if_changed(&dir.join(".zprofile"), ZPROFILE)?;
        write_if_changed(&dir.join(".zshrc"), ZSHRC)?;
        write_if_changed(&dir.join(".zlogin"), ZLOGIN)?;
        Ok(dir)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, BASHRC)?;
        Ok(rc)
    }

    fn prepare_fish_conf_d() -> Result<(), String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let dir = home.join(".config").join("fish").join("conf.d");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join("lut.fish"), FISH_INIT)?;
        Ok(())
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        // Atomic replace: a parallel shell startup must never source a half-written file.
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__lut_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn the_users_zdotdir_survives_a_lut_started_from_an_integrated_zsh() {
            let integration = Path::new("/cache/dev.lucode.lut/shell-integration/zsh");
            assert_eq!(
                user_zdotdir_for(Some("/home/me/.config/zsh"), integration),
                UserZdotdir::Set("/home/me/.config/zsh".into())
            );
            // Launched by a command in another lut terminal: keep the
            // LUT_USER_ZDOTDIR it inherited.
            assert_eq!(
                user_zdotdir_for(
                    Some("/cache/dev.lucode.lut/shell-integration/zsh"),
                    integration
                ),
                UserZdotdir::Keep
            );
            assert_eq!(user_zdotdir_for(None, integration), UserZdotdir::Clear);
            assert_eq!(user_zdotdir_for(Some(""), integration), UserZdotdir::Clear);
        }

        #[test]
        fn zsh_starts_from_the_integration_dir_and_forgets_a_stale_user_zdotdir() {
            let mut cmd = CommandBuilder::new("/bin/zsh");
            cmd.env("LUT_USER_ZDOTDIR", "/left/over/from/a/parent/terminal");
            apply_shell_init(&mut cmd, ShellKind::Zsh, &[]);
            let zdotdir = cmd.get_env("ZDOTDIR").expect("ZDOTDIR is set");
            assert!(Path::new(zdotdir).ends_with("shell-integration/zsh"));
            assert!(cmd.get_argv().iter().any(|arg| arg == "-l"));
            match std::env::var("ZDOTDIR") {
                Ok(user) if !user.is_empty() && Path::new(&user) != Path::new(zdotdir) => {
                    assert_eq!(
                        cmd.get_env("LUT_USER_ZDOTDIR"),
                        Some(std::ffi::OsStr::new(&user))
                    );
                }
                _ => assert_eq!(cmd.get_env("LUT_USER_ZDOTDIR"), None),
            }
            for file in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
                assert!(Path::new(zdotdir).join(file).is_file(), "{file}");
            }
        }

        #[test]
        fn builds_unix_fish_launch_with_post_config_rewrap() {
            let mut cmd = CommandBuilder::new("/usr/bin/fish");
            apply_shell_init(&mut cmd, ShellKind::Fish, &[]);
            let argv: Vec<_> = cmd
                .get_argv()
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect();
            assert_eq!(
                argv,
                vec![
                    "/usr/bin/fish".to_string(),
                    "-i".to_string(),
                    "-C".to_string(),
                    super::super::FISH_REINSTALL_PROMPT.to_string(),
                ]
            );
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::ShellKind;
    use crate::modules::workspace::WorkspaceEnv;
    use portable_pty::CommandBuilder;

    const PROFILE_PS1: &str = include_str!("scripts/profile.ps1");

    #[derive(Clone, Debug, Eq, PartialEq)]
    enum WslShellIntegration {
        Zsh {
            zdotdir: String,
            user_zdotdir: Option<String>,
        },
        Bash {
            rcfile: String,
        },
        Fish,
        None,
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct WslLaunchSpec {
        args: Vec<String>,
    }

    pub fn build(
        cwd: Option<String>,
        workspace: WorkspaceEnv,
        launch: Option<super::LaunchSpec>,
        control: Option<super::ShellControlEnv>,
    ) -> Result<CommandBuilder, super::LaunchError> {
        if let WorkspaceEnv::Wsl { distro } = workspace {
            let _ = (launch, control);
            return build_wsl(cwd, distro).map_err(super::LaunchError::Failed);
        }
        let (program, user_args) = match launch {
            Some(spec) => (super::resolve_program(&spec.program)?, spec.args),
            None => (super::windows_shell_path(), Vec::new()),
        };
        let mut cmd = CommandBuilder::new(&program);
        super::apply_common(&mut cmd, cwd, control.as_ref());
        let kind = ShellKind::classify(&program.to_string_lossy());
        let integrated = super::uses_integration(kind, &user_args, true);
        let file = if integrated {
            integration_file(kind)
        } else {
            log::info!("spawning {} without shell integration", program.display());
            None
        };
        apply_launch(&mut cmd, kind, integrated, &user_args, file.as_deref());
        log::info!("spawning Windows program: {}", program.display());
        Ok(cmd)
    }

    /// lut's prepared integration file for `kind`, in the form the shell reads.
    fn integration_file(kind: ShellKind) -> Option<String> {
        let prepared = match kind {
            ShellKind::Pwsh => prepare_ps_profile().map(|p| p.to_string_lossy().into_owned()),
            // Native git-bash: same OSC 7/133 rcfile as Unix bash, in the forward-slash form
            // MSYS bash accepts.
            ShellKind::Bash => {
                prepare_bash_rcfile().map(|p| p.to_string_lossy().replace('\\', "/"))
            }
            _ => return None,
        };
        prepared
            .inspect_err(|e| log::warn!("{kind:?} shell integration disabled: {e}"))
            .ok()
    }

    /// Environment and arguments of a native launch, once its program and integration are known.
    fn apply_launch(
        cmd: &mut CommandBuilder,
        kind: ShellKind,
        integrated: bool,
        user_args: &[String],
        file: Option<&str>,
    ) {
        if kind == ShellKind::Bash {
            // git-bash's /etc/profile cd's to $HOME unless CHERE_INVOKING is set; keep the cwd
            // we configured in apply_common.
            cmd.env("CHERE_INVOKING", "1");
        }
        if !integrated {
            cmd.args(user_args);
            return;
        }
        if kind == ShellKind::Cmd {
            let host = std::env::var("COMPUTERNAME").unwrap_or_default();
            let existing = std::env::var("PROMPT").ok();
            cmd.env("PROMPT", super::cmd_prompt(&host, existing.as_deref()));
        }
        cmd.args(super::integrated_args(kind, user_args, file));
    }

    fn build_wsl(cwd: Option<String>, distro: String) -> Result<CommandBuilder, String> {
        crate::modules::workspace::validate_wsl_distro_name(&distro)?;
        let shell_path = crate::modules::workspace::wsl_login_shell(distro.clone())?;
        let shell_kind = ShellKind::classify(&shell_path);
        let integration = match shell_kind {
            ShellKind::Zsh => match prepare_wsl_zdotdir(&distro) {
                Ok(zdotdir) => {
                    let user_zdotdir = match probe_wsl_zdotdir(&distro, &shell_path) {
                        Ok(path) if !path.is_empty() && path != zdotdir => Some(path),
                        Ok(_) => None,
                        Err(e) => {
                            log::warn!("WSL zsh ZDOTDIR probe failed for {distro}: {e}");
                            None
                        }
                    };
                    WslShellIntegration::Zsh {
                        zdotdir,
                        user_zdotdir,
                    }
                }
                Err(e) => {
                    log::warn!("WSL zsh shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Bash => match prepare_wsl_bash_rcfile(&distro) {
                Ok(rcfile) => WslShellIntegration::Bash { rcfile },
                Err(e) => {
                    log::warn!("WSL bash shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Fish => match prepare_wsl_fish_conf_d(&distro) {
                Ok(()) => WslShellIntegration::Fish,
                Err(e) => {
                    log::warn!("WSL fish shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Pwsh | ShellKind::Cmd | ShellKind::Other => {
                log::info!(
                    "unsupported WSL shell '{}', spawning without integration",
                    shell_path
                );
                WslShellIntegration::None
            }
        };
        let spec = build_wsl_launch_spec(
            cwd.as_deref(),
            &distro,
            &shell_path,
            shell_kind,
            integration,
        );
        let mut cmd = CommandBuilder::new("wsl.exe");
        cmd.env("LUT_WSL_LOGIN_SHELL", &shell_path);
        for arg in &spec.args {
            cmd.arg(arg);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LUT_TERMINAL", "1");
        super::ensure_utf8_locale(&mut cmd);
        log::info!("spawning WSL shell: {distro} ({shell_path})");
        Ok(cmd)
    }

    fn build_wsl_launch_spec(
        cwd: Option<&str>,
        distro: &str,
        shell_path: &str,
        shell_kind: ShellKind,
        integration: WslShellIntegration,
    ) -> WslLaunchSpec {
        let mut args = vec![
            "-d".to_string(),
            distro.to_string(),
            "--cd".to_string(),
            cwd.filter(|s| !s.is_empty()).unwrap_or("~").to_string(),
            "--exec".to_string(),
        ];
        match (shell_kind, integration) {
            (
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir,
                    user_zdotdir,
                },
            ) => {
                args.push("env".to_string());
                if let Some(user_zdotdir) = user_zdotdir {
                    args.push(format!("LUT_USER_ZDOTDIR={user_zdotdir}"));
                }
                args.push(format!("ZDOTDIR={zdotdir}"));
                args.push(shell_path.to_string());
                args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::Bash { rcfile }) => {
                args.push(shell_path.to_string());
                args.push("--rcfile".to_string());
                args.push(rcfile);
                args.push("-i".to_string());
            }
            (ShellKind::Fish, WslShellIntegration::Fish) => {
                args.push("env".to_string());
                args.push("fish_features=no-mark-prompt".to_string());
                args.push(shell_path.to_string());
                args.push("-i".to_string());
                args.push("-C".to_string());
                args.push(super::FISH_REINSTALL_PROMPT.to_string());
            }
            (ShellKind::Zsh, WslShellIntegration::None) => {
                args.push(shell_path.to_string());
                args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::None)
            | (ShellKind::Fish, WslShellIntegration::None) => {
                args.push(shell_path.to_string());
                args.push("-i".to_string());
            }
            (ShellKind::Other, _) => args.push(shell_path.to_string()),
            _ => {
                args.push(shell_path.to_string());
            }
        }
        WslLaunchSpec { args }
    }

    fn probe_wsl_zdotdir(distro: &str, shell_path: &str) -> Result<String, String> {
        let out = crate::modules::workspace::wsl_exec_capture(
            distro,
            shell_path,
            &["-c", r#"printf %s "${ZDOTDIR:-$HOME}""#],
        )?;
        Ok(crate::modules::workspace::normalize_wsl_value(out, ""))
    }

    fn prepare_wsl_integration_dir(distro: &str, shell: &str) -> Result<(String, PathBuf), String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
        let linux_dir = format!(
            "{}/.cache/{}/shell-integration/{shell}",
            home.trim_end_matches('/'),
            lut_control_protocol::RUNTIME_DIR_NAME
        );
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        Ok((linux_dir, unc_dir))
    }

    fn normalize_script(content: &str) -> String {
        content.replace("\r\n", "\n")
    }

    fn prepare_wsl_zdotdir(distro: &str) -> Result<String, String> {
        let (linux_dir, unc_dir) = prepare_wsl_integration_dir(distro, "zsh")?;
        write_if_changed(
            &unc_dir.join(".zshenv"),
            &normalize_script(super::zshenv_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zprofile"),
            &normalize_script(super::zprofile_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zshrc"),
            &normalize_script(super::zshrc_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zlogin"),
            &normalize_script(super::zlogin_script()),
        )?;
        Ok(linux_dir)
    }

    fn prepare_wsl_bash_rcfile(distro: &str) -> Result<String, String> {
        let (linux_dir, _unc_dir) = prepare_wsl_integration_dir(distro, "bash")?;
        let linux_rc = format!("{linux_dir}/bashrc");
        let unc_file = crate::modules::workspace::wsl_path_to_unc(distro, &linux_rc);
        let content = normalize_script(super::bashrc_script());
        write_if_changed(&unc_file, &content)?;
        Ok(linux_rc)
    }

    fn prepare_wsl_fish_conf_d(distro: &str) -> Result<(), String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
        let linux_dir = format!("{}/.config/fish/conf.d", home.trim_end_matches('/'));
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        let unc_file = unc_dir.join("lut.fish");
        let content = normalize_script(super::fish_init_script());
        write_if_changed(&unc_file, &content)?;
        Ok(())
    }

    fn integration_root() -> Result<PathBuf, String> {
        // lut's runtime dir, never Terax's `~/.cache/terax` (E02-10).
        let cache = dirs::cache_dir().ok_or_else(|| "could not resolve cache dir".to_string())?;
        let root = lut_control_protocol::runtime_dir(&cache).join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_ps_profile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("powershell");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let file = dir.join("profile.ps1");
        write_if_changed(&file, PROFILE_PS1)?;
        Ok(file)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, &normalize_script(super::bashrc_script()))?;
        Ok(rc)
    }

    pub fn list_shells() -> Vec<super::ShellInfo> {
        fn add(
            out: &mut Vec<super::ShellInfo>,
            id: &str,
            name: &str,
            path: PathBuf,
            integrated: bool,
        ) {
            if path.is_file() {
                out.push(super::ShellInfo {
                    id: id.to_string(),
                    name: name.to_string(),
                    path: path.to_string_lossy().into_owned(),
                    integrated,
                });
            }
        }

        let mut out = Vec::new();
        if let Some(p) = super::which_in_path("pwsh.exe") {
            add(&mut out, "pwsh", "PowerShell", p, true);
        } else if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
            add(
                &mut out,
                "pwsh",
                "PowerShell",
                pf.join("PowerShell").join("7").join("pwsh.exe"),
                true,
            );
        }
        let system32 = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
            .join("System32");
        add(
            &mut out,
            "powershell",
            "Windows PowerShell",
            system32
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe"),
            true,
        );
        add(
            &mut out,
            "cmd",
            "Command Prompt",
            system32.join("cmd.exe"),
            false,
        );
        if let Some(p) = git_bash_path() {
            add(&mut out, "git-bash", "Git Bash", p, true);
        }
        out
    }

    fn git_bash_path() -> Option<PathBuf> {
        // Git for Windows only: a bash.exe on PATH is usually the WSL launcher in System32,
        // which is the separate WSL switcher. Git may live on any drive, so it is found through
        // git itself first, and the usual install locations are the fallback.
        let from_path = super::which_in_path("git.exe").and_then(|git| git_root_for_git_exe(&git));
        // Spawns git, so it only runs when the roots before it hold no bash.
        let from_exec_path =
            std::iter::once_with(|| git_exec_path().and_then(|exec| git_root_for_exec_path(&exec)))
                .flatten();
        let fixed = ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"]
            .into_iter()
            .filter_map(|var| std::env::var_os(var).map(PathBuf::from))
            .flat_map(|base| [base.join("Git"), base.join("Programs").join("Git")]);
        from_path
            .into_iter()
            .chain(from_exec_path)
            .chain(fixed)
            .flat_map(|root| [root.join(r"bin\bash.exe"), root.join(r"usr\bin\bash.exe")])
            .find(|candidate| candidate.is_file())
    }

    fn git_exec_path() -> Option<PathBuf> {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("--exec-path");
        crate::modules::proc::hide_console(&mut cmd);
        let out = cmd.output().ok().filter(|out| out.status.success())?;
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (!text.is_empty()).then(|| PathBuf::from(text))
    }

    /// The Git for Windows root holding `git.exe`: `<root>\cmd\git.exe`, `<root>\bin\git.exe`
    /// or `<root>\mingw64\bin\git.exe`.
    fn git_root_for_git_exe(git: &Path) -> Option<PathBuf> {
        let dir_name = |p: &Path| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase())
        };
        let dir = git.parent()?;
        if !matches!(dir_name(dir).as_deref(), Some("cmd" | "bin")) {
            return None;
        }
        let parent = dir.parent()?;
        if dir_name(parent).is_some_and(|n| n.starts_with("mingw") || n == "clangarm64") {
            parent.parent().map(Path::to_path_buf)
        } else {
            Some(parent.to_path_buf())
        }
    }

    /// The Git for Windows root from `git --exec-path`, `<root>/mingw64/libexec/git-core`.
    fn git_root_for_exec_path(exec: &Path) -> Option<PathBuf> {
        let mut ancestors = exec.ancestors();
        let core = ancestors.next()?;
        let libexec = ancestors.next()?;
        let _platform = ancestors.next()?;
        let root = ancestors.next()?;
        let named = |p: &Path, name: &str| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(name))
        };
        (named(core, "git-core") && named(libexec, "libexec")).then(|| root.to_path_buf())
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__lut_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn launch(
            program: &str,
            integrated: bool,
            user_args: &[&str],
            file: Option<&str>,
        ) -> CommandBuilder {
            let mut cmd = CommandBuilder::new(program);
            let user_args: Vec<String> = user_args.iter().map(|a| a.to_string()).collect();
            apply_launch(
                &mut cmd,
                ShellKind::classify(program),
                integrated,
                &user_args,
                file,
            );
            cmd
        }

        fn argv(cmd: &CommandBuilder) -> Vec<String> {
            cmd.get_argv()
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect()
        }

        #[test]
        fn pwsh_starts_with_lut_profile() {
            let cmd = launch(
                r"C:\Program Files\PowerShell\7\pwsh.exe",
                true,
                &["-NoLogo"],
                Some(r"C:\cache\profile.ps1"),
            );
            assert_eq!(
                argv(&cmd),
                [
                    r"C:\Program Files\PowerShell\7\pwsh.exe",
                    "-NoLogo",
                    "-NoExit",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    r"C:\cache\profile.ps1",
                ]
            );
        }

        #[test]
        fn git_bash_keeps_the_cwd_and_reads_lut_rcfile() {
            let cmd = launch(
                r"D:\Git\bin\bash.exe",
                true,
                &[],
                Some("C:/cache/bash/bashrc"),
            );
            assert_eq!(
                argv(&cmd),
                [
                    r"D:\Git\bin\bash.exe",
                    "--rcfile",
                    "C:/cache/bash/bashrc",
                    "-i"
                ]
            );
            assert_eq!(cmd.get_env("CHERE_INVOKING"), Some("1".as_ref()));
            // Without integration bash still must not cd to $HOME.
            let cmd = launch(r"D:\Git\bin\bash.exe", false, &["-c", "make"], None);
            assert_eq!(argv(&cmd), [r"D:\Git\bin\bash.exe", "-c", "make"]);
            assert_eq!(cmd.get_env("CHERE_INVOKING"), Some("1".as_ref()));
        }

        #[test]
        fn cmd_reports_the_cwd_through_its_prompt_and_keeps_its_arguments() {
            let cmd = launch(
                r"C:\Windows\System32\cmd.exe",
                true,
                &["/k", "init.bat"],
                None,
            );
            assert_eq!(
                argv(&cmd),
                [r"C:\Windows\System32\cmd.exe", "/k", "init.bat"]
            );
            let prompt = cmd.get_env("PROMPT").unwrap().to_string_lossy();
            assert!(prompt.starts_with("$E]7;file://"), "{prompt}");
        }

        #[test]
        fn another_program_gets_its_arguments_one_by_one() {
            let cmd = launch(
                r"C:\Python\python.exe",
                false,
                &["-q", "C:\\My Scripts\\start.py", "a \"quoted\" arg"],
                None,
            );
            assert_eq!(
                argv(&cmd),
                [
                    r"C:\Python\python.exe",
                    "-q",
                    "C:\\My Scripts\\start.py",
                    "a \"quoted\" arg"
                ]
            );
        }

        #[test]
        fn only_git_for_windows_bin_bash_is_a_launcher() {
            let git = tempfile::tempdir().unwrap();
            for dir in [r"bin", r"usr\bin"] {
                fs::create_dir_all(git.path().join(dir)).unwrap();
                fs::write(git.path().join(dir).join("bash.exe"), "").unwrap();
            }
            assert!(super::super::is_git_bash_launcher(
                &git.path().join(r"bin\BASH.EXE")
            ));
            // The real bash it starts, and a bash with no usr\bin beside it (Cygwin).
            assert!(!super::super::is_git_bash_launcher(
                &git.path().join(r"usr\bin\bash.exe")
            ));
            let cygwin = tempfile::tempdir().unwrap();
            fs::create_dir_all(cygwin.path().join("bin")).unwrap();
            fs::write(cygwin.path().join(r"bin\bash.exe"), "").unwrap();
            assert!(!super::super::is_git_bash_launcher(
                &cygwin.path().join(r"bin\bash.exe")
            ));
            assert!(!super::super::is_git_bash_launcher(Path::new(
                r"C:\Windows\System32\cmd.exe"
            )));
        }

        #[test]
        fn git_root_comes_from_the_git_exe_folder() {
            for (git, root) in [
                (r"D:\Program Files\Git\cmd\git.exe", r"D:\Program Files\Git"),
                (r"D:\Program Files\Git\bin\git.exe", r"D:\Program Files\Git"),
                (r"D:\tools\Git\mingw64\bin\git.exe", r"D:\tools\Git"),
            ] {
                assert_eq!(
                    git_root_for_git_exe(Path::new(git)),
                    Some(PathBuf::from(root))
                );
            }
            // A shim (scoop) is not inside Git: `git --exec-path` finds that one.
            assert_eq!(
                git_root_for_git_exe(Path::new(r"C:\scoop\shims\git.exe")),
                None
            );
        }

        #[test]
        fn git_root_comes_from_the_exec_path() {
            assert_eq!(
                git_root_for_exec_path(Path::new("D:/Program Files/Git/mingw64/libexec/git-core")),
                Some(PathBuf::from("D:/Program Files/Git"))
            );
            assert_eq!(git_root_for_exec_path(Path::new("D:/elsewhere/git")), None);
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_env_and_login() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/zsh".into(),
                    user_zdotdir: None,
                },
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "ZDOTDIR=/home/vinicios/.cache/dev.lucode.lut/shell-integration/zsh"
                        .to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_user_zdotdir_probe() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/zsh".into(),
                    user_zdotdir: Some("/home/vinicios/.config/zsh".into()),
                },
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "LUT_USER_ZDOTDIR=/home/vinicios/.config/zsh".to_string(),
                    "ZDOTDIR=/home/vinicios/.cache/dev.lucode.lut/shell-integration/zsh"
                        .to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_without_integration_still_uses_login_shell() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::None,
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_bash_launch_spec_with_rcfile() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/bin/bash",
                ShellKind::Bash,
                WslShellIntegration::Bash {
                    rcfile: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/bash/bashrc"
                        .into(),
                },
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/bin/bash".to_string(),
                    "--rcfile".to_string(),
                    "/home/vinicios/.cache/dev.lucode.lut/shell-integration/bash/bashrc"
                        .to_string(),
                    "-i".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_fish_launch_spec_without_init_command() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/fish",
                ShellKind::Fish,
                WslShellIntegration::Fish,
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "fish_features=no-mark-prompt".to_string(),
                    "/usr/bin/fish".to_string(),
                    "-i".to_string(),
                    "-C".to_string(),
                    super::super::FISH_REINSTALL_PROMPT.to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_other_shell_without_integration() {
            let spec = build_wsl_launch_spec(
                None,
                "Ubuntu",
                "/usr/bin/nu",
                ShellKind::Other,
                WslShellIntegration::None,
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "~".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/nu".to_string(),
                ]
            );
        }
    }
}

/// `PROMPT` for `cmd.exe`, which has no prompt hook but expands `$E` (escape)
/// and `$P` (drive and path) each time it prints one. The OSC 7 it emits ahead
/// of the user's own prompt is what keeps the explorer and breadcrumb on the
/// shell's directory; the path arrives with backslashes and is not escaped, so
/// the frontend reads it leniently.
#[cfg(any(windows, test))]
fn cmd_prompt(host: &str, existing: Option<&str>) -> String {
    const REPORT_CWD: &str = "$E]7;file://";
    let existing = existing.map(str::trim).filter(|p| !p.is_empty());
    if existing.is_some_and(|p| p.contains(REPORT_CWD)) {
        return existing.unwrap_or_default().to_string();
    }
    let host: String = host
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    format!("{REPORT_CWD}{host}/$P$E\\{}", existing.unwrap_or("$P$G"))
}

/// Git for Windows' `<root>\bin\bash.exe` is a launcher: it sets up the environment and runs
/// `<root>\usr\bin\bash.exe` as its child. A bash elsewhere (MSYS2, Cygwin) is the shell itself.
#[cfg(windows)]
pub fn is_git_bash_launcher(program: &Path) -> bool {
    let named = |path: &Path, name: &str| {
        path.file_name()
            .is_some_and(|file| file.eq_ignore_ascii_case(name))
    };
    named(program, "bash.exe")
        && program
            .parent()
            .filter(|bin| named(bin, "bin"))
            .and_then(Path::parent)
            .is_some_and(|root| root.join(r"usr\bin\bash.exe").is_file())
}

#[cfg(windows)]
pub fn windows_shell_path() -> PathBuf {
    if let Some(p) = which_in_path("pwsh.exe") {
        return p;
    }

    if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
        let candidate = pf.join("PowerShell").join("7").join("pwsh.exe");
        if candidate.is_file() {
            return candidate;
        }
    }

    let system32 = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join("System32");
    let ps5 = system32
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if ps5.is_file() {
        return ps5;
    }

    system32.join("cmd.exe")
}

#[cfg(test)]
mod tests {
    use std::ffi::OsStr;

    use portable_pty::CommandBuilder;

    use std::path::PathBuf;

    use super::{
        apply_common, cmd_prompt, find_in_dirs, integrated_args, parse_etc_shells, resolve_program,
        unique_shell_paths, uses_integration, LaunchError, ShellControlEnv, ShellKind,
        FISH_REINSTALL_PROMPT,
    };

    fn strings(args: &[&str]) -> Vec<String> {
        args.iter().map(|arg| arg.to_string()).collect()
    }

    #[test]
    fn an_absolute_path_must_be_a_file() {
        let exe = std::env::current_exe().unwrap();
        assert_eq!(resolve_program(&exe.to_string_lossy()), Ok(exe.clone()));
        let missing = exe.with_file_name("no-such-shell-e14-07");
        let missing = missing.to_string_lossy().into_owned();
        assert_eq!(
            resolve_program(&missing),
            Err(LaunchError::ExecutableNotFound {
                program: missing.clone()
            })
        );
        assert_eq!(
            resolve_program(&missing).unwrap_err().to_string(),
            format!("executable not found: {missing}")
        );
    }

    #[test]
    fn a_relative_path_or_blank_program_is_not_found() {
        for program in ["", "  ", "bin/zsh", "./bash", "..\\cmd.exe"] {
            assert_eq!(
                resolve_program(program),
                Err(LaunchError::ExecutableNotFound {
                    program: program.into()
                }),
                "{program:?}"
            );
        }
    }

    #[test]
    fn a_bare_name_is_found_in_the_path_dirs() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        std::fs::write(second.path().join("nu"), "").unwrap();
        std::fs::write(second.path().join("nu.cmd"), "").unwrap();
        std::fs::write(first.path().join("nu.exe"), "").unwrap();
        let dirs = || [first.path().to_path_buf(), second.path().to_path_buf()];
        // As written when there is no PATHEXT, or the name has an extension.
        assert_eq!(
            find_in_dirs("nu", dirs(), ""),
            Some(second.path().join("nu"))
        );
        assert_eq!(
            find_in_dirs("nu.cmd", dirs(), ".EXE"),
            Some(second.path().join("nu.cmd"))
        );
        // With each PATHEXT extension, the first directory that has one winning.
        assert_eq!(
            find_in_dirs("nu", dirs(), ".COM;.EXE;.CMD"),
            Some(first.path().join("nu.exe"))
        );
        assert_eq!(find_in_dirs("fish", dirs(), ".EXE"), None);
        assert_eq!(find_in_dirs("nu", Vec::<PathBuf>::new(), ""), None);
    }

    #[test]
    fn shells_are_known_by_file_name() {
        for (program, kind) in [
            (r"C:\Program Files\PowerShell\7\pwsh.exe", ShellKind::Pwsh),
            (
                r"C:\Windows\System32\WindowsPowerShell\v1.0\PowerShell.EXE",
                ShellKind::Pwsh,
            ),
            ("/usr/bin/pwsh", ShellKind::Pwsh),
            (r"D:\Git\bin\bash.exe", ShellKind::Bash),
            ("/usr/bin/zsh", ShellKind::Zsh),
            ("/opt/homebrew/bin/fish", ShellKind::Fish),
            (r"C:\Windows\System32\cmd.exe", ShellKind::Cmd),
            ("/bin/sh", ShellKind::Other),
            ("nu", ShellKind::Other),
            (r"C:\Python\python.exe", ShellKind::Other),
        ] {
            assert_eq!(ShellKind::classify(program), kind, "{program}");
        }
    }

    #[test]
    fn integration_follows_the_host() {
        for kind in [ShellKind::Pwsh, ShellKind::Bash, ShellKind::Cmd] {
            assert!(uses_integration(kind, &[], true), "{kind:?}");
        }
        for kind in [ShellKind::Zsh, ShellKind::Fish, ShellKind::Other] {
            assert!(!uses_integration(kind, &[], true), "{kind:?}");
        }
        for kind in [ShellKind::Bash, ShellKind::Zsh, ShellKind::Fish] {
            assert!(uses_integration(kind, &[], false), "{kind:?}");
        }
        for kind in [ShellKind::Pwsh, ShellKind::Cmd, ShellKind::Other] {
            assert!(!uses_integration(kind, &[], false), "{kind:?}");
        }
    }

    #[test]
    fn only_flags_the_integrated_launch_covers_keep_integration() {
        assert!(uses_integration(
            ShellKind::Pwsh,
            &strings(&["-nologo"]),
            true
        ));
        assert!(!uses_integration(
            ShellKind::Pwsh,
            &strings(&["-NoProfile"]),
            true
        ));
        assert!(!uses_integration(
            ShellKind::Pwsh,
            &strings(&["-Command", "Get-Date"]),
            true
        ));
        for kind in [ShellKind::Bash, ShellKind::Zsh, ShellKind::Fish] {
            assert!(uses_integration(
                kind,
                &strings(&["-l", "--login", "-i"]),
                false
            ));
            assert!(!uses_integration(kind, &strings(&["-c", "make"]), false));
            assert!(!uses_integration(
                kind,
                &strings(&["-l", "script.sh"]),
                false
            ));
        }
        // cmd's integration is its PROMPT variable, which no argument clashes with.
        assert!(uses_integration(
            ShellKind::Cmd,
            &strings(&["/k", "init.bat"]),
            true
        ));
    }

    #[test]
    fn pwsh_runs_lut_profile_and_keeps_its_logo_off() {
        let expected = strings(&[
            "-NoLogo",
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            r"C:\cache\profile.ps1",
        ]);
        for user in [&[][..], &["-NoLogo"][..]] {
            assert_eq!(
                integrated_args(
                    ShellKind::Pwsh,
                    &strings(user),
                    Some(r"C:\cache\profile.ps1")
                ),
                expected
            );
        }
        // Without lut's profile, PowerShell starts as the user asked.
        assert_eq!(
            integrated_args(ShellKind::Pwsh, &strings(&["-NoLogo"]), None),
            strings(&["-NoLogo"])
        );
    }

    #[test]
    fn bash_runs_lut_rcfile_which_does_the_login() {
        for user in [&[][..], &["-l"][..], &["--login", "-i"][..]] {
            assert_eq!(
                integrated_args(ShellKind::Bash, &strings(user), Some("/cache/bashrc")),
                strings(&["--rcfile", "/cache/bashrc", "-i"]),
                "{user:?}"
            );
        }
        assert_eq!(
            integrated_args(ShellKind::Bash, &[], None),
            strings(&["-i"])
        );
    }

    #[test]
    fn zsh_is_a_login_shell_and_keeps_an_asked_interactive_flag() {
        assert_eq!(integrated_args(ShellKind::Zsh, &[], None), strings(&["-l"]));
        assert_eq!(
            integrated_args(ShellKind::Zsh, &strings(&["--login", "-i"]), None),
            strings(&["-l", "-i"])
        );
    }

    #[test]
    fn fish_reinstalls_lut_prompt_last_and_keeps_an_asked_login() {
        assert_eq!(
            integrated_args(ShellKind::Fish, &[], None),
            strings(&["-i", "-C", FISH_REINSTALL_PROMPT])
        );
        assert_eq!(
            integrated_args(ShellKind::Fish, &strings(&["--login"]), None),
            strings(&["-l", "-i", "-C", FISH_REINSTALL_PROMPT])
        );
    }

    #[test]
    fn cmd_keeps_its_arguments() {
        assert_eq!(
            integrated_args(ShellKind::Cmd, &strings(&["/k", "init.bat"]), None),
            strings(&["/k", "init.bat"])
        );
    }

    #[test]
    fn a_shell_keeps_its_listed_spelling_whatever_the_login_shell() {
        // `/bin` links to `/usr/bin`: both spellings name one binary.
        let binary = |path: &str| {
            let file = path.rsplit('/').next().unwrap();
            (file != "missing").then(|| file.to_string())
        };
        let listed: Vec<String> = ["/bin/bash", "/bin/zsh", "/usr/bin/zsh", "/bin/missing"]
            .map(String::from)
            .into();
        assert_eq!(
            unique_shell_paths("/usr/bin/zsh", &listed, binary),
            ["/bin/zsh", "/bin/bash"]
        );
        assert_eq!(
            unique_shell_paths("/usr/bin/bash", &listed, binary),
            ["/bin/bash", "/bin/zsh"]
        );
        // A login shell nothing lists keeps its own path.
        assert_eq!(unique_shell_paths("/opt/nu", &listed, binary)[0], "/opt/nu");
    }

    #[test]
    fn a_shell_under_another_name_stays_apart() {
        // As `list_shells` keys them: target and name. `/bin/sh` runs bash, but as a POSIX sh.
        let key = |path: &str| {
            let target = match path {
                "/bin/sh" | "/bin/bash" | "/usr/bin/bash" => "/usr/bin/bash",
                other => other,
            };
            Some((
                target.to_string(),
                path.rsplit('/').next().unwrap().to_string(),
            ))
        };
        let listed: Vec<String> = ["/bin/sh", "/bin/bash", "/usr/bin/bash"]
            .map(String::from)
            .into();
        assert_eq!(
            unique_shell_paths("/usr/bin/bash", &listed, key),
            ["/bin/bash", "/bin/sh"]
        );
    }

    #[test]
    fn etc_shells_skips_comments_and_blank_lines() {
        let content =
            "# List of acceptable shells\n\n/bin/bash\n  /bin/zsh  \n/usr/bin/fish # fish\n";
        assert_eq!(
            parse_etc_shells(content).collect::<Vec<_>>(),
            ["/bin/bash", "/bin/zsh", "/usr/bin/fish"]
        );
    }

    #[test]
    fn cmd_prompt_reports_the_cwd_before_the_users_own_prompt() {
        assert_eq!(
            cmd_prompt("BOX-1", None),
            "$E]7;file://BOX-1/$P$E\\$P$G".to_string()
        );
        assert_eq!(
            cmd_prompt("BOX-1", Some("  [$P] $G ")),
            "$E]7;file://BOX-1/$P$E\\[$P] $G".to_string()
        );
        assert_eq!(cmd_prompt("", Some("")), "$E]7;file:///$P$E\\$P$G");
    }

    #[test]
    fn cmd_prompt_is_not_stacked_and_keeps_the_host_inert() {
        let once = cmd_prompt("BOX", None);
        assert_eq!(cmd_prompt("BOX", Some(&once)), once);
        // The host is spliced into an escape sequence: nothing but a name survives.
        assert_eq!(
            cmd_prompt("a$E]52;c;x$E\\b", None),
            "$E]7;file://aE52cxEb/$P$E\\$P$G"
        );
    }

    #[test]
    fn common_env_includes_authenticated_caller_context() {
        let mut command = CommandBuilder::new("shell");
        let control = ShellControlEnv {
            address: "127.0.0.1:1234".into(),
            token: "secret".into(),
            pane_id: 42,
            cli_path: Some("/app/lut-cli".into()),
            cli_bin_dir: Some(std::path::PathBuf::from("/app/bin")),
        };
        apply_common(&mut command, None, Some(&control));

        assert_eq!(
            command.get_env("LUT_CONTROL_ADDR"),
            Some(OsStr::new("127.0.0.1:1234"))
        );
        assert_eq!(
            command.get_env("LUT_CONTROL_TOKEN"),
            Some(OsStr::new("secret"))
        );
        assert_eq!(command.get_env("LUT_PANE_ID"), Some(OsStr::new("42")));
        assert_eq!(command.get_env("LUT_CLI"), Some(OsStr::new("/app/lut-cli")));
        assert_eq!(
            command
                .get_env("PATH")
                .and_then(|path| std::env::split_paths(path).next()),
            Some(std::path::PathBuf::from("/app/bin"))
        );
    }

    #[test]
    fn no_terax_variable_reaches_a_lut_child() {
        // As if lut were launched from a Terax pane. The name is unique to this test, so setting it
        // cannot disturb tests running in parallel.
        std::env::set_var("TERAX_E02_09_INHERITED_PROBE", "terax");
        let mut command = CommandBuilder::new("shell");
        let control = ShellControlEnv {
            address: "127.0.0.1:1234".into(),
            token: "secret".into(),
            pane_id: 1,
            cli_path: Some("/app/lut-cli".into()),
            cli_bin_dir: Some(std::path::PathBuf::from("/app/bin")),
        };
        apply_common(&mut command, None, Some(&control));
        std::env::remove_var("TERAX_E02_09_INHERITED_PROBE");

        let terax: Vec<_> = command
            .iter_full_env_as_str()
            .map(|(key, _)| key)
            .filter(|key| key.starts_with("TERAX_"))
            .collect();
        assert!(terax.is_empty(), "{terax:?}");
        assert_eq!(command.get_env("LUT_TERMINAL"), Some(OsStr::new("1")));
    }
}
