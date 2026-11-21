// @vitest-environment happy-dom
import type { ProfileEntry, ProfilesList } from '@/modules/profiles';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Failure = { kind: 'startup' | 'renderer'; message: string; launch?: { code: string; message: string } };

const state = vi.hoisted(() => ({
  closeBehavior: 'ask' as 'ask' | 'close' | 'keepOpen',
  list: null as ProfilesList | null,
  session: {
    error: null as Failure | null,
    exitCode: null as number | null,
    model: null,
    retry: vi.fn(),
    restart: vi.fn(),
    openWithProfile: vi.fn(),
    setBarInset: vi.fn(),
    write: vi.fn(),
    writeAtPrompt: vi.fn(),
    focus: vi.fn(),
    getBuffer: vi.fn(),
    getSelection: vi.fn(),
  },
}));

vi.mock('./ghostty/useGhosttyTerminalSession', () => ({ useGhosttyTerminalSession: () => state.session }));
vi.mock('./lib/usePaneAppearance', () => ({ usePaneAppearance: () => null }));
vi.mock('@/modules/profiles/store', () => ({
  useProfiles: () => state.list,
  useCloseBehavior: () => state.closeBehavior,
  useProfileAppearance: () => undefined,
  setDefaultProfile: () => Promise.resolve(),
}));

const { TerminalPane } = await import('./TerminalPane');

function profile(id: string, name: string): ProfileEntry {
  return {
    id,
    name,
    args: [],
    env: {},
    loadUserProfile: true,
    environment: { kind: 'native' },
    appearance: {},
    tab: { allowShellTitle: true },
    closeBehavior: 'close',
    source: 'detected',
    hidden: false,
  };
}

let host: HTMLDivElement;
let root: Root;
const onExit = vi.fn();

beforeEach(() => {
  state.closeBehavior = 'ask';
  state.list = {
    profiles: [profile('detected:pwsh', 'PowerShell 7'), profile('detected:cmd', 'Command Prompt')],
    defaultProfileId: 'detected:pwsh',
  };
  state.session.error = null;
  state.session.exitCode = null;
  for (const fn of [
    state.session.restart,
    state.session.openWithProfile,
    state.session.setBarInset,
    state.session.retry,
    onExit,
  ]) {
    fn.mockClear();
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () => act(async () => root.render(createElement(TerminalPane, { leafId: 7, visible: true, onExit })));

const button = (name: string) => {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name));
  if (!found) throw new Error(`no button "${name}"`);
  return found;
};

/** A key pressed in the terminal, which sits inside the pane. */
function press(key: string) {
  const target = host.querySelector('[data-terminal-backend] > div') as HTMLElement;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('TerminalPane exit bar', () => {
  it('asks what to do: Enter restarts, Esc closes the pane', async () => {
    state.session.exitCode = 2;
    await render();
    expect(host.textContent).toContain('Process exited');
    expect(host.textContent).toContain('code 2');
    expect(state.session.setBarInset).toHaveBeenLastCalledWith(40);

    act(() => press('Enter'));
    expect(state.session.restart).toHaveBeenCalledTimes(1);
    act(() => press('Escape'));
    expect(onExit).toHaveBeenCalledWith(7, 2);
  });

  it('only tells when the profile keeps the pane open, and leaves the keys alone', async () => {
    state.closeBehavior = 'keepOpen';
    state.session.exitCode = 0;
    await render();
    expect(host.textContent).toContain('Process exited');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    act(() => press('Enter'));
    expect(state.session.restart).not.toHaveBeenCalled();
  });

  it('keeps no room for a bar while the process runs', async () => {
    await render();
    expect(host.textContent).not.toContain('Process exited');
    expect(state.session.setBarInset).toHaveBeenLastCalledWith(0);
    act(() => press('Enter'));
    expect(state.session.restart).not.toHaveBeenCalled();
  });
});

describe('TerminalPane launch bar', () => {
  beforeEach(() => {
    state.session.error = {
      kind: 'startup',
      message: 'Profile "Git Bash" was not found',
      launch: { code: 'profileNotFound', message: 'Profile "Git Bash" was not found' },
    };
  });

  it('opens the pane with the default profile', async () => {
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Profile "Git Bash" was not found');
    await act(async () => button('Open with default profile').click());
    expect(state.session.openWithProfile).toHaveBeenCalledWith();
  });

  it('opens the pane with the profile chosen in its menu', async () => {
    await render();
    await act(async () => {
      button('Choose profile').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }),
      );
    });
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Command Prompt'),
    );
    if (!item) throw new Error('no profile item');
    await act(async () => (item as HTMLElement).click());
    expect(state.session.openWithProfile).toHaveBeenCalledWith('detected:cmd');
  });

  it('leaves other startup failures on the full-pane error', async () => {
    state.session.error = {
      kind: 'startup',
      message: 'spawn failed',
      launch: { code: 'spawnFailed', message: 'spawn failed' },
    };
    await render();
    expect(host.textContent).toContain('Unable to start terminal');
    expect(host.textContent).not.toContain('Choose profile');
  });
});
