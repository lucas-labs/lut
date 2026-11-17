import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createLutIcon } from './createLutIcon';
import { ArrowOneSideIconData } from './icons/arrow-one-side';
import { ChevronIcon, ChevronIconData } from './icons/chevron';
import { PlusIcon, PlusIconData } from './icons/plus';
import { resolveSize } from './sizes';
import { toSvgString } from './svgString';

const attr = (html: string, name: string) => html.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe('resolveSize', () => {
  it('draws the small sizes from a master at half scale and the large ones at 1:1', () => {
    expect(resolveSize(ChevronIconData, 'xs')).toMatchObject({ width: 12, height: 12, viewBox: '0 0 24 24' });
    expect(resolveSize(ChevronIconData, 'sm')).toMatchObject({ width: 14, height: 14, viewBox: '0 0 28 28' });
    expect(resolveSize(ChevronIconData, 'md')).toMatchObject({ width: 16, height: 16, viewBox: '0 0 32 32' });
    expect(resolveSize(ChevronIconData, 'lg')).toMatchObject({ width: 24, height: 24, viewBox: '0 0 24 24' });
  });

  it('keeps an artboard smaller than its canvas at scale and marks its odd sides', () => {
    expect(resolveSize(PlusIconData, 'sm')).toMatchObject({ width: 13, height: 13, odd: 'xy' });
    expect(resolveSize(PlusIconData, 'lg')).toMatchObject({ width: 22, height: 22, odd: undefined });
    expect(resolveSize(ArrowOneSideIconData, 'sm')).toMatchObject({ width: 14, height: 13, odd: 'y' });
  });

  it('turns the box with a quarter turn', () => {
    const turned = resolveSize(ArrowOneSideIconData, 'sm', 90);
    expect(turned).toMatchObject({ width: 13, height: 14, odd: 'x', viewBox: '0 0 26 28' });
    expect(turned.transform).toBe('translate(26 0) rotate(90)');
    expect(resolveSize(ArrowOneSideIconData, 'sm', 180).transform).toBe('translate(28 26) rotate(180)');
    expect(resolveSize(ArrowOneSideIconData, 'sm', 270).transform).toBe('translate(0 28) rotate(270)');
  });
});

describe('createLutIcon', () => {
  it('renders the size inline, so CSS that sizes every svg cannot stretch it', () => {
    const html = renderToStaticMarkup(<ChevronIcon size="sm" className="text-muted" />);
    expect(attr(html, 'style')).toBe('width:14px;height:14px');
    expect(attr(html, 'class')).toBe('text-muted');
    expect(attr(html, 'data-odd')).toBeUndefined();
  });

  it('marks an odd box for the Button', () => {
    expect(attr(renderToStaticMarkup(<PlusIcon size="sm" />), 'data-odd')).toBe('xy');
  });

  it('wraps a turned drawing in its transform', () => {
    const html = renderToStaticMarkup(<ChevronIcon size="md" rotate={90} />);
    expect(html).toContain('<g transform="translate(32 0) rotate(90)">');
  });

  it('makes turned variants for configs', () => {
    const Down = createLutIcon('ChevronDownIcon', ChevronIconData, { rotate: 90 });
    expect(renderToStaticMarkup(<Down size="xs" />)).toContain('transform="translate(24 0) rotate(90)"');
  });
});

describe('toSvgString', () => {
  it('draws like the component, in the given color', () => {
    const svg = toSvgString(PlusIconData, 'sm', 'red');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="13" height="13" viewBox="0 0 26 26">/);
    expect(svg).toContain('stroke="red"');
    expect(toSvgString(ChevronIconData, 'sm', '#000', 180)).toContain('<g transform="translate(28 28) rotate(180)">');
  });
});
