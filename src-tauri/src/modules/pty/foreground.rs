//! What runs under a terminal's shell.
//!
//! "Does the shell have child processes?" without forking `pgrep`: the close-tab guard asks this on
//! the main thread, so it must be a cheap kernel query: `proc_listchildpids` on macOS,
//! `/proc/<pid>/task/*/children` on Linux (with a `/proc/*/stat` parent scan for kernels built
//! without `CONFIG_PROC_CHILDREN`), and the existing ToolHelp snapshot on Windows.
//!
//! "Which programs run under the shell?" names every process below it, off the main thread: the
//! same snapshot on Windows, `/proc` on Linux, `proc_listchildpids` and `proc_name` on macOS.

use std::collections::{BTreeSet, HashSet};

use super::program_name::program_name;

#[cfg(target_os = "macos")]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    // One slot is enough: only existence matters, and the kernel fills what
    // fits and reports the count it wrote.
    let mut child: libc::pid_t = 0;
    let listed = unsafe {
        libc::proc_listchildpids(
            shell_pid as libc::pid_t,
            (&mut child as *mut libc::pid_t).cast(),
            std::mem::size_of::<libc::pid_t>() as libc::c_int,
        )
    };
    listed > 0
}

#[cfg(target_os = "linux")]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    use std::fs;
    let tasks = format!("/proc/{shell_pid}/task");
    let mut readable = false;
    if let Ok(entries) = fs::read_dir(&tasks) {
        for task in entries.flatten() {
            match fs::read_to_string(task.path().join("children")) {
                Ok(children) => {
                    readable = true;
                    if children_listed(&children) {
                        return true;
                    }
                }
                Err(_) => continue,
            }
        }
    }
    if readable {
        return false;
    }
    // No `children` files (CONFIG_PROC_CHILDREN is off): scan parents.
    fs::read_dir("/proc").is_ok_and(|entries| {
        entries.flatten().any(|entry| {
            entry.file_name().to_str().is_some_and(|name| {
                name.bytes().all(|b| b.is_ascii_digit())
                    && fs::read_to_string(entry.path().join("stat"))
                        .ok()
                        .and_then(|stat| stat_parent(&stat))
                        == Some(shell_pid)
            })
        })
    })
}

/// A `children` file lists space-separated pids; empty means none.
#[cfg(any(target_os = "linux", test))]
fn children_listed(contents: &str) -> bool {
    contents.split_whitespace().next().is_some()
}

/// Parent pid from `/proc/<pid>/stat`: `pid (comm) state ppid ...` where
/// `comm` may itself contain spaces and parentheses, so anchor on the last `)`.
#[cfg(any(target_os = "linux", test))]
fn stat_parent(stat: &str) -> Option<u32> {
    let after = &stat[stat.rfind(')')? + 1..];
    after.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    // pgrep -P exits 0 when shell_pid has at least one child, 1 when none.
    std::process::Command::new("pgrep")
        .args(["-P", &shell_pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(windows)]
pub(super) fn shell_has_children(shell_pid: u32, git_bash_launcher: bool) -> bool {
    has_children(&snapshot(), shell_pid, git_bash_launcher)
}

/// Every process on the machine, from one ToolHelp snapshot.
#[cfg(windows)]
fn snapshot() -> Vec<Process> {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };
    let mut processes = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return processes;
        }
        let mut entry: PROCESSENTRY32 = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32>() as u32;
        if Process32First(snapshot, &mut entry) != 0 {
            loop {
                let name: Vec<u8> = entry
                    .szExeFile
                    .iter()
                    .take_while(|&&c| c != 0)
                    .map(|&c| c as u8)
                    .collect();
                processes.push(Process {
                    pid: entry.th32ProcessID,
                    parent: entry.th32ParentProcessID,
                    name: String::from_utf8_lossy(&name).into_owned(),
                });
                if Process32Next(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
    processes
}

/// Every process on the machine, from `/proc`.
#[cfg(target_os = "linux")]
fn snapshot() -> Vec<Process> {
    use std::fs;
    let Ok(entries) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let pid = entry.file_name().to_str()?.parse().ok()?;
            let stat = fs::read_to_string(entry.path().join("stat")).ok()?;
            // The executable's file; `comm` is cut at 15 bytes, so it stands in only when the
            // link cannot be read (another user's process).
            let name = fs::read_link(entry.path().join("exe"))
                .ok()
                .and_then(|path| Some(exe_name(path.file_name()?.to_str()?).to_owned()))
                .or_else(|| stat_comm(&stat).map(str::to_owned))?;
            Some(Process {
                pid,
                parent: stat_parent(&stat)?,
                name,
            })
        })
        .collect()
}

/// An `exe` link's file name, without the mark of an executable replaced while it runs.
#[cfg(any(target_os = "linux", test))]
fn exe_name(file_name: &str) -> &str {
    file_name.strip_suffix(" (deleted)").unwrap_or(file_name)
}

/// The command name in `/proc/<pid>/stat`: between the first `(` and the last `)`.
#[cfg(any(target_os = "linux", test))]
fn stat_comm(stat: &str) -> Option<&str> {
    stat.get(stat.find('(')? + 1..stat.rfind(')')?)
}

/// Every process on the machine, from `ps`: other Unixes have no cheaper portable listing.
#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
fn snapshot() -> Vec<Process> {
    std::process::Command::new("ps")
        .args(["-A", "-o", "pid=", "-o", "ppid=", "-o", "comm="])
        .output()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .filter_map(ps_line)
                .collect()
        })
        .unwrap_or_default()
}

/// One `ps -o pid= -o ppid= -o comm=` line; the command name may hold spaces.
#[cfg(any(all(unix, not(any(target_os = "macos", target_os = "linux"))), test))]
fn ps_line(line: &str) -> Option<Process> {
    let (pid, rest) = line.trim_start().split_once(char::is_whitespace)?;
    let (parent, name) = rest.trim_start().split_once(char::is_whitespace)?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    Some(Process {
        pid: pid.parse().ok()?,
        parent: parent.parse().ok()?,
        name: name.to_owned(),
    })
}

/// The programs running under the shell `shell_pid`, by `program_name`, each once.
#[cfg(target_os = "macos")]
pub(super) fn running_programs(shell_pid: u32, git_bash_launcher: bool) -> Vec<String> {
    programs_below(children_of, shell_pid, git_bash_launcher)
}

/// The programs running under the shell `shell_pid`, by `program_name`, each once.
#[cfg(not(target_os = "macos"))]
pub(super) fn running_programs(shell_pid: u32, git_bash_launcher: bool) -> Vec<String> {
    let processes = snapshot();
    programs_below(
        |pid| children_in(&processes, pid),
        shell_pid,
        git_bash_launcher,
    )
}

/// `pid`'s children, asked of the kernel.
#[cfg(target_os = "macos")]
fn children_of(pid: u32) -> Vec<Process> {
    // The kernel fills what fits and reports the count it wrote.
    let mut pids = vec![0 as libc::pid_t; 256];
    let listed = unsafe {
        libc::proc_listchildpids(
            pid as libc::pid_t,
            pids.as_mut_ptr().cast(),
            (pids.len() * std::mem::size_of::<libc::pid_t>()) as libc::c_int,
        )
    };
    pids.truncate(listed.max(0) as usize);
    pids.into_iter()
        .filter(|&child| child > 0)
        .map(|child| Process {
            pid: child as u32,
            parent: pid,
            name: proc_name(child),
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn proc_name(pid: libc::pid_t) -> String {
    let mut buffer = [0u8; 256];
    let len = unsafe { libc::proc_name(pid, buffer.as_mut_ptr().cast(), buffer.len() as u32) };
    String::from_utf8_lossy(&buffer[..len.max(0) as usize]).into_owned()
}

#[derive(Clone)]
struct Process {
    pid: u32,
    parent: u32,
    /// The executable's file name.
    name: String,
}

/// `pid`'s children in a process snapshot.
#[cfg(any(not(target_os = "macos"), test))]
fn children_in(processes: &[Process], pid: u32) -> Vec<Process> {
    processes
        .iter()
        .filter(|p| p.parent == pid)
        .cloned()
        .collect()
}

/// Git for Windows' shells: under its launcher, one of these alone in the chain is the shell itself.
const MSYS_SHELLS: [&str; 4] = ["bash", "zsh", "fish", "sh"];
/// Bounds the walk down the launcher's chain: a reused pid can make parent links loop.
const MAX_CHAIN: usize = 8;
/// Bounds the walk below the shell, loops included.
const MAX_PROGRAMS: usize = 256;

/// What the shell itself started.
///
/// Git for Windows' `bin\bash.exe` is a launcher whose child is the real bash
/// (`usr\bin\bash.exe`), and MSYS emulates `exec` by running the new program as a child the old
/// one waits for: an rc file's `exec zsh` leaves bash with zsh as its only child. So under the
/// launcher, a lone shell child stands in for its parent, and what runs below the last one counts.
///
/// Limits, as the snapshot has no command lines: a shell busy only with builtins (a `while` loop)
/// starts no child and reads as idle, at the top as in any shell this checks; and under the
/// launcher, an idle shell started by hand (typing `zsh`) reads as idle too.
fn started_by_shell(
    children: impl Fn(u32) -> Vec<Process>,
    shell: u32,
    git_bash_launcher: bool,
) -> Vec<Process> {
    let mut below = children(shell);
    if !git_bash_launcher {
        return below;
    }
    for _ in 0..MAX_CHAIN {
        match below.as_slice() {
            [only] if MSYS_SHELLS.contains(&program_name(&only.name).as_str()) => {
                below = children(only.pid);
            }
            _ => break,
        }
    }
    below
}

/// Whether `shell` has a child in a process snapshot.
#[cfg(any(windows, test))]
fn has_children(processes: &[Process], shell: u32, git_bash_launcher: bool) -> bool {
    !started_by_shell(|pid| children_in(processes, pid), shell, git_bash_launcher).is_empty()
}

/// What the shell started and everything below it, by `program_name`, each once and in order.
fn programs_below(
    children: impl Fn(u32) -> Vec<Process>,
    shell: u32,
    git_bash_launcher: bool,
) -> Vec<String> {
    let mut pending = started_by_shell(&children, shell, git_bash_launcher);
    let mut seen = HashSet::from([shell]);
    let mut names = BTreeSet::new();
    while let Some(process) = pending.pop() {
        if seen.len() > MAX_PROGRAMS {
            break;
        }
        if !seen.insert(process.pid) {
            continue;
        }
        names.insert(program_name(&process.name));
        pending.extend(children(process.pid));
    }
    names.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn children_files_list_pids_or_nothing() {
        assert!(!children_listed(""));
        assert!(!children_listed("  \n"));
        assert!(children_listed("1234 "));
        assert!(children_listed("1 2 3\n"));
    }

    fn process(pid: u32, parent: u32, name: &str) -> Process {
        Process {
            pid,
            parent,
            name: name.into(),
        }
    }

    #[test]
    fn a_shell_has_children_when_any_process_names_it_as_parent() {
        let processes = [process(10, 1, "pwsh.exe"), process(11, 10, "node.exe")];
        assert!(has_children(&processes, 10, false));
        assert!(!has_children(&processes, 11, false));
    }

    #[test]
    fn git_bash_counts_the_children_of_the_bash_its_launcher_started() {
        // Idle: the launcher's only child is the real bash, which has none.
        let idle = [process(20, 1, "bash.exe"), process(21, 20, "bash.exe")];
        assert!(!has_children(&idle, 20, true));
        // Without the launcher flag the same tree reads as busy, which was the bug.
        assert!(has_children(&idle, 20, false));
        let busy = [
            process(20, 1, "bash.exe"),
            process(21, 20, "BASH.EXE"),
            process(22, 21, "vim.exe"),
        ];
        assert!(has_children(&busy, 20, true));
        // Anything else the launcher itself runs still counts.
        let other = [process(20, 1, "bash.exe"), process(23, 20, "git.exe")];
        assert!(has_children(&other, 20, true));
    }

    #[test]
    fn git_bash_sees_through_an_rc_file_exec_of_another_shell() {
        // `exec zsh` in .bashrc: MSYS leaves bash waiting with zsh as its child.
        let idle = [
            process(20, 1, "bash.exe"),
            process(21, 20, "bash.exe"),
            process(22, 21, "zsh.exe"),
        ];
        assert!(!has_children(&idle, 20, true));
        let busy = [
            process(20, 1, "bash.exe"),
            process(21, 20, "bash.exe"),
            process(22, 21, "zsh.exe"),
            process(23, 22, "node.exe"),
        ];
        assert!(has_children(&busy, 20, true));
        // Two children are never an exec: something besides the shell runs.
        let two = [
            process(20, 1, "bash.exe"),
            process(21, 20, "bash.exe"),
            process(22, 21, "zsh.exe"),
            process(23, 21, "sleep.exe"),
        ];
        assert!(has_children(&two, 20, true));
    }

    #[test]
    fn names_every_program_below_the_shell_once() {
        let processes = [
            process(10, 1, "pwsh.exe"),
            process(11, 10, "git.exe"),
            process(12, 11, "nvim.exe"),
            process(13, 12, "Node.EXE"),
            process(14, 10, "node.exe"),
            process(15, 1, "htop.exe"),
        ];
        let programs = programs_below(|pid| children_in(&processes, pid), 10, false);
        assert_eq!(programs, ["git", "node", "nvim"]);
        assert!(programs_below(|pid| children_in(&processes, pid), 15, false).is_empty());
    }

    #[test]
    fn git_bash_names_what_runs_below_its_shells() {
        let processes = [
            process(20, 1, "bash.exe"),
            process(21, 20, "bash.exe"),
            process(22, 21, "zsh.exe"),
            process(23, 22, "claude.exe"),
        ];
        let programs = programs_below(|pid| children_in(&processes, pid), 20, true);
        assert_eq!(programs, ["claude"]);
        let idle = &processes[..3];
        assert!(programs_below(|pid| children_in(idle, pid), 20, true).is_empty());
    }

    #[test]
    fn a_looping_snapshot_still_ends() {
        // Reused pids: the shell's child names the shell as its own child.
        let looped = [process(40, 41, "vim.exe"), process(41, 40, "less.exe")];
        assert_eq!(
            programs_below(|pid| children_in(&looped, pid), 40, false),
            ["less"]
        );
    }

    #[test]
    fn stat_comm_is_the_name_between_the_outer_parentheses() {
        assert_eq!(stat_comm("42 (zsh) S 7 42"), Some("zsh"));
        assert_eq!(stat_comm("42 (a b) c) S 9 42"), Some("a b) c"));
        assert_eq!(stat_comm("garbage"), None);
    }

    #[test]
    fn exe_names_drop_the_replaced_mark() {
        assert_eq!(exe_name("nvim"), "nvim");
        assert_eq!(exe_name("nvim (deleted)"), "nvim");
    }

    #[test]
    fn ps_lines_keep_names_with_spaces() {
        let line = ps_line("  123   45 My Tool").expect("a process");
        assert_eq!(
            (line.pid, line.parent, line.name.as_str()),
            (123, 45, "My Tool")
        );
        assert!(ps_line("123 45").is_none());
        assert!(ps_line("x 45 vim").is_none());
    }

    #[test]
    fn a_looping_snapshot_still_answers() {
        // Reused pids: each names the other as parent.
        let looped = [process(30, 31, "bash.exe"), process(31, 30, "bash.exe")];
        assert!(has_children(&looped, 30, true));
    }

    #[test]
    fn stat_parent_survives_awkward_command_names() {
        assert_eq!(stat_parent("42 (zsh) S 7 42 42 0 -1"), Some(7));
        assert_eq!(stat_parent("42 (a b) c) S 9 42"), Some(9));
        assert_eq!(stat_parent("42 (x) S"), None);
        assert_eq!(stat_parent("garbage"), None);
    }

    #[cfg(unix)]
    #[test]
    fn detects_real_children_without_forking_a_helper() {
        let me = std::process::id();
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn sleep");
        assert!(shell_has_children(me), "the sleeping child is visible");
        let _ = child.kill();
        let _ = child.wait();
        // A leaf process (the child itself) has none.
        let leaf = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn leaf");
        assert!(!shell_has_children(leaf.id()));
        let mut leaf = leaf;
        let _ = leaf.kill();
        let _ = leaf.wait();
    }

    #[cfg(unix)]
    #[test]
    fn a_missing_process_has_no_children() {
        // PID 0x7fff_fff0 is far above any real pid on supported systems.
        assert!(!shell_has_children(0x7fff_fff0));
    }
}
