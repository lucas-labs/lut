import { describe, expect, it } from 'vitest';
import { rehypeImageSize } from './imageSize';

const run = (properties: Record<string, unknown>, tagName = 'img') => {
  const node = { type: 'element', tagName, properties, children: [] };
  rehypeImageSize()({
    type: 'root',
    children: [{ type: 'element', tagName: 'p', children: [node] }],
  });
  return node.properties.style;
};

describe('rehypeImageSize', () => {
  it('keeps a height-only logo at its height', () => {
    expect(run({ src: 'logo.svg', height: '112' })).toBe('height:112px');
    expect(run({ src: 'logo.svg', height: 112 })).toBe('height:112px');
  });

  it('keeps both sides, pixels and percentages', () => {
    expect(run({ src: 'a.png', width: '50%', height: '40px' })).toBe('width:50%;height:40px');
  });

  it('adds to a style the image already has', () => {
    expect(run({ src: 'a.png', height: '20', style: 'border-radius: 4px;' })).toBe(
      'border-radius: 4px;height:20px',
    );
  });

  it('ignores sizes that are not lengths, and images without sizes', () => {
    expect(run({ src: 'a.png', height: 'auto' })).toBeUndefined();
    expect(run({ src: 'a.png' })).toBeUndefined();
  });

  it('only touches images', () => {
    expect(run({ height: '10' }, 'video')).toBeUndefined();
  });
});
