import { usePreferencesStore } from '@/modules/settings/preferences';
import type { UpdateChannel } from '@/modules/settings/store';
import { useEffect, useRef } from 'react';
import { clearLastCheck, useUpdateStore } from './updateStore';

/** The first check waits for the app to settle after start. */
export const FIRST_CHECK_DELAY_MS = 10_000;
/** How often lut asks whether a check is due; the interval itself is `CHECK_INTERVAL_MS`. */
export const CHECK_TICK_MS = 60 * 60 * 1000;

/** The automatic update checks of the main window (E25-05). Off means no timer and no request. */
export function useUpdateChecks(): void {
  const settled = usePreferencesStore((s) => s.settled);
  const enabled = usePreferencesStore((s) => s.updatesEnabled);
  const channel = usePreferencesStore((s) => s.updateChannel);
  const checkedChannel = useRef<UpdateChannel | null | undefined>(undefined);

  useEffect(() => {
    if (!settled) return;
    // Another channel has its own manifest: check it soon, not a day after the last one.
    if (checkedChannel.current !== undefined && checkedChannel.current !== channel)
      clearLastCheck();
    checkedChannel.current = channel;
  }, [settled, channel]);

  useEffect(() => {
    if (!settled || !enabled) return;
    const check = () => void useUpdateStore.getState().checkForUpdates();
    const first = window.setTimeout(check, FIRST_CHECK_DELAY_MS);
    const tick = window.setInterval(check, CHECK_TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(tick);
    };
  }, [settled, enabled, channel]);
}
