import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ invoke: vi.fn(), mac: false }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: harness.invoke }));
vi.mock('@/modules/platform', () => ({
  get IS_MAC() {
    return harness.mac;
  },
}));

type PreferencesStore = (typeof import('@/modules/settings/preferences'))['usePreferencesStore'];
// `vi.resetModules` makes a new store too: use the one the fresh module reads.
let store: PreferencesStore | null = null;

async function load() {
  store = (await import('@/modules/settings/preferences')).usePreferencesStore;
  return import('./subpixelText');
}

function setSubpixelText(enabled: boolean) {
  store?.setState({ terminalSubpixelText: enabled });
}

function stubAdapter(adapter: { features: Set<string> } | null | 'none') {
  vi.stubGlobal(
    'navigator',
    adapter === 'none' ? {} : { gpu: { requestAdapter: vi.fn(async () => adapter) } },
  );
}

describe('subpixel text', () => {
  beforeEach(() => {
    // The panel order and the GPU support are read once per session.
    vi.resetModules();
    harness.invoke.mockReset();
    harness.invoke.mockResolvedValue('bgr');
    harness.mac = false;
  });

  afterEach(() => {
    setSubpixelText(false);
    vi.unstubAllGlobals();
  });

  it('asks for grayscale while the toggle is off, and the ClearType order while it is on', async () => {
    const { requestedSubpixelOrder } = await load();
    setSubpixelText(false);
    expect(await requestedSubpixelOrder()).toBeNull();
    expect(harness.invoke).not.toHaveBeenCalled();
    setSubpixelText(true);
    expect(await requestedSubpixelOrder()).toBe('bgr');
    expect(await requestedSubpixelOrder()).toBe('bgr');
    expect(harness.invoke).toHaveBeenCalledOnce();
    expect(harness.invoke).toHaveBeenCalledWith('font_subpixel_order');
  });

  it('falls back to RGB when the backend cannot say', async () => {
    harness.invoke.mockRejectedValue(new Error('no backend'));
    const { panelSubpixelOrder } = await load();
    expect(await panelSubpixelOrder()).toBe('rgb');
  });

  it('reports each change of the toggle, dropping one a later change overtook', async () => {
    const { onSubpixelTextChange } = await load();
    const listener = vi.fn();
    const unsubscribe = onSubpixelTextChange(listener);
    setSubpixelText(true);
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith('bgr'));
    setSubpixelText(false);
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));

    // On then off before the order arrives: only "off" is reported.
    listener.mockClear();
    let answer: (order: string) => void = () => {};
    vi.resetModules();
    harness.invoke.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const fresh = await load();
    const stop = fresh.onSubpixelTextChange(listener);
    setSubpixelText(true);
    setSubpixelText(false);
    answer('rgb');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(null));
    expect(listener).toHaveBeenCalledOnce();
    stop();
    unsubscribe();
  });

  it('draws the requested order only with hinting and dual-source blending, and says why not', async () => {
    const { resolveSubpixelOrder } = await load();
    const both = { dualSourceBlending: true, hinting: true };
    expect(resolveSubpixelOrder('rgb', both)).toEqual({ order: 'rgb', unavailable: null });
    expect(resolveSubpixelOrder(null, both)).toEqual({ order: null, unavailable: null });
    expect(resolveSubpixelOrder('bgr', { ...both, dualSourceBlending: false })).toEqual({
      order: null,
      unavailable: 'the GPU has no dual-source-blending',
    });
    expect(resolveSubpixelOrder('bgr', { ...both, hinting: false }).order).toBeNull();
  });

  it('tells Settings why the toggle cannot turn it on', async () => {
    stubAdapter({ features: new Set(['dual-source-blending']) });
    let { subpixelTextUnavailable } = await load();
    expect(await subpixelTextUnavailable('auto')).toBeNull();
    expect(await subpixelTextUnavailable('webgpu')).toBeNull();
    expect(await subpixelTextUnavailable('webgl')).toBe('Not available with the WebGL renderer.');

    harness.mac = true;
    expect(await subpixelTextUnavailable('auto')).toBe('Not available on macOS.');
    harness.mac = false;

    for (const [adapter, reason] of [
      [
        { features: new Set<string>() },
        "Not available: this GPU can't blend each colour channel on its own.",
      ],
      [null, 'Not available: this webview has no WebGPU.'],
      ['none', 'Not available: this webview has no WebGPU.'],
    ] as const) {
      vi.resetModules();
      stubAdapter(adapter);
      ({ subpixelTextUnavailable } = await load());
      expect(await subpixelTextUnavailable('auto')).toBe(reason);
    }
  });
});
