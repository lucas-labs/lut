use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use portable_pty::CommandBuilder;

use crate::modules::control::ShellControlEnv;
use crate::modules::workspace;

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

/// lut's fish integration inside an XDG data directory. fish sources the `vendor_conf.d` files of
/// every directory in `XDG_DATA_DIRS` before `config.fish`, wherever `XDG_CONFIG_HOME` points. The
/// name differs from the user's `conf.d` files, which would hide a vendor file of the same name.
const FISH_VENDOR_FILE: &str = "fish/vendor_conf.d/lut-shell-integration.fish";

/// `XDG_DATA_DIRS` for a fish launch: lut's directory first, then the child's own list, or the
/// spec's default when it has none. `init.fish` takes lut's directory out again once loaded.
fn fish_xdg_data_dirs(lut_dir: &str, inherited: Option<&str>) -> String {
    let rest = inherited
        .filter(|dirs| !dirs.is_empty())
        .unwrap_or("/usr/local/share:/usr/share");
    format!("{lut_dir}:{rest}")
}

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
/// joined into one shell string, plus where it starts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchSpec {
    /// An absolute path, or a bare name looked up on `PATH` (inside the distro for WSL). `None`
    /// starts the default shell on the host, or the distro's login shell in WSL.
    pub program: Option<String>,
    pub args: Vec<String>,
    /// PowerShell only: `false` starts it with `-NoProfile`, so it skips the user's profile
    /// scripts while lut's own integration script still runs.
    pub load_user_profile: bool,
    /// Set over the inherited environment and under lut's own variables (`apply_common`).
    pub env: ProfileEnv,
    /// The start directory, already checked (`pty_open`). `None` leaves it to the process on the
    /// host and to the home directory in WSL.
    pub cwd: Option<String>,
    pub target: LaunchTarget,
}

/// A profile's variables: a value sets one, `None` removes an inherited one. Names starting with
/// `LUT_` are rejected when the profile is saved.
pub type ProfileEnv = BTreeMap<String, Option<String>>;

/// Where a launch runs, chosen per launch and not by the window's workspace.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum LaunchTarget {
    #[default]
    Native,
    /// `None` is the distro `wsl.exe` marks as the default.
    Wsl { distro: Option<String> },
}

impl LaunchSpec {
    /// The default shell on the host, with no arguments, the user's profile loaded, no variables
    /// of its own and no start directory.
    pub fn new() -> Self {
        Self {
            program: None,
            args: Vec::new(),
            load_user_profile: true,
            env: ProfileEnv::new(),
            cwd: None,
            target: LaunchTarget::Native,
        }
    }
}

impl Default for LaunchSpec {
    fn default() -> Self {
        Self::new()
    }
}

/// Why a launch failed, or, for `CwdUnavailable`, why it started somewhere else. The frontend
/// tells them apart by `code` and shows `message`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchError {
    /// No listed profile has this id (deleted, or a detected shell or distro since removed).
    ProfileNotFound { id: String },
    /// The program is not a file, or a bare name not found on `PATH` (the distro's, for WSL).
    ExecutableNotFound { program: String },
    /// The requested start directory is missing, not a directory or on an unmounted drive. A
    /// warning: the launch falls back to the home directory.
    CwdUnavailable { cwd: String, reason: String },
    /// The distro is not installed; `None` when no distro is installed at all.
    DistroNotInstalled { distro: Option<String> },
    /// Anything else: the pseudoconsole, the spawn itself, or `wsl.exe`.
    SpawnFailed { reason: String },
}

impl LaunchError {
    pub fn spawn_failed(reason: impl std::fmt::Display) -> Self {
        Self::SpawnFailed {
            reason: reason.to_string(),
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::ProfileNotFound { .. } => "profileNotFound",
            Self::ExecutableNotFound { .. } => "executableNotFound",
            Self::CwdUnavailable { .. } => "cwdUnavailable",
            Self::DistroNotInstalled { .. } => "distroNotInstalled",
            Self::SpawnFailed { .. } => "spawnFailed",
        }
    }
}

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ProfileNotFound { id } => write!(f, "terminal profile not found: {id}"),
            Self::ExecutableNotFound { program } => write!(f, "executable not found: {program}"),
            Self::CwdUnavailable { cwd, reason } => {
                write!(f, "directory not available: {cwd} ({reason})")
            }
            Self::DistroNotInstalled {
                distro: Some(distro),
            } => {
                write!(f, "WSL distro {distro} is not installed")
            }
            Self::DistroNotInstalled { distro: None } => f.write_str("no WSL distro is installed"),
            Self::SpawnFailed { reason } => f.write_str(reason),
        }
    }
}

impl std::error::Error for LaunchError {}

/// `{ code, ...fields, message }`, the fields in camelCase.
impl serde::Serialize for LaunchError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("code", self.code())?;
        match self {
            Self::ProfileNotFound { id } => map.serialize_entry("id", id)?,
            Self::ExecutableNotFound { program } => map.serialize_entry("program", program)?,
            Self::CwdUnavailable { cwd, reason } => {
                map.serialize_entry("cwd", cwd)?;
                map.serialize_entry("reason", reason)?;
            }
            Self::DistroNotInstalled { distro } => map.serialize_entry("distro", distro)?,
            Self::SpawnFailed { reason } => map.serialize_entry("reason", reason)?,
        }
        map.serialize_entry("message", &self.to_string())?;
        map.end()
    }
}

/// Builds the command for `spec`.
pub fn build_command(
    spec: LaunchSpec,
    control: Option<ShellControlEnv>,
) -> Result<CommandBuilder, LaunchError> {
    #[cfg(unix)]
    {
        if let LaunchTarget::Wsl { .. } = spec.target {
            return Err(LaunchError::spawn_failed(
                "WSL is only available on Windows",
            ));
        }
        unix::build(spec, control)
    }
    #[cfg(windows)]
    {
        windows::build(spec, control)
    }
}

/// The distro a WSL launch runs in: the one named, else the one `wsl.exe` marks as the default.
pub fn wsl_distro(distro: Option<String>) -> Result<String, LaunchError> {
    #[cfg(windows)]
    {
        distro.map_or_else(windows::default_wsl_distro, Ok)
    }
    #[cfg(not(windows))]
    {
        let _ = distro;
        Err(LaunchError::spawn_failed(
            "WSL is only available on Windows",
        ))
    }
}

/// The start directory when none was asked for: the directory lut was started in, then home.
pub fn default_cwd() -> Option<String> {
    workspace::launch_cwd_snapshot()
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().into_owned())
        .or_else(home_cwd)
}

/// The home directory, where a launch goes when its requested directory cannot be used.
pub fn home_cwd() -> Option<String> {
    dirs::home_dir()
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().into_owned())
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
/// Relative directories (`.` in `PATH`) are skipped: lut's own working directory has nothing to
/// do with the pane's, and the child would resolve the path against its cwd.
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
    dirs.into_iter()
        .filter(|dir| dir.is_absolute())
        .find_map(|dir| {
            candidates
                .iter()
                .map(|candidate| dir.join(candidate))
                .find(|path| is_executable(path))
        })
}

/// A file the PATH search may pick. On Unix it also needs an execute bit, so a later executable
/// in `PATH` wins over a plain file of the same name.
fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// The program's file name in lower case, without `.exe`.
fn program_name(program: &str) -> String {
    let name = program
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match name.strip_suffix(".exe") {
        Some(stem) => stem.to_string(),
        None => name,
    }
}

/// Whether the program is an interactive shell, integrated by lut or not. At its prompt a shell is
/// idle, so only what it starts counts as running; any other program is the running process.
pub(crate) fn is_shell(program: &str) -> bool {
    const SHELLS: [&str; 15] = [
        "pwsh",
        "powershell",
        "cmd",
        "bash",
        "zsh",
        "fish",
        "nu",
        "sh",
        "dash",
        "ksh",
        "mksh",
        "tcsh",
        "csh",
        "elvish",
        "xonsh",
    ];
    SHELLS.contains(&program_name(program).as_str())
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
        match program_name(program).as_str() {
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
        ShellKind::Pwsh => arg.eq_ignore_ascii_case("-NoLogo") || is_no_profile(arg),
        ShellKind::Bash | ShellKind::Zsh | ShellKind::Fish => {
            matches!(arg.as_str(), "-l" | "--login" | "-i")
        }
        ShellKind::Cmd => true,
        ShellKind::Other => false,
    };
    args.iter().all(covered)
}

fn is_no_profile(arg: &str) -> bool {
    arg.eq_ignore_ascii_case("-NoProfile")
}

/// The arguments of a launch without lut's integration: the user's own, plus `-NoProfile` for a
/// PowerShell that should skip the user's profile. It goes first, as PowerShell hands everything
/// after `-File` or `-Command` to the script or command, so a `-NoProfile` among the user's own
/// arguments may be the script's. PowerShell accepts the switch twice.
fn bare_args(kind: ShellKind, user_args: &[String], load_user_profile: bool) -> Vec<String> {
    let mut args = Vec::with_capacity(user_args.len() + 1);
    if kind == ShellKind::Pwsh && !load_user_profile {
        args.push("-NoProfile".to_string());
    }
    args.extend(user_args.iter().cloned());
    args
}

/// The arguments of an integrated launch. `file` is lut's prepared integration file (the
/// PowerShell profile, the bash rcfile), `None` when preparing it failed. The user's covered
/// flags are kept where the integrated launch does not already imply them: bash's rcfile runs the
/// login files itself (`--login` would make bash skip it), zsh already starts with `-l`, and
/// PowerShell with `-NoLogo`. PowerShell skips the user's profile when `load_user_profile` is off
/// or the user asked for `-NoProfile`; `-File` still runs lut's.
fn integrated_args(
    kind: ShellKind,
    user_args: &[String],
    file: Option<&str>,
    load_user_profile: bool,
) -> Vec<String> {
    let asked = |flags: &[&str]| user_args.iter().any(|arg| flags.contains(&arg.as_str()));
    let mut args: Vec<String> = Vec::new();
    match kind {
        ShellKind::Pwsh => match file {
            Some(profile) => {
                args.push("-NoLogo".into());
                if !load_user_profile || user_args.iter().any(|arg| is_no_profile(arg)) {
                    args.push("-NoProfile".into());
                }
                args.extend(["-NoExit", "-ExecutionPolicy", "Bypass", "-File"].map(String::from));
                args.push(profile.to_string());
            }
            None => args = bare_args(kind, user_args, load_user_profile),
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
    // What the child gets, so a profile's own locale counts.
    let already_utf8 = ["LC_ALL", "LC_CTYPE", "LANG"].iter().any(|k| {
        cmd.get_env(k)
            .and_then(|value| value.to_str())
            .is_some_and(is_utf8)
    });
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

/// The profile's variables: a value sets one, `None` removes an inherited one.
fn apply_profile_env(cmd: &mut CommandBuilder, env: &ProfileEnv) {
    for (name, value) in env {
        match value {
            Some(value) => {
                cmd.env(name, value);
            }
            None => {
                cmd.env_remove(name);
            }
        }
    }
}

/// Whether the profile sets or removes `name`, which Windows matches in any case.
fn profile_names(env: &ProfileEnv, name: &str) -> bool {
    env.keys().any(|key| {
        if cfg!(windows) {
            key.eq_ignore_ascii_case(name)
        } else {
            key == name
        }
    })
}

/// The environment, in order: the inherited one, lut's defaults (`TERM`, `COLORTERM`, no
/// `TERAX_*`, the AppImage fixes), the profile's `env`, then lut's own `LUT_*` variables, which a
/// profile cannot override. The CLI folder goes in front of the profile's `PATH` when it has one.
fn apply_common(
    cmd: &mut CommandBuilder,
    cwd: Option<String>,
    control: Option<&ShellControlEnv>,
    env: &ProfileEnv,
) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
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
    apply_profile_env(cmd, env);
    let clean_path = if profile_names(env, "PATH") {
        cmd.get_env("PATH").map(ToOwned::to_owned)
    } else {
        clean_path
    };
    cmd.env("LUT_TERMINAL", "1");
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
    // The UTF-8 fallback is a default: a profile that sets or removes a locale variable (even
    // `LANG=C`) gets exactly that.
    const LOCALE: [&str; 3] = ["LC_ALL", "LC_CTYPE", "LANG"];
    if !LOCALE.iter().any(|name| profile_names(env, name)) {
        ensure_utf8_locale(cmd);
    }

    // `pty_open` already chose and checked it (`default_cwd`, `home_cwd`).
    if let Some(cwd) = cwd.map(PathBuf::from) {
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
        spec: super::LaunchSpec,
        control: Option<super::ShellControlEnv>,
    ) -> Result<CommandBuilder, super::LaunchError> {
        let program = match spec.program.as_deref() {
            Some(program) => super::resolve_program(program)?
                .to_string_lossy()
                .into_owned(),
            None => default_shell(),
        };
        let mut cmd = CommandBuilder::new(&program);
        super::apply_common(&mut cmd, spec.cwd, control.as_ref(), &spec.env);
        let kind = ShellKind::classify(&program);
        if super::uses_integration(kind, &spec.args, false) {
            apply_shell_init(&mut cmd, kind, &spec.args);
        } else {
            log::info!("spawning '{program}' without shell integration");
            cmd.args(super::bare_args(kind, &spec.args, spec.load_user_profile));
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
                        // The child's ZDOTDIR so far, inherited or the profile's; guards against
                        // lut-in-lut :)
                        let inherited = cmd
                            .get_env("ZDOTDIR")
                            .map(|dir| dir.to_string_lossy().into_owned());
                        match user_zdotdir_for(inherited.as_deref(), &zdotdir) {
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
                match prepare_fish_data_dir() {
                    Ok(dir) => {
                        let dir = dir.to_string_lossy().into_owned();
                        // The child's list so far, inherited or the profile's.
                        let inherited = cmd
                            .get_env("XDG_DATA_DIRS")
                            .map(|dirs| dirs.to_string_lossy().into_owned());
                        cmd.env(
                            "XDG_DATA_DIRS",
                            super::fish_xdg_data_dirs(&dir, inherited.as_deref()),
                        );
                        cmd.env("LUT_FISH_XDG_DATA_DIR", &dir);
                    }
                    Err(e) => {
                        log::warn!("fish shell integration disabled: {e}");
                    }
                }
                // fish 4.0+ writes its own OSC 133 A/B; ours would double it.
                cmd.env("fish_features", "no-mark-prompt");
            }
            ShellKind::Pwsh | ShellKind::Cmd | ShellKind::Other => {}
        }
        // Only PowerShell reads the profile option, and lut does not integrate it on Unix.
        cmd.args(super::integrated_args(
            kind,
            user_args,
            file.as_deref(),
            true,
        ));
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

    /// lut's XDG data directory for fish, holding `FISH_VENDOR_FILE`.
    fn prepare_fish_data_dir() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("fish");
        let file = dir.join(super::FISH_VENDOR_FILE);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        write_if_changed(&file, FISH_INIT)?;
        Ok(dir)
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
        fn a_zdotdir_from_the_profile_is_the_users() {
            let mut cmd = CommandBuilder::new("/bin/zsh");
            // As apply_common leaves it for a profile that sets ZDOTDIR.
            cmd.env("ZDOTDIR", "/profile/zsh");
            apply_shell_init(&mut cmd, ShellKind::Zsh, &[]);
            assert_eq!(
                cmd.get_env("LUT_USER_ZDOTDIR"),
                Some(std::ffi::OsStr::new("/profile/zsh"))
            );
            let zdotdir = cmd.get_env("ZDOTDIR").expect("ZDOTDIR is set");
            assert!(Path::new(zdotdir).ends_with("shell-integration/zsh"));
        }

        #[test]
        fn fish_loads_lut_from_its_data_dir_whatever_the_config_dir() {
            for (config, data) in [
                (None, None),
                (Some("/tmp/xdg"), None),
                (Some("/tmp/xdg"), Some("/opt/share:/usr/share")),
            ] {
                let mut cmd = CommandBuilder::new("/usr/bin/fish");
                // As apply_common leaves them, inherited or from the profile.
                cmd.env_remove("XDG_CONFIG_HOME");
                cmd.env_remove("XDG_DATA_DIRS");
                if let Some(config) = config {
                    cmd.env("XDG_CONFIG_HOME", config);
                }
                if let Some(data) = data {
                    cmd.env("XDG_DATA_DIRS", data);
                }
                apply_shell_init(&mut cmd, ShellKind::Fish, &[]);
                let dir = cmd
                    .get_env("LUT_FISH_XDG_DATA_DIR")
                    .expect("lut's data dir is set")
                    .to_string_lossy()
                    .into_owned();
                assert!(Path::new(&dir)
                    .join(super::super::FISH_VENDOR_FILE)
                    .is_file());
                assert_eq!(
                    cmd.get_env("XDG_DATA_DIRS")
                        .map(|dirs| dirs.to_string_lossy().into_owned()),
                    Some(super::super::fish_xdg_data_dirs(&dir, data))
                );
                assert_eq!(
                    cmd.get_env("XDG_CONFIG_HOME"),
                    config.map(std::ffi::OsStr::new)
                );
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
        /// lut's XDG data directory inside the distro (`FISH_VENDOR_FILE`).
        Fish {
            data_dir: String,
        },
        None,
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct WslLaunchSpec {
        args: Vec<String>,
    }

    pub fn build(
        spec: super::LaunchSpec,
        control: Option<super::ShellControlEnv>,
    ) -> Result<CommandBuilder, super::LaunchError> {
        if let super::LaunchTarget::Wsl { distro } = &spec.target {
            // lut's control variables name a Windows helper that cannot run inside WSL, and
            // `pty_open` does not pass them there.
            let _ = control;
            return build_wsl(distro.clone(), &spec);
        }
        let super::LaunchSpec {
            program,
            args: user_args,
            load_user_profile,
            env,
            cwd,
            ..
        } = spec;
        let program = match program.as_deref() {
            Some(program) => super::resolve_program(program)?,
            None => super::windows_shell_path(),
        };
        let mut cmd = CommandBuilder::new(&program);
        super::apply_common(&mut cmd, cwd, control.as_ref(), &env);
        let kind = ShellKind::classify(&program.to_string_lossy());
        let integrated = super::uses_integration(kind, &user_args, true);
        let file = if integrated {
            integration_file(kind)
        } else {
            log::info!("spawning {} without shell integration", program.display());
            None
        };
        apply_launch(
            &mut cmd,
            kind,
            integrated,
            &user_args,
            file.as_deref(),
            load_user_profile,
        );
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
        load_user_profile: bool,
    ) {
        if kind == ShellKind::Bash {
            // git-bash's /etc/profile cd's to $HOME unless CHERE_INVOKING is set; keep the cwd
            // we configured in apply_common.
            cmd.env("CHERE_INVOKING", "1");
        }
        if !integrated {
            cmd.args(super::bare_args(kind, user_args, load_user_profile));
            return;
        }
        if kind == ShellKind::Cmd {
            let host = std::env::var("COMPUTERNAME").unwrap_or_default();
            // The prompt the child would get, which may be the profile's.
            let existing = cmd
                .get_env("PROMPT")
                .map(|prompt| prompt.to_string_lossy().into_owned());
            cmd.env("PROMPT", super::cmd_prompt(&host, existing.as_deref()));
        }
        cmd.args(super::integrated_args(
            kind,
            user_args,
            file,
            load_user_profile,
        ));
    }

    /// A WSL launch: the distro (the default one when unset), then the program (the distro's
    /// login shell when unset), each checked inside the distro so a failure has its own error.
    fn build_wsl(
        distro: Option<String>,
        spec: &super::LaunchSpec,
    ) -> Result<CommandBuilder, super::LaunchError> {
        let distro = match distro {
            Some(distro) => distro,
            None => default_wsl_distro()?,
        };
        crate::modules::workspace::validate_wsl_distro_name(&distro)
            .map_err(super::LaunchError::spawn_failed)?;
        let env = &spec.env;
        let program_path = match spec.program.as_deref() {
            Some(program) => find_wsl_program(&distro, program, env)?,
            None => crate::modules::workspace::wsl_login_shell(distro.clone())
                .map_err(|reason| wsl_failure(&distro, reason))?,
        };
        let program = WslProgram {
            path: &program_path,
            kind: ShellKind::classify(&program_path),
            args: &spec.args,
            load_user_profile: spec.load_user_profile,
        };
        let integration = if super::uses_integration(program.kind, program.args, false) {
            wsl_integration(&distro, &program, env)
        } else {
            log::info!("spawning WSL '{program_path}' without shell integration");
            WslShellIntegration::None
        };
        let launch =
            build_wsl_launch_spec(spec.cwd.as_deref(), &distro, &program, integration, env);
        let mut cmd = CommandBuilder::new("wsl.exe");
        cmd.env("LUT_WSL_LOGIN_SHELL", &program_path);
        for arg in &launch.args {
            cmd.arg(arg);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LUT_TERMINAL", "1");
        super::ensure_utf8_locale(&mut cmd);
        log::info!("spawning WSL program: {distro} ({program_path})");
        Ok(cmd)
    }

    /// The program a WSL launch runs, already found inside the distro.
    struct WslProgram<'a> {
        path: &'a str,
        kind: ShellKind,
        args: &'a [String],
        load_user_profile: bool,
    }

    /// The distro `wsl.exe` runs without `-d`, from the registry (`registered_distros`).
    pub(super) fn default_wsl_distro() -> Result<String, super::LaunchError> {
        let distros = crate::modules::workspace::registered_distros()
            .map_err(super::LaunchError::spawn_failed)?;
        pick_default_distro(&distros)
    }

    /// The one marked as the default, else the first; none registered is `DistroNotInstalled`.
    fn pick_default_distro(
        distros: &[crate::modules::workspace::RegisteredDistro],
    ) -> Result<String, super::LaunchError> {
        distros
            .iter()
            .find(|d| d.default)
            .or_else(|| distros.first())
            .map(|d| d.name.clone())
            .ok_or(super::LaunchError::DistroNotInstalled { distro: None })
    }

    /// A failed `wsl.exe` call for `distro`, typed. The registered distros are read only once a
    /// call failed, to tell a missing distro from anything else.
    fn wsl_failure(distro: &str, reason: String) -> super::LaunchError {
        classify_wsl_failure(
            distro,
            reason,
            crate::modules::workspace::registered_distros(),
        )
    }

    /// `DistroNotInstalled` when the registered distros were read and do not name `distro`
    /// (`wsl.exe` matches names in any case), none registered included; `SpawnFailed` with
    /// `wsl.exe`'s own text otherwise.
    fn classify_wsl_failure(
        distro: &str,
        reason: String,
        installed: Result<Vec<crate::modules::workspace::RegisteredDistro>, String>,
    ) -> super::LaunchError {
        match installed {
            Ok(distros) if !distros.iter().any(|d| d.name.eq_ignore_ascii_case(distro)) => {
                super::LaunchError::DistroNotInstalled {
                    distro: Some(distro.to_string()),
                }
            }
            _ => super::LaunchError::SpawnFailed { reason },
        }
    }

    /// The path of `program` inside the distro, or `ExecutableNotFound`.
    fn find_wsl_program(
        distro: &str,
        program: &str,
        env: &super::ProfileEnv,
    ) -> Result<String, super::LaunchError> {
        let (probe, args) = wsl_program_probe(program, env);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = crate::modules::workspace::wsl_exec_capture(distro, &probe, &args)
            .map_err(|reason| wsl_failure(distro, reason))?;
        let found = crate::modules::workspace::normalize_wsl_value(out, "");
        if found.is_empty() {
            Err(super::LaunchError::ExecutableNotFound {
                program: program.to_string(),
            })
        } else {
            Ok(found)
        }
    }

    /// Program and arguments of the lookup: `command -v` in `/bin/sh`, behind `env` when the
    /// profile has variables, so a profile's `PATH` counts for the program but not for the shell
    /// (`env` looks its command up in the `PATH` it sets). It searches the `PATH` that `wsl.exe --exec`
    /// gives, the one the launch uses. It always exits 0, so a failure is `wsl.exe`'s and empty
    /// output means not found.
    fn wsl_program_probe(program: &str, env: &super::ProfileEnv) -> (String, Vec<String>) {
        let probe = [
            "-c".to_string(),
            r#"command -v "$1" || true"#.to_string(),
            "sh".to_string(),
            program.to_string(),
        ];
        if env.is_empty() {
            return ("/bin/sh".to_string(), probe.to_vec());
        }
        let mut args = wsl_env_args(env);
        args.push("/bin/sh".to_string());
        args.extend(probe);
        ("env".to_string(), args)
    }

    /// lut's integration for an integrated WSL shell, prepared inside the distro; `None` when
    /// preparing it failed or lut does not integrate that shell.
    fn wsl_integration(
        distro: &str,
        program: &WslProgram,
        env: &super::ProfileEnv,
    ) -> WslShellIntegration {
        let shell_path = program.path;
        match program.kind {
            ShellKind::Zsh => match prepare_wsl_zdotdir(distro) {
                Ok(zdotdir) => {
                    // A ZDOTDIR the profile sets is the user's, as the distro's own would be.
                    let user_zdotdir = match env.get("ZDOTDIR") {
                        Some(set) => set.clone(),
                        None => match probe_wsl_zdotdir(distro, shell_path, env) {
                            Ok(path) => Some(path),
                            Err(e) => {
                                log::warn!("WSL zsh ZDOTDIR probe failed for {distro}: {e}");
                                None
                            }
                        },
                    }
                    .filter(|path| !path.is_empty() && *path != zdotdir);
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
            ShellKind::Bash => match prepare_wsl_bash_rcfile(distro) {
                Ok(rcfile) => WslShellIntegration::Bash { rcfile },
                Err(e) => {
                    log::warn!("WSL bash shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Fish => match prepare_wsl_fish_data_dir(distro) {
                Ok(data_dir) => WslShellIntegration::Fish { data_dir },
                Err(e) => {
                    log::warn!("WSL fish shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Pwsh | ShellKind::Cmd | ShellKind::Other => {
                log::info!("unsupported WSL shell '{shell_path}', spawning without integration");
                WslShellIntegration::None
            }
        }
    }

    /// The profile's variables as `env` arguments inside the distro. `wsl.exe` passes no Windows
    /// variable to Linux unless `WSLENV` lists it, and `WSLENV` cannot remove one, so: `-u NAME`
    /// for a removed one (options come before any assignment), then `--` so a name that starts
    /// with `-` is never read as an option, then `NAME=value` for a set one. Empty without
    /// profile variables.
    fn wsl_env_args(env: &super::ProfileEnv) -> Vec<String> {
        let removed = env.iter().filter(|(_, value)| value.is_none());
        let mut args: Vec<String> = removed
            .flat_map(|(name, _)| ["-u".to_string(), name.clone()])
            .collect();
        if !env.is_empty() {
            args.push("--".to_string());
        }
        args.extend(
            env.iter()
                .filter_map(|(name, value)| Some(format!("{name}={}", value.as_ref()?))),
        );
        args
    }

    /// `wsl.exe --exec` arguments: the profile's variables (`wsl_env_args`), then lut's
    /// integration variables, so they win. Without profile variables the prefix is lut's alone.
    /// An integrated shell gets its integrated arguments (`integrated_args`), which keep the
    /// user's covered flags. Any other launch gets the user's arguments as they are, or, with
    /// none, the login or interactive flag the shell needs to start as a terminal shell.
    fn build_wsl_launch_spec(
        cwd: Option<&str>,
        distro: &str,
        program: &WslProgram,
        integration: WslShellIntegration,
        env: &super::ProfileEnv,
    ) -> WslLaunchSpec {
        let mut args = vec![
            "-d".to_string(),
            distro.to_string(),
            "--cd".to_string(),
            cwd.filter(|s| !s.is_empty()).unwrap_or("~").to_string(),
            "--exec".to_string(),
        ];
        let mut prefix = wsl_env_args(env);
        let kind = program.kind;
        let program_args = match integration {
            WslShellIntegration::Zsh {
                zdotdir,
                user_zdotdir,
            } => {
                if let Some(user_zdotdir) = user_zdotdir {
                    prefix.push(format!("LUT_USER_ZDOTDIR={user_zdotdir}"));
                }
                prefix.push(format!("ZDOTDIR={zdotdir}"));
                super::integrated_args(kind, program.args, None, true)
            }
            WslShellIntegration::Bash { rcfile } => {
                super::integrated_args(kind, program.args, Some(&rcfile), true)
            }
            WslShellIntegration::Fish { data_dir } => {
                // The distro's own list is not known from here: the profile's, else the default.
                let profile_dirs = env.get("XDG_DATA_DIRS").cloned().flatten();
                prefix.push(format!(
                    "XDG_DATA_DIRS={}",
                    super::fish_xdg_data_dirs(&data_dir, profile_dirs.as_deref())
                ));
                prefix.push(format!("LUT_FISH_XDG_DATA_DIR={data_dir}"));
                prefix.push("fish_features=no-mark-prompt".to_string());
                super::integrated_args(kind, program.args, None, true)
            }
            WslShellIntegration::None if program.args.is_empty() => match kind {
                ShellKind::Zsh => vec!["-l".to_string()],
                ShellKind::Bash | ShellKind::Fish => vec!["-i".to_string()],
                _ => super::bare_args(kind, program.args, program.load_user_profile),
            },
            WslShellIntegration::None => {
                super::bare_args(kind, program.args, program.load_user_profile)
            }
        };
        if !prefix.is_empty() {
            args.push("env".to_string());
            args.extend(prefix);
        }
        args.push(program.path.to_string());
        args.extend(program_args);
        WslLaunchSpec { args }
    }

    /// The user's zsh directory as the launched shell will see it: the probe runs with the
    /// profile's variables, so a profile's `HOME` counts.
    fn probe_wsl_zdotdir(
        distro: &str,
        shell_path: &str,
        env: &super::ProfileEnv,
    ) -> Result<String, String> {
        let (program, args) = wsl_zdotdir_probe(shell_path, env);
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let out = crate::modules::workspace::wsl_exec_capture(distro, &program, &args)?;
        Ok(crate::modules::workspace::normalize_wsl_value(out, ""))
    }

    /// Program and arguments of the ZDOTDIR probe: the shell itself, behind `env` when the
    /// profile has variables. `-f` skips the user's startup files (only `/etc/zshenv` runs), so the
    /// probe sees the ZDOTDIR the environment gives; one the user's `.zshenv` sets is the
    /// wrapper's to find (`scripts/zshenv.zsh`), after it has sourced that `.zshenv`.
    fn wsl_zdotdir_probe(shell_path: &str, env: &super::ProfileEnv) -> (String, Vec<String>) {
        let probe = [
            "-f".to_string(),
            "-c".to_string(),
            r#"printf %s "${ZDOTDIR:-$HOME}""#.to_string(),
        ];
        if env.is_empty() {
            return (shell_path.to_string(), probe.to_vec());
        }
        let mut args = wsl_env_args(env);
        args.push(shell_path.to_string());
        args.extend(probe);
        ("env".to_string(), args)
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

    /// lut's XDG data directory for fish inside the distro, holding `FISH_VENDOR_FILE`.
    fn prepare_wsl_fish_data_dir(distro: &str) -> Result<String, String> {
        let (linux_dir, _unc_dir) = prepare_wsl_integration_dir(distro, "fish")?;
        let linux_file = format!("{linux_dir}/{}", super::FISH_VENDOR_FILE);
        let unc_file = crate::modules::workspace::wsl_path_to_unc(distro, &linux_file);
        if let Some(parent) = unc_file.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        write_if_changed(&unc_file, &normalize_script(super::fish_init_script()))?;
        Ok(linux_dir)
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
                true,
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
        fn cmd_reports_the_cwd_before_the_profiles_own_prompt() {
            let mut cmd = CommandBuilder::new(r"C:\Windows\System32\cmd.exe");
            // As apply_common leaves it for a profile that sets PROMPT.
            cmd.env("PROMPT", "[$P]$G");
            apply_launch(&mut cmd, ShellKind::Cmd, true, &[], None, true);
            let prompt = cmd.get_env("PROMPT").unwrap().to_string_lossy();
            assert!(prompt.starts_with("$E]7;file://"), "{prompt}");
            assert!(prompt.ends_with(r"$E\[$P]$G"), "{prompt}");
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

        fn no_env() -> super::super::ProfileEnv {
            super::super::ProfileEnv::new()
        }

        /// A WSL program started with no arguments of the user's.
        fn login(path: &str, kind: ShellKind) -> WslProgram<'_> {
            WslProgram {
                path,
                kind,
                args: &[],
                load_user_profile: true,
            }
        }

        fn wsl_args(shell: &str, kind: ShellKind, integration: WslShellIntegration) -> Vec<String> {
            let env = super::super::ProfileEnv::from([
                ("PAGER".to_string(), None),
                ("--split-string".to_string(), Some("printf x".to_string())),
                ("EDITOR".to_string(), Some("nvim".to_string())),
                ("GREETING".to_string(), Some("hello world".to_string())),
                ("ZDOTDIR".to_string(), Some("/mine".to_string())),
            ]);
            let spec =
                build_wsl_launch_spec(None, "Ubuntu", &login(shell, kind), integration, &env);
            // The part after `--exec`.
            spec.args[5..].to_vec()
        }

        #[test]
        fn the_wsl_zdotdir_probe_sees_the_profiles_variables() {
            let script = r#"printf %s "${ZDOTDIR:-$HOME}""#;
            assert_eq!(
                wsl_zdotdir_probe("/usr/bin/zsh", &no_env()),
                (
                    "/usr/bin/zsh".to_string(),
                    vec!["-f".to_string(), "-c".to_string(), script.to_string()]
                )
            );
            let env = super::super::ProfileEnv::from([
                ("HOME".to_string(), Some("/home/other".to_string())),
                ("PAGER".to_string(), None),
            ]);
            assert_eq!(
                wsl_zdotdir_probe("/usr/bin/zsh", &env),
                (
                    "env".to_string(),
                    [
                        "-u",
                        "PAGER",
                        "--",
                        "HOME=/home/other",
                        "/usr/bin/zsh",
                        "-f",
                        "-c",
                        script
                    ]
                    .map(String::from)
                    .to_vec()
                )
            );
        }

        #[test]
        fn wsl_gets_the_profiles_variables_through_an_env_prefix() {
            let profile = [
                "env",
                "-u",
                "PAGER",
                // A name that starts with `-` stays an assignment.
                "--",
                "--split-string=printf x",
                "EDITOR=nvim",
                "GREETING=hello world",
                "ZDOTDIR=/mine",
            ];
            let with = |rest: &[&str]| -> Vec<String> {
                profile.iter().chain(rest).map(|a| a.to_string()).collect()
            };
            // lut's integration variables come last, so they win.
            assert_eq!(
                wsl_args(
                    "/usr/bin/zsh",
                    ShellKind::Zsh,
                    WslShellIntegration::Zsh {
                        zdotdir: "/lut/zsh".into(),
                        user_zdotdir: Some("/mine".into()),
                    },
                ),
                with(&[
                    "LUT_USER_ZDOTDIR=/mine",
                    "ZDOTDIR=/lut/zsh",
                    "/usr/bin/zsh",
                    "-l"
                ])
            );
            assert_eq!(
                wsl_args(
                    "/bin/bash",
                    ShellKind::Bash,
                    WslShellIntegration::Bash {
                        rcfile: "/lut/bashrc".into()
                    },
                ),
                with(&["/bin/bash", "--rcfile", "/lut/bashrc", "-i"])
            );
            assert_eq!(
                wsl_args(
                    "/usr/bin/fish",
                    ShellKind::Fish,
                    WslShellIntegration::Fish {
                        data_dir: "/lut/fish".into()
                    }
                ),
                with(&[
                    "XDG_DATA_DIRS=/lut/fish:/usr/local/share:/usr/share",
                    "LUT_FISH_XDG_DATA_DIR=/lut/fish",
                    "fish_features=no-mark-prompt",
                    "/usr/bin/fish",
                    "-i",
                    "-C",
                    super::super::FISH_REINSTALL_PROMPT
                ])
            );
            assert_eq!(
                wsl_args("/usr/bin/nu", ShellKind::Other, WslShellIntegration::None),
                with(&["/usr/bin/nu"])
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_env_and_login() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                &login("/usr/bin/zsh", ShellKind::Zsh),
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/zsh".into(),
                    user_zdotdir: None,
                },
                &no_env(),
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
                &login("/usr/bin/zsh", ShellKind::Zsh),
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/zsh".into(),
                    user_zdotdir: Some("/home/vinicios/.config/zsh".into()),
                },
                &no_env(),
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
                &login("/usr/bin/zsh", ShellKind::Zsh),
                WslShellIntegration::None,
                &no_env(),
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
                &login("/bin/bash", ShellKind::Bash),
                WslShellIntegration::Bash {
                    rcfile: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/bash/bashrc"
                        .into(),
                },
                &no_env(),
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
                &login("/usr/bin/fish", ShellKind::Fish),
                WslShellIntegration::Fish {
                    data_dir: "/home/vinicios/.cache/dev.lucode.lut/shell-integration/fish".into(),
                },
                &no_env(),
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
                    "XDG_DATA_DIRS=/home/vinicios/.cache/dev.lucode.lut/shell-integration/fish:/usr/local/share:/usr/share".to_string(),
                    "LUT_FISH_XDG_DATA_DIR=/home/vinicios/.cache/dev.lucode.lut/shell-integration/fish".to_string(),
                    "fish_features=no-mark-prompt".to_string(),
                    "/usr/bin/fish".to_string(),
                    "-i".to_string(),
                    "-C".to_string(),
                    super::super::FISH_REINSTALL_PROMPT.to_string(),
                ]
            );
        }

        #[test]
        fn wsl_fish_loads_lut_whatever_xdg_dirs_the_profile_sets() {
            let fish = || WslShellIntegration::Fish {
                data_dir: "/lut/fish".into(),
            };
            let launch = |env: &super::super::ProfileEnv| {
                build_wsl_launch_spec(
                    None,
                    "Ubuntu",
                    &login("/usr/bin/fish", ShellKind::Fish),
                    fish(),
                    env,
                )
                .args
            };
            let lut_vars = |data_dirs: &str| {
                [
                    format!("XDG_DATA_DIRS=/lut/fish:{data_dirs}"),
                    "LUT_FISH_XDG_DATA_DIR=/lut/fish".to_string(),
                ]
            };
            // The profile's config dir is passed on; lut's data dir goes first in its data dirs.
            let set = super::super::ProfileEnv::from([
                ("XDG_CONFIG_HOME".to_string(), Some("/tmp/xdg".to_string())),
                ("XDG_DATA_DIRS".to_string(), Some("/opt/share".to_string())),
            ]);
            let args = launch(&set);
            assert!(args.contains(&"XDG_CONFIG_HOME=/tmp/xdg".to_string()));
            assert!(args.ends_with(&[
                lut_vars("/opt/share")[0].clone(),
                lut_vars("/opt/share")[1].clone(),
                "fish_features=no-mark-prompt".to_string(),
                "/usr/bin/fish".to_string(),
                "-i".to_string(),
                "-C".to_string(),
                super::super::FISH_REINSTALL_PROMPT.to_string(),
            ]));
            // A profile that removes the data dirs gets the default list after lut's.
            let removed = super::super::ProfileEnv::from([("XDG_DATA_DIRS".to_string(), None)]);
            let args = launch(&removed);
            let defaults = lut_vars("/usr/local/share:/usr/share");
            assert!(args.windows(2).any(|pair| pair == defaults));
        }

        #[test]
        fn builds_wsl_other_shell_without_integration() {
            let spec = build_wsl_launch_spec(
                None,
                "Ubuntu",
                &login("/usr/bin/nu", ShellKind::Other),
                WslShellIntegration::None,
                &no_env(),
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

        /// The part after `--exec` for `program` started with the user's `args`.
        fn wsl_program_args(
            path: &str,
            args: &[&str],
            load_user_profile: bool,
            integration: WslShellIntegration,
        ) -> Vec<String> {
            let args: Vec<String> = args.iter().map(|arg| arg.to_string()).collect();
            let program = WslProgram {
                path,
                kind: ShellKind::classify(path),
                args: &args,
                load_user_profile,
            };
            build_wsl_launch_spec(None, "Ubuntu", &program, integration, &no_env()).args[5..]
                .to_vec()
        }

        #[test]
        fn a_wsl_profiles_covered_flags_keep_the_integration() {
            let zsh = WslShellIntegration::Zsh {
                zdotdir: "/lut/zsh".into(),
                user_zdotdir: None,
            };
            assert_eq!(
                wsl_program_args("/usr/bin/zsh", &["-l", "-i"], true, zsh),
                ["env", "ZDOTDIR=/lut/zsh", "/usr/bin/zsh", "-l", "-i"]
            );
            // bash's rcfile runs the login files itself, so `-l` is not passed on.
            let bash = WslShellIntegration::Bash {
                rcfile: "/lut/bashrc".into(),
            };
            assert_eq!(
                wsl_program_args("/bin/bash", &["-l"], true, bash),
                ["/bin/bash", "--rcfile", "/lut/bashrc", "-i"]
            );
            assert_eq!(
                wsl_program_args(
                    "/usr/bin/fish",
                    &["--login"],
                    true,
                    WslShellIntegration::Fish {
                        data_dir: "/lut/fish".into()
                    }
                ),
                [
                    "env",
                    "XDG_DATA_DIRS=/lut/fish:/usr/local/share:/usr/share",
                    "LUT_FISH_XDG_DATA_DIR=/lut/fish",
                    "fish_features=no-mark-prompt",
                    "/usr/bin/fish",
                    "-l",
                    "-i",
                    "-C",
                    super::super::FISH_REINSTALL_PROMPT
                ]
            );
        }

        #[test]
        fn a_wsl_profiles_other_arguments_are_passed_as_they_are() {
            assert_eq!(
                wsl_program_args(
                    "/bin/bash",
                    &["-c", "htop"],
                    true,
                    WslShellIntegration::None
                ),
                ["/bin/bash", "-c", "htop"]
            );
            assert_eq!(
                wsl_program_args(
                    "/usr/bin/htop",
                    &["-d", "10"],
                    true,
                    WslShellIntegration::None
                ),
                ["/usr/bin/htop", "-d", "10"]
            );
        }

        #[test]
        fn a_wsl_pwsh_can_skip_the_users_profile() {
            assert_eq!(
                wsl_program_args("/usr/bin/pwsh", &[], false, WslShellIntegration::None),
                ["/usr/bin/pwsh", "-NoProfile"]
            );
            assert_eq!(
                wsl_program_args(
                    "/usr/bin/pwsh",
                    &["-NoLogo"],
                    false,
                    WslShellIntegration::None
                ),
                ["/usr/bin/pwsh", "-NoProfile", "-NoLogo"]
            );
            assert_eq!(
                wsl_program_args("/usr/bin/pwsh", &[], true, WslShellIntegration::None),
                ["/usr/bin/pwsh"]
            );
        }

        #[test]
        fn the_wsl_program_lookup_sees_the_profiles_variables() {
            let script = r#"command -v "$1" || true"#;
            assert_eq!(
                wsl_program_probe("fish", &no_env()),
                (
                    "/bin/sh".to_string(),
                    ["-c", script, "sh", "fish"].map(String::from).to_vec()
                )
            );
            let env = super::super::ProfileEnv::from([
                ("PATH".to_string(), Some("/opt/bin:/usr/bin".to_string())),
                ("PAGER".to_string(), None),
            ]);
            assert_eq!(
                wsl_program_probe("fish", &env),
                (
                    "env".to_string(),
                    [
                        "-u",
                        "PAGER",
                        "--",
                        "PATH=/opt/bin:/usr/bin",
                        "/bin/sh",
                        "-c",
                        script,
                        "sh",
                        "fish"
                    ]
                    .map(String::from)
                    .to_vec()
                )
            );
        }

        #[test]
        fn a_wsl_failure_names_a_missing_distro() {
            use super::super::LaunchError;
            use crate::modules::workspace::RegisteredDistro;
            let installed = || {
                Ok(vec![RegisteredDistro {
                    name: "Ubuntu".into(),
                    default: true,
                }])
            };
            assert_eq!(
                classify_wsl_failure("Debian", "wsl failed".into(), installed()),
                LaunchError::DistroNotInstalled {
                    distro: Some("Debian".into())
                }
            );
            // `wsl.exe` matches names in any case: the distro is there, so the failure is another.
            assert_eq!(
                classify_wsl_failure("ubuntu", "wsl failed".into(), installed()),
                LaunchError::SpawnFailed {
                    reason: "wsl failed".into()
                }
            );
            // The last distro was removed: none registered.
            assert_eq!(
                classify_wsl_failure("Debian", "wsl failed".into(), Ok(Vec::new())),
                LaunchError::DistroNotInstalled {
                    distro: Some("Debian".into())
                }
            );
            // The registry could not be read: `wsl.exe`'s own text.
            assert_eq!(
                classify_wsl_failure("Debian", "wsl failed".into(), Err("no list".into())),
                LaunchError::SpawnFailed {
                    reason: "wsl failed".into()
                }
            );
        }

        #[test]
        fn the_default_distro_is_the_marked_one_else_the_first_else_none() {
            use super::super::LaunchError;
            use crate::modules::workspace::RegisteredDistro;
            let distro = |name: &str, default: bool| RegisteredDistro {
                name: name.into(),
                default,
            };
            assert_eq!(
                pick_default_distro(&[distro("Ubuntu", false), distro("Debian", true)]),
                Ok("Debian".to_string())
            );
            assert_eq!(
                pick_default_distro(&[distro("Ubuntu", false)]),
                Ok("Ubuntu".to_string())
            );
            assert_eq!(
                pick_default_distro(&[]),
                Err(LaunchError::DistroNotInstalled { distro: None })
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
        apply_common, bare_args, cmd_prompt, find_in_dirs, integrated_args, is_shell,
        parse_etc_shells, resolve_program, unique_shell_paths, uses_integration, LaunchError,
        ProfileEnv, ShellControlEnv, ShellKind, FISH_REINSTALL_PROMPT,
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
    fn launch_errors_serialize_with_a_code_and_a_message() {
        let cases = [
            (
                LaunchError::ExecutableNotFound {
                    program: "fish".into(),
                },
                serde_json::json!({
                    "code": "executableNotFound",
                    "program": "fish",
                    "message": "executable not found: fish"
                }),
            ),
            (
                LaunchError::CwdUnavailable {
                    cwd: r"D:\gone".into(),
                    reason: "cwd not accessible".into(),
                },
                serde_json::json!({
                    "code": "cwdUnavailable",
                    "cwd": r"D:\gone",
                    "reason": "cwd not accessible",
                    "message": r"directory not available: D:\gone (cwd not accessible)"
                }),
            ),
            (
                LaunchError::DistroNotInstalled {
                    distro: Some("Debian".into()),
                },
                serde_json::json!({
                    "code": "distroNotInstalled",
                    "distro": "Debian",
                    "message": "WSL distro Debian is not installed"
                }),
            ),
            (
                LaunchError::DistroNotInstalled { distro: None },
                serde_json::json!({
                    "code": "distroNotInstalled",
                    "distro": null,
                    "message": "no WSL distro is installed"
                }),
            ),
            (
                LaunchError::ProfileNotFound { id: "gone".into() },
                serde_json::json!({
                    "code": "profileNotFound",
                    "id": "gone",
                    "message": "terminal profile not found: gone"
                }),
            ),
            (
                LaunchError::spawn_failed("openpty failed"),
                serde_json::json!({
                    "code": "spawnFailed",
                    "reason": "openpty failed",
                    "message": "openpty failed"
                }),
            ),
        ];
        for (error, json) in cases {
            assert_eq!(serde_json::to_value(&error).unwrap(), json);
        }
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

    /// An empty file the PATH search accepts (with an execute bit on Unix).
    fn executable(path: &std::path::Path) {
        std::fs::write(path, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    #[test]
    fn a_bare_name_is_found_in_the_path_dirs() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        executable(&second.path().join("nu"));
        executable(&second.path().join("nu.cmd"));
        executable(&first.path().join("nu.exe"));
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
    fn relative_path_dirs_are_skipped() {
        // Tests run in the crate root, which holds Cargo.toml.
        assert!(std::path::Path::new("Cargo.toml").is_file());
        for dir in [".", "./", ""] {
            assert_eq!(
                find_in_dirs("Cargo.toml", [PathBuf::from(dir)], ""),
                None,
                "{dir:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_file_without_an_execute_bit_does_not_hide_a_later_executable() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        std::fs::write(first.path().join("nu"), "").unwrap();
        executable(&second.path().join("nu"));
        assert_eq!(
            find_in_dirs(
                "nu",
                [first.path().to_path_buf(), second.path().to_path_buf()],
                ""
            ),
            Some(second.path().join("nu"))
        );
    }

    #[test]
    fn shells_are_told_from_other_programs() {
        for program in [
            r"C:\Windows\System32\cmd.exe",
            r"C:\Program Files\nu\bin\nu.exe",
            "/bin/sh",
            "/usr/bin/dash",
            "/usr/local/bin/xonsh",
            "Pwsh.EXE",
        ] {
            assert!(is_shell(program), "{program}");
        }
        for program in [r"C:\tools\nvim.exe", "/usr/bin/python3", "htop", "shell"] {
            assert!(!is_shell(program), "{program}");
        }
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
            &strings(&["-nologo", "-noprofile"]),
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
                    Some(r"C:\cache\profile.ps1"),
                    true
                ),
                expected
            );
        }
        // Without lut's profile, PowerShell starts as the user asked.
        assert_eq!(
            integrated_args(ShellKind::Pwsh, &strings(&["-NoLogo"]), None, true),
            strings(&["-NoLogo"])
        );
    }

    #[test]
    fn pwsh_can_skip_the_users_profile_and_still_run_luts() {
        let expected = strings(&[
            "-NoLogo",
            "-NoProfile",
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            r"C:\cache\profile.ps1",
        ]);
        let file = Some(r"C:\cache\profile.ps1");
        // The profile option, or -NoProfile among the arguments, in any case.
        for (user, load_user_profile) in [
            (&[][..], false),
            (&["-NoProfile"][..], true),
            (&["-noprofile", "-NoLogo"][..], true),
            (&["-NoProfile"][..], false),
        ] {
            assert_eq!(
                integrated_args(ShellKind::Pwsh, &strings(user), file, load_user_profile),
                expected,
                "{user:?} {load_user_profile}"
            );
        }
        // Without lut's profile it is still skipped.
        assert_eq!(
            integrated_args(ShellKind::Pwsh, &[], None, false),
            strings(&["-NoProfile"])
        );
    }

    #[test]
    fn a_bare_pwsh_skips_the_users_profile_before_its_own_arguments() {
        // Everything after -Command goes to the command: -NoProfile must come first.
        assert_eq!(
            bare_args(ShellKind::Pwsh, &strings(&["-Command", "Get-Date"]), false),
            strings(&["-NoProfile", "-Command", "Get-Date"])
        );
        // A -NoProfile after -File is the script's argument: the host still gets its own.
        assert_eq!(
            bare_args(
                ShellKind::Pwsh,
                &strings(&["-File", "task.ps1", "-NoProfile"]),
                false
            ),
            strings(&["-NoProfile", "-File", "task.ps1", "-NoProfile"])
        );
        assert_eq!(
            bare_args(ShellKind::Pwsh, &strings(&["-c", "x"]), true),
            strings(&["-c", "x"])
        );
        // Other programs ignore the option.
        for kind in [ShellKind::Bash, ShellKind::Cmd, ShellKind::Other] {
            assert_eq!(
                bare_args(kind, &strings(&["-c", "x"]), false),
                strings(&["-c", "x"]),
                "{kind:?}"
            );
        }
    }

    #[test]
    fn bash_runs_lut_rcfile_which_does_the_login() {
        for user in [&[][..], &["-l"][..], &["--login", "-i"][..]] {
            assert_eq!(
                integrated_args(ShellKind::Bash, &strings(user), Some("/cache/bashrc"), true),
                strings(&["--rcfile", "/cache/bashrc", "-i"]),
                "{user:?}"
            );
        }
        assert_eq!(
            integrated_args(ShellKind::Bash, &[], None, true),
            strings(&["-i"])
        );
    }

    #[test]
    fn zsh_is_a_login_shell_and_keeps_an_asked_interactive_flag() {
        assert_eq!(
            integrated_args(ShellKind::Zsh, &[], None, true),
            strings(&["-l"])
        );
        assert_eq!(
            integrated_args(ShellKind::Zsh, &strings(&["--login", "-i"]), None, true),
            strings(&["-l", "-i"])
        );
    }

    #[test]
    fn fish_reinstalls_lut_prompt_last_and_keeps_an_asked_login() {
        assert_eq!(
            integrated_args(ShellKind::Fish, &[], None, true),
            strings(&["-i", "-C", FISH_REINSTALL_PROMPT])
        );
        assert_eq!(
            integrated_args(ShellKind::Fish, &strings(&["--login"]), None, true),
            strings(&["-l", "-i", "-C", FISH_REINSTALL_PROMPT])
        );
    }

    #[test]
    fn cmd_keeps_its_arguments() {
        assert_eq!(
            integrated_args(ShellKind::Cmd, &strings(&["/k", "init.bat"]), None, true),
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
        apply_common(&mut command, None, Some(&control), &ProfileEnv::new());

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
        apply_common(&mut command, None, Some(&control), &ProfileEnv::new());
        std::env::remove_var("TERAX_E02_09_INHERITED_PROBE");

        let terax: Vec<_> = command
            .iter_full_env_as_str()
            .map(|(key, _)| key)
            .filter(|key| key.starts_with("TERAX_"))
            .collect();
        assert!(terax.is_empty(), "{terax:?}");
        assert_eq!(command.get_env("LUT_TERMINAL"), Some(OsStr::new("1")));
    }

    fn control(pane_id: u32) -> ShellControlEnv {
        ShellControlEnv {
            address: "127.0.0.1:1234".into(),
            token: "secret".into(),
            pane_id,
            cli_path: Some("/app/lut-cli".into()),
            cli_bin_dir: Some(PathBuf::from("/app/bin")),
        }
    }

    #[test]
    fn the_profile_sets_and_removes_variables_over_the_inherited_and_luts_defaults() {
        // Unique names, so setting them cannot disturb tests running in parallel.
        std::env::set_var("E14_09_OVERRIDDEN", "inherited");
        std::env::set_var("E14_09_REMOVED", "inherited");
        let mut command = CommandBuilder::new("shell");
        let env = ProfileEnv::from([
            ("E14_09_OVERRIDDEN".to_string(), Some("profile".to_string())),
            ("E14_09_REMOVED".to_string(), None),
            ("TERM".to_string(), Some("xterm".to_string())),
            ("EDITOR".to_string(), Some("nvim".to_string())),
        ]);
        apply_common(&mut command, None, Some(&control(7)), &env);
        std::env::remove_var("E14_09_OVERRIDDEN");
        std::env::remove_var("E14_09_REMOVED");

        assert_eq!(
            command.get_env("E14_09_OVERRIDDEN"),
            Some(OsStr::new("profile"))
        );
        assert_eq!(command.get_env("E14_09_REMOVED"), None);
        assert_eq!(command.get_env("EDITOR"), Some(OsStr::new("nvim")));
        assert_eq!(command.get_env("TERM"), Some(OsStr::new("xterm")));
    }

    #[test]
    fn luts_own_variables_win_over_the_profile() {
        // Saving a profile rejects these names; the launch still never lets them through.
        let mut command = CommandBuilder::new("shell");
        let env = ProfileEnv::from([
            ("LUT_PANE_ID".to_string(), Some("1".to_string())),
            ("LUT_TERMINAL".to_string(), None),
        ]);
        apply_common(&mut command, None, Some(&control(42)), &env);
        assert_eq!(command.get_env("LUT_PANE_ID"), Some(OsStr::new("42")));
        assert_eq!(command.get_env("LUT_TERMINAL"), Some(OsStr::new("1")));
    }

    #[test]
    fn the_cli_folder_goes_in_front_of_the_profiles_path() {
        let profile_path = std::env::join_paths(["/opt/tools", "/usr/bin"]).unwrap();
        let mut command = CommandBuilder::new("shell");
        let env = ProfileEnv::from([(
            "PATH".to_string(),
            Some(profile_path.to_string_lossy().into_owned()),
        )]);
        apply_common(&mut command, None, Some(&control(1)), &env);
        let path: Vec<PathBuf> = std::env::split_paths(command.get_env("PATH").unwrap()).collect();
        assert_eq!(
            path,
            [
                PathBuf::from("/app/bin"),
                PathBuf::from("/opt/tools"),
                PathBuf::from("/usr/bin")
            ]
        );
        // A removed PATH leaves only the CLI folder.
        let mut command = CommandBuilder::new("shell");
        let env = ProfileEnv::from([("PATH".to_string(), None)]);
        apply_common(&mut command, None, Some(&control(1)), &env);
        assert_eq!(command.get_env("PATH"), Some(OsStr::new("/app/bin")));
    }

    #[test]
    fn a_locale_the_profile_sets_or_removes_is_kept() {
        for (name, value) in [("LANG", Some("C")), ("LANG", None), ("LC_ALL", Some("C"))] {
            let mut command = CommandBuilder::new("shell");
            command.env_remove("LC_ALL");
            command.env_remove("LC_CTYPE");
            command.env_remove("LANG");
            let env = ProfileEnv::from([(name.to_string(), value.map(String::from))]);
            apply_common(&mut command, None, None, &env);
            assert_eq!(
                command.get_env(name).and_then(|v| v.to_str()),
                value,
                "{name}={value:?}"
            );
            if name != "LANG" {
                assert_eq!(command.get_env("LANG"), None, "{name}={value:?}");
            }
        }
        // Without one, the fallback still applies.
        let mut command = CommandBuilder::new("shell");
        command.env_remove("LC_ALL");
        command.env_remove("LC_CTYPE");
        command.env_remove("LANG");
        apply_common(&mut command, None, None, &ProfileEnv::new());
        assert!(command.get_env("LANG").is_some());
    }

    #[test]
    fn a_utf8_locale_from_the_profile_needs_no_fallback() {
        let mut command = CommandBuilder::new("shell");
        command.env_remove("LC_ALL");
        command.env_remove("LC_CTYPE");
        let env = ProfileEnv::from([("LANG".to_string(), Some("de_DE.UTF-8".to_string()))]);
        apply_common(&mut command, None, None, &env);
        assert_eq!(command.get_env("LANG"), Some(OsStr::new("de_DE.UTF-8")));
    }
}
