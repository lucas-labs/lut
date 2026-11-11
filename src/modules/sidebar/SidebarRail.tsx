import { cn } from '@/lib/utils';
import { DashboardSquare01Icon, Folder01Icon, GitBranchIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { SidebarViewId } from './types';

type RailItem = {
  id: SidebarViewId;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]['icon'];
  badge?: number;
};

type Props = {
  activeView: SidebarViewId;
  onSelectView: (view: SidebarViewId) => void;
  changedCount: number;
};

/** The sidebar's view switcher, at its bottom (E11-02 design). */
export function SidebarRail({ activeView, onSelectView, changedCount }: Props) {
  const items: RailItem[] = [
    { id: 'spaces', label: 'Spaces', icon: DashboardSquare01Icon },
    { id: 'explorer', label: 'Files', icon: Folder01Icon },
    { id: 'source-control', label: 'Git', icon: GitBranchIcon, badge: changedCount },
  ];

  return (
    <div role="tablist" aria-label="Sidebar view" className="flex shrink-0 gap-0.5 border-t border-border p-1.5">
      {items.map((item) => {
        const isActive = item.id === activeView;
        const badge = item.badge ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectView(item.id)}
            className={cn(
              'flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1 text-xs whitespace-nowrap outline-none transition-colors',
              'focus-visible:ring-1 focus-visible:ring-ring',
              isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.5} className="shrink-0" />
            <span>{item.label}</span>
            {badge > 0 ? (
              <span
                className={cn(
                  'rounded-full px-[5px] text-[10px] leading-[15px] tabular-nums text-muted-foreground',
                  isActive ? 'bg-popover' : 'bg-accent',
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
