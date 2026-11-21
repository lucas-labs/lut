import { DEFAULT_THEME_ID, type Theme } from '../types';
import { caffeine } from './caffeine';
import { catppuccin } from './catppuccin';
import { claude } from './claude';
import { dracula } from './dracula';
import { everforest } from './everforest';
import { gruvbox } from './gruvbox';
import { kanagawa } from './kanagawa';
import { kanagawaDragon } from './kanagawa-dragon';
import { lut } from './lut';
import { neutral } from './neutral';
import { nord } from './nord';
import { rosePine } from './rose-pine';
import { sage } from './sage';
import { solarized } from './solarized';
import { tide } from './tide';
import { tokyoNight } from './tokyo-night';
import { xcode } from './xcode';

const BUILTIN: Theme[] = [
  lut,
  neutral,
  xcode,
  claude,
  kanagawa,
  kanagawaDragon,
  tokyoNight,
  catppuccin,
  rosePine,
  everforest,
  nord,
  gruvbox,
  dracula,
  solarized,
  tide,
  sage,
  caffeine,
];

const BY_ID = new Map<string, Theme>(BUILTIN.map((t) => [t.id, t]));

export function listBuiltinThemes(): Theme[] {
  return BUILTIN;
}

export function getBuiltinTheme(id: string): Theme | undefined {
  return BY_ID.get(id);
}

export function getDefaultTheme(): Theme {
  return BY_ID.get(DEFAULT_THEME_ID) ?? BUILTIN[0];
}

/**
 * The theme `id` names among the built-in and the user's themes. Built-in ids are reserved
 * (validateTheme rejects them for custom themes), so a built-in wins over a custom theme.
 */
export function findTheme(id: string, custom: readonly Theme[]): Theme | undefined {
  return getBuiltinTheme(id) ?? custom.find((t) => t.id === id);
}

/** Like `findTheme`, with the default theme for an id that names none. */
export function resolveTheme(id: string, custom: readonly Theme[]): Theme {
  return findTheme(id, custom) ?? getDefaultTheme();
}
