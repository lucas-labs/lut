// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeFileEditing } from './useThemeFileEditing';

const written = vi.hoisted(() => ({
  handler: null as ((e: { payload: { path: string; source?: string } }) => void) | null,
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    listen: (_name: string, handler: typeof written.handler) => {
      written.handler = handler;
      return Promise.resolve(() => {});
    },
    setFocus: async () => {},
  }),
}));
const files = vi.hoisted(() => ({ readThemeFile: vi.fn() }));
vi.mock('./themeFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./themeFiles')>()),
  readThemeFile: files.readThemeFile,
  onThemeEdit: () => Promise.resolve(() => {}),
}));
const custom = vi.hoisted(() => ({ saveCustomTheme: vi.fn(async () => {}) }));
vi.mock('./customThemes', () => ({ saveCustomTheme: custom.saveCustomTheme, listCustomThemes: async () => [] }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/modules/navigation', () => ({ useNavigationStore: { getState: () => ({ tabs: [] }) } }));
vi.mock('@/modules/settings/store', () => ({ setThemeId: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function Harness() {
  useThemeFileEditing({ openFileTab: () => {} });
  return null;
}

async function save(path: string) {
  await act(async () => {
    written.handler?.({ payload: { path, source: 'editor' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  files.readThemeFile.mockReset();
  custom.saveCustomTheme.mockClear();
  toast.error.mockClear();
  host = document.createElement('div');
  root = createRoot(host);
  act(() => root.render(createElement(Harness)));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('useThemeFileEditing', () => {
  it('keeps the theme and says why when a saved theme file is invalid', async () => {
    files.readThemeFile.mockResolvedValue({ ok: false, error: 'variants.dark.colors.background must be a string' });
    await save('C:\\config\\themes\\mine.lut-theme');
    expect(custom.saveCustomTheme).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn't apply mine.lut-theme", {
      description: 'variants.dark.colors.background must be a string',
    });
  });

  it('applies a valid theme file without a toast', async () => {
    const theme = { id: 'mine', name: 'Mine', variants: {} };
    files.readThemeFile.mockResolvedValue({ ok: true, theme });
    await save('C:\\config\\themes\\mine.lut-theme');
    expect(custom.saveCustomTheme).toHaveBeenCalledWith(theme);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores files that are not theme files', async () => {
    await save('C:\\project\\notes.md');
    expect(files.readThemeFile).not.toHaveBeenCalled();
  });
});
