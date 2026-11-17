import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type LspPreset, redetectBinary } from '@/modules/lsp';
import { setLspActivation } from '@/modules/settings/store';
import { CheckmarkIcon, CopyIcon, RefreshIcon } from '@lut/lut-icons';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';

type Props = {
  server: LspPreset | null;
  onClose: () => void;
};

export function LspInstallDialog({ server, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!server) return null;

  const copyInstallCommand = async () => {
    if (!server.install) return;
    try {
      await navigator.clipboard.writeText(server.install.command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const checkAgain = async () => {
    setChecking(true);
    setNotFound(false);
    const path = await redetectBinary(server.command);
    if (path) {
      await setLspActivation(server.id, 'enabled');
      onClose();
      return;
    }
    setChecking(false);
    setNotFound(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install {server.name} language server</DialogTitle>
          <DialogDescription>
            lut could not find <code className="font-mono text-foreground">{server.command}</code> on your PATH. Install
            it, then check again to enable this language server.
          </DialogDescription>
        </DialogHeader>

        {server.install ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px]">
            <span className="min-w-0 flex-1 select-text break-all">{server.install.command}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void copyInstallCommand()}
              aria-label="Copy install command"
              title="Copy install command"
            >
              {copied ? <CheckmarkIcon size="sm" /> : <CopyIcon size="sm" />}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Install this custom server manually and make sure its command is available on PATH.
          </p>
        )}

        {notFound ? (
          <p className="text-xs text-destructive">
            Still not found. Finish the installation and make sure the command is available on PATH.
          </p>
        ) : null}

        <DialogFooter className="items-center sm:justify-between">
          {server.install ? (
            <Button
              variant="ghost"
              size="lg"
              className="mr-auto"
              onClick={() => void openUrl(server.install?.docsUrl ?? '').catch(console.error)}
            >
              Documentation
            </Button>
          ) : (
            <span />
          )}
          <Button size="lg" disabled={checking} onClick={() => void checkAgain()}>
            <RefreshIcon size="sm" className={checking ? 'animate-spin' : undefined} />
            {checking ? 'Checking...' : 'Check again'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
