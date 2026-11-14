import { describe, expect, it } from 'vitest';
import { REFUSED_IMAGE_TAG } from './assetPath';
import { rehypeImageCaptions } from './imageCaptions';

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const text = (value: string): Node => ({ type: 'text', value });
const img = (alt?: string, tagName = 'img'): Node => ({
  type: 'element',
  tagName,
  properties: alt === undefined ? { src: 'a.png' } : { src: 'a.png', alt },
  children: [],
});
const p = (...children: Node[]): Node => ({
  type: 'element',
  tagName: 'p',
  properties: {},
  children,
});

const run = (node: Node) => {
  rehypeImageCaptions()({ type: 'root', children: [node] });
  return node;
};

describe('rehypeImageCaptions', () => {
  it('turns a paragraph holding one image with an alt into a captioned figure', () => {
    const image = img('The restore flow');
    const node = run(p(text('\n'), image, text('\n')));
    expect(node.tagName).toBe('figure');
    expect(node.children).toEqual([
      image,
      {
        type: 'element',
        tagName: 'figcaption',
        properties: {},
        children: [text('The restore flow')],
      },
    ]);
  });

  it('captions a refused image too', () => {
    expect(run(p(img('Logo', REFUSED_IMAGE_TAG))).tagName).toBe('figure');
  });

  it('leaves an image without an alt, or with a blank one, alone', () => {
    expect(run(p(img())).tagName).toBe('p');
    expect(run(p(img('  '))).tagName).toBe('p');
  });

  it('leaves an image inside running text alone', () => {
    expect(run(p(text('See '), img('diagram'), text(' below.'))).tagName).toBe('p');
  });
});
