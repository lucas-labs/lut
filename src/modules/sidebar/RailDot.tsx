import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

/**
 * A state on a compact sidebar button (E27-03): a 7 px dot at its top right corner, ringed in the rail's colour to
 * stand apart from a tinted button. The button is `relative`; the colour comes from `className`.
 */
export function RailDot({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-0.5 right-0.5 size-[7px] rounded-full ring-2 ring-frame',
        className,
      )}
      {...props}
    />
  );
}
