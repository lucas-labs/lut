<#
.SYNOPSIS
  Phase 0 performance baseline on Windows (E01-10 to E01-12): drives the real release app from outside.

.DESCRIPTION
  Measures, on a release build:
    - binary sizes (app executable, CLI sidecar, frontend dist);
    - startup: window visible, shell process spawned, window content settled (N runs, clean app data);
    - input latency: keystroke to screen change, from SendInput to the first changed pixels (P50/P95/P99);
    - output throughput: time to print a large file through the shell, and screen updates per second meanwhile;
    - memory (working set, private bytes, GPU dedicated memory) with 1 and 4 panes, after a long output run and after
      closing it; CPU while idle and with a busy hidden tab; tab switch time.
  Results go to a JSON file and a summary on the console. Nothing is optimised or changed in the app.

  The script sends keystrokes to the app window and reads the screen: do not touch the keyboard or mouse while it runs,
  and keep the app window on the primary monitor, unobstructed.

  The app data dirs (%APPDATA% and %LOCALAPPDATA% \<identifier>) are moved aside for the run and restored at the end,
  so every start is from a clean state and the user's data is untouched.

.EXAMPLE
  pwsh scripts/baseline/measure.ps1 -Exe src-tauri/target/release/terax.exe

.EXAMPLE
  pwsh scripts/baseline/measure.ps1 -Exe src-tauri/target/release/terax.exe -MemoryOnly -Out memory.json
#>
param(
  [Parameter(Mandatory)] [string] $Exe,
  [string] $Identifier = 'app.crynta.terax',
  [int] $StartupRuns = 5,
  [int] $LatencySamples = 200,
  [int] $ThroughputMB = 50,
  [string] $Out = 'baseline-results.json',
  # Only the memory steps (start, 1 pane after output, 4 panes, long output, after closing the tab).
  [switch] $MemoryOnly
)

$ErrorActionPreference = 'Stop'
$Exe = (Resolve-Path $Exe).Path
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$work = Join-Path ([IO.Path]::GetTempPath()) 'lut-baseline'
New-Item -ItemType Directory -Force $work | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common, System.Private.Windows.GdiPlus, System.Private.Windows.Core, System.Drawing.Primitives, System.Threading.Thread, System.Threading, System.Collections, System.Runtime.InteropServices -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;

public static class Lab {
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  delegate bool EnumProc(IntPtr h, IntPtr l);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT m; [FieldOffset(0)] public KEYBDINPUT k; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

  public static void Init() { SetProcessDpiAwarenessContext(new IntPtr(-4)); }

  /// The visible top-level window of a process with a real client area (at least 100x100), or zero.
  public static IntPtr MainWindow(int pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      RECT r;
      if (p == pid && IsWindowVisible(h) && GetClientRect(h, out r) && r.R - r.L >= 100 && r.B - r.T >= 100) {
        found = h; return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void Focus(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); // Alt unlocks SetForegroundWindow
    SetForegroundWindow(h);
    Thread.Sleep(150);
  }

  public static Rectangle Client(IntPtr h) {
    RECT r; GetClientRect(h, out r);
    POINT p = new POINT(); ClientToScreen(h, ref p);
    return new Rectangle(p.X, p.Y, r.R - r.L, r.B - r.T);
  }

  public static void Place(IntPtr h, int x, int y, int w, int hgt) { SetWindowPos(h, IntPtr.Zero, x, y, w, hgt, 0x0004 | 0x0010); }

  static INPUT Key(ushort vk, ushort scan, uint flags) {
    INPUT i = new INPUT(); i.type = 1; i.u.k = new KEYBDINPUT { vk = vk, scan = scan, flags = flags }; return i;
  }
  public static void Char(char c) {
    SendInput(2, new[] { Key(0, c, 4), Key(0, c, 4 | 2) }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Text(string s) { foreach (char c in s) { Char(c); Thread.Sleep(2); } }
  /// Virtual-key chord, for example Chord(0x11, 0x10, 0x44) for Ctrl+Shift+D.
  public static void Chord(params ushort[] vks) {
    var list = new System.Collections.Generic.List<INPUT>();
    foreach (var v in vks) list.Add(Key(v, 0, 0));
    for (int i = vks.Length - 1; i >= 0; i--) list.Add(Key(vks[i], 0, 2));
    SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
  }

  public static byte[] Grab(Rectangle r) {
    if (r.Width <= 0 || r.Height <= 0) return new byte[0];
    using (var bmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(r.X, r.Y, 0, 0, r.Size);
      var data = bmp.LockBits(new Rectangle(0, 0, r.Width, r.Height), ImageLockMode.ReadOnly, bmp.PixelFormat);
      var buf = new byte[data.Stride * r.Height];
      Marshal.Copy(data.Scan0, buf, 0, buf.Length);
      bmp.UnlockBits(data);
      return buf;
    }
  }

  public static int Diff(byte[] a, byte[] b) {
    int n = 0;
    for (int i = 0; i + 3 < a.Length && i + 3 < b.Length; i += 4)
      if (a[i] != b[i] || a[i + 1] != b[i + 1] || a[i + 2] != b[i + 2]) n++;
    return n;
  }

  /// Bounding box (in region coordinates) of the pixels that differ.
  public static Rectangle DiffBox(byte[] a, byte[] b, int width) {
    int minX = int.MaxValue, minY = int.MaxValue, maxX = -1, maxY = -1;
    for (int i = 0; i + 3 < a.Length; i += 4) {
      if (a[i] == b[i] && a[i + 1] == b[i + 1] && a[i + 2] == b[i + 2]) continue;
      int px = (i / 4) % width, py = (i / 4) / width;
      if (px < minX) minX = px; if (py < minY) minY = py; if (px > maxX) maxX = px; if (py > maxY) maxY = py;
    }
    return maxX < 0 ? Rectangle.Empty : Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
  }

  /// Sends one character and returns the milliseconds until at least minPixels changed in the region (-1: timeout).
  public static double CharLatency(char c, Rectangle region, int minPixels, int timeoutMs) {
    var before = Grab(region);
    var sw = Stopwatch.StartNew();
    Char(c);
    while (sw.ElapsedMilliseconds < timeoutMs)
      if (Diff(before, Grab(region)) >= minPixels) return sw.Elapsed.TotalMilliseconds;
    return -1;
  }

  /// Sends a chord and returns the milliseconds until at least minPixels changed in the region (-1: timeout).
  public static double ChordLatency(Rectangle region, int minPixels, int timeoutMs, params ushort[] vks) {
    var before = Grab(region);
    var sw = Stopwatch.StartNew();
    Chord(vks);
    while (sw.ElapsedMilliseconds < timeoutMs)
      if (Diff(before, Grab(region)) >= minPixels) return sw.Elapsed.TotalMilliseconds;
    return -1;
  }

  /// Counts how many times the region's content changes per second over durationMs.
  public static double ChangesPerSecond(Rectangle region, int durationMs) {
    var sw = Stopwatch.StartNew();
    var last = Grab(region); int changes = 0;
    while (sw.ElapsedMilliseconds < durationMs) {
      var now = Grab(region);
      if (Diff(last, now) > 0) { changes++; last = now; }
    }
    return changes * 1000.0 / sw.ElapsedMilliseconds;
  }
}
'@
[Lab]::Init()

$VK = @{ Ctrl = 0x11; Shift = 0x10; Alt = 0x12; Tab = 0x09; Enter = 0x0D; Esc = 0x1B; Back = 0x08; D = 0x44; T = 0x54; W = 0x57; Plus = 0xBB; Zero = 0x30 }
$exeName = [IO.Path]::GetFileNameWithoutExtension($Exe)
$results = [ordered]@{
  date = (Get-Date).ToString('s'); machine = $env:COMPUTERNAME
  os = (Get-CimInstance Win32_OperatingSystem).Caption
  cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
  gpu = (Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join '; '
  commit = (git -C $repo rev-parse --short HEAD); exe = $Exe
}

function Write-Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Percentile($values, $p) {
  $s = @($values | Sort-Object); if (-not $s.Count) { return $null }
  $s[[math]::Min($s.Count - 1, [math]::Ceiling($p / 100 * $s.Count) - 1)]
}
function Stats($values) {
  $v = @($values | Where-Object { $_ -ge 0 })
  [ordered]@{
    n = $v.Count; timeouts = @($values).Count - $v.Count
    min = [math]::Round(($v | Measure-Object -Minimum).Minimum, 1)
    p50 = [math]::Round((Percentile $v 50), 1); p95 = [math]::Round((Percentile $v 95), 1)
    p99 = [math]::Round((Percentile $v 99), 1); max = [math]::Round(($v | Measure-Object -Maximum).Maximum, 1)
  }
}

# Every process started by the app: WebView2, shells, conhost/OpenConsole.
function Get-Tree([int] $rootPid) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name
  $ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($rootPid)
  do {
    $added = 0
    foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added++ } }
  } while ($added)
  $all | Where-Object { $ids.Contains([int]$_.ProcessId) }
}

# Memory of the app and every process it started. The headline value is the private working set, the "Memory" column
# of Task Manager; summing plain working sets would count shared DLL pages once per process.
function Get-Memory([int] $rootPid) {
  $tree = Get-Tree $rootPid
  $ids = [System.Collections.Generic.HashSet[int]]::new(); foreach ($t in $tree) { [void]$ids.Add([int]$t.ProcessId) }
  $rows = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Property IDProcess, Name, WorkingSetPrivate |
    Where-Object { $ids.Contains([int]$_.IDProcess) }
  $gpu = 0
  try {
    $samples = (Get-Counter '\GPU Process Memory(*)\Dedicated Usage' -ErrorAction Stop).CounterSamples
    foreach ($s in $samples) { if ($s.InstanceName -match '^pid_(\d+)_' -and $ids.Contains([int]$Matches[1])) { $gpu += $s.CookedValue } }
  } catch { $gpu = $null }
  # Perf-counter instance names look like "msedgewebview2#3".
  $group = { param($pattern) [math]::Round((($rows | Where-Object { ($_.Name -replace '#\d+$', '') -match $pattern } |
          Measure-Object WorkingSetPrivate -Sum).Sum) / 1MB, 1) }
  [ordered]@{
    processes = @($rows).Count
    shells = @($tree | Where-Object Name -match '^(pwsh|powershell|cmd|bash|wsl)\.exe$').Count
    privateWorkingSetMB = [math]::Round(($rows | Measure-Object WorkingSetPrivate -Sum).Sum / 1MB, 1)
    appMB = & $group "^$exeName$"
    webviewMB = & $group '^msedgewebview2$'
    shellsMB = & $group '^(pwsh|powershell|cmd|bash|wsl|conhost|OpenConsole)$'
    gpuDedicatedMB = if ($null -ne $gpu) { [math]::Round($gpu / 1MB, 1) } else { $null }
  }
}

function Get-CpuPercent([int] $rootPid, [int] $seconds) {
  $cpu = { (Get-Tree $rootPid | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum }
  $a = & $cpu; $sw = [Diagnostics.Stopwatch]::StartNew(); Start-Sleep -Seconds $seconds; $b = & $cpu
  # Percent of one logical core.
  [math]::Round(($b - $a) / $sw.Elapsed.TotalMilliseconds * 100, 2)
}

function Stop-App { Get-Process $exeName -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Milliseconds 800 }

function Start-App {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $proc = Start-Process -FilePath $Exe -PassThru
  $r = [ordered]@{ pid = $proc.Id }
  while (($h = [Lab]::MainWindow($proc.Id)) -eq [IntPtr]::Zero) {
    if ($sw.ElapsedMilliseconds -gt 30000) { throw 'window did not appear in 30 s' }; Start-Sleep -Milliseconds 5
  }
  $r.windowVisibleMs = $sw.ElapsedMilliseconds
  while (-not (Get-Tree $proc.Id | Where-Object Name -match '^(pwsh|powershell|cmd|bash)\.exe$')) {
    if ($sw.ElapsedMilliseconds -gt 30000) { throw 'no shell process in 30 s' }; Start-Sleep -Milliseconds 20
  }
  $r.shellSpawnedMs = $sw.ElapsedMilliseconds
  # Settled: no change bigger than a cursor cell for 1 s. The client area can be empty right after the window shows.
  while (($rect = [Lab]::Client($h)).Width -le 0 -or $rect.Height -le 0) {
    if ($sw.ElapsedMilliseconds -gt 30000) { throw 'window has no client area after 30 s' }; Start-Sleep -Milliseconds 10
  }
  $last = [Lab]::Grab($rect); $lastChange = $sw.ElapsedMilliseconds
  while ($sw.ElapsedMilliseconds - $lastChange -lt 1000 -and $sw.ElapsedMilliseconds -lt 30000) {
    $rect = [Lab]::Client($h)
    $now = [Lab]::Grab($rect)
    if ($now.Length -ne $last.Length) { $lastChange = $sw.ElapsedMilliseconds; $last = $now; continue }
    if ([Lab]::Diff($last, $now) -gt 300) { $lastChange = $sw.ElapsedMilliseconds; $last = $now }
    Start-Sleep -Milliseconds 10
  }
  $r.settledMs = $lastChange
  $r.handle = $h
  $r
}

# Terminal area: the client rect minus a margin for the header and the status bar.
function Get-TermRect($h) {
  $c = [Lab]::Client($h)
  [Drawing.Rectangle]::new($c.X + 60, $c.Y + 80, [math]::Max(200, $c.Width - 120), [math]::Max(120, $c.Height - 160))
}

function Invoke-Command-InTerminal($h, [string] $command) {
  [Lab]::Focus($h); [Lab]::Text($command); [Lab]::Chord($VK.Enter)
}

function Wait-File([string] $path, [int] $timeoutSec) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-Path $path) -and $sw.Elapsed.TotalSeconds -lt $timeoutSec) { Start-Sleep -Milliseconds 100 }
  Start-Sleep -Milliseconds 200
  if (Test-Path $path) { (Get-Content $path -Raw).Trim() } else { $null }
}

# --- App data aside ---------------------------------------------------------------------------------------------
$dataDirs = @((Join-Path $env:APPDATA $Identifier), (Join-Path $env:LOCALAPPDATA $Identifier))
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$moved = @()
Stop-App
try {
  foreach ($d in $dataDirs) { if (Test-Path $d) { $bak = "$d.baseline-$stamp"; Move-Item $d $bak; $moved += , @($d, $bak) } }

  Write-Step 'Binary sizes'
  $sidecar = Get-ChildItem (Join-Path $repo 'src-tauri/binaries') -Filter '*.exe' | Select-Object -First 1
  $dist = Get-ChildItem (Join-Path $repo 'dist') -Recurse -File
  $results.sizes = [ordered]@{
    appExeMB = [math]::Round((Get-Item $Exe).Length / 1MB, 2)
    cliSidecarMB = if ($sidecar) { [math]::Round($sidecar.Length / 1MB, 2) } else { $null }
    distMB = [math]::Round(($dist | Measure-Object Length -Sum).Sum / 1MB, 2)
    distJsMB = [math]::Round(($dist | Where-Object Extension -eq '.js' | Measure-Object Length -Sum).Sum / 1MB, 2)
    distCssMB = [math]::Round(($dist | Where-Object Extension -eq '.css' | Measure-Object Length -Sum).Sum / 1MB, 2)
    distWasmMB = [math]::Round(($dist | Where-Object Extension -eq '.wasm' | Measure-Object Length -Sum).Sum / 1MB, 2)
    distOtherMB = [math]::Round(($dist | Where-Object Extension -notin '.js', '.css', '.wasm' | Measure-Object Length -Sum).Sum / 1MB, 2)
  }
  $results.sizes | Format-Table | Out-String | Write-Host

  if (-not $MemoryOnly) {
  Write-Step "Startup ($StartupRuns runs, clean data each time)"
  $runs = @()
  for ($i = 1; $i -le $StartupRuns; $i++) {
    foreach ($d in $dataDirs) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
    $s = Start-App; Stop-App
    $runs += [ordered]@{ run = $i; windowVisibleMs = $s.windowVisibleMs; shellSpawnedMs = $s.shellSpawnedMs; settledMs = $s.settledMs }
    Write-Host ("  run {0}: window {1} ms, shell {2} ms, settled {3} ms" -f $i, $s.windowVisibleMs, $s.shellSpawnedMs, $s.settledMs)
  }
  $results.startup = [ordered]@{
    runs = $runs
    windowVisible = Stats ($runs | ForEach-Object windowVisibleMs)
    shellSpawned = Stats ($runs | ForEach-Object shellSpawnedMs)
    settled = Stats ($runs | ForEach-Object settledMs)
  }
  }

  Write-Step 'Session for the remaining measurements'
  foreach ($d in $dataDirs) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
  $app = Start-App
  $h = $app.handle; $appPid = $app.pid
  [Lab]::Place($h, 100, 100, 1280, 800); Start-Sleep -Seconds 2
  [Lab]::Focus($h)
  $results.memoryStart = Get-Memory $appPid
  Write-Host ("  start: {0} MB private working set" -f $results.memoryStart.privateWorkingSetMB)
  if (-not $MemoryOnly) {
  $results.cpuIdlePercent = Get-CpuPercent $appPid 20
  Write-Host ("  idle CPU {0}% of one core" -f $results.cpuIdlePercent)

  Write-Step "Input latency ($LatencySamples keystrokes)"
  Invoke-Command-InTerminal $h 'cls'; Start-Sleep -Seconds 1
  $term = Get-TermRect $h
  $before = [Lab]::Grab($term); [Lab]::Char('x'); Start-Sleep -Milliseconds 400
  $box = [Lab]::DiffBox($before, [Lab]::Grab($term), $term.Width)
  [Lab]::Chord($VK.Back); Start-Sleep -Milliseconds 300
  if ($box.IsEmpty) { throw 'could not locate the cursor: no change after typing' }
  $row = [Drawing.Rectangle]::new($term.X + $box.X - 2, $term.Y + $box.Y - 2, [math]::Min(900, $term.Width - $box.X), $box.Height + 4)
  $lat = @(); $letters = 'abcdefghijklmnopqrstuvwxyz'
  $perRound = 40
  while ($lat.Count -lt $LatencySamples) {
    for ($i = 0; $i -lt $perRound -and $lat.Count -lt $LatencySamples; $i++) {
      $lat += [Lab]::CharLatency($letters[$i % 26], $row, 8, 1000); Start-Sleep -Milliseconds (40 + (Get-Random -Maximum 40))
    }
    [Lab]::Chord($VK.Esc); Start-Sleep -Milliseconds 400   # PSReadLine: clear the line
  }
  $results.inputLatency = Stats $lat
  Write-Host ("  p50 {0} ms, p95 {1} ms, p99 {2} ms, max {3} ms" -f $results.inputLatency.p50, $results.inputLatency.p95, $results.inputLatency.p99, $results.inputLatency.max)

  }

  $big = Join-Path $work "big-$ThroughputMB.txt"
  if (-not (Test-Path $big) -or (Get-Item $big).Length -lt $ThroughputMB * 1MB) {
    $line = ('0123456789abcdefghijklmnopqrstuvwxyz' * 3) + "`r`n"
    $writer = [IO.StreamWriter]::new($big)
    for ($i = 0; $i -lt [int]($ThroughputMB * 1MB / $line.Length); $i++) { $writer.Write("$i $line") }
    $writer.Close()
  }
  if ($MemoryOnly) {
    Write-Step "Output ($ThroughputMB MB, one pane)"
    $res = Join-Path $work 'tp-mem.txt'; Remove-Item $res -ErrorAction SilentlyContinue
    Invoke-Command-InTerminal $h "cls; cmd /c type `"$big`"; 'done' | Out-File `"$res`""
    [void](Wait-File $res 600)
  } else {
  Write-Step "Output throughput ($ThroughputMB MB, 3 runs)"
  $tp = @()
  for ($i = 1; $i -le 3; $i++) {
    $res = Join-Path $work "tp-$i.txt"; Remove-Item $res -ErrorAction SilentlyContinue
    Invoke-Command-InTerminal $h "cls; `$s=[Diagnostics.Stopwatch]::StartNew(); cmd /c type `"$big`"; `$s.ElapsedMilliseconds | Out-File `"$res`""
    Start-Sleep -Milliseconds 300
    $fps = [Lab]::ChangesPerSecond((Get-TermRect $h), 3000)
    $ms = Wait-File $res 600
    $tp += [ordered]@{ run = $i; elapsedMs = [int]$ms; mbPerSecond = [math]::Round($ThroughputMB / ([int]$ms / 1000), 1); screenUpdatesPerSecond = [math]::Round($fps, 1) }
    Write-Host ("  run {0}: {1} ms ({2} MB/s), {3} screen updates/s" -f $i, $ms, $tp[-1].mbPerSecond, $tp[-1].screenUpdatesPerSecond)
  }
  $results.throughput = $tp
  }
  Invoke-Command-InTerminal $h 'cls'; Start-Sleep -Seconds 3
  $results.memoryAfterOutput1Pane = Get-Memory $appPid

  Write-Step 'Four panes'
  [Lab]::Chord($VK.Ctrl, $VK.Shift, $VK.D); Start-Sleep -Seconds 2
  [Lab]::Chord($VK.Ctrl, $VK.Shift, $VK.Enter); Start-Sleep -Seconds 2
  [Lab]::Chord($VK.Ctrl, $VK.Shift, 0x21); Start-Sleep -Milliseconds 500   # focus the previous pane (PageUp)
  [Lab]::Chord($VK.Ctrl, $VK.Shift, $VK.Enter); Start-Sleep -Seconds 4
  $results.memory4Panes = Get-Memory $appPid
  Write-Host ("  4 panes: {0} MB private working set, {1} shells" -f $results.memory4Panes.privateWorkingSetMB, $results.memory4Panes.shells)

  Write-Step 'Long output in a second tab, then close it'
  [Lab]::Chord($VK.Ctrl, $VK.Shift, $VK.T); Start-Sleep -Seconds 3
  $res = Join-Path $work 'scroll.txt'; Remove-Item $res -ErrorAction SilentlyContinue
  Invoke-Command-InTerminal $h "1..5 | % { cmd /c type `"$big`" }; 'done' | Out-File `"$res`""
  [void](Wait-File $res 1800); Start-Sleep -Seconds 3
  $results.memoryAfterLongOutput = Get-Memory $appPid
  $results.longOutputMB = 5 * $ThroughputMB
  Write-Host ("  after {0} MB in tab 2: {1} MB private working set" -f $results.longOutputMB, $results.memoryAfterLongOutput.privateWorkingSetMB)

  if (-not $MemoryOnly) {

  Write-Step 'Busy hidden tab: CPU'
  # Tab 2 prints continuously while tab 1 (four idle panes) is in front.
  Invoke-Command-InTerminal $h 'cls; while ($true) { Get-Date -Format o; Start-Sleep -Milliseconds 50 }'
  Start-Sleep -Seconds 1
  [Lab]::Chord($VK.Ctrl, $VK.Tab); Start-Sleep -Seconds 3
  $results.cpuBusyHiddenTabPercent = Get-CpuPercent $appPid 20
  Write-Host ("  busy hidden tab: CPU {0}% of one core" -f $results.cpuBusyHiddenTabPercent)

  Write-Step 'Tab switch time (two static tabs)'
  [Lab]::Chord($VK.Ctrl, $VK.Tab); Start-Sleep -Seconds 1          # back to tab 2
  [Lab]::Chord($VK.Ctrl, 0x43); Start-Sleep -Milliseconds 500       # Ctrl+C stops the loop
  Invoke-Command-InTerminal $h 'cls'; Start-Sleep -Seconds 1
  $switch = @()
  for ($i = 0; $i -lt 20; $i++) {
    $switch += [Lab]::ChordLatency((Get-TermRect $h), 2000, 2000, $VK.Ctrl, $VK.Tab); Start-Sleep -Milliseconds 800
  }
  $results.tabSwitch = Stats $switch
  Write-Host ("  tab switch p50 {0} ms, p95 {1} ms" -f $results.tabSwitch.p50, $results.tabSwitch.p95)

  }

  Write-Step 'Close the long-output tab, measure release'
  # Tab 2 is in front: right after the long output, or after an even number of switches.
  [Lab]::Focus($h); [Lab]::Chord($VK.Ctrl, $VK.Shift, $VK.W); Start-Sleep -Seconds 5
  $results.memoryAfterClosingTab = Get-Memory $appPid
  $results.tabClosed = $results.memoryAfterClosingTab.shells -lt $results.memoryAfterLongOutput.shells
  Write-Host ("  tab closed: {0}; {1} MB private working set" -f $results.tabClosed, $results.memoryAfterClosingTab.privateWorkingSetMB)

  if (-not $MemoryOnly) {

  Write-Step 'Resize sweep and zoom (watch the window for artifacts)'
  $c = [Lab]::Client($h)
  for ($w = 1280; $w -ge 700; $w -= 20) { [Lab]::Place($h, 100, 100, $w, 800); Start-Sleep -Milliseconds 30 }
  for ($w = 700; $w -le 1280; $w += 20) { [Lab]::Place($h, 100, 100, $w, 800); Start-Sleep -Milliseconds 30 }
  for ($i = 0; $i -lt 3; $i++) { [Lab]::Chord($VK.Ctrl, $VK.Plus); Start-Sleep -Milliseconds 600 }
  [Lab]::Chord($VK.Ctrl, $VK.Zero); Start-Sleep -Seconds 1
  $results.resizeSweep = 'done; visual result recorded in the manual checklist'
  }
}
finally {
  Stop-App
  foreach ($m in $moved) {
    if (Test-Path $m[0]) { Remove-Item $m[0] -Recurse -Force }
    Move-Item $m[1] $m[0]
  }
  foreach ($d in $dataDirs) { if (-not ($moved | Where-Object { $_[0] -eq $d }) -and (Test-Path $d)) { Remove-Item $d -Recurse -Force } }
  $results | ConvertTo-Json -Depth 6 | Out-File $Out -Encoding utf8
  Write-Host "`nResults: $((Resolve-Path $Out).Path)" -ForegroundColor Green
}
