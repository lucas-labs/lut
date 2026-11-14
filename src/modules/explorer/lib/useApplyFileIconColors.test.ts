// @vitest-environment happy-dom
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { FileIconColors } from '@/modules/settings/store';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useApplyFileIconColors } from './useApplyFileIconColors';

function Probe() {
  useApplyFileIconColors();
  return null;
}

describe('useApplyFileIconColors', () => {
  it('puts the setting on the root and follows its changes', () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Probe)));
    expect(document.documentElement.dataset.fileIcons).toBe('theme');

    act(() => usePreferencesStore.setState({ fileIconColors: 'monochrome' }));
    expect(document.documentElement.dataset.fileIcons).toBe('monochrome');

    // A value from another build of the settings file falls back to the default.
    act(() => usePreferencesStore.setState({ fileIconColors: 'sepia' as FileIconColors }));
    expect(document.documentElement.dataset.fileIcons).toBe('theme');
    act(() => root.unmount());
  });
});
