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
// fs_stat for a linked path: every linked path exists as a file.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ kind: 'file' })) }));
const openFile = vi.fn();
const LOGO_DOC = '# Title\n\n![Logo](./.github/logo.svg)\n';
const doc = vi.hoisted(() => ({ content: '' }));
vi.mock('./useMarkdownDocument', () => ({
  useMarkdownDocument: () => ({ kind: 'ready', content: doc.content }),
}));

const { MarkdownPreviewPane } = await import('./MarkdownPreviewPane');

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  grant.reset();
  doc.content = LOGO_DOC;
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
      createElement(MarkdownPreviewPane, {
        path,
        workspaceRoot: 'C:/proj',
        visible: true,
        onSetView: () => {},
        onOpenFile: openFile,
      }),
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

describe('MarkdownPreviewPane on the design', () => {
  it('draws a GitHub alert with its title, without the marker', async () => {
    doc.content = '> [!WARNING]\n> Never drop `ratio` when migrating.\n';
    await render();
    const alert = host.querySelector('[data-alert="warning"]');
    expect(alert?.getAttribute('role')).toBe('note');
    expect(alert?.textContent).toContain('Warning');
    expect(alert?.textContent).toContain('Never drop ratio when migrating.');
    expect(host.textContent).not.toContain('[!WARNING]');
  });

  it('shows a refused local image as a placeholder with its path and caption', async () => {
    doc.content = '![Secret](../../outside/logo.png)\n';
    await render();
    expect(host.textContent).not.toContain('Image blocked');
    expect(host.querySelector('[data-image-placeholder]')?.textContent).toBe(
      'Image not loaded: ../../outside/logo.png',
    );
    expect(host.querySelector('figcaption')?.textContent).toBe('Secret');
  });

  it('captions an image with its alt', async () => {
    grant.land({ [LOGO]: GRANTED });
    await render();
    expect(host.querySelector('figure img')?.getAttribute('src')).toBe(GRANTED);
    expect(host.querySelector('figure figcaption')?.textContent).toBe('Logo');
  });

  it('opens an image enlarged when clicked, with no download button', async () => {
    grant.land({ [LOGO]: GRANTED });
    await render();
    expect(host.querySelector('[data-streamdown="image-wrapper"]')).toBeNull();
    const open = host.querySelector<HTMLButtonElement>('button[aria-label="Enlarge image: Logo"]');
    expect(open?.querySelector('img')?.getAttribute('src')).toBe(GRANTED);
    await act(async () => open?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('img')?.getAttribute('src')).toBe(GRANTED);
    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the prompt on shell blocks, in the same frame with Copy', async () => {
    doc.content = '```sh\npnpm test restore --watch\n```\n';
    await render();
    expect(host.textContent).toContain('$pnpm test restore --watch');
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toContain('Copy');
  });

  it.each([
    ['a bare relative path', '[Guide](docs/guide.md)', 'C:/proj/docs/guide.md'],
    ['a Windows-style path', '[Guide](docs\\guide.md)', 'C:/proj/docs/guide.md'],
    ['a path with a section', '[Guide](docs/guide.md#setup)', 'C:/proj/docs/guide.md'],
  ])('opens %s in lut instead of blocking it', async (_name, markdown, expected) => {
    openFile.mockClear();
    doc.content = `${markdown}\n`;
    await render();
    expect(host.textContent).not.toContain('[blocked]');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      host.querySelector('article a')?.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(openFile).toHaveBeenCalledWith(expected);
  });

  it('opens a relative link in lut instead of navigating the webview', async () => {
    openFile.mockClear();
    doc.content = 'More info in [UI/UX Guide](./src/components/UI-UX-GUIDE.md).\n';
    await render();
    const link = host.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      link?.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(openFile).toHaveBeenCalledWith('C:/proj/src/components/UI-UX-GUIDE.md');
  });

  it('scrolls to the heading a #section link names, inside the preview', async () => {
    doc.content = '[Go](#schema-versions)\n\n## Schema versions\n';
    await render();
    const heading = host.querySelector('h2');
    expect(heading?.id).toBe('schema-versions');
    const scroll = vi.fn();
    if (heading) heading.scrollIntoView = scroll;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      host.querySelector('a')?.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalled();
  });

  it('draws a fenced block without a language as a block, not inline code', async () => {
    doc.content = '```\nHello!\n```\n';
    await render();
    expect(host.querySelector('pre')?.textContent).toBe('Hello!');
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toContain('Copy');
  });

  it('shows the file and that it is a preview under the document', async () => {
    await render();
    expect(host.querySelector('[aria-label="Preview status"]')?.textContent).toBe(`${DOC}Preview`);
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
