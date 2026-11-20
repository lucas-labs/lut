//! "Does the shell have child processes?" without forking `pgrep`.
//!
//! The close-tab guard asks this on the main thread, so it must be a cheap
//! kernel query: `proc_listchildpids` on macOS, `/proc/<pid>/task/*/children`
//! on Linux (with a `/proc/*/stat` parent scan for kernels built without
//! `CONFIG_PROC_CHILDREN`), and the existing ToolHelp snapshot on Windows.

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
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };
    let mut processes = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
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
    has_children(&processes, shell_pid, git_bash_launcher)
}

#[cfg(any(windows, test))]
struct Process {
    pid: u32,
    parent: u32,
    /// The executable's file name.
    name: String,
}

/// Whether `shell` has a child in a process snapshot.
///
/// Git for Windows' `bin\bash.exe` is a launcher whose child is the real bash
/// (`usr\bin\bash.exe`), and MSYS emulates `exec` by running the new program as a child the old
/// one waits for: an rc file's `exec zsh` leaves bash with zsh as its only child. So under the
/// launcher, a lone shell child stands in for its parent, and what runs below the last one counts.
#[cfg(any(windows, test))]
fn has_children(processes: &[Process], shell: u32, git_bash_launcher: bool) -> bool {
    const MSYS_SHELLS: [&str; 4] = ["bash.exe", "zsh.exe", "fish.exe", "sh.exe"];
    // Bounds the walk: a reused pid can make parent links loop.
    const MAX_CHAIN: usize = 8;
    let children = |pid: u32| processes.iter().filter(move |p| p.parent == pid);
    if !git_bash_launcher {
        return children(shell).next().is_some();
    }
    let mut current = shell;
    for _ in 0..MAX_CHAIN {
        let mut below = children(current);
        match (below.next(), below.next()) {
            (None, _) => return false,
            (Some(only), None)
                if MSYS_SHELLS
                    .iter()
                    .any(|name| only.name.eq_ignore_ascii_case(name)) =>
            {
                current = only.pid;
            }
            _ => return true,
        }
    }
    true
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
