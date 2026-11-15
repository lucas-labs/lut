import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handOffThemeEdit, parseThemeFile, readThemeFileError, starterTheme } from './themeFiles';

/** Theme files on disk, by path; a missing path fails `fs_stat` as the backend does. */
const disk = vi.hoisted(() => new Map<string, string>());
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: { path: string }) => {
    const content = disk.get(args.path);
    if (content === undefined) throw 'The system cannot find the file specified.';
    if (cmd === 'fs_stat') return { size: content.length, mtime: 0, kind: 'file' };
    if (cmd === 'fs_read_file') return { kind: 'text', content };
    throw new Error(`unexpected ${cmd}`);
  },
}));
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: async () => 'C:\\config',
  join: async (...parts: string[]) => parts.join('\\'),
}));
vi.mock('@/modules/workspace', () => ({ currentWorkspaceEnv: () => undefined }));

const theme = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'mine',
    name: 'Mine',
    variants: { dark: { colors: { background: '#000' } } },
    ...over,
  });

describe('parseThemeFile', () => {
  it('accepts a valid file whose id is its name', () => {
    expect(parseThemeFile(theme(), 'mine').ok).toBe(true);
  });

  it('rejects a changed id, which would add a second theme', () => {
    expect(parseThemeFile(theme({ id: 'other' }), 'mine')).toEqual({
      ok: false,
      error: `id must stay "mine", the file's name`,
    });
  });
});

describe('readThemeFileError', () => {
  beforeEach(() => disk.clear());

  it('has nothing to say about a theme that was never edited', async () => {
    await expect(readThemeFileError('mine')).resolves.toBeNull();
  });

  it('has nothing to say about a valid file', async () => {
    disk.set('C:\\config\\themes\\mine.lut-theme', theme());
    await expect(readThemeFileError('mine')).resolves.toBeNull();
  });

  it('names the file and the field that is wrong', async () => {
    disk.set('C:\\config\\themes\\mine.lut-theme', theme({ name: '' }));
    await expect(readThemeFileError('mine')).resolves.toEqual({
      file: 'mine.lut-theme',
      error: 'name must be a non-empty string',
    });
  });

  it('reports a file that is not JSON', async () => {
    disk.set('C:\\config\\themes\\mine.lut-theme', '{ "id": ');
    const found = await readThemeFileError('mine');
    expect(found?.file).toBe('mine.lut-theme');
    expect(found?.error).toMatch(/JSON/);
  });
});

describe('starterTheme', () => {
  it('exposes terminal font settings in newly created themes', () => {
    expect(starterTheme().variants.dark?.terminal).toMatchObject({
      fontFamily: 'Source Code Pro',
      fontWeight: 'normal',
      fontSize: 14,
    });
  });
});

describe('handOffThemeEdit', () => {
  it('emits the request before closing the settings window', async () => {
    const calls: string[] = [];
    const emit = vi.fn(async () => {
      await Promise.resolve();
      calls.push('emit');
    });
    const close = vi.fn(async () => {
      calls.push('close');
    });
    await expect(handOffThemeEdit({ action: 'edit', id: 'mine' }, close, emit)).resolves.toBe(true);
    expect(emit).toHaveBeenCalledWith({ action: 'edit', id: 'mine' });
    expect(calls).toEqual(['emit', 'close']);
  });

  it('keeps Settings open when the request cannot be delivered', async () => {
    const close = vi.fn(async () => undefined);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      handOffThemeEdit({ action: 'create' }, close, async () => {
        throw new Error('bus down');
      }),
    ).resolves.toBe(false);
    expect(close).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('still reports delivery when the window refuses to close', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      handOffThemeEdit(
        { action: 'create' },
        async () => {
          throw new Error('denied');
        },
        async () => undefined,
      ),
    ).resolves.toBe(true);
    spy.mockRestore();
  });
});
