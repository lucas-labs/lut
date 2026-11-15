/**
 * Subpixel (ClearType-style) terminal text (E13-17): on while the `terminalSubpixelText` preference
 * is, in the colour order of the screen's stripes that the backend reads from Windows' ClearType
 * setting (RGB elsewhere). Only the WebGPU renderer draws it, and only where text is hinted
 * (`hintedGlyphs.ts`) and the GPU can blend each colour channel on its own (`dual-source-blending`).
 */
import { IS_MAC } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { TerminalRendererSetting } from '@/modules/settings/store';
import { invoke } from '@tauri-apps/api/core';

export type SubpixelOrder = 'rgb' | 'bgr';

let panelOrder: Promise<SubpixelOrder> | null = null;

/** The stripe order of the screen, read once per session; RGB when the backend cannot say. */
export function panelSubpixelOrder(): Promise<SubpixelOrder> {
  panelOrder ??= invoke<string>('font_subpixel_order').then(
    (order) => (order === 'bgr' ? 'bgr' : 'rgb'),
    () => 'rgb',
  );
  return panelOrder;
}

function orderFor(enabled: boolean): Promise<SubpixelOrder | null> {
  return enabled ? panelSubpixelOrder() : Promise.resolve(null);
}

/** The order the preference asks for now, or null for grayscale text. */
export function requestedSubpixelOrder(): Promise<SubpixelOrder | null> {
  return orderFor(usePreferencesStore.getState().terminalSubpixelText);
}

/**
 * Calls `listener` with the order the preference asks for each time it is turned on or off. A
 * change that resolves after a later one is dropped.
 */
export function onSubpixelTextChange(listener: (order: SubpixelOrder | null) => void): () => void {
  let latest = 0;
  return usePreferencesStore.subscribe((state, previous) => {
    if (state.terminalSubpixelText === previous.terminalSubpixelText) return;
    const change = ++latest;
    void orderFor(state.terminalSubpixelText).then((order) => {
      if (change === latest) listener(order);
    });
  });
}

/**
 * The order new glyph atlases draw with: the requested one when this GPU and platform can draw
 * it, otherwise null, with the reason it cannot.
 */
export function resolveSubpixelOrder(
  requested: SubpixelOrder | null,
  support: { readonly dualSourceBlending: boolean; readonly hinting: boolean },
): { readonly order: SubpixelOrder | null; readonly unavailable: string | null } {
  if (!requested) return { order: null, unavailable: null };
  if (!support.hinting) return { order: null, unavailable: 'text is not hinted on this platform' };
  if (!support.dualSourceBlending) {
    return { order: null, unavailable: 'the GPU has no dual-source-blending' };
  }
  return { order: requested, unavailable: null };
}

let gpuSupport: Promise<string | null> | null = null;

function webGpuUnavailable(): Promise<string | null> {
  gpuSupport ??= (async () => {
    const gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu;
    const adapter = await gpu?.requestAdapter({ powerPreference: 'low-power' }).catch(() => null);
    if (!adapter) return 'Not available: this webview has no WebGPU.';
    return adapter.features.has('dual-source-blending')
      ? null
      : "Not available: this GPU can't blend each colour channel on its own.";
  })();
  return gpuSupport;
}

/** Why the Settings toggle cannot turn subpixel text on with `renderer`, or null when it can. */
export async function subpixelTextUnavailable(
  renderer: TerminalRendererSetting,
): Promise<string | null> {
  if (renderer === 'webgl') return 'Not available with the WebGL renderer.';
  // Text is hinted everywhere but macOS (`hintingEnabled`); not imported from there, because it
  // would bring the glyph rasterizer into the Settings window.
  if (IS_MAC) return 'Not available on macOS.';
  return webGpuUnavailable();
}
