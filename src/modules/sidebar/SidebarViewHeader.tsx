import { cn } from '@/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

/** The header of a sidebar view (E11-02 design): the view's title, then its actions. */
export function SidebarViewHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-2 overflow-hidden pr-1.5 pl-[18px]">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

/** An icon action in a sidebar view's header. */
export function SidebarHeaderButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors',
        'hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}
