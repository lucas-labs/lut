import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHoldTitleBar } from '@/lib/titleBarHold';
import { cn } from '@/lib/utils';
import type { TabNavigatorItem } from '@/modules/navigation';
import { ChevronIcon } from '@lut/lut-icons';
import { useState } from 'react';
import { SEGMENT_CLASS, useMenuCloseFocus } from './CwdBreadcrumb';

type FocusCrumbSpace = { id: string; name: string };

type Props = {
  spaces: readonly FocusCrumbSpace[];
  activeSpaceId: string | null;
  onSwitchSpace: (id: string) => void;
  /** The active space's tabs. */
  tabs: readonly TabNavigatorItem[];
  onSelectTab: (id: number) => void;
};

type MenuOption = { value: string; label: string };

/** One segment of the trail: its label, and a menu of the options to switch to. */
function CrumbMenu({
  label,
  current,
  options,
  onPick,
  className,
  ariaLabel,
}: {
  label: string;
  current: string | null;
  options: MenuOption[];
  onPick: (value: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const closeFocus = useMenuCloseFocus();
  // The bar is an overlay in focus mode: it stays shown while its menu is open.
  useHoldTitleBar(open);
  return (
    // Not modal, like the bar's other menus: a modal menu turns pointer events off on `body`, so the overlay bar
    // would show the terminal's text cursor, and another segment's menu would open over this one.
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={ariaLabel} className={cn(SEGMENT_CLASS, className)}>
          <span className="max-w-40 truncate">{label}</span>
          <ChevronIcon size="xs" rotate={90} className="opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto" {...closeFocus}>
        <DropdownMenuRadioGroup value={current ?? ''} onValueChange={onPick}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <span className="max-w-64 truncate">{o.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Where focus mode is (E12-10 design): the active space and its active tab, each a menu that switches to another one,
 * since the sidebar and the tabs are hidden.
 */
export function FocusCrumbs({ spaces, activeSpaceId, onSwitchSpace, tabs, onSelectTab }: Props) {
  const space = spaces.find((s) => s.id === activeSpaceId);
  const tab = tabs.find((t) => t.active);
  return (
    <nav aria-label="Space and tab" className="ml-2 flex min-w-0 shrink items-center gap-px text-xs whitespace-nowrap">
      {space ? (
        <CrumbMenu
          ariaLabel={`Space: ${space.name}`}
          label={space.name}
          current={space.id}
          options={spaces.map((s) => ({ value: s.id, label: s.name }))}
          onPick={onSwitchSpace}
        />
      ) : null}
      {space && tab ? (
        <span aria-hidden className="px-0.5 text-muted-foreground opacity-55">
          /
        </span>
      ) : null}
      {tab ? (
        <CrumbMenu
          ariaLabel={`Tab: ${tab.title}`}
          label={tab.title}
          current={String(tab.id)}
          options={tabs.map((t) => ({ value: String(t.id), label: t.title }))}
          onPick={(value) => onSelectTab(Number(value))}
          className="text-foreground"
        />
      ) : null}
    </nav>
  );
}
