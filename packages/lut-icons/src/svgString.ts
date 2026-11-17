import { resolveSize } from './sizes';
import type { LutIconData, LutIconRotation, LutIconSize } from './types';

/**
 * An icon as an SVG document, for places outside React (CSS masks, data URLs, canvas). It draws
 * like the component: same master, box, rotation and line styles for the size. `color` is the
 * paint, black by default (masks only read the alpha).
 */
export function toSvgString(
  data: LutIconData,
  size: LutIconSize,
  color = '#000',
  rotate: LutIconRotation = 0,
): string {
  const { master, width, height, viewBox, transform } = resolveSize(data, size, rotate);
  const paths = master.paths
    .map((p) =>
      p.paint === 'fill'
        ? `<path d="${p.d}" fill="${color}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ''}/>`
        : `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${p.strokeWidth}" stroke-linecap="${p.linecap}" stroke-linejoin="${p.linejoin}"${p.miterLimit != null ? ` stroke-miterlimit="${p.miterLimit}"` : ''}/>`,
    )
    .join('');
  const body = transform ? `<g transform="${transform}">${paths}</g>` : paths;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;
}
