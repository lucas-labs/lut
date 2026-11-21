import type { ShortcutId } from '@/modules/shortcuts';
import type { LutIconComponent } from '@lut/lut-icons';

export type PaletteItem = {
  id: string;
  title: string;
  group: string;
  keywords?: string[];
  icon?: LutIconComponent;
  iconUrl?: string;
  shortcutId?: ShortcutId;
  trailing?: string;
  disabledReason?: string;
  run: () => void;
};

/** What a query without a sigil means. */
export type PaletteBase = 'commands' | 'files';
export type PaletteMode = PaletteBase | 'content' | 'help';
/** `profiles` opens on the list of terminal profiles, to open a tab with one. */
export type PaletteInitialMode = PaletteBase | 'content' | 'profiles';

/** How to open a file picked in the palette. */
export type OpenFileTarget = {
  line?: number;
  column?: number;
  /** Cmd/Ctrl+Enter. Hosts without side-by-side editors treat it as a plain open. */
  side?: boolean;
};
