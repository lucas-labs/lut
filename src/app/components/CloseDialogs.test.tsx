// @vitest-environment happy-dom
import { act, type ComponentProps, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ actionFirst: true, optOut: vi.fn(() => Promise.resolve()) }));

vi.mock('@/modules/settings/store', async (original) => ({
  ...(await original<typeof import('@/modules/settings/store')>()),
  setConfirmCloseRunningTerminal: harness.optOut,
}));
vi.mock('@/modules/platform', async (original) => ({
  ...(await original<typeof import('@/modules/platform')>()),
  get IS_WINDOWS() {
    return harness.actionFirst;
  },
}));

const { CloseDialogs } = await import('./CloseDialogs');

type Props = ComponentProps<typeof CloseDialogs>;
const closed: Props = {
  tabs: [],
  pendingCloseTab: null,
  onCancelClose: vi.fn(),
  onConfirmClose: vi.fn(),
  pendingTerminalCloseTab: null,
  onCancelTerminalClose: vi.fn(),
  onConfirmTerminalClose: vi.fn(),
  pendingDeleteTabs: null,
  onCancelDeleteClose: vi.fn(),
  onConfirmDeleteClose: vi.fn(),
  pendingCloseMany: null,
  closeManyConfirming: false,
  onCancelCloseMany: vi.fn(),
  onConfirmCloseMany: vi.fn(),
  pendingAppClose: null,
  onCancelAppClose: vi.fn(),
  onConfirmAppClose: vi.fn(),
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  harness.actionFirst = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (props: Partial<Props>) => act(() => root.render(createElement(CloseDialogs, { ...closed, ...props })));
const dialog = () => {
  const el = document.querySelector('[role="alertdialog"]');
  if (!el) throw new Error('no dialog');
  return el as HTMLElement;
};
const button = (name: string) => {
  const el = [...dialog().querySelectorAll('button')].find((b) => b.textContent === name);
  if (!el) throw new Error(`no ${name} button`);
  return el;
};

describe('the app close dialog', () => {
  const busy = { pendingAppClose: { dirtyEditors: 0, busyTerminal: true } };

  it('says lut and shows the warning mark', () => {
    render(busy);
    expect(dialog().querySelector('h2')?.textContent).toBe('Quit lut?');
    expect(dialog().textContent).toContain('A process is still running in a terminal');
    expect(dialog().querySelector('[data-slot="alert-dialog-media"] svg')).not.toBeNull();
  });

  it('stores the opt-out before quitting when it is ticked', async () => {
    render(busy);
    await act(async () => (dialog().querySelector('[role="checkbox"]') as HTMLElement).click());
    await act(async () => button('Quit Anyway').click());
    expect(harness.optOut).toHaveBeenCalledWith(false);
    expect(closed.onConfirmAppClose).toHaveBeenCalledTimes(1);
    expect(harness.optOut.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(closed.onConfirmAppClose).mock.invocationCallOrder[0],
    );
  });

  it('offers no opt-out when unsaved changes would be discarded too', () => {
    render({ pendingAppClose: { dirtyEditors: 2, busyTerminal: true } });
    expect(dialog().querySelector('[role="checkbox"]')).toBeNull();
  });
});

describe('the terminal close dialog', () => {
  it('closes anyway without storing an unticked opt-out', async () => {
    render({ pendingTerminalCloseTab: 3 });
    await act(async () => button('Close Anyway').click());
    expect(closed.onConfirmTerminalClose).toHaveBeenCalledTimes(1);
    expect(harness.optOut).not.toHaveBeenCalled();
  });

  it('cancels', async () => {
    render({ pendingTerminalCloseTab: 3 });
    await act(async () => button('Cancel').click());
    expect(closed.onCancelTerminalClose).toHaveBeenCalled();
    expect(closed.onConfirmTerminalClose).not.toHaveBeenCalled();
  });
});

it.each([
  [true, 'flex-row-reverse'],
  [false, 'justify-end'],
])('orders the buttons for the platform (action first: %s)', (actionFirst, layout) => {
  harness.actionFirst = actionFirst;
  render({ pendingCloseTab: 1 });
  const footer = dialog().querySelector('[data-slot="alert-dialog-footer"]');
  expect(footer?.className).toContain(layout);
  // Cancel stays first in the tab order either way.
  expect([...(footer?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Cancel', 'Close Anyway']);
});
