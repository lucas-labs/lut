// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRows } from './listRows';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Item = { value: string };
const items = (...values: string[]): Item[] => values.map((value) => ({ value }));
const same = (a: Item[], b: Item[]) => a.length === b.length && a.every((item, i) => item.value === b[i].value);

let host: HTMLDivElement;
let root: Root;
type Rows = ReturnType<typeof useRows<Item>>;
let hook: Rows;

function Harness({ saved, report }: { saved: Item[]; report: (rows: Rows) => void }) {
  const rows = useRows(saved, same);
  useEffect(() => report(rows));
  return null;
}

const report = (rows: Rows) => {
  hook = rows;
};
const render = (saved: Item[]) => act(() => root.render(createElement(Harness, { saved, report })));
const shown = () => hook.rows.map((row) => row.value);

/** A save the test settles. */
function pendingSave() {
  let settle!: (done: boolean) => void;
  const result = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  return { result, settle };
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

describe('useRows', () => {
  it('keeps the draft when any list it sent comes back, even an older one first', () => {
    render(items('a'));
    const b = items('b');
    const c = items('c');
    act(() => hook.send(b, pendingSave().result));
    act(() => hook.send(c, pendingSave().result));
    act(() => hook.setRows(hook.rows.map((row) => ({ ...row, value: 'draft' }))));
    expect(hook.last).toBe(c);

    render(b);
    expect(shown()).toEqual(['draft']);
    expect(hook.last).toBe(c);
    render(c);
    expect(shown()).toEqual(['draft']);
    expect(hook.last).toEqual(c);

    // A list saved elsewhere replaces the draft.
    render(items('elsewhere'));
    expect(shown()).toEqual(['elsewhere']);
  });

  it('forgets only the list whose save failed', async () => {
    render(items('a'));
    const failing = pendingSave();
    const b = items('b');
    const c = items('c');
    act(() => hook.send(b, failing.result));
    act(() => hook.send(c, pendingSave().result));
    await act(async () => failing.settle(false));
    expect(hook.last).toBe(c);

    const lone = pendingSave();
    render(c);
    const d = items('d');
    act(() => hook.send(d, lone.result));
    await act(async () => lone.settle(false));
    expect(hook.last).toEqual(c);
  });
});
