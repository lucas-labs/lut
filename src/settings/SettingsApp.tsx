import { Toaster } from '@/components/ui/sonner';
import { WindowControls } from '@/components/WindowControls';
import { cn } from '@/lib/utils';
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from '@/modules/platform';
import type { SettingsTab } from '@/modules/settings/openSettingsWindow';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { WindowActivityBridge } from '@/modules/theme';
import {
  ContrastIcon,
  InformationCircleIcon,
  KeyboardIcon,
  PencilEdit02Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { type JSX, useEffect, useState } from 'react';
import { AboutSection } from './sections/AboutSection';
import { EditorSection } from './sections/EditorSection';
import { GeneralSection } from './sections/GeneralSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { ThemesSection } from './sections/ThemesSection';

const TABS: {
  id: SettingsTab;
  label: string;
  icon: typeof SlidersHorizontalIcon;
  component: () => JSX.Element;
}[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontalIcon, component: GeneralSection },
  { id: 'editor', label: 'Editor', icon: PencilEdit02Icon, component: EditorSection },
  { id: 'themes', label: 'Themes', icon: ContrastIcon, component: ThemesSection },
  { id: 'shortcuts', label: 'Shortcuts', icon: KeyboardIcon, component: ShortcutsSection },
  { id: 'about', label: 'About', icon: InformationCircleIcon, component: AboutSection },
];

/** A known section id, or general for anything else (a removed section such as models or agents). */
function toTab(id: string | null): SettingsTab {
  return TABS.find((t) => t.id === id)?.id ?? 'general';
}

function readInitialTab(): SettingsTab {
  if (typeof window === 'undefined') return 'general';
  return toTab(new URL(window.location.href).searchParams.get('tab'));
}

export function SettingsApp() {
  const [active, setActive] = useState<SettingsTab>(readInitialTab);
  const init = usePreferencesStore((s) => s.init);
  const ActiveSection = TABS.find((t) => t.id === active)?.component;

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const unlistenPromise = getCurrentWebviewWindow().listen<string>('lut:settings-tab', (e) =>
      setActive(toTab(e.payload)),
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-[13px] leading-[18px] text-foreground select-none">
      <nav aria-label="Settings sections" className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-card">
        {/* On macOS the traffic lights sit in this row. */}
        <div
          data-tauri-drag-region
          className={cn(
            'flex h-7 shrink-0 items-center text-[12px] leading-4 text-muted-foreground',
            IS_MAC ? 'pr-4.5 pl-22' : 'px-4.5',
          )}
        >
          Settings
        </div>
        <div className="flex flex-col gap-0.5 px-2 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={active === t.id ? 'page' : undefined}
              onClick={() => setActive(t.id)}
              className={cn(
                'flex h-7.5 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                active === t.id && 'bg-accent text-foreground',
              )}
            >
              <HugeiconsIcon icon={t.icon} size={16} strokeWidth={1.5} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
        <div data-tauri-drag-region className="flex-1" />
      </nav>
      <WindowActivityBridge />
      <Toaster position="bottom-right" />

      <main className="flex h-full min-w-0 flex-1 flex-col">
        <div data-tauri-drag-region className="flex h-7 shrink-0 items-start justify-end">
          {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls closeOnly />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-12 pt-3 pb-12 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto w-full max-w-170">{ActiveSection && <ActiveSection />}</div>
        </div>
      </main>
    </div>
  );
}
