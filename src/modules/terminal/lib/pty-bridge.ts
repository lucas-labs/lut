import type { TerminalGpuTheme } from '@/modules/terminal/ghostty/gpu/terminalVisuals';
import {
  clearAgentActivity,
  ensureAgentActivityListener,
} from '@/modules/terminal/lib/agentActivity';
import {
  type LaunchError,
  parseLaunchError,
  PtyLaunchError,
} from '@/modules/terminal/lib/launchError';
import { PtyOutputHub, type PtyStreamTransport } from '@/modules/terminal/lib/PtyOutputHub';
import { PtyOutputReceiver, type PtyOutputStatus } from '@/modules/terminal/lib/PtyOutputReceiver';
import {
  bindLeafPty,
  leafPresentationClass,
  ptyPresentationDiagnostics,
  unbindLeafPty,
} from '@/modules/terminal/lib/ptyPresentation';
import { tokenBytes } from '@/modules/terminal/lib/ptyWire';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

const textEncoder = new TextEncoder();
const receivers = new Map<number, PtyOutputReceiver>();

/**
 * The webview side of the `lut-pty` scheme. Requests are plain `fetch`es to
 * a custom protocol (the same mechanism Tauri's own IPC uses), so no per-chunk
 * channel eval or per-acknowledgement invoke is needed.
 */
function tauriTransport(): PtyStreamTransport {
  const request = (path: string, body: Uint8Array<ArrayBuffer>, signal?: AbortSignal) =>
    fetch(convertFileSrc(path, 'lut-pty'), {
      method: 'POST',
      body,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  return {
    open: async () => tokenBytes(await invoke<string>('pty_stream_open')),
    poll: async (body, signal) => {
      const response = await request('poll', body, signal);
      return {
        status: response.status,
        body: new Uint8Array(await response.arrayBuffer()),
      };
    },
    ack: async (body) => {
      const response = await request('ack', body);
      await response.arrayBuffer();
      return { status: response.status, body: new Uint8Array(0) };
    },
  };
}

let hub: PtyOutputHub | null = null;

function outputHub(): PtyOutputHub {
  hub ??= new PtyOutputHub(tauriTransport());
  return hub;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    hub?.dispose();
    hub = null;
  });
}

export function ptyTransportDiagnostics() {
  return {
    hub: hub?.diagnostics() ?? null,
    presentation: ptyPresentationDiagnostics(),
    receivers: [...receivers].map(([id, receiver]) => ({
      id,
      ...receiver.diagnostics(),
    })),
  };
}

export type PtyHandlers = {
  onData: (bytes: Uint8Array) => void | Promise<void>;
  onExit?: (code: number) => void;
  onOutputStatus?: (status: PtyOutputStatus) => void;
};

/** What native answers `OSC 4/10/11/12` and `CSI ? 996 n` queries from. */
type PtyColors = Pick<TerminalGpuTheme, 'foreground' | 'background' | 'cursor' | 'palette'>;

export type PtySession = {
  id: number;
  /** The profile that opened; `null` only when no profile is listed (the system's default shell). */
  profileId: string | null;
  write: (data: string | Uint8Array) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  setColors: (colors: PtyColors) => Promise<void>;
  close: () => Promise<void>;
};

/** What `pty_open` answers: `cwd` is where the terminal started (`~` is the WSL distro's home). */
type PtyOpened = { id: number; profileId: string | null; cwd: string | null; warning: unknown };

function warnCwdFallback(
  warning: Extract<LaunchError, { code: 'cwdUnavailable' }>,
  cwd: string | null,
): void {
  // One toast per directory: restoring a Space whose folder is gone opens many panes there.
  toast.warning(`Couldn't open ${warning.cwd}`, {
    id: `pty-cwd:${warning.cwd}`,
    description: `Opened ${cwd ?? 'the default folder'} instead.`,
  });
}

type PtyOpenOptions = {
  /** The profile to open; without one native opens the default profile. */
  profileId?: string;
  cwd?: string;
  paneId?: number;
  colors?: PtyColors;
};

export async function openPty(
  cols: number,
  rows: number,
  handlers: PtyHandlers,
  { profileId, cwd, paneId, colors }: PtyOpenOptions = {},
): Promise<PtySession> {
  const stream = outputHub();
  let id: number | null = null;
  let openedProfile: string | null = null;
  let released = false;
  let notice: string | number | undefined;
  let progress: ((processedBytes: number) => void) | null = null;
  const receiver = new PtyOutputReceiver(
    handlers.onData,
    (processedBytes) => progress?.(processedBytes),
    (status) => {
      handlers.onOutputStatus?.(status);
      if (status === 'running') {
        if (notice !== undefined) toast.dismiss(notice);
        notice = undefined;
      } else if (status === 'stalled' || status === 'failed') {
        notice = toast.error('Terminal output paused', {
          id: notice,
          duration: Number.POSITIVE_INFINITY,
          description:
            status === 'failed'
              ? 'The terminal could not process output. Reopen this terminal to recover.'
              : 'Waiting for the terminal connection. Delivery will resume automatically.',
          action:
            status === 'failed' ? undefined : { label: 'Retry', onClick: () => stream.retry() },
        });
      }
    },
  );
  const releaseHandlers = () => {
    if (released) return;
    released = true;
    receiver.dispose();
    if (id !== null) {
      stream.unregister(id);
      receivers.delete(id);
      clearAgentActivity(id);
      if (paneId !== undefined) unbindLeafPty(paneId, id);
    }
    if (notice !== undefined) toast.dismiss(notice);
  };

  const presentation = paneId === undefined ? undefined : leafPresentationClass(paneId);
  try {
    await ensureAgentActivityListener();
    await stream.ensureStream();
    const opened = await invoke<PtyOpened>('pty_open', {
      cols,
      rows,
      profileId: profileId ?? null,
      cwd: cwd ?? null,
      paneId: paneId ?? null,
      presentation: presentation ?? null,
      colors: colors ?? null,
    });
    id = opened.id;
    openedProfile = opened.profileId;
    const warning = parseLaunchError(opened.warning);
    if (warning?.code === 'cwdUnavailable') warnCwdFallback(warning, opened.cwd);
  } catch (error) {
    releaseHandlers();
    const launch = parseLaunchError(error);
    throw launch ? new PtyLaunchError(launch) : error;
  }
  const sessionId = id;
  if (released) {
    clearAgentActivity(sessionId);
  } else {
    receivers.set(sessionId, receiver);
    // Native holds this terminal's output until it is registered here, so no
    // frame can precede this call.
    progress = stream.register(sessionId, receiver, (code) => {
      try {
        handlers.onExit?.(code);
      } finally {
        releaseHandlers();
      }
    }).progress;
    if (paneId !== undefined && presentation !== undefined)
      bindLeafPty(paneId, sessionId, presentation);
  }
  receiver.start();

  let closed = false;
  const headers = { 'x-pty-id': String(sessionId) };

  return {
    id: sessionId,
    profileId: openedProfile,
    // Raw bytes + id header: no JSON round-trip on the per-keystroke path.
    write: (data) =>
      invoke('pty_write', typeof data === 'string' ? textEncoder.encode(data) : data, { headers }),
    resize: (c, r) => invoke('pty_resize', { id: sessionId, cols: c, rows: r }),
    setColors: (next) =>
      closed ? Promise.resolve() : invoke('pty_set_colors', { id: sessionId, colors: next }),
    close: async () => {
      if (closed) return;
      closed = true;
      releaseHandlers();
      await invoke('pty_close', { id: sessionId });
    },
  };
}
