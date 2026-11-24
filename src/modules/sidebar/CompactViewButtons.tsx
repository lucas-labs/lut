import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRovingFocus } from '@/lib/useRovingFocus';
import { FolderIcon, GitBranchIcon } from '@lut/lut-icons';
import { RailDot } from './RailDot';
import type { SidebarViewId } from './types';

type Props = {
  /** The view open beside the rail; null while the sidebar's panel is closed. */
  activeView: SidebarViewId | null;
  onSelectView: (view: SidebarViewId) => void;
  changedCount: number;
};

/** "3 changes", "1 change". */
const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;

/**
 * The compact sidebar's Files and Git buttons (E27-04), `SidebarRail` for the rail: each opens its view in the
 * sidebar's panel beside the rail, or closes it when it is the open one. Git carries a dot while there are changes.
 */
export function CompactViewButtons({ activeView, onSelectView, changedCount }: Props) {
  const items = [
    { id: 'explorer', label: 'Files', tip: 'Files', icon: FolderIcon, dot: false },
    {
      id: 'source-control',
      label: changedCount > 0 ? `Git, ${changes(changedCount)}` : 'Git',
      tip: changedCount > 0 ? `Git · ${changes(changedCount)}` : 'Git',
      icon: GitBranchIcon,
      dot: changedCount > 0,
    },
  ] as const;
  // One Tab stop, the arrow keys move between the two (E27-13).
  const roving = useRovingFocus(
    items.map((item) => item.id),
    activeView,
    'vertical',
  );

  return (
    <fieldset {...roving.group} className="m-0 flex min-w-0 shrink-0 flex-col items-center gap-1 border-0 p-0">
      <legend className="sr-only">Sidebar views</legend>
      {items.map((item) => (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>
            <Button
              variant="rail"
              size="icon-sm"
              aria-label={item.label}
              aria-pressed={activeView === item.id}
              {...roving.item(item.id)}
              onClick={() => onSelectView(item.id)}
              className="relative"
            >
              <item.icon size="sm" />
              {item.dot ? <RailDot data-slot="changes-dot" className="bg-warning" /> : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            {item.tip}
          </TooltipContent>
        </Tooltip>
      ))}
    </fieldset>
  );
}
