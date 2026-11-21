import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { offersProfiles, ProfileMenuItems, useProfiles } from '@/modules/profiles';
import { AlertIcon, CheckmarkCircleIcon, ChevronIcon, MoreIcon } from '@lut/lut-icons';
import type { ReactNode } from 'react';

/** The bar's height: the terminal keeps this much room under its text while a bar shows. */
export const PANE_BAR_HEIGHT = 40;

/**
 * A bar over a pane's bottom edge (E11-04 design): what happened, and what the pane can do next.
 * It is a size container: a narrow pane shows the compact actions (`menu`) instead of the
 * buttons, so the bar keeps one line and its height.
 */
function PaneBar({
  alert,
  wideFrom,
  children,
  buttons,
  menu,
}: {
  alert?: boolean;
  /** The widest of the two: where the buttons fit. */
  wideFrom: 'md' | 'xl';
  children: ReactNode;
  buttons?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <div
      role={alert ? 'alert' : 'status'}
      aria-live={alert ? undefined : 'polite'}
      className="@container absolute inset-x-0 bottom-0 z-10 border-t bg-card text-xs whitespace-nowrap text-muted-foreground"
      style={{ height: PANE_BAR_HEIGHT }}
    >
      <div className="flex h-full items-center gap-2.5 overflow-hidden px-2.5">
        {children}
        <span className="flex-1" />
        {buttons ? (
          <span
            className={
              wideFrom === 'md' ? 'hidden items-center gap-2.5 @md:flex' : 'hidden items-center gap-2.5 @xl:flex'
            }
          >
            {buttons}
          </span>
        ) : null}
        {menu ? <span className={wideFrom === 'md' ? 'flex @md:hidden' : 'flex @xl:hidden'}>{menu}</span> : null}
      </div>
    </div>
  );
}

/** The compact actions of a narrow pane: one button that opens them in a menu. */
function PaneActionsMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Pane actions" title="Pane actions">
          <MoreIcon size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <PaneBar
      wideFrom="md"
      buttons={
        ask && (
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
        )
      }
      menu={
        ask && (
          <PaneActionsMenu>
            <DropdownMenuItem onSelect={onRestart}>
              <span className="flex-1">Restart</span>
              <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onClose}>
              <span className="flex-1">Close pane</span>
              <DropdownMenuShortcut>Esc</DropdownMenuShortcut>
            </DropdownMenuItem>
          </PaneActionsMenu>
        )
      }
    >
      {failed ? (
        <AlertIcon size="sm" className="shrink-0 text-destructive" />
      ) : (
        <CheckmarkCircleIcon size="sm" className="shrink-0" />
      )}
      <strong className="min-w-0 truncate font-medium text-foreground">Process exited</strong>
      <Badge variant={failed ? 'destructive' : 'secondary'} className="font-mono">
        code {code}
      </Badge>
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
    <PaneBar
      alert
      wideFrom="xl"
      buttons={
        <>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenWith()}>
            Open with default profile
          </Button>
          {offersProfiles(profiles) && (
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
        </>
      }
      menu={
        <PaneActionsMenu>
          <DropdownMenuItem onSelect={onRetry}>Retry</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenWith()}>Open with default profile</DropdownMenuItem>
          {offersProfiles(profiles) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Open with</DropdownMenuLabel>
              <ProfileMenuItems list={profiles} onPick={(id) => onOpenWith(id)} />
            </>
          )}
        </PaneActionsMenu>
      }
    >
      <AlertIcon size="sm" className="shrink-0 text-destructive" />
      <strong className="min-w-0 truncate font-medium text-foreground" title={message}>
        {message}
      </strong>
    </PaneBar>
  );
}
