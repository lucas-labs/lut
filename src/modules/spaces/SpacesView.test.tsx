// @vitest-environment happy-dom
import { initialNavigationData, registerTabPresenter, type Tab, useNavigationStore } from '@/modules/navigation';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EPHEMERAL_SPACE_ID } from './lib/ephemeral';
import { SPACE_COLORS } from './lib/spaceColor';
import { useSpaces } from './lib/useSpaces';
import { SpacesView } from './SpacesView';

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

async function render(tabs: Tab[] = tabsInB()) {
  await act(async () => root.render(<SpacesView tabs={tabs} {...props} />));
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
