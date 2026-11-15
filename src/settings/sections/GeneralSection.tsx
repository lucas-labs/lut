import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { type OsNotificationResult, testAgentOsNotification } from '@/modules/agents/lib/notify';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { ThemePref } from '@/modules/settings/store';
import {
  coerceFileIconColors,
  setAgentNotifications,
  setAgentNotificationSound,
  setExplorerGitDecorations,
  setFileIconColors,
  setRestoreWindowState,
  setShowHidden,
  setZoomLevel,
} from '@/modules/settings/store';
import { useTheme } from '@/modules/theme';
import type { Theme, ThemeMode } from '@/modules/theme/types';
import { useState } from 'react';
import { RangeControl } from '../components/RangeControl';
import { SectionHeader } from '../components/SectionHeader';
import { SettingExpander, SettingRow } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';
import type { SectionProps } from '../sectionProps';

const APPEARANCE: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const FILE_ICON_COLORS = [
  { value: 'theme', label: 'Theme' },
  { value: 'original', label: 'Original' },
  { value: 'monochrome', label: 'Monochrome' },
] as const;
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

  return (
    <div className="flex flex-col">
      <SectionHeader title="General" description="Mode, explorer, and startup." />

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
          {(a11y) => (
            <RangeControl
              {...a11y}
              value={zoomLevel}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              onChange={(v) => void setZoomLevel(v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Explorer">
        <SettingRow
          title="Show hidden files"
          description="Include dot-prefixed files and folders (.env, .gitignore, .config) in the file explorer and search."
        >
          {(a11y) => <Switch {...a11y} checked={showHidden} onCheckedChange={(v) => void setShowHidden(v)} />}
        </SettingRow>
        <SettingRow
          title="Git decorations"
          description="Show the Git status of changed files and dim gitignored entries in the file explorer."
        >
          {(a11y) => (
            <Switch
              {...a11y}
              checked={explorerGitDecorations}
              onCheckedChange={(v) => void setExplorerGitDecorations(v)}
            />
          )}
        </SettingRow>
        <SettingRow
          title="File icon colors"
          description="Theme uses the theme's colors, Original the icon set's own, Monochrome the muted text color."
        >
          {(a11y) => (
            <Select value={fileIconColors} onValueChange={(v) => void setFileIconColors(v)}>
              <SelectTrigger {...a11y} value={fileIconColors}>
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
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Agents">
        <SettingExpander
          open={agentNotifications}
          setting={
            <SettingRow
              title="Coding agent notifications"
              description="Alert when a coding agent needs your input or finishes. Native notification when lut is unfocused, in-app otherwise."
            >
              {(a11y) => (
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
                    {...a11y}
                    checked={agentNotifications}
                    disabled={notificationTestPending}
                    onCheckedChange={(v) => {
                      setNotificationTest('idle');
                      void setAgentNotifications(v);
                    }}
                  />
                </div>
              )}
            </SettingRow>
          }
        >
          <SettingRow title="Notification sound" description="Play a sound with agent notifications and in-app alerts.">
            {(a11y) => (
              <Switch
                {...a11y}
                checked={agentNotificationSound}
                disabled={notificationTestPending}
                onCheckedChange={(v) => void setAgentNotificationSound(v)}
              />
            )}
          </SettingRow>
        </SettingExpander>
      </SettingsGroup>

      <SettingsGroup title="Startup">
        <SettingRow
          title="Restore window position & size"
          description="Reopen the main window where you left it. Applies on next launch."
        >
          {(a11y) => (
            <Switch {...a11y} checked={restoreWindowState} onCheckedChange={(v) => void setRestoreWindowState(v)} />
          )}
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
