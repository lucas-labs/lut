import { parseCssColor, toHex } from './vibrancy';

/** A colour of the active theme the user can pick by name, so it follows a theme change. */
export type ThemeColor = { readonly name: string; readonly label: string; readonly css: string };

/** The theme colours a colour row offers: the theme's own colour, then its six ANSI hues. */
export const THEME_COLORS: readonly ThemeColor[] = [
  { name: 'primary', label: 'Primary', css: 'var(--primary)' },
  { name: 'red', label: 'Red', css: 'var(--terminal-ansi-red)' },
  { name: 'yellow', label: 'Yellow', css: 'var(--terminal-ansi-yellow)' },
  { name: 'green', label: 'Green', css: 'var(--terminal-ansi-green)' },
  { name: 'cyan', label: 'Cyan', css: 'var(--terminal-ansi-cyan)' },
  { name: 'blue', label: 'Blue', css: 'var(--terminal-ansi-blue)' },
  { name: 'magenta', label: 'Magenta', css: 'var(--terminal-ansi-magenta)' },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Whether `value` is a `#rrggbb` colour. */
export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

/** The CSS for a kept colour: a theme colour's variable, or the hex itself; null for anything else. */
export function colorCss(value: string): string | null {
  if (isHexColor(value)) return value.toLowerCase();
  return THEME_COLORS.find((color) => color.name === value)?.css ?? null;
}

/** What a CSS colour (a theme variable too) paints right now, as `#rrggbb`; null when it cannot be read. */
export function currentHex(css: string): string | null {
  if (isHexColor(css)) return css.toLowerCase();
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;width:0;height:0;pointer-events:none;color:${css}`;
  document.body.appendChild(probe);
  const rgb = parseCssColor(getComputedStyle(probe).color);
  probe.remove();
  return rgb ? toHex(rgb) : null;
}
