import { labelFor, type Tab } from '@/modules/navigation';
import { appName, setWindowTitle } from '@/modules/platform';
import { useEffect, useState } from 'react';

/**
 * Drives the OS window title (taskbar, Alt+Tab) from the focused tab: `<tab> - lut`, with the tab named as the tab
 * strip names it (`labelFor`). Just the app name without a tab. Without this the window keeps the build-time default.
 */
export function useWindowTitle(
  activeTab: Tab | undefined,
  allowsShellTitle: (profileId: string | undefined) => boolean,
): void {
  const label = activeTab ? labelFor(activeTab, allowsShellTitle) : '';
  // `lut`, or `lut (dev)` for a dev build, known once the app reports its identity.
  const [name, setName] = useState('lut');

  useEffect(() => {
    let active = true;
    void appName().then((resolved) => {
      if (active) setName(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const title = label ? `${label} - ${name}` : name;
    document.title = title;
    void setWindowTitle(title).catch(() => {});
  }, [label, name]);
}
