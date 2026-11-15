import { cn } from '@/lib/utils';
import { type ReactNode, useId } from 'react';

/** Spread on a row's control so it is named by the row's title and described by its description. */
export type SettingRowA11y = {
  'aria-labelledby': string;
  'aria-describedby': string | undefined;
};

type Props = {
  title: ReactNode;
  description?: string;
  /** The control, or a function that receives the ids naming it, for a row whose control has no name of its own. */
  children: ReactNode | ((a11y: SettingRowA11y) => ReactNode);
  className?: string;
};

/** One setting: its name and what it does on the left, the control on the right. */
export function SettingRow({ title, description, children, className }: Props) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn('flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="font-medium">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="text-[12px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {typeof children === 'function'
          ? children({ 'aria-labelledby': titleId, 'aria-describedby': descriptionId })
          : children}
      </div>
    </div>
  );
}
