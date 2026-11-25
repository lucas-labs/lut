import { labelFor, type Tab } from '@/modules/navigation';
import { setWindowTitle } from '@/modules/platform';
import { useEffect } from 'react';

/** `lut (dev)` in a development build, which runs apart from an installed lut (E25-10), so the two tell apart. */
const appName = () => (import.meta.env.DEV ? 'lut (dev)' : 'lut');

/**
 * Drives the OS window title (taskbar, Alt+Tab) from the focused tab: `<tab> - lut`, with the tab named as the tab
 * strip names it (`labelFor`). Just the app name without a tab. Without this the window keeps the build-time default.
 */
export function useWindowTitle(
  activeTab: Tab | undefined,
  allowsShellTitle: (profileId: string | undefined) => boolean,
): void {
  const label = activeTab ? labelFor(activeTab, allowsShellTitle) : '';

  useEffect(() => {
    const name = appName();
    const title = label ? `${label} - ${name}` : name;
    document.title = title;
    void setWindowTitle(title).catch(() => {});
  }, [label]);
}
