import { cn } from '@/lib/utils';
import { TabIcon, type TabNavigatorItem, TabStatus } from '@/modules/navigation';
import { useMemo } from 'react';
import type { TabSwitcherState } from './lib/useTabSwitcher';

/** The Ctrl+Tab switcher: the space's tabs in most-recently-used order, with the one to switch to marked. */
export function TabSwitcher({ items, state }: { items: TabNavigatorItem[]; state: TabSwitcherState }) {
  const byId = useMemo(() => new Map(items.map((t) => [t.id, t])), [items]);
  const rows = state.order.map((id) => byId.get(id)).filter((t): t is TabNavigatorItem => t !== undefined);
  const selectedId = state.order[state.index];

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <div className="flex max-h-[60vh] w-72 flex-col overflow-y-auto rounded-[8px] border border-border bg-popover p-1 shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
        {rows.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex h-7 shrink-0 items-center gap-2 rounded-[5px] px-2 text-sm',
              t.id === selectedId ? 'bg-accent text-foreground' : 'text-muted-foreground',
            )}
          >
            <TabIcon id={t.id} />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {t.detail && <span className="shrink-0 truncate text-[11px] text-muted-foreground">{t.detail}</span>}
            <TabStatus id={t.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
