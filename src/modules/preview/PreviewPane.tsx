import { Button } from '@/components/ui/button';
import { Alert02Icon, Cancel01Icon, InformationCircleIcon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { isAllowedPreviewUrl, loopbackPreviewOrigin } from './lib/previewUrl';
import { PreviewAddressBar, type PreviewAddressBarHandle } from './PreviewAddressBar';

export type PreviewPaneHandle = {
  reload: () => void;
  focusAddressBar: () => void;
  getUrl: () => string;
};

type Props = {
  url: string;
  visible: boolean;
  onUrlChange: (url: string) => void;
};

// Tear the iframe down after this much invisibility — a background dev
// server page can hold hundreds of MB inside the WebView.
const SUSPEND_AFTER_MS = 30_000;

export const PreviewPane = forwardRef<PreviewPaneHandle, Props>(function PreviewPane(
  { url, visible, onUrlChange },
  ref,
) {
  // `nonce` is part of the iframe `key`. Bumping it remounts the iframe,
  // which is the only reliable cross-origin reload (calling
  // contentWindow.location.reload() throws on cross-origin frames).
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(visible);
  const [dismissedCookieOrigin, setDismissedCookieOrigin] = useState<string | null>(null);
  const addressRef = useRef<PreviewAddressBarHandle>(null);

  // Showing the pane loads the page again if it was suspended.
  if (visible && !loaded) setLoaded(true);

  useEffect(() => {
    if (visible) return;
    const t = setTimeout(() => setLoaded(false), SUSPEND_AFTER_MS);
    return () => clearTimeout(t);
  }, [visible]);

  useImperativeHandle(
    ref,
    () => ({
      reload: () => {
        setLoaded(true);
        setNonce((n) => n + 1);
      },
      focusAddressBar: () => addressRef.current?.focus(),
      getUrl: () => url,
    }),
    [url],
  );

  const allowed = isAllowedPreviewUrl(url);
  const cookieOrigin = loopbackPreviewOrigin(url);
  const showXfoHint = url ? cookieOrigin === null : false;
  const showCookieHint = cookieOrigin !== null && cookieOrigin !== dismissedCookieOrigin;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-background"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <PreviewAddressBar ref={addressRef} url={url} onSubmit={onUrlChange} onReload={() => setNonce((n) => n + 1)} />
      {showXfoHint ? (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border bg-warning/10 px-4 text-[11px] text-warning">
          <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">
            Many public sites refuse to embed (X-Frame-Options). If the page is blank, open it externally.
          </span>
        </div>
      ) : null}
      {showCookieHint ? (
        <div
          role="note"
          className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border bg-info/10 px-4 text-[11px] text-info"
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={12} strokeWidth={1.75} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate" title="Cookie-based sign-in may not work in the sandboxed preview.">
            Cookie-based sign-in may not work in preview.
          </span>
          <button
            type="button"
            onClick={() => void openUrl(url).catch(console.error)}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-info/15"
          >
            <HugeiconsIcon icon={LinkSquare02Icon} size={10} strokeWidth={1.75} />
            Open in browser
          </button>
          <button
            type="button"
            aria-label="Dismiss cookie sign-in notice"
            title="Dismiss"
            onClick={() => setDismissedCookieOrigin(cookieOrigin)}
            className="flex size-5 shrink-0 items-center justify-center rounded opacity-70 hover:bg-info/15 hover:opacity-100"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
          </button>
        </div>
      ) : null}
      {/* No backdrop of our own: the webview paints a page's canvas when its colour scheme differs from the app's,
          and a page that follows the app's dark scheme must show through to the pane's background. */}
      <div className="relative min-h-0 flex-1 bg-background">
        {url && !allowed ? (
          <CenterPlaceholder>
            <p className="text-[13px] font-medium text-destructive">This URL cannot be loaded in preview.</p>
          </CenterPlaceholder>
        ) : url ? (
          loaded ? (
            <iframe
              key={`${url}#${nonce}`}
              src={url}
              title="Preview"
              className="h-full w-full border-0"
              // sandbox grants the bare minimum for a dev preview: scripts,
              // same-origin (cookies/storage for the previewed app), forms,
              // popups for "open in new tab". Critically OMITS
              // `allow-top-navigation*` — without it the iframe cannot
              // navigate the parent Tauri webview to an attacker origin,
              // which would otherwise expose `window.__TAURI__` IPC.
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              referrerPolicy="no-referrer"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          ) : (
            <SuspendedState
              onReload={() => {
                setLoaded(true);
                setNonce((n) => n + 1);
              }}
            />
          )
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
});

/** A message centred in the pane, as the other tools show their empty and error states. */
function CenterPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">{children}</div>
  );
}

function SuspendedState({ onReload }: { onReload: () => void }) {
  return (
    <CenterPlaceholder>
      <p className="text-[13px] font-medium text-foreground">Preview suspended</p>
      <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
        Released to free memory after sitting in the background.
      </p>
      <Button size="sm" onClick={onReload}>
        Reload
      </Button>
    </CenterPlaceholder>
  );
}

function EmptyState() {
  return (
    <CenterPlaceholder>
      <p className="text-[13px] font-medium text-foreground">Nothing to preview yet</p>
      <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
        Type a URL above, or open the{' '}
        <span className="rounded-[4px] border border-border bg-card px-1 font-mono text-[10.5px]">Ports</span> dropdown
        to jump straight to your running dev server. Public sites often block embedding. Open them in your browser via
        the link icon if you see a blank page.
      </p>
    </CenterPlaceholder>
  );
}
