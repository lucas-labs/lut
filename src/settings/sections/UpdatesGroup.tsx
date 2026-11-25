import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { isDevBuild } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { setUpdateChannel, setUpdatesEnabled } from '@/modules/settings/store';
import { requestUpdateCheck, resolveChannel, type UpdateStatusPayload, useUpdateStatus } from '@/modules/updates';
import { RefreshIcon } from '@lut/lut-icons';
import { useEffect, useState } from 'react';
import { SettingRow } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';

const CHANNELS = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
] as const;

function statusText(status: UpdateStatusPayload | null): string {
  switch (status?.status) {
    case 'checking':
      return 'Checking…';
    case 'upToDate':
      return 'lut is up to date';
    case 'available':
      return status.version ? `lut ${status.version} is available` : 'An update is available';
    case 'error':
      return `Couldn't check: ${status.error ?? 'unknown error'}`;
    default:
      return '';
  }
}

/** The update settings of the About section (E25-06); the checks run in the main window. */
export function UpdatesGroup({ version }: { version: string }) {
  const enabled = usePreferencesStore((s) => s.updatesEnabled);
  const choice = usePreferencesStore((s) => s.updateChannel);
  const status = useUpdateStatus();
  const [dev, setDev] = useState(false);

  useEffect(() => {
    void isDevBuild().then(setDev);
  }, []);

  const channel = resolveChannel(choice, version);

  return (
    <SettingsGroup title="Updates">
      <SettingRow
        title="Automatic updates"
        description={
          dev
            ? "Development builds don't update."
            : enabled
              ? 'Check for new versions once a day.'
              : 'lut makes no update requests.'
        }
      >
        {(a11y) => (
          <Switch
            {...a11y}
            checked={enabled && !dev}
            disabled={dev}
            onCheckedChange={(v) => void setUpdatesEnabled(v)}
          />
        )}
      </SettingRow>
      <SettingRow title="Channel" description="Beta also gets pre-releases.">
        {(a11y) => (
          <Select value={channel} disabled={dev} onValueChange={(v) => void setUpdateChannel(v)}>
            <SelectTrigger {...a11y} value={channel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SettingRow>
      <SettingRow title="Check for updates" description={dev ? "Development builds don't update." : statusText(status)}>
        <Button
          variant="outline"
          disabled={dev || !enabled || status?.status === 'checking'}
          onClick={() => void requestUpdateCheck()}
        >
          <RefreshIcon size="sm" />
          Check now
        </Button>
      </SettingRow>
    </SettingsGroup>
  );
}
