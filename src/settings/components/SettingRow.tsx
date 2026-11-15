import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

/** One setting: its name and what it does on the left, the control on the right. */
export function SettingRow({ title, description, children, className }: Props) {
  return (
    <div className={cn('flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? <span className="text-[12px] leading-4 text-muted-foreground">{description}</span> : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}
