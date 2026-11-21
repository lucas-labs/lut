export type TerminalTokens = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selection: string;
  ansiBlack: string;
  ansiRed: string;
  ansiGreen: string;
  ansiYellow: string;
  ansiBlue: string;
  ansiMagenta: string;
  ansiCyan: string;
  ansiWhite: string;
  ansiBrightBlack: string;
  ansiBrightRed: string;
  ansiBrightGreen: string;
  ansiBrightYellow: string;
  ansiBrightBlue: string;
  ansiBrightMagenta: string;
  ansiBrightCyan: string;
  ansiBrightWhite: string;
};

const VAR_BY_KEY: Record<keyof TerminalTokens, string> = {
  background: '--terminal-background',
  foreground: '--terminal-foreground',
  cursor: '--terminal-cursor',
  cursorAccent: '--terminal-cursor-accent',
  selection: '--terminal-selection',
  ansiBlack: '--terminal-ansi-black',
  ansiRed: '--terminal-ansi-red',
  ansiGreen: '--terminal-ansi-green',
  ansiYellow: '--terminal-ansi-yellow',
  ansiBlue: '--terminal-ansi-blue',
  ansiMagenta: '--terminal-ansi-magenta',
  ansiCyan: '--terminal-ansi-cyan',
  ansiWhite: '--terminal-ansi-white',
  ansiBrightBlack: '--terminal-ansi-bright-black',
  ansiBrightRed: '--terminal-ansi-bright-red',
  ansiBrightGreen: '--terminal-ansi-bright-green',
  ansiBrightYellow: '--terminal-ansi-bright-yellow',
  ansiBrightBlue: '--terminal-ansi-bright-blue',
  ansiBrightMagenta: '--terminal-ansi-bright-magenta',
  ansiBrightCyan: '--terminal-ansi-bright-cyan',
  ansiBrightWhite: '--terminal-ansi-bright-white',
};

const KEYS = Object.keys(VAR_BY_KEY) as (keyof TerminalTokens)[];

const probes = new WeakMap<HTMLElement, HTMLDivElement>();

function getProbe(scope: HTMLElement): HTMLDivElement {
  const existing = probes.get(scope);
  if (existing?.isConnected) return existing;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;contain:strict;width:0;height:0;';
  scope.appendChild(el);
  probes.set(scope, el);
  return el;
}

function resolve(el: HTMLDivElement, varName: string): string {
  el.style.color = `var(${varName})`;
  return getComputedStyle(el).color;
}

/** The terminal colours as they compute inside `scope`: the document's theme by default. */
export function readTerminalTokens(scope: HTMLElement = document.body): TerminalTokens {
  const el = getProbe(scope);
  const out = {} as TerminalTokens;
  for (const k of KEYS) {
    out[k] = resolve(el, VAR_BY_KEY[k]);
  }
  return out;
}
