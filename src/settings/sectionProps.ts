import type { SettingsTab } from '@/modules/settings/openSettingsWindow';

/** What `SettingsApp` hands every section. */
export type SectionProps = {
  /** Switches the window to another section, e.g. a link from General to Themes. */
  openTab: (tab: SettingsTab) => void;
};
