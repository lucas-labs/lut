import { cn } from '@/lib/utils';
import {
  closeWindow,
  IS_LINUX,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
  USE_CUSTOM_WINDOW_CONTROLS,
  useWindowFullScreen,
} from '@/modules/platform';
import {
  LinuxWindowCloseIcon,
  LinuxWindowMaximizeIcon,
  LinuxWindowMinimizeIcon,
  LinuxWindowRestoreIcon,
  WindowCloseIcon,
  WindowMaximizeIcon,
  WindowMinimizeIcon,
  WindowRestoreIcon,
} from '@lut/lut-icons';
import { useEffect, useState } from 'react';

/** Each OS's glyphs: GNOME's rounded ones on Linux, Windows' caption glyphs elsewhere. */
const ICONS = IS_LINUX
  ? {
      Minimize: LinuxWindowMinimizeIcon,
      Maximize: LinuxWindowMaximizeIcon,
      Restore: LinuxWindowRestoreIcon,
      Close: LinuxWindowCloseIcon,
    }
  : { Minimize: WindowMinimizeIcon, Maximize: WindowMaximizeIcon, Restore: WindowRestoreIcon, Close: WindowCloseIcon };

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
    <div
      className={cn(
        'flex shrink-0 self-start',
        // Linux: GNOME's round buttons, spaced apart; Windows: caption buttons flush with the corner.
        IS_LINUX ? 'h-7 items-center gap-2.5 px-1.5' : 'h-full items-start',
      )}
    >
      {!closeOnly && (
        <CtlButton ariaLabel="Minimize" onClick={() => void minimizeWindow()}>
          <ICONS.Minimize size="xs" />
        </CtlButton>
      )}
      {/* Maximize means nothing to a full-screen window; F11 leaves full screen. */}
      {!closeOnly && !fullScreen && (
        <CtlButton ariaLabel={maximized ? 'Restore' : 'Maximize'} onClick={() => void toggleMaximizeWindow()}>
          {maximized ? <ICONS.Restore size="xs" /> : <ICONS.Maximize size="xs" />}
        </CtlButton>
      )}
      <CtlButton ariaLabel="Close" onClick={() => void closeWindow()} danger>
        <ICONS.Close size="xs" />
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
        'grid shrink-0 place-items-center transition-colors',
        IS_LINUX
          ? 'size-5 rounded-full bg-accent text-foreground hover:bg-border'
          : cn(
              'h-7 w-10 text-muted-foreground',
              danger ? 'hover:bg-destructive hover:text-foreground' : 'hover:bg-accent hover:text-foreground',
            ),
      )}
    >
      {children}
    </button>
  );
}
