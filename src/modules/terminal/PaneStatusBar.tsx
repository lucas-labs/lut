import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { ProfileMenuItems, useProfiles } from '@/modules/profiles';
import { AlertIcon, CheckmarkCircleIcon, ChevronIcon } from '@lut/lut-icons';
import type { ReactNode } from 'react';

/** The bar's height: the terminal keeps this much room under its text while a bar shows. */
export const PANE_BAR_HEIGHT = 40;

/** A bar over a pane's bottom edge (E11-04 design): what happened, and what the pane can do next. */
function PaneBar({ alert, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <div
      role={alert ? 'alert' : 'status'}
      aria-live={alert ? undefined : 'polite'}
      className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2.5 overflow-hidden border-t bg-card px-2.5 text-xs whitespace-nowrap text-muted-foreground"
      style={{ height: PANE_BAR_HEIGHT }}
    >
      {children}
    </div>
  );
}

type ExitBarProps = {
  code: number;
  /** The profile asks what to do: Restart (Enter) and Close pane (Esc). Else the bar only tells. */
  ask: boolean;
  onRestart: () => void;
  onClose: () => void;
};

/** The pane's process exited and the pane stays open, per its profile's `closeBehavior`. */
export function PaneExitBar({ code, ask, onRestart, onClose }: ExitBarProps) {
  const failed = code !== 0;
  return (
    <PaneBar>
      {failed ? (
        <AlertIcon size="sm" className="shrink-0 text-destructive" />
      ) : (
        <CheckmarkCircleIcon size="sm" className="shrink-0" />
      )}
      <strong className="shrink-0 font-medium text-foreground">Process exited</strong>
      <Badge variant={failed ? 'destructive' : 'secondary'} className="font-mono">
        code {code}
      </Badge>
      <span className="flex-1" />
      {ask && (
        <>
          <Button variant="outline" size="sm" onClick={onRestart}>
            Restart
            <Kbd>Enter</Kbd>
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close pane
            <Kbd>Esc</Kbd>
          </Button>
        </>
      )}
    </PaneBar>
  );
}

type LaunchBarProps = {
  /** Native's explanation of why the profile could not open. */
  message: string;
  onRetry: () => void;
  /** Opens the pane with another profile; none is the default one. */
  onOpenWith: (profileId?: string) => void;
};

/** The pane's profile cannot open: it is gone, or what it runs is missing. */
export function PaneLaunchBar({ message, onRetry, onOpenWith }: LaunchBarProps) {
  const profiles = useProfiles();
  return (
    <PaneBar alert>
      <AlertIcon size="sm" className="shrink-0 text-destructive" />
      <strong className="min-w-0 truncate font-medium text-foreground" title={message}>
        {message}
      </strong>
      <span className="flex-1" />
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
      <Button variant="outline" size="sm" onClick={() => onOpenWith()}>
        Open with default profile
      </Button>
      {profiles && profiles.profiles.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Choose profile
              <ChevronIcon size="sm" rotate={90} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="min-w-56">
            <DropdownMenuLabel>Open with</DropdownMenuLabel>
            <ProfileMenuItems list={profiles} onPick={(id) => onOpenWith(id)} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </PaneBar>
  );
}
