import { USE_CUSTOM_WINDOW_CONTROLS } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from './windowControlIcons';

type Props = {
  /** Render only the close button (used by the settings window). */
  closeOnly?: boolean;
};

export function WindowControls({ closeOnly = false }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!USE_CUSTOM_WINDOW_CONTROLS || closeOnly) return;
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void w.isMaximized().then(setMaximized);
    void w
      .onResized(() => {
        void w.isMaximized().then(setMaximized);
      })
      .then((un) => {
        unlisten = un;
      });
    return () => unlisten?.();
  }, [closeOnly]);

  if (!USE_CUSTOM_WINDOW_CONTROLS) return null;

  const w = getCurrentWindow();

  return (
    <div className="flex h-full shrink-0 items-start self-start">
      {!closeOnly && (
        <>
          <CtlButton ariaLabel="Minimize" onClick={() => void w.minimize()}>
            <MinimizeIcon />
          </CtlButton>
          <CtlButton ariaLabel={maximized ? 'Restore' : 'Maximize'} onClick={() => void w.toggleMaximize()}>
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </CtlButton>
        </>
      )}
      <CtlButton ariaLabel="Close" onClick={() => void w.close()} danger>
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
