// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutSection } from './AboutSection';

vi.mock('@tauri-apps/api/app', () => ({
  getName: async () => 'lut',
  getVersion: async () => '1.2.3',
  getIdentifier: async () => 'dev.example.lut',
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    if (cmd !== 'app_about') throw new Error(`unexpected ${cmd}`);
    return { authors: ['someone'], license: 'MIT', repository: 'https://github.com/someone/lut' };
  },
}));
const opener = vi.hoisted(() => ({ openUrl: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => opener);
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'windows', arch: () => 'x86_64' }));
vi.mock('@/components/AppLogo', () => ({ AppLogo: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  opener.openUrl.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(AboutSection));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** The value shown on the detail row with this title. */
const detail = (title: string) => {
  const row = [...host.querySelectorAll('section span.font-medium')].find((t) => t.textContent === title);
  return row?.parentElement?.nextElementSibling?.textContent;
};

const button = (name: string) => {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no ${name} button`);
  return found;
};

describe('AboutSection', () => {
  it('names the app as the page heading with its version', () => {
    expect(host.querySelector('h1')?.textContent).toBe('lut');
    expect(host.textContent).toContain('Version 1.2.3');
  });

  it('shows the package metadata from the backend and the bundle id', () => {
    expect(detail('Build')).toBe('Windows · x86_64 · 1.2.3');
    expect(detail('Bundle ID')).toBe('dev.example.lut');
    expect(detail('License')).toBe('MIT');
    expect(detail('Author')).toBe('someone');
    expect(detail('Source code')).toBe('someone/lut');
  });

  it('opens the repository and its new issue page', () => {
    act(() => button('someone/lut').click());
    act(() => button('Report an issue').click());
    expect(opener.openUrl.mock.calls).toEqual([
      ['https://github.com/someone/lut'],
      ['https://github.com/someone/lut/issues/new'],
    ]);
  });
});
