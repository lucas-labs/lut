// @vitest-environment happy-dom
import type { ProfileEntry, ProfilesList } from '@/modules/profiles';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = vi.hoisted(() => ({
  state: {
    terminalFontFamily: '',
    terminalFontSize: 14,
    terminalFontWeight: 'normal',
    terminalCursorStyle: 'bar',
    terminalCursorBlink: true,
    terminalScrollback: 10000,
    terminalPadding: { top: 0, right: 0, bottom: 0, left: 0 },
  } as Record<string, unknown>,
}));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) => pick(prefs.state),
}));
vi.mock('@/modules/theme', () => ({
  listBuiltinThemes: () => [{ id: 'lut', name: 'lut' }],
  useTheme: () => ({ themeId: 'lut', customThemes: [] }),
}));

const profiles = vi.hoisted(() => ({
  list: null as ProfilesList | null,
  setDefault: vi.fn(async (_id: string) => {}),
}));
vi.mock('@/modules/profiles/store', () => ({
  useProfiles: () => profiles.list,
  useProfilesRead: () => (profiles.list ? 'listed' : 'reading'),
  readProfilesAgain: () => {},
  setDefaultProfile: profiles.setDefault,
  useCloseBehavior: () => 'close',
  useProfileAppearance: () => undefined,
}));

const native = vi.hoisted(() => ({
  save: vi.fn(async (_profile: unknown) => {}),
  remove: vi.fn(async (_id: string) => {}),
  override: vi.fn(async (_id: string, _changes: unknown) => {}),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: { profile?: unknown; id?: string; changes?: unknown }) => {
    if (command === 'profiles_save') return native.save(args.profile);
    if (command === 'profiles_delete') return native.remove(args.id ?? '');
    if (command === 'profiles_set_detected_override') return native.override(args.id ?? '', args.changes);
    return Promise.resolve(null);
  },
}));
const toasts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));

const { ProfilesSection } = await import('./ProfilesSection');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function profile(fields: Partial<ProfileEntry> & Pick<ProfileEntry, 'id' | 'name'>): ProfileEntry {
  return {
    args: [],
    env: {},
    loadUserProfile: true,
    environment: { kind: 'native' },
    appearance: {},
    tab: { allowShellTitle: true },
    closeBehavior: 'close',
    source: 'detected',
    hidden: false,
    ...fields,
  };
}

const PYTHON = profile({
  id: 'custom:py',
  name: 'Python',
  executable: 'python',
  args: ['-q'],
  env: { FOO: 'bar' },
  source: 'custom',
});

/** The profile `profiles_save` takes for PYTHON with `change`. */
const { source: _source, hidden: _hidden, ...PYTHON_SAVED } = PYTHON;

const LIST: ProfilesList = {
  profiles: [
    profile({ id: 'detected:pwsh', name: 'PowerShell 7', executable: 'C:/pwsh.exe' }),
    profile({ id: 'detected:cmd', name: 'Command Prompt', executable: 'C:/cmd.exe', hidden: true }),
    profile({
      id: 'detected:wsl:Ubuntu',
      name: 'Ubuntu',
      environment: { kind: 'wsl', distro: 'Ubuntu' },
      appearance: { fontSize: 15 },
    }),
    PYTHON,
  ],
  defaultProfileId: 'detected:pwsh',
};

let host: HTMLDivElement;
let root: Root;

/** What native lists after a save: the saved profile in place of its entry. */
function listSaved(saved: unknown) {
  const list = profiles.list;
  const sent = saved as ProfileEntry;
  if (!list) return;
  profiles.list = {
    ...list,
    profiles: list.profiles.map((e) => (e.id === sent.id ? { ...sent, source: e.source, hidden: e.hidden } : e)),
  };
}

beforeEach(() => {
  profiles.list = structuredClone(LIST);
  profiles.setDefault.mockClear();
  native.save.mockReset().mockImplementation(async (saved) => listSaved(saved));
  native.remove.mockReset().mockResolvedValue(undefined);
  native.override.mockReset().mockResolvedValue(undefined);
  toasts.error.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () => act(async () => root.render(createElement(ProfilesSection)));
/** Lets queued saves run, then shows the list as native would list it after them. */
const settle = async () => {
  await act(async () => {});
  await act(async () => root.render(createElement(ProfilesSection)));
};

const nav = () => host.querySelector('nav[aria-label="Profiles"]') as HTMLElement;
const choose = async (name: string) => {
  const item = [...nav().querySelectorAll('button')].find((b) => b.textContent?.startsWith(name));
  if (!item) throw new Error(`no profile "${name}"`);
  await act(async () => item.click());
};
const rowOf = (title: string) =>
  [...host.querySelectorAll('[data-slot="setting-row"]')].find(
    (r) => r.querySelector('.font-medium')?.textContent === title,
  ) as HTMLElement | undefined;
const buttonNamed = (scope: ParentNode, name: string) => {
  const found = [...scope.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent === name,
  );
  if (!found) throw new Error(`no button "${name}"`);
  return found;
};

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function leave(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await settle();
}
const inputOf = (title: string) => rowOf(title)?.querySelector('input') as HTMLInputElement;

async function pick(title: string, option: string) {
  await act(async () => {
    rowOf(title)
      ?.querySelector('[role="combobox"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  const found = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === option);
  if (!found) throw new Error(`no option "${option}"`);
  await act(async () => {
    found.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await settle();
}

describe('ProfilesSection list', () => {
  it('lists the detected and custom profiles, the default tagged and chosen', async () => {
    await render();
    const items = [...nav().querySelectorAll('h2, button')].map((el) => el.textContent);
    expect(items).toEqual([
      'Detected',
      'PowerShell 7Default',
      'Command PromptHidden',
      'Ubuntu',
      'Custom',
      'Python',
      'New profile',
    ]);
    expect(host.querySelector('h2.text-\\[15px\\]')?.textContent).toBe('PowerShell 7');
  });

  it('tells when the profiles are not read yet', async () => {
    profiles.list = null;
    await render();
    expect(host.textContent).toContain('Loading profiles...');
  });
});

describe('a custom profile', () => {
  it('saves the whole profile when a field is left', async () => {
    await render();
    await choose('Python');
    await type(inputOf('Name'), 'Py');
    await leave(inputOf('Name'));
    expect(native.save).toHaveBeenCalledWith({ ...PYTHON_SAVED, name: 'Py' });
  });

  it('keeps text typed while the last save is on its way back', async () => {
    await render();
    await choose('Python');
    await type(inputOf('Name'), 'Py');
    await act(async () => {
      inputOf('Name').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await type(inputOf('Name'), 'Pyt');
    // The saved name arrives now.
    await settle();
    expect(inputOf('Name').value).toBe('Pyt');
  });

  it('takes a name changed elsewhere', async () => {
    await render();
    await choose('Python');
    listSaved({ ...PYTHON_SAVED, name: 'Python 3' });
    await settle();
    expect(inputOf('Name').value).toBe('Python 3');
  });

  it('shows a refused field under it and keeps what was typed', async () => {
    native.save.mockRejectedValueOnce({
      kind: 'invalid',
      errors: [{ profileId: 'custom:py', field: 'executable', code: 'emptyExecutable' }],
    });
    await render();
    await choose('Python');
    await type(inputOf('Executable'), '');
    await leave(inputOf('Executable'));
    expect(native.save).toHaveBeenCalledWith({ ...PYTHON_SAVED, executable: undefined });
    expect(rowOf('Executable')?.textContent).toContain('Enter the program to run.');
    expect(inputOf('Executable').getAttribute('aria-invalid')).toBe('true');
  });

  it('tells a failure that is not a field in a toast', async () => {
    native.save.mockRejectedValueOnce({ kind: 'io', message: 'disk full' });
    await render();
    await choose('Python');
    await type(inputOf('Name'), 'Py');
    await leave(inputOf('Name'));
    expect(toasts.error).toHaveBeenCalledWith("Couldn't save the profile", { description: 'disk full' });
  });

  it('removes an argument', async () => {
    await render();
    await choose('Python');
    await act(async () => buttonNamed(rowOf('Arguments') as HTMLElement, 'Remove argument 1').click());
    await settle();
    expect(native.save).toHaveBeenCalledWith({ ...PYTHON_SAVED, args: [] });
  });

  it('keeps a saved empty argument, and leaves out a new field left empty', async () => {
    listSaved({ ...PYTHON_SAVED, args: ['-c', '', 'marker'] });
    await render();
    await choose('Python');
    const args = rowOf('Arguments') as HTMLElement;
    await act(async () => buttonNamed(args, 'Add argument').click());
    const last = args.querySelector('[aria-label="Argument 3"]') as HTMLInputElement;
    await type(last, 'next');
    await leave(last);
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, args: ['-c', '', 'next'] });
  });

  it('unsets a variable', async () => {
    await render();
    await choose('Python');
    const variables = rowOf('Variables') as HTMLElement;
    await act(async () => (variables.querySelector('[aria-label="Unset variable 1"]') as HTMLElement).click());
    await settle();
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, env: { FOO: null } });
  });

  it('saves a new variable only once it has a name', async () => {
    await render();
    await choose('Python');
    const variables = rowOf('Variables') as HTMLElement;
    await act(async () => buttonNamed(variables, 'Add variable').click());
    const value = variables.querySelector('[aria-label="Variable 2 value"]') as HTMLInputElement;
    await type(value, 'x');
    await leave(value);
    expect(native.save).not.toHaveBeenCalled();
    const name = variables.querySelector('[aria-label="Variable 2 name"]') as HTMLInputElement;
    await type(name, 'BAR');
    await leave(name);
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, env: { FOO: 'bar', BAR: 'x' } });
  });

  it('keeps a row, its field and what was typed in it when its own save comes back', async () => {
    await render();
    await choose('Python');
    const variables = rowOf('Variables') as HTMLElement;
    await act(async () => buttonNamed(variables, 'Add variable').click());
    const name = variables.querySelector('[aria-label="Variable 2 name"]') as HTMLInputElement;
    await type(name, 'TOKEN');
    await act(async () => {
      name.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    const value = variables.querySelector('[aria-label="Variable 2 value"]') as HTMLInputElement;
    await type(value, 'secret');
    // The saved TOKEN arrives now.
    await settle();
    expect(variables.querySelector('[aria-label="Variable 2 value"]')).toBe(value);
    expect(value.value).toBe('secret');
    await leave(value);
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, env: { FOO: 'bar', TOKEN: 'secret' } });
  });

  it('sets an appearance field, and follows the setting again', async () => {
    await render();
    await choose('Python');
    await pick('Font size', '16 px');
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, appearance: { fontSize: 16 } });
    await pick('Font size', 'Default (14 px)');
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, appearance: { fontSize: undefined } });
  });

  it('keeps two appearance changes made before the list catches up', async () => {
    native.save.mockImplementation(async () => {});
    await render();
    await choose('Python');
    await pick('Font size', '16 px');
    await pick('Cursor style', 'Block');
    expect(native.save).toHaveBeenLastCalledWith({
      ...PYTHON_SAVED,
      appearance: { fontSize: 16, cursorStyle: 'block' },
    });
  });

  it('saves in order, on top of each other, across choosing another profile and coming back', async () => {
    let answer: () => void = () => {};
    native.save.mockImplementationOnce(() => new Promise<void>((resolve) => (answer = resolve)));
    await render();
    await choose('Python');
    await type(inputOf('Name'), 'Py');
    await act(async () => {
      inputOf('Name').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await choose('Ubuntu');
    await choose('Python');
    await pick('When the program exits', 'Ask');
    // The second save waits for the first.
    expect(native.save).toHaveBeenCalledTimes(1);
    await act(async () => answer());
    await settle();
    expect(native.save).toHaveBeenCalledTimes(2);
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, name: 'Py', closeBehavior: 'ask' });
  });

  it('sets the close behavior', async () => {
    await render();
    await choose('Python');
    await pick('When the program exits', 'Ask');
    expect(native.save).toHaveBeenLastCalledWith({ ...PYTHON_SAVED, closeBehavior: 'ask' });
  });
});

describe('a detected profile', () => {
  it('shows what it runs without editing it', async () => {
    await render();
    expect(rowOf('Name')).toBeUndefined();
    expect(rowOf('Executable')?.querySelector('input')).toBeNull();
    expect(rowOf('Executable')?.textContent).toContain('C:/pwsh.exe');
    expect(host.querySelector('[aria-label="Delete profile"]')).toBeNull();
  });

  it('hides it through its override, keeping its appearance', async () => {
    await render();
    await choose('Ubuntu');
    await act(async () => (rowOf('Hidden')?.querySelector('[role="switch"]') as HTMLElement).click());
    await settle();
    expect(native.override).toHaveBeenCalledWith('detected:wsl:Ubuntu', {
      hidden: true,
      appearance: { fontSize: 15 },
      tab: { allowShellTitle: true },
    });
    expect(native.save).not.toHaveBeenCalled();
  });

  it('keeps both of two quick changes', async () => {
    await render();
    await choose('Ubuntu');
    await act(async () => {
      (rowOf('Hidden')?.querySelector('[role="switch"]') as HTMLElement).click();
      (rowOf('Shell sets the tab title')?.querySelector('[role="switch"]') as HTMLElement).click();
    });
    await settle();
    expect(native.override).toHaveBeenLastCalledWith('detected:wsl:Ubuntu', {
      hidden: true,
      appearance: { fontSize: 15 },
      tab: { allowShellTitle: false },
    });
  });
});

describe('profile actions', () => {
  it('sets the chosen profile as the default', async () => {
    await render();
    await choose('Python');
    await act(async () => buttonNamed(host, 'Set as default').click());
    expect(profiles.setDefault).toHaveBeenCalledWith('custom:py');
  });

  it('duplicates a profile under a new id', async () => {
    await render();
    await choose('Python');
    await act(async () => buttonNamed(host, 'Duplicate profile').click());
    await settle();
    const [copy] = native.save.mock.calls[0] as [{ id: string; name: string }];
    expect(copy).toEqual({ ...PYTHON_SAVED, id: copy.id, name: 'Python copy' });
    expect(copy.id).toMatch(/^custom:/);
    expect(copy.id).not.toBe('custom:py');
  });

  it('deletes a custom profile once confirmed', async () => {
    await render();
    await choose('Python');
    await act(async () => buttonNamed(host, 'Delete profile').click());
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Delete “Python”?');
    await act(async () => buttonNamed(dialog, 'Delete').click());
    await settle();
    expect(native.remove).toHaveBeenCalledWith('custom:py');
  });

  it('creates a profile from its name and program, telling the fields native refused', async () => {
    native.save.mockImplementationOnce(async (sent) => {
      throw {
        kind: 'invalid',
        errors: [{ profileId: (sent as { id: string }).id, field: 'executable', code: 'emptyExecutable' }],
      };
    });
    await render();
    await act(async () => buttonNamed(nav(), 'New profile').click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const [name, executable] = [...dialog.querySelectorAll('input')];
    await type(name, 'Node');
    await act(async () => buttonNamed(dialog, 'Create').click());
    await settle();
    expect(dialog.textContent).toContain('Enter the program to run.');

    await type(executable, 'node');
    await act(async () => buttonNamed(dialog, 'Create').click());
    await settle();
    expect(native.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Node', executable: 'node', args: [], env: {} }),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('creates one profile however often Create is pressed while it is saved', async () => {
    let answer: () => void = () => {};
    native.save.mockImplementationOnce(() => new Promise<void>((resolve) => (answer = resolve)));
    await render();
    await act(async () => buttonNamed(nav(), 'New profile').click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const [name, executable] = [...dialog.querySelectorAll('input')];
    await type(name, 'Node');
    await type(executable, 'node');
    const form = dialog.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(buttonNamed(dialog, 'Create').disabled).toBe(true);
    await act(async () => answer());
    expect(native.save).toHaveBeenCalledTimes(1);
  });

  it('stays open while the profile is created', async () => {
    let answer: () => void = () => {};
    native.save.mockImplementationOnce(() => new Promise<void>((resolve) => (answer = resolve)));
    await render();
    await act(async () => buttonNamed(nav(), 'New profile').click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const [name, executable] = [...dialog.querySelectorAll('input')];
    await type(name, 'Node');
    await type(executable, 'node');
    await act(async () => (dialog.querySelector('form') as HTMLFormElement).requestSubmit());
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    await act(async () => answer());
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
