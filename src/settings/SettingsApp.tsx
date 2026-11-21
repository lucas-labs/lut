import { Toaster } from '@/components/ui/sonner';
import { WindowControls } from '@/components/WindowControls';
import { cn } from '@/lib/utils';
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from '@/modules/platform';
import type { SettingsTab } from '@/modules/settings/openSettingsWindow';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { WindowActivityBridge, WindowVibrancyBridge } from '@/modules/theme';
import {
  FileEditIcon,
  InfoIcon,
  KeyboardIcon,
  type LutIconComponent,
  OptionsIcon,
  TerminalIcon,
  ThemesIcon,
} from '@lut/lut-icons';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { type JSX, useEffect, useState } from 'react';
import type { SectionProps } from './sectionProps';
import { AboutSection } from './sections/AboutSection';
import { EditorSection } from './sections/EditorSection';
import { GeneralSection } from './sections/GeneralSection';
import { ProfilesSection } from './sections/ProfilesSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { TerminalSection } from './sections/TerminalSection';
import { ThemesSection } from './sections/ThemesSection';

const TABS: {
  id: SettingsTab;
  label: string;
  icon: LutIconComponent;
  component: (props: SectionProps) => JSX.Element;
  /** Two panes side by side: the section takes a wider column than the others. */
  wide?: boolean;
}[] = [
  { id: 'general', label: 'General', icon: OptionsIcon, component: GeneralSection },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon, component: TerminalSection },
  { id: 'profiles', label: 'Profiles', icon: TerminalIcon, component: ProfilesSection, wide: true },
  { id: 'editor', label: 'Editor', icon: FileEditIcon, component: EditorSection },
  { id: 'themes', label: 'Themes', icon: ThemesIcon, component: ThemesSection },
  { id: 'shortcuts', label: 'Shortcuts', icon: KeyboardIcon, component: ShortcutsSection },
  { id: 'about', label: 'About', icon: InfoIcon, component: AboutSection },
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
    // Vertical tabs: the arrow keys move between sections and each section is a labelled tab panel. The navigation
    // is chrome like the main window's sidebars: `frame`, which window vibrancy (Mica) turns translucent. The content
    // keeps the solid background.
    <TabsPrimitive.Root
      value={active}
      onValueChange={(v) => setActive(toTab(v))}
      orientation="vertical"
      className="flex h-screen overflow-hidden text-[13px] leading-[18px] text-foreground select-none"
    >
      <nav className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-frame">
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
        <TabsPrimitive.List aria-label="Settings sections" className="flex flex-col gap-0.5 px-2 pt-2">
          {TABS.map((t) => (
            <TabsPrimitive.Trigger
              key={t.id}
              value={t.id}
              className="flex h-7.5 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=active]:bg-accent data-[state=active]:text-foreground"
            >
              <t.icon size="md" aria-hidden />
              {t.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        <div data-tauri-drag-region className="flex-1" />
      </nav>
      <WindowActivityBridge />
      <WindowVibrancyBridge />
      <Toaster position="bottom-right" />

      <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
        <div data-tauri-drag-region className="flex h-7 shrink-0 items-start justify-end">
          {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls closeOnly />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-12 pt-3 pb-12 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ id, component: Section, wide }) => (
            <TabsPrimitive.Content
              key={id}
              value={id}
              className={cn('mx-auto w-full focus-visible:outline-none', wide ? 'max-w-205' : 'max-w-170')}
            >
              <Section openTab={setActive} />
            </TabsPrimitive.Content>
          ))}
        </div>
      </main>
    </TabsPrimitive.Root>
  );
}
