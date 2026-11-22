import { labelFor, type Tab } from '@/modules/navigation';
import { setWindowTitle } from '@/modules/platform';
import { useEffect } from 'react';

const APP_NAME = 'lut';

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
    const title = label ? `${label} - ${APP_NAME}` : APP_NAME;
    document.title = title;
    void setWindowTitle(title).catch(() => {});
  }, [label]);
}
