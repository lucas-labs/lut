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

const paintAttr = paint => (paint && paint.type === 'solid' ? 'currentColor' : 'none');

function styleAttrs(appearance, rule) {
  const items = appearance?.items ?? [];
  const fill = items.find(i => i.kind === 'fill');
  const stroke = items.find(i => i.kind === 'stroke');
  const at = [`fill="${paintAttr(fill?.paint)}"`];
  if (fill?.paint?.type === 'solid' && rule === 'EvenOdd') at.push('fill-rule="evenodd"');
  if (stroke && stroke.paint?.type === 'solid') {
    at.push('stroke="currentColor"', `stroke-width="${r(stroke.width ?? 1)}"`);
    if (stroke.cap && stroke.cap !== 'Butt') at.push(`stroke-linecap="${stroke.cap.toLowerCase()}"`);
    if (stroke.join && stroke.join !== 'Miter') at.push(`stroke-linejoin="${stroke.join.toLowerCase()}"`);
    if (stroke.miter_limit != null && stroke.join !== 'Round') at.push(`stroke-miterlimit="${r(stroke.miter_limit)}"`);
  }
  return at.join(' ');
}

function nodeSvg(node, o, warn) {
  const k = node.kind;
  if (k.type === 'path') {
    const d = k.path.subpaths.map(sp => subpathD(sp, o)).join('');
    return `<path d="${d}" ${styleAttrs(node.appearance)}/>`;
  }
  if (k.type === 'compound') {
    const d = k.children.flatMap(c => c.kind.path?.subpaths ?? []).map(sp => subpathD(sp, o)).join('');
    return `<path d="${d}" ${styleAttrs(node.appearance, k.rule)}/>`;
  }
  if (k.type === 'group') {
    if (k.clip) warn(`clipping group ${node.id} exported without its clip`);
    return `<g>${k.children.map(c => nodeSvg(c, o, warn)).join('')}</g>`;
  }
  warn(`node ${node.id} of type "${k.type}" skipped`);
  return '';
}

// How a shape is painted: a filled area, or a line with the caps, joins and width it was drawn
// with (they are part of the design: square ends that match the native window controls, butt
// lines that fill a dot). Colour is left to the component (currentColor).
function paintOf(appearance) {
  const items = appearance?.items ?? [];
  if (items.some(i => i.kind === 'fill' && i.paint?.type === 'solid')) return { paint: 'fill' };
  const s = items.find(i => i.kind === 'stroke' && i.paint?.type === 'solid');
  const join = (s?.join ?? 'Miter').toLowerCase();
  return {
    paint: 'stroke',
    strokeWidth: r(s?.width ?? 1),
    linecap: (s?.cap ?? 'Butt').toLowerCase(),
    linejoin: join,
    ...(join === 'miter' && s?.miter_limit != null ? { miterLimit: r(s.miter_limit) } : {}),
  };
}

// Geometry and paint. Groups have no transforms, so their children are flattened.
function nodeElements(node, o) {
  const k = node.kind;
  if (k.type === 'path') return [{ type: 'path', ...paintOf(node.appearance), d: k.path.subpaths.map(sp => subpathD(sp, o)).join('') }];
  if (k.type === 'compound') {
    const d = k.children.flatMap(c => c.kind.path?.subpaths ?? []).map(sp => subpathD(sp, o)).join('');
    return [{ type: 'path', ...paintOf(node.appearance), d, ...(k.rule === 'EvenOdd' ? { fillRule: 'evenodd' } : {}) }];
  }
  if (k.type === 'group') return k.children.flatMap(c => nodeElements(c, o));
  return [];
}

// Lines with the same style draw the same in one path as in several (a stroke ignores fill rules and
// subpath direction), so they are joined: one <path> per style. Fills stay apart, since joining
// filled shapes can open or close holes.
function mergeStrokes(elements) {
  const out = [];
  const byStyle = new Map();
  for (const e of elements) {
    if (e.paint !== 'stroke') { out.push(e); continue; }
    const key = JSON.stringify([e.strokeWidth, e.linecap, e.linejoin, e.miterLimit]);
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
