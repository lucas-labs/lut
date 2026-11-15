// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LspServersGroup } from './LspServersGroup';

const rust = {
  id: 'rust',
  name: 'Rust',
  command: 'rust-analyzer',
  args: [],
  languages: { rs: 'rust' },
  rootMarkers: [],
  install: { command: 'rustup component add rust-analyzer', docsUrl: 'https://example.com' },
};
const zig = { id: 'custom-zls', name: 'Zig', command: 'zls', args: [], languages: { zig: 'zig' }, rootMarkers: [] };

const lsp = vi.hoisted(() => ({ detected: {} as Record<string, string | null> }));
vi.mock('@/modules/lsp', () => ({
  allServers: (custom: unknown[]) => [rust, ...custom],
  detectBinary: vi.fn(async () => null),
  redetectBinary: vi.fn(async () => null),
  useLspRuntimeStore: (pick: (s: typeof lsp) => unknown) => pick(lsp),
}));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) =>
    pick({ lspActivation: {}, lspCustomServers: [zig] }),
}));
const store = vi.hoisted(() => ({
  setLspActivation: vi.fn(async () => {}),
  setLspCustomServers: vi.fn(async () => {}),
}));
vi.mock('@/modules/settings/store', () => store);
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const render = () => act(() => root.render(createElement(LspServersGroup)));

beforeEach(() => {
  lsp.detected = { 'rust-analyzer': null, zls: '/usr/bin/zls' };
  store.setLspActivation.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const rowOf = (name: string) =>
  [...host.querySelectorAll('[data-slot="setting-row"]')].find((r) =>
    r.querySelector('.font-medium')?.textContent?.startsWith(name),
  );
const description = (name: string) => rowOf(name)?.querySelector('[id$="-description"]');

describe('LspServersGroup', () => {
  it('writes the command in mono and keeps the languages and status in the description', () => {
    render();
    expect(description('Rust')?.querySelector('.font-mono')?.textContent).toBe('rust-analyzer');
    expect(description('Rust')?.textContent).toBe('rust-analyzer (rs) - not found on PATH');
    expect(description('Zig')?.textContent).toBe('zls (zig) - /usr/bin/zls');
  });

  it('marks only the servers the user added as custom', () => {
    render();
    expect(rowOf('Zig')?.querySelector('.font-medium')?.textContent).toContain('· custom');
    expect(rowOf('Rust')?.querySelector('.font-medium')?.textContent).not.toContain('custom');
    expect(rowOf('Zig')?.querySelector('[aria-label="Remove server"]')).not.toBeNull();
    expect(rowOf('Rust')?.querySelector('[aria-label="Remove server"]')).toBeNull();
  });

  it('dots a detected server in the theme success colour', () => {
    render();
    expect(rowOf('Zig')?.querySelector('[data-slot="lsp-detected"]')?.className).toContain('bg-success');
    expect(rowOf('Rust')?.querySelector('[data-slot="lsp-detected"]')).toBeNull();
  });

  it('opens the install dialog when a server that is not found is switched on', () => {
    render();
    act(() => rowOf('Rust')?.querySelector<HTMLButtonElement>('[role="switch"]')?.click());
    expect(store.setLspActivation).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Install Rust language server');
  });

  it('names every button', () => {
    render();
    const unnamed = [...host.querySelectorAll('button')].filter(
      (b) => !b.getAttribute('aria-label') && !b.textContent?.trim(),
    );
    expect(unnamed).toHaveLength(0);
  });
});
