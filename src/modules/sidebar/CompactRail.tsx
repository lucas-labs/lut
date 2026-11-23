import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PlusIcon } from '@lut/lut-icons';
import type { ReactNode } from 'react';

/** The rail's fixed width (E27-01): it hides and shows like the sidebar, but never resizes. */
export const COMPACT_RAIL_WIDTH = 32;

type CompactRailSpace = { id: string; name: string };

type Props = {
  spaces: readonly CompactRailSpace[];
  activeSpaceId: string | null;
  onSwitchSpace: (id: string) => void;
  onNewSpace: () => void;
};

/** A space's mark on the rail: the first character of its name, upper-cased; an emoji stays whole. */
export function spaceInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** A rail button's name, shown to the right of the rail, over the terminals. */
function RailTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The compact sidebar (E27-01): a 32 px rail in place of the sidebar and the vertical tab column, with one button per
 * space and one that opens a new space.
 */
export function CompactRail({ spaces, activeSpaceId, onSwitchSpace, onNewSpace }: Props) {
  return (
    <nav aria-label="Compact sidebar" className="flex h-full min-h-0 flex-col items-center gap-1 py-2">
      {spaces.map((space) => (
        <RailTip key={space.id} label={space.name}>
          <Button
            variant="rail"
            size="icon-sm"
            aria-label={space.name}
            aria-current={space.id === activeSpaceId ? 'true' : undefined}
            onClick={() => onSwitchSpace(space.id)}
          >
            <span className="font-semibold">{spaceInitial(space.name)}</span>
          </Button>
        </RailTip>
      ))}
      <RailTip label="Open space">
        <Button variant="rail" size="icon-sm" aria-label="Open space" onClick={onNewSpace} className="mt-1">
          <PlusIcon size="sm" />
        </Button>
      </RailTip>
    </nav>
  );
}
