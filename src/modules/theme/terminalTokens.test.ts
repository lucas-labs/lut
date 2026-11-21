// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { terminalTokensFor } from './terminalTokens';
import type { Theme } from './types';

// The shape of `globals.css`: each mode class restores the default colours, and the terminal ones
// fall back to the app ones.
const STYLESHEET = `
  :root, .light { --background: rgb(250, 250, 250); --foreground: rgb(10, 10, 10); --primary: rgb(0, 100, 0); --primary-foreground: rgb(255, 255, 255); }
  .dark { --background: rgb(15, 15, 15); --foreground: rgb(230, 230, 230); --primary: rgb(180, 230, 90); --primary-foreground: rgb(0, 0, 0); }
  :root, .light, .dark {
    --terminal-background: var(--background);
    --terminal-foreground: var(--foreground);
    --terminal-cursor: var(--primary);
    --terminal-cursor-accent: var(--primary-foreground);
    --terminal-selection: rgb(200, 220, 180);
    --terminal-ansi-red: rgb(190, 50, 40);
  }
  .dark { --terminal-selection: rgb(40, 60, 20); --terminal-ansi-red: rgb(240, 100, 90); }
`;

const theme = (id: string, variants: Theme['variants']): Theme => ({ id, name: id, variants });

let style: HTMLStyleElement;
beforeAll(() => {
  style = document.createElement('style');
  style.textContent = STYLESHEET;
  document.head.append(style);
  // The app's own theme is on the document; a pane's theme must not inherit it.
  document.documentElement.className = 'dark';
  document.documentElement.style.setProperty('--terminal-ansi-red', 'rgb(1, 2, 3)');
  document.documentElement.style.setProperty('--background', 'rgb(4, 5, 6)');
});
afterAll(() => {
  style.remove();
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('style');
});

describe('the terminal colours of a theme', () => {
  it('are the default ones for the default theme, in each mode', () => {
    const lut = theme('lut', { light: {}, dark: {} });
    expect(terminalTokensFor(lut, 'light')).toMatchObject({
      background: 'rgb(250, 250, 250)',
      selection: 'rgb(200, 220, 180)',
      ansiRed: 'rgb(190, 50, 40)',
    });
    expect(terminalTokensFor(lut, 'dark')).toMatchObject({
      background: 'rgb(15, 15, 15)',
      selection: 'rgb(40, 60, 20)',
      ansiRed: 'rgb(240, 100, 90)',
    });
  });

  it("are the theme's own terminal colours", () => {
    const own = theme('own', {
      dark: { terminal: { background: 'rgb(20, 0, 0)', cursor: 'rgb(0, 0, 200)', selection: 'rgb(9, 9, 9)' } },
    });
    expect(terminalTokensFor(own, 'dark')).toMatchObject({
      background: 'rgb(20, 0, 0)',
      cursor: 'rgb(0, 0, 200)',
      selection: 'rgb(9, 9, 9)',
    });
  });

  it("fall back to the theme's app colours, then to the default ones", () => {
    const appOnly = theme('app-only', {
      light: { colors: { background: 'rgb(240, 230, 220)', primary: 'rgb(100, 0, 100)' } },
    });
    expect(terminalTokensFor(appOnly, 'light')).toMatchObject({
      background: 'rgb(240, 230, 220)',
      cursor: 'rgb(100, 0, 100)',
      foreground: 'rgb(10, 10, 10)',
      ansiRed: 'rgb(190, 50, 40)',
    });
  });

  it('use the other variant when the theme has only one', () => {
    const darkOnly = theme('dark-only', { dark: { terminal: { background: 'rgb(1, 1, 1)' } } });
    expect(terminalTokensFor(darkOnly, 'light').background).toBe('rgb(1, 1, 1)');
  });
});
