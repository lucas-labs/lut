import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { createContext, type ReactNode, useContext } from 'react';

/** Whether the sidebar's headers share their row with macOS's traffic lights. */
const TrafficLightsRowContext = createContext(false);

/**
 * On macOS, with the title bar beside the sidebar (horizontal tabs), the traffic lights sit in the sidebar's header
 * row: inside `clear`, a view's header is that row, 28px high, its title after the lights, and drags the window.
 */
export function SidebarTrafficLightsRow({ clear, children }: { clear: boolean; children: ReactNode }) {
  return <TrafficLightsRowContext value={clear}>{children}</TrafficLightsRowContext>;
}

/**
 * The header of a sidebar view (E11-02 design): the view's title, then its actions. `titleHint` is shown on hovering
 * the title, such as the full path a short title stands for.
 */
export function SidebarViewHeader({
  title,
  titleHint,
  children,
}: {
  title: string;
  titleHint?: string;
  children?: ReactNode;
}) {
  const lightsRow = useContext(TrafficLightsRowContext);
  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <div
        // `deep`: the title drags the window too, the actions stay buttons.
        data-tauri-drag-region={lightsRow ? 'deep' : undefined}
        className={cn(
          'flex shrink-0 items-center gap-2 overflow-hidden pr-1.5',
          lightsRow ? 'h-7 pl-20' : 'h-[30px] pl-[18px]',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={titleHint}>
          {title}
        </span>
        {children}
      </div>
    </TooltipProvider>
  );
}

/** An icon action in a sidebar view's header, named by its tooltip. */
export function SidebarHeaderAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
