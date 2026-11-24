// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SidebarHeaderRow, type SidebarTrafficLights, SidebarViewHeader } from './SidebarViewHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function header(lights: SidebarTrafficLights, drag = lights !== null) {
  act(() =>
    root.render(
      <SidebarHeaderRow lights={lights} drag={drag}>
        <SidebarViewHeader title="Spaces" />
      </SidebarHeaderRow>,
    ),
  );
  const row = host.querySelector<HTMLElement>('div');
  if (!row) throw new Error('no header');
  return row;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('SidebarViewHeader', () => {
  it('is its own 30 px row away from the traffic lights, and drags the window beside the title bar', () => {
    let row = header(null);
    expect(row.className).toContain('h-[30px]');
    expect(row.hasAttribute('data-tauri-drag-region')).toBe(false);
    // `deep`: the title drags too, the actions stay buttons.
    row = header(null, true);
    expect(row.className).toContain('h-[30px]');
    expect(row.getAttribute('data-tauri-drag-region')).toBe('deep');
  });

  it("shares macOS's traffic lights' row, its title 80 px from the window's edge, and drags the window", () => {
    // At the window's corner: past the lights.
    let row = header('corner');
    expect(row.className).toContain('h-7');
    expect(row.className).toContain('pl-20');
    expect(row.getAttribute('data-tauri-drag-region')).toBe('deep');
    // Beside the 32 px rail (E27-06): the rest of the 80 px.
    row = header('rail');
    expect(row.className).toContain('pl-12');
    expect(row.getAttribute('data-tauri-drag-region')).toBe('deep');
  });
});
