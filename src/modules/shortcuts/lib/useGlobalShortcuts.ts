import { usePreferencesStore } from '@/modules/settings/preferences';
import { useEffect, useEffectEvent } from 'react';
import { type ShortcutId, SHORTCUTS } from '../shortcuts';
import { resolveShortcut } from './resolveShortcut';

type ShortcutHandler = (e: KeyboardEvent) => void;
export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

export type UseGlobalShortcutsOptions = {
  isDisabled?: (id: ShortcutId, e: KeyboardEvent) => boolean;
};

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  options?: UseGlobalShortcutsOptions,
) {
  const current = useEffectEvent(() => ({ handlers, options }));

  // Access the shortcuts from the store
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { handlers, options } = current();
      const id = resolveShortcut(e, {
        shortcuts: SHORTCUTS,
        user: userShortcuts,
        isDisabled: options?.isDisabled,
        hasHandler: (candidate) => handlers[candidate] !== undefined,
      });
      if (id === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handlers[id]?.(e);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [userShortcuts]);
}
