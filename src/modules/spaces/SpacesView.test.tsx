// @vitest-environment happy-dom
import { TooltipProvider } from '@/components/ui/tooltip';
import { initialNavigationData, registerTabPresenter, type Tab, useNavigationStore } from '@/modules/navigation';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EPHEMERAL_SPACE_ID } from './lib/ephemeral';
import { SPACE_COLORS } from './lib/spaceColor';
import { useSpaces } from './lib/useSpaces';
import { spaceInitial, SpacesView } from './SpacesView';

vi.mock('./lib/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/store')>()),
  saveSpacesList: vi.fn(async () => {}),
  saveActiveId: vi.fn(async () => {}),
  saveState: vi.fn(async () => {}),
  deleteSpaceData: vi.fn(async () => {}),
}));

const env = { kind: 'local' as const };
let root: Root;
let host: HTMLElement;
let undoPresenter: () => void = () => {};
const props = {
  onNewSpace: vi.fn(),
  onDeleteSpace: vi.fn(),
  onNewTabInSpace: vi.fn(),
  onJumpTab: vi.fn(),
  onCloseTab: vi.fn(),
  onMoveTabToSpace: vi.fn(),
  onReorderTab: vi.fn(),
  onReorderSpaces: vi.fn(),
};

beforeAll(() => {
  // happy-dom has no pointer capture; the view only needs the calls to exist.
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  useSpaces.getState().hydrate(
    [
      { id: 'a', name: 'Alpha', root: null, env, color: 2, createdAt: 0, updatedAt: 0 },
      { id: 'b', name: 'Beta', root: null, env, createdAt: 0, updatedAt: 0 },
      { id: EPHEMERAL_SPACE_ID, name: 'Ephemeral', root: null, env, createdAt: 0, updatedAt: 0 },
    ],
    'a',
  );
  useNavigationStore.setState(initialNavigationData());
  useNavigationStore.getState().seedLaunchTab();
  undoPresenter = registerTabPresenter('terminal', { Icon: () => null, Status: () => null });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  undoPresenter();
});

/** One terminal tab in Space `b`. */
function tabsInB(): Tab[] {
  return useNavigationStore.getState().tabs.map((t) => ({ ...t, spaceId: 'b' }));
}

async function render(tabs: Tab[] = tabsInB(), compact = false) {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <SpacesView tabs={tabs} compact={compact} {...props} />
      </TooltipProvider>,
    ),
  );
}

const row = (id: string) => host.querySelector<HTMLElement>(`[data-space-id="${id}"]`);
const tabRows = () => host.querySelectorAll('[data-drop="tab"]');

async function openMenu(id: string) {
  await act(async () => {
    row(id)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 5, clientY: 5 }));
  });
}

async function chooseItem(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (el) => el.textContent === label,
  );
  expect(item).toBeDefined();
  await act(async () => item?.click());
}

describe('SpacesView', () => {
  it('marks only the active row as current', async () => {
    await render();
    expect(row('a')?.getAttribute('aria-current')).toBe('true');
    expect(row('b')?.hasAttribute('aria-current')).toBe(false);
    expect(row('a')?.classList.contains('bg-accent')).toBe(true);
    expect(row('b')?.classList.contains('bg-accent')).toBe(false);
  });

  it('tints a coloured Space like a coloured tab, and leaves one with no colour alone', async () => {
    await render();
    expect(row('a')?.hasAttribute('data-tab-color')).toBe(true);
    expect(row('a')?.style.getPropertyValue('--tab-color')).toBe(SPACE_COLORS[2]);
    expect(row('b')?.hasAttribute('data-tab-color')).toBe(false);
  });

  it('starts collapsed, and a click switches Space without expanding it', async () => {
    await render();
    expect(tabRows()).toHaveLength(0);
    await act(async () => {
      row('b')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      row('b')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
    });
    expect(useSpaces.getState().activeId).toBe('b');
    expect(tabRows()).toHaveLength(0);
  });

  it.each([false, true])(
    'switches Space with Enter, Space or a click with no pointer, not a pointer click (compact: %s)',
    async (compact) => {
      await render(tabsInB(), compact);
      const switchesTo = async (id: string, fire: (el: HTMLElement) => void) => {
        useSpaces.getState().setActive('a');
        await act(async () => fire(row(id) as HTMLElement));
        return useSpaces.getState().activeId === id;
      };
      expect(
        await switchesTo('b', (el) => el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))),
      ).toBe(true);
      expect(
        await switchesTo('b', (el) => el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }))),
      ).toBe(true);
      expect(
        await switchesTo('b', (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))),
      ).toBe(true);
      expect(
        await switchesTo('b', (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))),
      ).toBe(false);
    },
  );

  it('expands and collapses a Space from its menu', async () => {
    await render();
    await openMenu('b');
    await chooseItem('Expand');
    expect(tabRows()).toHaveLength(1);
    await openMenu('b');
    await chooseItem('Collapse');
    expect(tabRows()).toHaveLength(0);
  });

  it('renames, opens a tab in and deletes a Space from its menu', async () => {
    await render();
    await openMenu('b');
    await chooseItem('New tab');
    expect(props.onNewTabInSpace).toHaveBeenCalledWith('b');
    await openMenu('b');
    await chooseItem('Delete space');
    expect(props.onDeleteSpace).toHaveBeenCalledWith('b');
    await openMenu('b');
    await chooseItem('Rename space');
    expect(row('b')?.querySelector('input')).not.toBeNull();
  });

  it('returns focus to the row when the menu closes, but not after Rename', async () => {
    await render();
    // Opened from the keyboard: the focused row is where the menu returns focus.
    act(() => row('b')?.focus());
    await openMenu('b');
    await chooseItem('Expand');
    expect(document.activeElement).toBe(row('b'));
    await openMenu('b');
    await chooseItem('Rename space');
    expect(document.activeElement).toBe(row('b')?.querySelector('input'));
  });

  it('keeps the row clean: no action buttons', async () => {
    await render();
    expect(row('b')?.querySelectorAll('button')).toHaveLength(0);
  });

  it('marks the ephemeral Space and shows no tab count', async () => {
    await render();
    expect(row(EPHEMERAL_SPACE_ID)?.textContent).toContain("This Space isn't saved");
    expect(row('b')?.textContent).toBe('Beta');
  });
});

describe('SpacesView on the compact sidebar (E27-01)', () => {
  const menuItems = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

  it('shows each Space by its initial and name, marks the active one, and switches on a click', async () => {
    await render(tabsInB(), true);
    const ids = ['a', 'b', EPHEMERAL_SPACE_ID];
    expect(ids.map((id) => row(id)?.textContent)).toEqual(['A', 'B', 'E']);
    expect(ids.map((id) => row(id)?.getAttribute('aria-label'))).toEqual(['Alpha', 'Beta', 'Ephemeral']);
    expect(ids.map((id) => row(id)?.getAttribute('aria-current'))).toEqual(['true', null, null]);
    expect(row('a')?.getAttribute('data-orientation')).toBe('compact');
    await act(async () => {
      row('b')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      row('b')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
    });
    expect(useSpaces.getState().activeId).toBe('b');
  });

  it('opens a Space from its +', async () => {
    await render(tabsInB(), true);
    await act(async () => host.querySelector<HTMLElement>('button[aria-label="Open space"]')?.click());
    expect(props.onNewSpace).toHaveBeenCalledOnce();
  });

  it("offers the Spaces view's menu, less Expand", async () => {
    await render(tabsInB(), true);
    await openMenu('b');
    expect(menuItems().map((el) => el.textContent)).toEqual(['Rename space', 'New tab', 'Delete space']);
    await chooseItem('New tab');
    expect(props.onNewTabInSpace).toHaveBeenCalledWith('b');
  });

  it('renames a Space in a field beside its button', async () => {
    await render(tabsInB(), true);
    await openMenu('b');
    await chooseItem('Rename space');
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Rename space"]');
    expect(input).not.toBeNull();
    expect(host.contains(input)).toBe(false);
    if (!input) return;
    input.value = '  Gamma ';
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(useSpaces.getState().spaces.find((s) => s.id === 'b')?.name).toBe('Gamma');
    expect(document.querySelector('input[aria-label="Rename space"]')).toBeNull();
  });

  it('reorders a Space dragged onto another', async () => {
    await render(tabsInB(), true);
    const from = row('a');
    const to = row('b');
    if (!from || !to) throw new Error('no rows');
    // happy-dom has no hit testing: the pointer is over Beta, past its middle (0, nothing is laid out).
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(to);
    await act(async () => {
      from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientY: 0 }));
      from.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 1, clientY: 20 }));
    });
    await act(async () => {
      from.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientY: 20 }));
    });
    elementFromPoint.mockRestore();
    expect(props.onReorderSpaces).toHaveBeenCalledWith(['b', 'a', EPHEMERAL_SPACE_ID]);
    expect(useSpaces.getState().activeId).toBe('a');
  });

  it.each([false, true])('drops a cancelled drag: no reorder, no switch (compact: %s)', async (compact) => {
    await render(tabsInB(), compact);
    const from = row('a');
    const to = row('b');
    if (!from || !to) throw new Error('no rows');
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(to);
    await act(async () => {
      from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientY: 0 }));
      from.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 1, clientY: 20 }));
    });
    await act(async () => {
      from.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, button: 0, pointerId: 1, clientY: 20 }));
    });
    elementFromPoint.mockRestore();
    expect(props.onReorderSpaces).not.toHaveBeenCalled();
    expect(useSpaces.getState().activeId).toBe('a');
  });
});

describe('spaceInitial', () => {
  it('upper-cases the first character and keeps an emoji whole', () => {
    expect(spaceInitial('lut')).toBe('L');
    expect(spaceInitial(' 🚀 launch')).toBe('🚀');
    expect(spaceInitial('ñandú')).toBe('Ñ');
  });

  it('falls back to a question mark for a blank name', () => {
    expect(spaceInitial('')).toBe('?');
    expect(spaceInitial('   ')).toBe('?');
  });
});
