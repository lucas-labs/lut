import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { AlertFilledIcon, DownloadIcon } from '@lut/lut-icons';
import { useEffect, useState } from 'react';
import { type DownloadProgress, type RestartBlocker, useUpdateStore } from './updateStore';

type Props = {
  /** What restarting would lose (the app's close guard); asked when the dialog opens and after the download. */
  restartBlocker: RestartBlocker;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressLabel({ downloaded, total }: DownloadProgress): string {
  return total ? `${formatBytes(downloaded)} of ${formatBytes(total)}` : formatBytes(downloaded);
}

/** The update dialog of the main window (E25-06): offer, download, restart. */
export function UpdateDialog({ restartBlocker }: Props) {
  const update = useUpdateStore((s) => s.update);
  const phase = useUpdateStore((s) => s.phase);
  const progress = useUpdateStore((s) => s.progress);
  const readyBlocker = useUpdateStore((s) => s.blocker);
  const installError = useUpdateStore((s) => s.installError);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const install = useUpdateStore((s) => s.install);
  const restartNow = useUpdateStore((s) => s.restartNow);
  const [offerBlocker, setOfferBlocker] = useState<string | null>(null);

  const open = phase !== 'closed' && update !== null;
  const working = phase === 'downloading' || phase === 'installing';

  useEffect(() => {
    if (phase !== 'offer') return;
    let current = true;
    void restartBlocker().then((message) => {
      if (current) setOfferBlocker(message);
    });
    return () => {
      current = false;
    };
  }, [phase, restartBlocker]);

  if (!open) return null;

  const version = update.version;
  const percent = progress?.total ? Math.min(100, (progress.downloaded / progress.total) * 100) : null;
  const blocker = phase === 'ready' ? readyBlocker : phase === 'offer' ? offerBlocker : null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        showCloseButton={!working}
        onEscapeKeyDown={(event) => working && event.preventDefault()}
        onInteractOutside={(event) => working && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex gap-1.75">
            <DownloadIcon size="md" />
            {phase === 'failed'
              ? "Couldn't install the update"
              : phase === 'installed'
                ? `lut ${version} was installed`
                : phase === 'downloading'
                  ? `Downloading lut ${version}…`
                  : phase === 'installing'
                    ? `Installing lut ${version}…`
                    : phase === 'ready'
                      ? `lut ${version} is ready`
                      : `lut ${version} is available`}
          </DialogTitle>
          <DialogDescription>
            {phase === 'failed'
              ? 'Nothing was installed.'
              : phase === 'installed'
                ? "lut couldn't restart. Restart it to use the new version."
                : phase === 'downloading' && progress
                  ? progressLabel(progress)
                  : phase === 'installing'
                    ? 'lut restarts when it is done.'
                    : phase === 'ready'
                      ? 'Restart lut to finish installing.'
                      : `You have ${update.currentVersion}.`}
          </DialogDescription>
        </DialogHeader>

        {phase === 'offer' && update.body ? (
          <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
            {update.body}
          </div>
        ) : null}

        {phase === 'downloading' ? (
          <Progress value={percent ?? undefined} className={percent === null ? 'animate-pulse' : undefined} />
        ) : null}

        {(phase === 'failed' || phase === 'installed') && installError ? (
          <div className="text-xs text-destructive">{installError}</div>
        ) : null}

        {blocker ? (
          <div className="flex items-start gap-1.5 text-xs text-warning">
            <AlertFilledIcon size="xs" className="mt-0.5 shrink-0" />
            {blocker}
          </div>
        ) : null}

        {phase === 'offer' ? (
          <DialogFooter>
            <Button variant="ghost" size="lg" onClick={dismiss}>
              Later
            </Button>
            <Button size="lg" onClick={() => void install(restartBlocker)}>
              Install and restart
            </Button>
          </DialogFooter>
        ) : phase === 'ready' ? (
          <DialogFooter>
            <Button variant="ghost" size="lg" onClick={dismiss}>
              Cancel
            </Button>
            <Button size="lg" onClick={() => void restartNow()}>
              Restart now
            </Button>
          </DialogFooter>
        ) : phase === 'failed' || phase === 'installed' ? (
          <DialogFooter>
            <Button size="lg" onClick={dismiss}>
              Close
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
