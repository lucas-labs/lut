// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const fake = vi.hoisted(() => ({
  emit: vi.fn(async (_event: string, _payload?: unknown) => {}),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  check: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: fake.emit,
  listen: async (event: string, handler: (event: { payload: unknown }) => void) => {
    fake.listeners.set(event, handler);
    return () => fake.listeners.delete(event);
  },
}));
vi.mock('./updateStore', () => ({
  useUpdateStore: create(() => ({
    status: 'idle',
    update: null as { version: string } | null,
    error: null as string | null,
    checkForUpdates: fake.check,
  })),
}));

const { useUpdateStore } = await import('./updateStore');
const { bridgeUpdateEvents, requestUpdateCheck } = await import('./updateEvents');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fake.emit.mockClear();
  fake.check.mockClear();
  fake.listeners.clear();
  useUpdateStore.setState({ status: 'idle', update: null, error: null });
});

describe('the update events between windows', () => {
  it('runs a manual check when the settings window asks', async () => {
    const stop = bridgeUpdateEvents();
    await flush();
    await requestUpdateCheck();
    fake.listeners.get(fake.emit.mock.calls[0][0])?.({ payload: undefined });
    expect(fake.check).toHaveBeenCalledWith({ manual: true });
    stop();
  });

  it('tells the settings window every status change, and the status when asked', async () => {
    const stop = bridgeUpdateEvents();
    await flush();
    useUpdateStore.setState({ status: 'available', update: { version: '0.10.1' } as never });
    expect(fake.emit).toHaveBeenLastCalledWith('lut:updates-status', {
      status: 'available',
      version: '0.10.1',
      error: null,
    });
    fake.emit.mockClear();
    fake.listeners.get('lut:updates-status-request')?.({ payload: undefined });
    expect(fake.emit).toHaveBeenCalledWith(
      'lut:updates-status',
      expect.objectContaining({ status: 'available' }),
    );
    stop();
    fake.emit.mockClear();
    useUpdateStore.setState({ status: 'upToDate', update: null });
    expect(fake.emit).not.toHaveBeenCalled();
  });
});
