// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Command, CommandDialog, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Terax's look: big radii and a ring instead of a border. The design never uses them on these surfaces. */
const TERAX_LOOK = /\brounded-(xl|2xl|3xl|4xl)\b|\bring-1\b|\bbg-foreground\b/;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function slot(name: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-slot="${name}"]`);
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('shared primitives on the design', () => {
  it('a popover has a border and 8 px corners', () => {
    act(() =>
      root.render(
        createElement(
          Popover,
          { open: true },
          createElement(PopoverTrigger, null, 'open'),
          createElement(PopoverContent, null, 'body'),
        ),
      ),
    );
    const content = slot('popover-content');
    expect(content.className).not.toMatch(TERAX_LOOK);
    expect(content.className).toContain('rounded-[8px]');
    expect(content.className).toContain('border-border');
  });

  it('a tooltip is not inverted', () => {
    act(() =>
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(
            Tooltip,
            { open: true },
            createElement(TooltipTrigger, null, 'hover'),
            createElement(TooltipContent, null, 'tip'),
          ),
        ),
      ),
    );
    const content = slot('tooltip-content');
    expect(content.className).not.toMatch(TERAX_LOOK);
    expect(content.className).toContain('bg-popover');
  });

  it('a badge is a 4 px tag', () => {
    act(() => root.render(createElement(Badge, null, 'Default')));
    const badge = slot('badge');
    expect(badge.className).not.toMatch(TERAX_LOOK);
    expect(badge.className).toContain('rounded-sm');
  });

  it('the palette has 8 px corners, 6 px rows and a plain input row', () => {
    act(() =>
      root.render(
        createElement(
          CommandDialog,
          { open: true },
          createElement(
            Command,
            null,
            createElement(CommandInput, null),
            createElement(CommandList, null, createElement(CommandItem, null, 'Row')),
          ),
        ),
      ),
    );
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.className).not.toMatch(TERAX_LOOK);
    expect(dialog?.className).toContain('rounded-[8px]');
    expect(slot('command-item').className).not.toMatch(TERAX_LOOK);
    expect(slot('command-item').className).toContain('rounded-[6px]');
    expect(slot('command-input-wrapper').className).toContain('border-b');
  });
});
