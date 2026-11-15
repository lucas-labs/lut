import { usePreferencesStore } from '@/modules/settings/preferences';
import { useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { applyVibrancy } from './vibrancy';

/** Each window mounts its own: `window_set_backdrop` targets its caller (the main window and Settings). */
export function WindowVibrancyBridge() {
  const enabled = usePreferencesStore((s) => s.windowVibrancy);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const { resolvedMode, activeTheme } = useTheme();

  useEffect(() => {
    if (!hydrated) return;
    void applyVibrancy(enabled, resolvedMode === 'dark', activeTheme.id);
  }, [enabled, hydrated, resolvedMode, activeTheme.id]);

  return null;
}
