// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DOC = 'C:/proj/README.md';
const LOGO = 'C:/proj/.github/logo.svg';
const GRANTED = 'http://asset.localhost/logo.svg?token=t1';
const OTHER_DOC = 'C:/proj/docs/README.md';
const OTHER_LOGO = 'C:/proj/docs/.github/logo.svg';
const OTHER_GRANTED = 'http://asset.localhost/docs-logo.svg?token=t1';

// The asset grant is an IPC round trip: tests decide when it lands.
const grant = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let urls: Record<string, string> = {};
  return {
    reset: () => {
      urls = {};
    },
    land: (next: Record<string, string>) => {
      urls = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => urls,
  };
});

vi.mock('@/lib/useAssetGrant', async () => {
  const { useMemo, useSyncExternalStore } = await import('react');
  return {
    useAssetGrant: () => {
      const urls = useSyncExternalStore(grant.subscribe, grant.get);
      const urlFor = useMemo(() => (abs: string) => urls[abs], [urls]);
      return { urlFor, error: undefined, retry: () => {} };
    },
  };
});
vi.mock('@/lib/security/security', () => ({ checkReadable: () => ({ ok: true }) }));
vi.mock('./useMarkdownDocument', () => ({
  useMarkdownDocument: () => ({ kind: 'ready', content: '# Title\n\n![Logo](./.github/logo.svg)\n' }),
}));

const { MarkdownPreviewPane } = await import('./MarkdownPreviewPane');

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  grant.reset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (path = DOC) =>
  act(() =>
    root.render(
      createElement(MarkdownPreviewPane, { path, workspaceRoot: 'C:/proj', visible: true, onSetView: () => {} }),
    ),
  );

describe('MarkdownPreviewPane local images', () => {
  it('shows nothing, not a blocked notice, while the grant is on its way', async () => {
    await render();
    expect(host.textContent).not.toContain('Image blocked');
    expect(host.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/gif/);
  });

  it('loads the image through the asset policy once a late grant lands', async () => {
    await render();
    await act(async () => grant.land({ [LOGO]: GRANTED }));
    expect(host.textContent).not.toContain('Image blocked');
    expect(host.querySelector('img')?.getAttribute('src')).toBe(GRANTED);
  });

  it("resolves each document's images against its own folder", async () => {
    grant.land({ [LOGO]: GRANTED, [OTHER_LOGO]: OTHER_GRANTED });
    await render(DOC);
    expect(host.querySelector('img')?.getAttribute('src')).toBe(GRANTED);
    // Same text, another folder: the image is the other document's.
    await render(OTHER_DOC);
    expect(host.querySelector('img')?.getAttribute('src')).toBe(OTHER_GRANTED);
  });
});

describe('MarkdownPreviewPane Streamdown configuration', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, 'MarkdownPreviewPane.tsx'), 'utf8');
  const streamdownJsx = src.match(/<Streamdown[\s\S]*?<\/Streamdown>/)?.[0] ?? '';

  it('renders complete markdown files in static mode', () => {
    expect(streamdownJsx).toMatch(/mode="static"/);
  });

  it('does not run streaming incomplete-markdown repair for files', () => {
    expect(streamdownJsx).toMatch(/parseIncompleteMarkdown=\{false\}/);
  });
});
