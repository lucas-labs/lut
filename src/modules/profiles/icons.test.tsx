// @vitest-environment happy-dom
import {
  type LutIconComponent,
  ShellBashIcon,
  ShellCmdIcon,
  ShellGitbashIcon,
  ShellPwshIcon,
  StarIcon,
  TerminalIcon,
} from '@lut/lut-icons';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileEnvironment, TerminalProfile } from './model';

const native = vi.hoisted(() => ({ read: vi.fn(async (_name: string): Promise<ArrayBuffer> => new ArrayBuffer(4)) }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: { name: string }) =>
    command === 'profile_icon_read' ? native.read(args.name) : Promise.reject(new Error(command)),
}));

const { defaultIconId, ProfileIcon } = await import('./icons');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function source(id: string, executable?: string, environment: ProfileEnvironment = { kind: 'native' }) {
  return { id, executable, environment };
}

describe('defaultIconId', () => {
  it.each([
    ['detected:pwsh', 'C:/Program Files/PowerShell/7/pwsh.exe', 'shell-pwsh'],
    ['detected:powershell', 'C:/Windows/powershell.exe', 'shell-pwsh'],
    ['detected:cmd', 'C:/Windows/System32/cmd.exe', 'shell-cmd'],
    ['detected:git-bash', 'C:/Program Files/Git/bin/bash.exe', 'shell-gitbash'],
    ['detected:nu', 'C:/nu/nu.exe', 'shell-nu'],
    ['detected:shell:/bin/zsh', '/bin/zsh', 'shell-zsh'],
    ['custom:a', 'C:\\tools\\Fish.EXE', 'shell-fish'],
    ['custom:b', 'bash', 'shell-bash'],
    ['custom:c', 'wsl.exe', 'shell-wsl'],
    ['custom:d', 'python', 'terminal'],
    ['custom:e', undefined, 'terminal'],
  ])('%s running %s shows %s', (id, executable, icon) => {
    expect(defaultIconId(source(id, executable))).toBe(icon);
  });

  it.each([
    ['Ubuntu-24.04', 'shell-ubuntu'],
    ['Debian', 'shell-debian'],
    ['Alpine', 'shell-linux'],
    [undefined, 'shell-wsl'],
  ])('a WSL profile of %s shows %s, whatever it runs', (distro, icon) => {
    expect(defaultIconId(source('custom:wsl', 'zsh', { kind: 'wsl', distro }))).toBe(icon);
  });
});

describe('ProfileIcon', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    native.read.mockReset().mockResolvedValue(new ArrayBuffer(4));
    URL.createObjectURL = vi.fn(() => 'blob:icon');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const profile = (icon?: string): Pick<TerminalProfile, 'id' | 'executable' | 'environment' | 'tab'> => ({
    ...source('detected:pwsh', 'pwsh.exe'),
    tab: { allowShellTitle: true, icon },
  });
  /** An icon's drawing: the markup's styles serialize differently in the DOM. */
  const drawing = (html: string) => [...html.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join(' ');
  const shows = (Icon: LutIconComponent) => drawing(renderToStaticMarkup(createElement(Icon, { size: 'sm' })));
  const shown = () => drawing(host.innerHTML);
  /** Lets the copy be read and shown. */
  const read = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const render = (icon?: string) =>
    act(async () => root.render(createElement(ProfileIcon, { profile: profile(icon) })));

  it('shows the chosen built-in icon', async () => {
    await render('star');
    expect(shown()).toBe(shows(StarIcon));
  });

  it('shows the default icon without one chosen, or with one it does not know', async () => {
    await render();
    expect(shown()).toBe(shows(ShellPwshIcon));
    await render('no-such-icon');
    expect(shown()).toBe(shows(ShellPwshIcon));
  });

  it('shows an image icon from lut’s copy', async () => {
    const name = '0123456789abcdef0123456789abcdef.png';
    await render(`image:${name}`);
    await read();
    expect(native.read).toHaveBeenCalledWith(name);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:icon');
  });

  it('shows the default icon, without telling, when the copy is missing', async () => {
    native.read.mockRejectedValue('No such file');
    const error = vi.spyOn(console, 'error');
    await render('image:ffffffffffffffffffffffffffffffff.png');
    await read();
    expect(shown()).toBe(shows(ShellPwshIcon));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('shows the default icon when the image cannot be drawn', async () => {
    await render('image:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png');
    await read();
    await act(async () => host.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(shown()).toBe(shows(ShellPwshIcon));
  });

  it('keeps every shell icon apart', () => {
    const drawings = [TerminalIcon, ShellPwshIcon, ShellCmdIcon, ShellBashIcon, ShellGitbashIcon].map(shows);
    expect(drawings.every(Boolean)).toBe(true);
    expect(new Set(drawings).size).toBe(drawings.length);
  });
});
