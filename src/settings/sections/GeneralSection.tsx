import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { type OsNotificationResult, testAgentOsNotification } from '@/modules/agents/lib/notify';
import { IS_MAC } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { ThemePref } from '@/modules/settings/store';
import {
  coerceFileIconColors,
  coerceTerminalRenderer,
  setAgentNotifications,
  setAgentNotificationSound,
  setConfirmCloseRunningTerminal,
  setDefaultWorkspaceEnv,
  setExplorerGitDecorations,
  setFileIconColors,
  setRestoreWindowState,
  setShowHidden,
  setTerminalCursorBlink,
  setTerminalCursorStyle,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalMacOptionAsAlt,
  setTerminalRenderer,
  setTerminalScreenReader,
  setTerminalScrollback,
  setTerminalScrollSpeed,
  setTerminalShell,
  setZoomLevel,
  TERMINAL_FONT_SIZES,
  TERMINAL_SCROLLBACK_PRESETS,
} from '@/modules/settings/store';
import { coerceMacOptionAsAlt } from '@/modules/terminal/ghostty/input/macOptionAsAlt';
import { useTheme } from '@/modules/theme';
import type { Theme, ThemeMode } from '@/modules/theme/types';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { RangeControl } from '../components/RangeControl';
import { SectionHeader } from '../components/SectionHeader';
import { SettingRow } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';
import type { SectionProps } from '../sectionProps';

const APPEARANCE: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const TERMINAL_FONT_WEIGHTS = [
  { value: 'normal', label: 'Normal' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semi-Bold' },
  { value: 'bold', label: 'Bold' },
] as const;
const TERMINAL_CURSOR_STYLES = [
  { value: 'bar', label: 'Bar' },
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
] as const;
const FILE_ICON_COLORS = [
  { value: 'theme', label: 'Theme' },
  { value: 'original', label: 'Original' },
  { value: 'monochrome', label: 'Monochrome' },
] as const;
const LETTER_SPACINGS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;
const OPTION_AS_ALT_CHOICES = [
  ['off', 'Off'],
  ['left', 'Left Option'],
  ['right', 'Right Option'],
  ['both', 'Both'],
] as const;
const SCROLL_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

type ShellInfo = { name: string; path: string; integrated: boolean };
const SHELL_AUTO = 'auto';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.05;
const NOTIFICATION_TEST_DELAY_MS = 2_000;

type NotificationTestState = OsNotificationResult | 'idle' | 'waiting' | 'sending';

export function GeneralSection({ openTab }: SectionProps) {
  const { mode, setMode, activeTheme } = useTheme();

  const restoreWindowState = usePreferencesStore((s) => s.restoreWindowState);
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const explorerGitDecorations = usePreferencesStore((s) => s.explorerGitDecorations);
  const fileIconColors = usePreferencesStore((s) => coerceFileIconColors(s.fileIconColors));
  const terminalRenderer = usePreferencesStore((s) => s.terminalRenderer);
  const terminalScreenReader = usePreferencesStore((s) => s.terminalScreenReader);
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalFontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const terminalShell = usePreferencesStore((s) => s.terminalShell);
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [wslDistros, setWslDistros] = useState<{ name: string }[]>([]);
  const defaultWorkspaceEnv = usePreferencesStore((s) => s.defaultWorkspaceEnv);
  const terminalLetterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);
  const terminalScrollSpeed = usePreferencesStore((s) => s.terminalScrollSpeed);
  const terminalMacOptionAsAlt = usePreferencesStore((s) => s.terminalMacOptionAsAlt);
  const confirmCloseRunningTerminal = usePreferencesStore((s) => s.confirmCloseRunningTerminal);
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);
  const agentNotifications = usePreferencesStore((s) => s.agentNotifications);
  const agentNotificationSound = usePreferencesStore((s) => s.agentNotificationSound);
  const [notificationTest, setNotificationTest] = useState<NotificationTestState>('idle');
  const notificationTestPending = notificationTest === 'waiting' || notificationTest === 'sending';

  const testNotification = async () => {
    setNotificationTest('waiting');
    await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_TEST_DELAY_MS));
    setNotificationTest('sending');
    setNotificationTest(await testAgentOsNotification(agentNotificationSound));
  };

  useEffect(() => {
    void invoke<ShellInfo[]>('pty_list_shells')
      .then(setShells)
      .catch(() => {});
    void invoke<{ name: string }[]>('wsl_list_distros')
      .then(setWslDistros)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col">
      <SectionHeader title="General" description="Mode, terminal, and startup." />

      <SettingsGroup title="Appearance">
        <div className="flex gap-3.5 pt-1">
          {APPEARANCE.map((o) => (
            <ModeCard
              key={o.id}
              mode={o.id}
              label={o.label}
              theme={activeTheme}
              selected={mode === o.id}
              onSelect={() => setMode(o.id)}
            />
          ))}
        </div>
        <p className="pt-0.5 text-[12px] leading-4 text-muted-foreground">
          For theme, background and customization, see the{' '}
          <Button variant="link" size="inline" onClick={() => openTab('themes')}>
            Themes
          </Button>{' '}
          tab.
        </p>
      </SettingsGroup>

      <SettingsGroup title="Zoom">
        <SettingRow title="UI zoom level">
          <RangeControl
            label="UI zoom level"
            value={zoomLevel}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            onChange={(v) => void setZoomLevel(v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Explorer">
        <SettingRow
          title="Show hidden files"
          description="Include dot-prefixed files and folders (.env, .gitignore, .config) in the file explorer and search."
        >
          <Switch checked={showHidden} onCheckedChange={(v) => void setShowHidden(v)} />
        </SettingRow>
        <SettingRow
          title="Git decorations"
          description="Show the Git status of changed files and dim gitignored entries in the file explorer."
        >
          <Switch checked={explorerGitDecorations} onCheckedChange={(v) => void setExplorerGitDecorations(v)} />
        </SettingRow>
        <SettingRow
          title="File icon colors"
          description="Theme uses the theme's colors, Original the icon set's own, Monochrome the muted text color."
        >
          <Select value={fileIconColors} onValueChange={(v) => void setFileIconColors(v)}>
            <SelectTrigger value={fileIconColors}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILE_ICON_COLORS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Terminal">
        <SettingRow
          title="Terminal renderer"
          description="Automatic and WebGPU draw with WebGPU and fall back to WebGL where the webview has none. WebGL is a compatibility mode: it uses more CPU and holds at most 12 visible panes per window. Applies to new terminals."
        >
          <Select
            value={terminalRenderer}
            onValueChange={(value) => void setTerminalRenderer(coerceTerminalRenderer(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="webgpu">WebGPU</SelectItem>
              <SelectItem value="webgl">WebGL</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Screen reader support"
          description="Expose terminal output as accessible text. Page Up and Page Down browse history when the output region is focused."
        >
          <Switch checked={terminalScreenReader} onCheckedChange={(value) => void setTerminalScreenReader(value)} />
        </SettingRow>
        <SettingRow
          title="Cursor blinking"
          description="Blink the terminal cursor, which marks the active pane. On by default."
        >
          <Switch checked={terminalCursorBlink} onCheckedChange={(v) => void setTerminalCursorBlink(v)} />
        </SettingRow>
        <SettingRow title="Cursor style" description="Shape of the terminal cursor.">
          <Select value={terminalCursorStyle} onValueChange={(v) => void setTerminalCursorStyle(v)}>
            <SelectTrigger value={terminalCursorStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_CURSOR_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  {style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <FontFamilyInput value={terminalFontFamily} onCommit={(v) => void setTerminalFontFamily(v)} />
        <SettingRow title="Font weight" description="Thickness of terminal characters">
          <Select value={terminalFontWeight} onValueChange={(v) => void setTerminalFontWeight(v)}>
            <SelectTrigger value={terminalFontWeight}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Integrated terminal shell"
          description={
            shells.find((s) => s.path === terminalShell)?.integrated === false
              ? 'Command blocks and directory tracking are unavailable for this shell.'
              : wslDistros.length > 0
                ? 'Shell for the integrated terminal. WSL spaces use the distro login shell. Existing tabs keep their shell.'
                : 'Shell for new terminal tabs. Existing tabs keep their shell.'
          }
        >
          <Select
            value={terminalShell || SHELL_AUTO}
            onValueChange={(v) => void setTerminalShell(v === SHELL_AUTO ? '' : v)}
          >
            <SelectTrigger value={terminalShell || SHELL_AUTO}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SHELL_AUTO}>Auto</SelectItem>
              {shells.map((s) => (
                <SelectItem key={s.path} value={s.path}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        {(wslDistros.length > 0 || defaultWorkspaceEnv !== 'local') && (
          <SettingRow
            title="Workspace environment"
            description="Where new spaces run: Windows or a WSL distro. Existing spaces keep theirs; switch any from the status bar."
          >
            <Select value={defaultWorkspaceEnv} onValueChange={(v) => void setDefaultWorkspaceEnv(v)}>
              <SelectTrigger value={defaultWorkspaceEnv}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Windows</SelectItem>
                {wslDistros.map((d) => (
                  <SelectItem key={d.name} value={`wsl:${d.name}`}>
                    WSL: {d.name}
                  </SelectItem>
                ))}
                {defaultWorkspaceEnv.startsWith('wsl:') &&
                  !wslDistros.some((d) => `wsl:${d.name}` === defaultWorkspaceEnv) && (
                    <SelectItem value={defaultWorkspaceEnv}>
                      {defaultWorkspaceEnv.slice('wsl:'.length)} (unavailable)
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
          </SettingRow>
        )}
        <SettingRow
          title="Letter spacing"
          description="Extra horizontal space between characters (px). Use negative values to tighten Nerd Fonts."
        >
          <Select value={String(terminalLetterSpacing)} onValueChange={(v) => void setTerminalLetterSpacing(Number(v))}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LETTER_SPACINGS.map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v > 0 ? `+${v}` : v} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow title="Font size" description="Terminal text size.">
          <Select value={String(terminalFontSize)} onValueChange={(v) => void setTerminalFontSize(Number(v))}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_FONT_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Scrollback"
          description="Lines of history kept per terminal. Higher uses more RAM (~3 KB / line)."
        >
          <Select value={String(terminalScrollback)} onValueChange={(v) => void setTerminalScrollback(Number(v))}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMINAL_SCROLLBACK_PRESETS.map((lines) => (
                <SelectItem key={lines} value={String(lines)}>
                  {lines.toLocaleString()} lines
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        {IS_MAC && (
          <SettingRow
            title="Option as Alt"
            description="Send Option as Alt (Meta) so readline and editor shortcuts like Option+B and Option+F work. Off types the characters Option produces. Keys are matched by their position on a US keyboard, so layouts that type other letters on those keys are not followed."
          >
            <Select
              value={terminalMacOptionAsAlt}
              onValueChange={(v) => void setTerminalMacOptionAsAlt(coerceMacOptionAsAlt(v))}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTION_AS_ALT_CHOICES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        )}
        <SettingRow
          title="Scroll speed"
          description="Lines per wheel or trackpad movement, for history and for programs that read the mouse wheel."
        >
          <Select value={String(terminalScrollSpeed)} onValueChange={(v) => void setTerminalScrollSpeed(Number(v))}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(SCROLL_SPEEDS.some((v) => v === terminalScrollSpeed)
                ? SCROLL_SPEEDS
                : [...SCROLL_SPEEDS, terminalScrollSpeed].sort((a, b) => a - b)
              ).map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="Confirm before killing a running process"
          description="Ask before closing a terminal tab or quitting while a command is still running. Unsaved editor changes are always confirmed."
        >
          <Switch
            checked={confirmCloseRunningTerminal}
            onCheckedChange={(v) => void setConfirmCloseRunningTerminal(v)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Agents">
        <SettingRow
          title="Coding agent notifications"
          description="Alert when a coding agent needs your input or finishes. Native notification when lut is unfocused, in-app otherwise."
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!agentNotifications || notificationTestPending}
              title={notificationTestTitle(notificationTest)}
              onClick={() => void testNotification()}
            >
              {notificationTestLabel(notificationTest)}
            </Button>
            <Switch
              checked={agentNotifications}
              disabled={notificationTestPending}
              onCheckedChange={(v) => {
                setNotificationTest('idle');
                void setAgentNotifications(v);
              }}
            />
          </div>
        </SettingRow>
        <SettingRow title="Notification sound" description="Play a sound with agent notifications and in-app alerts.">
          <Switch
            checked={agentNotificationSound}
            disabled={!agentNotifications || notificationTestPending}
            onCheckedChange={(v) => void setAgentNotificationSound(v)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Startup">
        <SettingRow
          title="Restore window position & size"
          description="Reopen the main window where you left it. Applies on next launch."
        >
          <Switch checked={restoreWindowState} onCheckedChange={(v) => void setRestoreWindowState(v)} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}

type ModeCardProps = {
  mode: ThemePref;
  label: string;
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
};

/** A mode choice with a small window drawn in the active theme's light or dark colours. */
function ModeCard({ mode, label, theme, selected, onSelect }: ModeCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="group flex flex-1 flex-col gap-2 text-left text-[12px] leading-4 text-foreground outline-none"
    >
      <span
        className={cn(
          'flex h-18 overflow-hidden rounded-lg border transition-colors group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
          selected ? 'border-primary ring-1 ring-primary' : 'border-border group-hover:border-muted-foreground/75',
        )}
        aria-hidden
      >
        {mode === 'system' ? (
          <>
            <span className="light flex-1" style={{ background: variantColors(theme, 'light').background }} />
            <span
              className="dark flex-1 border-l border-border"
              style={{ background: variantColors(theme, 'dark').background }}
            />
          </>
        ) : (
          <WindowSketch mode={mode} colors={variantColors(theme, mode)} />
        )}
      </span>
      {label}
    </button>
  );
}

type SketchColors = { background: string; card: string; border: string; primary: string; muted: string };

/** A sidebar and two lines of text, in one variant's colours. */
function WindowSketch({ mode, colors }: { mode: ThemeMode; colors: SketchColors }) {
  return (
    // The mode class scopes the colour tokens to this mode, for a theme that leaves them to the stylesheet (lut's).
    <span className={cn(mode, 'flex flex-1')}>
      <span className="w-[30%] border-r" style={{ background: colors.card, borderColor: colors.border }} />
      <span className="flex flex-1 flex-col gap-1.25 p-2.5" style={{ background: colors.background }}>
        <span className="h-1.25 w-1/2 rounded-full" style={{ background: colors.primary }} />
        <span className="h-1.25 w-[70%] rounded-full" style={{ background: colors.muted }} />
      </span>
    </span>
  );
}

/** One variant's colours, or the other variant's when the theme has only one, as the theme cards do. */
function variantColors(theme: Theme, mode: ThemeMode): SketchColors {
  const c = (theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light)?.colors ?? {};
  return {
    background: c.background ?? 'var(--background)',
    card: c.card ?? 'var(--card)',
    border: c.border ?? 'var(--border)',
    primary: c.primary ?? 'var(--primary)',
    muted: c.mutedForeground ?? 'var(--muted-foreground)',
  };
}

function notificationTestLabel(status: NotificationTestState): string {
  switch (status) {
    case 'waiting':
      return 'Switch apps...';
    case 'sending':
      return 'Sending...';
    case 'requested':
      return 'Requested';
    case 'denied':
      return 'Blocked';
    case 'failed':
      return 'Failed';
    default:
      return 'Test in 2s';
  }
}

function notificationTestTitle(status: NotificationTestState): string {
  switch (status) {
    case 'waiting':
      return 'Switch to another app to verify native delivery';
    case 'requested':
      return 'The native notification was requested';
    case 'denied':
      return 'Notifications are disabled by the system';
    case 'failed':
      return 'lut could not request a native notification';
    default:
      return 'Send a native test notification after two seconds';
  }
}

function FontFamilyInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  // A change saved elsewhere replaces the draft.
  const [draftOf, setDraftOf] = useState(value);
  if (value !== draftOf) {
    setDraftOf(value);
    setDraft(value);
  }

  // Commit (and trim) only on blur/Enter so a trailing space can be typed
  // mid-edit, e.g. "JetBrains Mono ".
  const commit = () => {
    const next = draft.trim();
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <SettingRow
      title="Font family"
      description='Terminal font (e.g. "CaskaydiaCove Nerd Font Mono"). Icons render without a Nerd Font; leave blank to use an installed one when found.'
    >
      <Input
        type="text"
        value={draft}
        placeholder="Auto-detect"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-55 font-mono"
      />
    </SettingRow>
  );
}
