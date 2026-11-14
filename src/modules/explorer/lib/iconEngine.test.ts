import catppuccinIcons from '@iconify-json/catppuccin/icons.json';
import { describe, expect, it } from 'vitest';
import { CATPPUCCIN_PALETTE, iconEngine, recolor } from './iconEngine';
import { ICON_ID_TOKEN } from './iconMarkup';

const { fileIconSvg, folderIconSvg } = iconEngine;
const icons = Object.entries(
  (catppuccinIcons as { icons: Record<string, { body: string }> }).icons,
);
const markupOf = (slug: string) =>
  recolor(catppuccinIcons.icons[slug as keyof typeof catppuccinIcons.icons].body);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** Masks, clip paths and gradients only shape an icon: their colours are never seen. */
const SHAPING = /<(mask|clipPath|linearGradient|radialGradient)\b[\s\S]*?<\/\1>/g;

// These assertions lock the resolution chain (by-name, extension, compound
// extension, and default fallback) rather than the icon SVGs themselves, so
// they stay valid when the underlying icon set changes.
const DEFAULT = fileIconSvg('file-with-no-known-extension');

describe('icon colours', () => {
  it('knows every colour the icon set paints with', () => {
    const unknown = new Set<string>();
    for (const [, { body }] of icons) {
      for (const hex of body.replace(SHAPING, '').match(HEX) ?? []) {
        if (!CATPPUCCIN_PALETTE[hex.toLowerCase()]) unknown.add(hex);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('draws every palette colour through its variable, with one style per element', () => {
    for (const [name, { body }] of icons) {
      const markup = recolor(body);
      const bare = markup.replace(/var\(--file-icon-[a-z0-9]+,#[0-9a-fA-F]+\)/g, '');
      const left = (bare.match(HEX) ?? []).filter((hex) => CATPPUCCIN_PALETTE[hex.toLowerCase()]);
      expect(left, name).toEqual([]);
      for (const tag of markup.match(/<[a-zA-Z][^>]*>/g) ?? []) {
        expect(tag.match(/\sstyle="/g)?.length ?? 0, `${name}: ${tag}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the colour itself as the fallback and leaves shaping colours alone', () => {
    expect(recolor('<path stroke="#8aadf4" d="M0 0"/>')).toBe(
      '<path d="M0 0" style="stroke:var(--file-icon-blue,#8aadf4)"/>',
    );
    expect(recolor('<mask id="m" style="mask-type:alpha"><circle fill="#3700ff"/></mask>')).toBe(
      `<mask id="${ICON_ID_TOKEN}-m" style="mask-type:alpha"><circle fill="#3700ff"/></mask>`,
    );
    expect(recolor('<g fill="#a6da95" style="opacity:.5">')).toBe(
      '<g style="opacity:.5;fill:var(--file-icon-green,#a6da95)">',
    );
  });

  it('marks the ids an icon declares and refers to', () => {
    const markup = fileIconSvg('humans.txt');
    expect(markup).not.toMatch(/\sid="(?!%icon%-)/);
    expect(markup).not.toMatch(/url\(#(?!%icon%-)/);
    expect(markup).toContain(`url(#${ICON_ID_TOKEN}-`);
  });
});

describe('fileIconSvg resolution chain', () => {
  it('maps known names to their icons, drawn through the colour variables', () => {
    expect(fileIconSvg('index.ts')).toBe(markupOf('typescript'));
    expect(fileIconSvg('main.rs')).toBe(markupOf('rust'));
    expect(fileIconSvg('notes.md')).toBe(markupOf('markdown'));
    expect(fileIconSvg('mystery.qzxwv')).toBe(markupOf('file'));
    expect(fileIconSvg('index.ts')).toContain('var(--file-icon-');
  });

  it('is deterministic for the same extension', () => {
    expect(fileIconSvg('a.ts')).toBe(fileIconSvg('b.ts'));
  });

  it('distinguishes a compound extension from its base', () => {
    // .test.tsx should resolve differently from a plain .tsx.
    expect(fileIconSvg('component.test.tsx')).not.toBe(fileIconSvg('component.tsx'));
  });

  it('resolves a by-name match (no extension) to a non-default icon', () => {
    expect(fileIconSvg('Dockerfile')).not.toBe(DEFAULT);
  });

  it('falls back to the default for an unknown extension', () => {
    expect(fileIconSvg('mystery.qzxwv')).toBe(DEFAULT);
  });
});

describe('folderIconSvg', () => {
  it('maps a known folder to its open and closed icons', () => {
    expect(folderIconSvg('src', false)).toBe(markupOf('folder-src'));
    expect(folderIconSvg('src', true)).toBe(markupOf('folder-src-open'));
  });

  it('falls back to the plain folder icons for an unknown folder', () => {
    expect(folderIconSvg('qzxwv-dir', false)).toBe(markupOf('folder'));
    expect(folderIconSvg('qzxwv-dir', true)).toBe(markupOf('folder-open'));
  });
});
