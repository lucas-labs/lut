import { cn } from '@/lib/utils';
import {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
  USE_CUSTOM_WINDOW_CONTROLS,
  useWindowFullScreen,
} from '@/modules/platform';
import { useEffect, useState } from 'react';
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from './windowControlIcons';

type Props = {
  /** Render only the close button (used by the settings window). */
  closeOnly?: boolean;
};

export function WindowControls({ closeOnly = false }: Props) {
  const [maximized, setMaximized] = useState(false);
  const fullScreen = useWindowFullScreen();

  useEffect(() => {
    if (!USE_CUSTOM_WINDOW_CONTROLS || closeOnly) return;
    const sync = () => void isWindowMaximized().then(setMaximized);
    sync();
    return onWindowResized(sync);
  }, [closeOnly]);

  if (!USE_CUSTOM_WINDOW_CONTROLS) return null;

  return (
    <div className="flex h-full shrink-0 items-start self-start">
      {!closeOnly && (
        <CtlButton ariaLabel="Minimize" onClick={() => void minimizeWindow()}>
          <MinimizeIcon />
        </CtlButton>
      )}
      {/* Maximize means nothing to a full-screen window; F11 leaves full screen. */}
      {!closeOnly && !fullScreen && (
        <CtlButton ariaLabel={maximized ? 'Restore' : 'Maximize'} onClick={() => void toggleMaximizeWindow()}>
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </CtlButton>
      )}
      <CtlButton ariaLabel="Close" onClick={() => void closeWindow()} danger>
        <CloseIcon />
      </CtlButton>
    </div>
  );
}

function CtlButton({
  ariaLabel,
  onClick,
  children,
  danger,
}: {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      className={cn(
        'grid h-7 w-10 shrink-0 place-items-center text-muted-foreground transition-colors',
        danger ? 'hover:bg-destructive hover:text-foreground' : 'hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
