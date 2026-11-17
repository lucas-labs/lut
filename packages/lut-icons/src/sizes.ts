import type {
  LutIconCanvas,
  LutIconData,
  LutIconMaster,
  LutIconRotation,
  LutIconSize,
} from './types';

/**
 * Each size label, its rendered size and the master it is drawn from: the small sizes are a master
 * at half scale, the large ones the same master at 1:1, so every size stays on the pixel grid.
 */
export const LUT_ICON_SIZES: Readonly<Record<LutIconSize, { px: number; canvas: LutIconCanvas }>> =
  {
    xs: { px: 12, canvas: 24 },
    sm: { px: 14, canvas: 28 },
    md: { px: 16, canvas: 32 },
    lg: { px: 24, canvas: 24 },
    xl: { px: 28, canvas: 28 },
    '2xl': { px: 32, canvas: 32 },
  };

/** How an icon renders at a size and rotation. */
export type ResolvedLutIcon = {
  master: LutIconMaster;
  /** The rendered box, in px; a quarter turn swaps width and height. */
  width: number;
  height: number;
  /** The viewBox, in canvas units. */
  viewBox: string;
  /** The transform that turns the drawing inside that viewBox, if any. */
  transform?: string;
  /** Which sides are an odd number of px: a box only centres on whole pixels in a box of the same parity. */
  odd?: 'x' | 'y' | 'xy';
};

/**
 * The master for `size` and the box it renders in. The box keeps the master's scale, so an
 * artboard smaller than its canvas (30 on a 32 canvas) renders smaller instead of stretched.
 */
export function resolveSize(
  data: LutIconData,
  size: LutIconSize,
  rotate: LutIconRotation = 0,
): ResolvedLutIcon {
  const { px, canvas } = LUT_ICON_SIZES[size];
  const master = data[canvas];
  const scale = px / canvas;
  const { width: w, height: h } = master;
  const quarter = rotate === 90 || rotate === 270;
  const width = (quarter ? h : w) * scale;
  const height = (quarter ? w : h) * scale;
  const transform =
    rotate === 90
      ? `translate(${h} 0) rotate(90)`
      : rotate === 180
        ? `translate(${w} ${h}) rotate(180)`
        : rotate === 270
          ? `translate(0 ${w}) rotate(270)`
          : undefined;
  const oddX = width % 2 === 1;
  const oddY = height % 2 === 1;
  const odd = oddX && oddY ? 'xy' : oddX ? 'x' : oddY ? 'y' : undefined;
  return {
    master,
    width,
    height,
    viewBox: `0 0 ${quarter ? h : w} ${quarter ? w : h}`,
    transform,
    odd,
  };
}
