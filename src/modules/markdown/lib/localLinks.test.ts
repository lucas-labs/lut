import { describe, expect, it, vi } from 'vitest';
import { headingSlug, rehypeHeadingIds, rehypeLocalLinks } from './localLinks';
import { openLocalLink } from './openLocalLink';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: vi.fn() }));

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const link = (href: string): Node => ({
  type: 'element',
  tagName: 'a',
  properties: { href },
  children: [],
});
const localPath = (href: string, base = '/w/p/docs/readme.md') => {
  const node = link(href);
  rehypeLocalLinks({ basePath: base })({ type: 'root', children: [node] });
  return node.properties?.dataLocalPath;
};

describe('rehypeLocalLinks', () => {
  it("resolves relative links against the document's folder, dropping the fragment", () => {
    expect(localPath('./guide.md')).toBe('/w/p/docs/guide.md');
    expect(localPath('../src/components/UI-UX-GUIDE.md')).toBe(
      '/w/p/src/components/UI-UX-GUIDE.md',
    );
    expect(localPath('other.md#setup')).toBe('/w/p/docs/other.md');
  });

  it('keeps Windows paths in their own separator', () => {
    expect(localPath('guide.md', 'D:\\w\\p\\README.md')).toBe('D:\\w\\p\\guide.md');
  });

  it('leaves remote links, mail and in-page anchors alone', () => {
    expect(localPath('https://example.com/a.md')).toBeUndefined();
    expect(localPath('mailto:me@example.com')).toBeUndefined();
    expect(localPath('#schema-versions')).toBeUndefined();
  });
});

describe('rehypeHeadingIds', () => {
  const heading = (tagName: string, text: string): Node => ({
    type: 'element',
    tagName,
    properties: {},
    children: [{ type: 'text', value: text }],
  });

  it('gives headings the ids GitHub would, numbering repeats', () => {
    const nodes = [
      heading('h2', 'Schema versions'),
      heading('h3', 'Schema versions'),
      heading('h1', '📢 Parla'),
    ];
    rehypeHeadingIds()({ type: 'root', children: nodes });
    expect(nodes.map((n) => n.properties?.id)).toEqual([
      'schema-versions',
      'schema-versions-1',
      '-parla',
    ]);
  });

  it('drops punctuation like GitHub does', () => {
    expect(headingSlug('1. Station / Client Application')).toBe('1-station--client-application');
    expect(headingSlug("What's new?")).toBe('whats-new');
  });
});

describe('openLocalLink', () => {
  const deps = (kind: 'file' | 'dir' | 'symlink' | null) => ({
    stat: vi.fn(async () => kind),
    openFile: vi.fn(),
    reveal: vi.fn(async () => {}),
    notFound: vi.fn(),
  });

  it('opens a linked file in lut', async () => {
    const d = deps('file');
    await openLocalLink('/w/p/a.md', d);
    expect(d.openFile).toHaveBeenCalledWith('/w/p/a.md');
  });

  it('shows a linked folder in the file manager', async () => {
    const d = deps('dir');
    await openLocalLink('/w/p/docs', d);
    expect(d.reveal).toHaveBeenCalledWith('/w/p/docs');
    expect(d.openFile).not.toHaveBeenCalled();
  });

  it('says so when the linked path does not exist', async () => {
    const d = deps(null);
    await openLocalLink('/w/p/missing.md', d);
    expect(d.notFound).toHaveBeenCalledWith('/w/p/missing.md');
    expect(d.openFile).not.toHaveBeenCalled();
  });
});
