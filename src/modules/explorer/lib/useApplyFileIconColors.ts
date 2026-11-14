import { usePreferencesStore } from '@/modules/settings/preferences';
import { coerceFileIconColors } from '@/modules/settings/store';
import { useEffect } from 'react';

/** Puts the "File icon colors" setting on the root, where `globals.css` maps the icon colours for it (E10-18). */
export function useApplyFileIconColors(): void {
  const colors = usePreferencesStore((s) => coerceFileIconColors(s.fileIconColors));

  useEffect(() => {
    document.documentElement.dataset.fileIcons = colors;
  }, [colors]);
}
