import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { createContext, type ReactNode, useContext } from 'react';

/**
 * Where macOS's traffic lights sit beside the sidebar's headers: at the views' own corner (the sidebar leads the
 * window), past the compact rail (the views open beside it), or not in their row (null).
 */
export type SidebarTrafficLights = 'corner' | 'rail' | null;

type HeaderRow = { lights: SidebarTrafficLights; drag: boolean };

const HeaderRowContext = createContext<HeaderRow>({ lights: null, drag: false });

/**
 * The row the sidebar's view headers sit in. With `drag`, beside the title bar at the window's top, a header drags the
 * window as the bar does. On macOS the traffic lights can share that row: with `lights`, a header is 28px high, its
 * title past the lights (80px from the window's edge, as the title bar's).
 */
export function SidebarHeaderRow({ lights, drag, children }: HeaderRow & { children: ReactNode }) {
  return <HeaderRowContext value={{ lights, drag }}>{children}</HeaderRowContext>;
}

const HEADER_INSET = { corner: 'h-7 pl-20', rail: 'h-7 pl-12' } as const;

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
  const { lights, drag } = useContext(HeaderRowContext);
  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <div
        // `deep`: the title drags the window too, the actions stay buttons.
        data-tauri-drag-region={drag ? 'deep' : undefined}
        className={cn(
          'flex shrink-0 items-center gap-2 overflow-hidden pr-1.5',
          lights ? HEADER_INSET[lights] : 'h-[30px] pl-[18px]',
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
