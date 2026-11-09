import { describe, expect, it, vi } from 'vitest';

// `store` is created at module load, so the plugin mock must be in place
// before `./store` is imported.
const entries = vi.hoisted(() => ({
  value: [
    ['defaultModelId', 'gpt-4o'],
    ['customInstructions', 'be brief'],
    ['autocompleteEnabled', true],
    ['autocompleteProvider', 'cerebras'],
    ['lmstudioBaseURL', 'http://localhost:1234'],
    [
      'customEndpoints',
      [{ id: 'x', name: 'x', baseURL: 'http://x', modelId: 'm', contextLimit: 1 }],
    ],
    ['favoriteModelIds', ['gpt-4o']],
    ['vimMode', true],
  ] as [string, unknown][],
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    entries = async () => entries.value;
    get = async () => undefined;
    set = async () => undefined;
    save = async () => undefined;
  },
  Store: class {},
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

describe('settings saved with the removed AI preferences', () => {
  it('load without errors, ignore the AI keys and keep the rest', async () => {
    const { loadPreferences } = await import('./store');
    const prefs = await loadPreferences();
    for (const key of [
      'defaultModelId',
      'customInstructions',
      'autocompleteEnabled',
      'customEndpoints',
    ]) {
      expect(prefs).not.toHaveProperty(key);
    }
    expect(prefs.vimMode).toBe(true);
  });
});
