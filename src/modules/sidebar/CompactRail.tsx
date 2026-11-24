import { AppLogo } from '@/components/AppLogo';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** The rail's fixed width (E27-01): it hides and shows like the sidebar, but never resizes. */
export const COMPACT_RAIL_WIDTH = 32;

type Props = {
  /** The Spaces view in its compact form. */
  spaces: ReactNode;
  /** The active space's tabs in their compact form (E27-02); null with horizontal tabs, which stay in the strip. */
  tabs: ReactNode | null;
  /** The buttons that open the sidebar's views beside the rail (E27-04), at its bottom. */
  views: ReactNode;
};

/**
 * The compact sidebar (E27-01): a 32 px rail in place of the sidebar and the vertical tab column. It lays out the
 * compact views of the spaces and of the tabs, each the full sidebar's component drawn as buttons: each group scrolls
 * on its own above its +; with both, each takes at most half of the room above the view buttons, which sit at the
 * bottom.
 */
export function CompactRail({ spaces, tabs, views }: Props) {
  return (
    <nav aria-label="Compact sidebar" className="flex h-full min-h-0 flex-col items-center gap-1 py-2">
      {/* lut's compact mark leads the rail, as the wordmark leads the title bar. */}
      <span data-slot="rail-logo" className="mb-1 flex h-6 shrink-0 items-center text-muted-foreground">
        <AppLogo compact size="sm" />
      </span>
      <div data-slot="rail-groups" className="flex min-h-0 flex-1 flex-col items-center gap-1">
        <div data-slot="rail-spaces" className={cn('flex min-h-0 flex-col', tabs && 'max-h-1/2')}>
          {spaces}
        </div>
        {tabs ? (
          <>
            <span aria-hidden data-slot="rail-separator" className="my-1 h-px w-4 shrink-0 bg-border" />
            <div data-slot="rail-tabs" className="flex max-h-1/2 min-h-0 flex-col">
              {tabs}
            </div>
          </>
        ) : null}
      </div>
      <div data-slot="rail-views" className="mt-1 flex shrink-0 flex-col items-center">
        {views}
      </div>
    </nav>
  );
}
