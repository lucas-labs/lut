// Reads lut-icons.vectorcraft: the file format, its artboards and the art drawn on each one.

import { readFileSync } from 'node:fs';

// Size scale: 3 masters (canvas / grid); each master serves a small and a large label.
export const MASTERS = [
  { canvas: 24, grid: 12, labels: { xs: 12, lg: 24 } },
  { canvas: 28, grid: 14, labels: { sm: 14, xl: 28 } },
  { canvas: 32, grid: 16, labels: { md: 16, '2xl': 32 } },
];
export const LABEL_ORDER = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

const ARTBOARD_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(24|28|32)$/;

// A VectorCraft file is a JSON document, then "\0VCBLOBS\0" and an embedded PDF.
function readVectorcraft(path) {
  const raw = readFileSync(path, 'latin1');
  const end = raw.indexOf('\u0000VCBLOBS');
  const json = Buffer.from(end > -1 ? raw.slice(0, end) : raw, 'latin1').toString('utf8');
  const file = JSON.parse(json);
  if (file.format !== 'vectorcraft') throw new Error(`${path} is not a VectorCraft file`);
  return file.document;
}

function points(node) {
  const k = node.kind;
  if (k.path) return k.path.subpaths.flatMap(sp => sp.anchors.map(a => a.p));
  return (k.children ?? []).flatMap(points);
}

// Hidden layers and objects (`visible: false`, hidden in VectorCraft) are not part of the icon.
const shown = n => n.visible !== false;
function visibleOnly(nodes) {
  return nodes.filter(shown).map(n =>
    n.kind.children && n.kind.type !== 'compound'
      ? { ...n, kind: { ...n.kind, children: visibleOnly(n.kind.children) } }
      : n,
  );
}

// Top-level art is matched to the artboard that contains its centre.
function artByArtboard(doc) {
  const byId = new Map(doc.artboards.map(a => [a.id, []]));
  for (const n of visibleOnly(doc.layers).flatMap(l => l.kind.children ?? [])) {
    const ps = points(n);
    if (!ps.length) continue;
    const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const ab = doc.artboards.find(a => cx >= a.rect.x0 && cx <= a.rect.x1 && cy >= a.rect.y0 && cy <= a.rect.y1);
    if (ab) byId.get(ab.id).push(n);
  }
  return byId;
}

/**
 * Groups the artboards into icons: `{ icons: Map<name, Map<canvas, { artboard, art }>>, errors }`.
 * An error is an artboard whose name is not `<name>-<24|28|32>`, a duplicate, an empty artboard,
 * or an icon missing one of the 3 masters.
 */
export function readIcons(path) {
  const doc = readVectorcraft(path);
  const art = artByArtboard(doc);
  const icons = new Map();
  const errors = [];
  for (const ab of doc.artboards) {
    const m = ARTBOARD_NAME.exec(ab.name);
    if (!m) { errors.push(`artboard "${ab.name}" is not named <icon>-<24|28|32>`); continue; }
    const [, name, canvas] = m;
    const sizes = icons.get(name) ?? new Map();
    icons.set(name, sizes);
    if (sizes.has(+canvas)) { errors.push(`artboard "${ab.name}" appears twice`); continue; }
    if (!art.get(ab.id).length) errors.push(`artboard "${ab.name}" is empty`);
    sizes.set(+canvas, { artboard: ab, art: art.get(ab.id) });
  }
  for (const [name, sizes] of icons) {
    const missing = MASTERS.filter(m => !sizes.has(m.canvas)).map(m => `${name}-${m.canvas}`);
    if (missing.length) errors.push(`${name}: missing ${missing.join(', ')}`);
  }
  return { icons: new Map([...icons].sort(([a], [b]) => a.localeCompare(b))), errors };
}
