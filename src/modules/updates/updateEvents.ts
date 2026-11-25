import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { type UpdateStatus, useUpdateStore } from './updateStore';

/**
 * The update state lives in the main window (E25-05); the settings window is another webview, so it asks for a check
 * and reads the status through these events (E25-06).
 */
const CHECK_EVENT = 'lut:updates-check';
const STATUS_EVENT = 'lut:updates-status';
const STATUS_REQUEST_EVENT = 'lut:updates-status-request';

export type UpdateStatusPayload = {
  status: UpdateStatus;
  version: string | null;
  error: string | null;
};

function statusPayload(): UpdateStatusPayload {
  const { status, update, error } = useUpdateStore.getState();
  return { status, version: update?.version ?? null, error };
}

/** Main window: runs the checks the settings window asks for and tells it every status change. */
export function bridgeUpdateEvents(): () => void {
  const pending: Promise<UnlistenFn>[] = [
    listen(CHECK_EVENT, () => void useUpdateStore.getState().checkForUpdates({ manual: true })),
    listen(STATUS_REQUEST_EVENT, () => void emit(STATUS_EVENT, statusPayload())),
  ];
  const unsubscribe = useUpdateStore.subscribe((state, previous) => {
    if (
      state.status !== previous.status ||
      state.update !== previous.update ||
      state.error !== previous.error
    ) {
      void emit(STATUS_EVENT, statusPayload());
    }
  });
  return () => {
    unsubscribe();
    for (const unlisten of pending) void unlisten.then((off) => off());
  };
}

/** Settings window: Check now, run by the main window. */
export function requestUpdateCheck(): Promise<void> {
  return emit(CHECK_EVENT);
}

/** Settings window: the main window's update status, `null` until it answers. */
export function useUpdateStatus(): UpdateStatusPayload | null {
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);
  useEffect(() => {
    const pending = listen<UpdateStatusPayload>(STATUS_EVENT, (event) => setStatus(event.payload));
    void pending.then(() => emit(STATUS_REQUEST_EVENT));
    return () => void pending.then((off) => off());
  }, []);
  return status;
}
