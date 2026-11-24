#!/usr/bin/env node
// Builds lut-icons.json from the VectorCraft file alone: every icon drawn in it, with each size's
// SVG and its geometry. Every icon needs all 3 masters (artboards "<name>-24|28|32"); any problem
// in the file fails the build and leaves the previous lut-icons.json untouched.
//
// Usage: node scripts/build-manifest.mjs [--source <file>] [--out <file>]

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABEL_ORDER, MASTERS, readIcons } from './vectorcraft.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return resolve(i > -1 ? process.argv[i + 1] : fallback);
};
const sourcePath = arg('--source', resolve(root, 'craft/lut-icons.vectorcraft'));
const outPath = arg('--out', resolve(root, 'lut-icons.json'));

const r = n => Math.round(n * 1000) / 1000;
const pt = ([x, y], o) => `${r(x - o.x)} ${r(y - o.y)}`;

function subpathD(sp, o) {
  const a = sp.anchors;
  if (!a.length) return '';
  let d = `M${pt(a[0].p, o)}`;
  const seg = (from, to) => {
    if (!from.out && !to.in) return `L${pt(to.p, o)}`;
    return `C${pt(from.out ?? from.p, o)} ${pt(to.in ?? to.p, o)} ${pt(to.p, o)}`;
  };
  for (let i = 1; i < a.length; i++) d += seg(a[i - 1], a[i]);
  if (sp.closed) {
    if (a.length > 1) {
      const last = a[a.length - 1];
      if (last.out || a[0].in) d += seg(last, a[0]);
    }
    d += 'Z';
  }
  return d;
}

// A shape's colour: a theme colour's name in the object's VectorCraft note (`{"color": "primary"}`), drawn as
// `var(--primary)`, or inherited from its group; without one the shape takes the text colour (currentColor). A note
// that is not JSON is left alone: notes can hold other things.
function noteColor(node) {
  const note = node.attrs?.note;
  if (!note) return null;
  try {
    const color = JSON.parse(note)?.color;
    return typeof color === 'string' && color ? color : null;
  } catch {
    return null;
  }
}
const colorOf = (node, parentColor) => noteColor(node) ?? parentColor;
const cssColor = color => (color ? `var(--${color})` : 'currentColor');

const paintAttr = (paint, color) => (paint && paint.type === 'solid' ? cssColor(color) : 'none');

// An object's opacity (`node.opacity`, its own and its groups') multiplies the opacity of its fill or stroke
// (`item.opacity`): VectorCraft keeps them apart, the icon draws them as one.
const opacity = (item, objectOpacity) => (item?.opacity ?? 1) * objectOpacity;

function styleAttrs(appearance, rule, objectOpacity = 1, color = null) {
  const items = appearance?.items ?? [];
  const fill = items.find(i => i.kind === 'fill');
  const stroke = items.find(i => i.kind === 'stroke');
  const at = [`fill="${paintAttr(fill?.paint, color)}"`];
  if (fill?.paint?.type === 'solid' && rule === 'EvenOdd') at.push('fill-rule="evenodd"');
  const fillOpacity = opacity(fill, objectOpacity);
  if (fill?.paint?.type === 'solid' && fillOpacity !== 1) at.push(`fill-opacity="${r(fillOpacity)}"`);
  if (stroke && stroke.paint?.type === 'solid') {
    at.push(`stroke="${cssColor(color)}"`, `stroke-width="${r(stroke.width ?? 1)}"`);
    const strokeOpacity = opacity(stroke, objectOpacity);
    if (strokeOpacity !== 1) at.push(`stroke-opacity="${r(strokeOpacity)}"`);
    if (stroke.cap && stroke.cap !== 'Butt') at.push(`stroke-linecap="${stroke.cap.toLowerCase()}"`);
    if (stroke.join && stroke.join !== 'Miter') at.push(`stroke-linejoin="${stroke.join.toLowerCase()}"`);
    if (stroke.miter_limit != null && stroke.join !== 'Round') at.push(`stroke-miterlimit="${r(stroke.miter_limit)}"`);
  }
  return at.join(' ');
}

function nodeSvg(node, o, warn, parentOpacity = 1, parentColor = null) {
  const k = node.kind;
  const objectOpacity = parentOpacity * (node.opacity ?? 1);
  const color = colorOf(node, parentColor);
  if (k.type === 'path') {
    const d = k.path.subpaths.map(sp => subpathD(sp, o)).join('');
    return `<path d="${d}" ${styleAttrs(node.appearance, undefined, objectOpacity, color)}/>`;
  }
  if (k.type === 'compound') {
    const d = k.children.flatMap(c => c.kind.path?.subpaths ?? []).map(sp => subpathD(sp, o)).join('');
    return `<path d="${d}" ${styleAttrs(node.appearance, k.rule, objectOpacity, color)}/>`;
  }
  if (k.type === 'group') {
    if (k.clip) warn(`clipping group ${node.id} exported without its clip`);
    if (objectOpacity !== 1 && k.children.length > 1) {
      warn(`group ${node.id}: its opacity is applied to each child, so where they overlap it stacks`);
    }
    return `<g>${k.children.map(c => nodeSvg(c, o, warn, objectOpacity, color)).join('')}</g>`;
  }
  warn(`node ${node.id} of type "${k.type}" skipped`);
  return '';
}

// How a shape is painted: a filled area, or a line with the caps, joins and width it was drawn
// with (they are part of the design: square ends that match the native window controls, butt
// lines that fill a dot). Colour is the component's (currentColor) unless a note names one; an opacity below 1 is
// kept, since it is part of the drawing too (the spinner's faint track).
const opacityOf = (item, objectOpacity) => {
  const value = opacity(item, objectOpacity);
  return value !== 1 ? { opacity: r(value) } : {};
};
function paintOf(appearance, objectOpacity) {
  const items = appearance?.items ?? [];
  const f = items.find(i => i.kind === 'fill' && i.paint?.type === 'solid');
  if (f) return { paint: 'fill', ...opacityOf(f, objectOpacity) };
  const s = items.find(i => i.kind === 'stroke' && i.paint?.type === 'solid');
  const join = (s?.join ?? 'Miter').toLowerCase();
  return {
    paint: 'stroke',
    strokeWidth: r(s?.width ?? 1),
    linecap: (s?.cap ?? 'Butt').toLowerCase(),
    linejoin: join,
    ...(join === 'miter' && s?.miter_limit != null ? { miterLimit: r(s.miter_limit) } : {}),
    ...opacityOf(s, objectOpacity),
  };
}

// Geometry and paint. Groups have no transforms, so their children are flattened.
function nodeElements(node, o, parentOpacity = 1, parentColor = null) {
  const k = node.kind;
  const objectOpacity = parentOpacity * (node.opacity ?? 1);
  const color = colorOf(node, parentColor);
  const paint = { ...paintOf(node.appearance, objectOpacity), ...(color ? { color } : {}) };
  if (k.type === 'path') return [{ type: 'path', ...paint, d: k.path.subpaths.map(sp => subpathD(sp, o)).join('') }];
  if (k.type === 'compound') {
    const d = k.children.flatMap(c => c.kind.path?.subpaths ?? []).map(sp => subpathD(sp, o)).join('');
    return [{ type: 'path', ...paint, d, ...(k.rule === 'EvenOdd' ? { fillRule: 'evenodd' } : {}) }];
  }
  if (k.type === 'group') return k.children.flatMap(c => nodeElements(c, o, objectOpacity, color));
  return [];
}

// Opaque lines with the same style draw the same in one path as in several (a stroke ignores fill rules and
// subpath direction), so they are joined: one <path> per style. Translucent lines stay apart: where two
// cross, separate paths stack their opacity and one path would paint the crossing once. Fills stay apart,
// since joining filled shapes can open or close holes.
function mergeStrokes(elements) {
  const out = [];
  const byStyle = new Map();
  for (const e of elements) {
    // A stroke joins an earlier one only while nothing of another colour is drawn between them: merging past it
    // would move the stroke under that colour.
    for (const [key, s] of byStyle) if ((s.color ?? null) !== (e.color ?? null)) byStyle.delete(key);
    if (e.paint !== 'stroke' || e.opacity != null) { out.push(e); continue; }
    const key = JSON.stringify([e.strokeWidth, e.linecap, e.linejoin, e.miterLimit, e.color]);
    const same = byStyle.get(key);
    if (same) same.d += e.d;
    else { const copy = { ...e }; byStyle.set(key, copy); out.push(copy); }
  }
  return out;
}

// --- build ---
const { icons, errors } = readIcons(sourcePath);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`${errors.length} problems in ${sourcePath}; ${outPath} was not written.`);
  process.exit(1);
}

const warnings = [];
const result = [];
for (const [name, masters] of icons) {
  const sizes = [];
  for (const m of MASTERS) {
    const { artboard: ab, art } = masters.get(m.canvas);
    const o = { x: ab.rect.x0, y: ab.rect.y0 };
    const width = r(ab.rect.x1 - ab.rect.x0), height = r(ab.rect.y1 - ab.rect.y0);
    const viewBox = `0 0 ${width} ${height}`;
    const body = art.map(n => nodeSvg(n, o, w => warnings.push(`${ab.name}: ${w}`))).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${body}</svg>`;
    const innerSvgElements = mergeStrokes(art.flatMap(n => nodeElements(n, o)));
    for (const [label, px] of Object.entries(m.labels)) {
      sizes.push({ [label]: { px, artboard: ab.name, canvas: m.canvas, grid: m.grid, width, height, viewBox, svg, innerSvgElements } });
    }
  }
  sizes.sort((a, b) => LABEL_ORDER.indexOf(Object.keys(a)[0]) - LABEL_ORDER.indexOf(Object.keys(b)[0]));
  result.push({ [name]: { sizes } });
}

writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`${result.length} icons → ${outPath}`);
for (const w of warnings) console.warn(`warning: ${w}`);
