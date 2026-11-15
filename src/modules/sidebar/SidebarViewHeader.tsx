import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

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
  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <div className="flex h-[30px] shrink-0 items-center gap-2 overflow-hidden pr-1.5 pl-[18px]">
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
