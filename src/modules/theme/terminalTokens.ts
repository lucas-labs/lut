import { readTerminalTokens, type TerminalTokens } from '@/styles/tokens';
import { themeVariant, writeThemeVars } from './applyTheme';
import { DEFAULT_THEME_ID, type Theme, type ThemeMode } from './types';

const cache = new WeakMap<Theme, Partial<Record<ThemeMode, TerminalTokens>>>();
let scope: HTMLDivElement | null = null;

/**
 * The terminal colours `theme` shows in `mode`, whatever theme the app has. They compute in a
 * hidden element scoped like the document: its mode class restores the default theme's colours
 * (`globals.css`), then the theme's own variables are written on it as `applyTheme` writes them on
 * the document. So a colour the theme leaves out falls back exactly as it does in the app.
 */
export function terminalTokensFor(theme: Theme, mode: ThemeMode): TerminalTokens {
  const cached = cache.get(theme)?.[mode];
  if (cached) return cached;
  const element = themeScope();
  element.className = mode;
  // The default theme is the stylesheet's own colours; `applyTheme` writes nothing for it either.
  writeThemeVars(element, (theme.id !== DEFAULT_THEME_ID && themeVariant(theme, mode)) || {});
  const tokens = readTerminalTokens(element);
  cache.set(theme, { ...cache.get(theme), [mode]: tokens });
  return tokens;
}

function themeScope(): HTMLDivElement {
  if (scope?.isConnected) return scope;
  scope = document.createElement('div');
  scope.setAttribute('aria-hidden', 'true');
  scope.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;contain:strict;width:0;height:0;';
  document.body.appendChild(scope);
  return scope;
}
