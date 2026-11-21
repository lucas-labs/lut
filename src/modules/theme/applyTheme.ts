import type { TerminalPalette, Theme, ThemeColors, ThemeMode, ThemeVariant } from './types';

const COLOR_VAR: Record<keyof ThemeColors, string> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  destructive: '--destructive',
  success: '--success',
  warning: '--warning',
  info: '--info',
  border: '--border',
  input: '--input',
  ring: '--ring',
  sidebar: '--sidebar',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
  sidebarRing: '--sidebar-ring',
  radius: '--radius',
};

const ANSI_VARS: readonly string[] = [
  '--terminal-ansi-black',
  '--terminal-ansi-red',
  '--terminal-ansi-green',
  '--terminal-ansi-yellow',
  '--terminal-ansi-blue',
  '--terminal-ansi-magenta',
  '--terminal-ansi-cyan',
  '--terminal-ansi-white',
  '--terminal-ansi-bright-black',
  '--terminal-ansi-bright-red',
  '--terminal-ansi-bright-green',
  '--terminal-ansi-bright-yellow',
  '--terminal-ansi-bright-blue',
  '--terminal-ansi-bright-magenta',
  '--terminal-ansi-bright-cyan',
  '--terminal-ansi-bright-white',
];

const ALL_VARS: readonly string[] = [
  ...Object.values(COLOR_VAR),
  '--terminal-background',
  '--terminal-foreground',
  '--terminal-cursor',
  '--terminal-cursor-accent',
  '--terminal-selection',
  ...ANSI_VARS,
];

let lastApplied: string | null = null;

/** The variant a theme shows in `mode`: the other one when it has only one. */
export function themeVariant(theme: Theme, mode: ThemeMode): ThemeVariant | undefined {
  return theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light;
}

/** Writes the variant's colours on `element`, replacing any written before. */
export function writeThemeVars(element: HTMLElement, variant: ThemeVariant): void {
  for (const v of ALL_VARS) element.style.removeProperty(v);
  if (variant.colors) writeColors(element, variant.colors);
  if (variant.terminal) writeTerminal(element, variant.terminal);
}

export function applyTheme(theme: Theme, mode: ThemeMode): void {
  const variant = themeVariant(theme, mode);
  if (!variant) {
    clearTheme();
    return;
  }
  writeThemeVars(document.documentElement, variant);
  lastApplied = theme.id;
}

export function clearTheme(): void {
  if (lastApplied === null) return;
  const root = document.documentElement;
  for (const v of ALL_VARS) root.style.removeProperty(v);
  lastApplied = null;
}

function writeColors(element: HTMLElement, c: ThemeColors): void {
  for (const k of Object.keys(c) as (keyof ThemeColors)[]) {
    const v = c[k];
    if (v) element.style.setProperty(COLOR_VAR[k], v);
  }
}

function writeTerminal(element: HTMLElement, t: TerminalPalette): void {
  const set = (name: string, value: string | undefined) => {
    if (value) element.style.setProperty(name, value);
  };
  set('--terminal-background', t.background);
  set('--terminal-foreground', t.foreground);
  set('--terminal-cursor', t.cursor);
  set('--terminal-cursor-accent', t.cursorAccent);
  set('--terminal-selection', t.selection);
  if (t.ansi) {
    for (let i = 0; i < ANSI_VARS.length && i < t.ansi.length; i++) {
      element.style.setProperty(ANSI_VARS[i], t.ansi[i]);
    }
  }
}
