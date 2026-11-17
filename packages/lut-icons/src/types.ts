/** The size labels: each one is drawn from one of the 3 masters (see `sizes.ts`). */
export type LutIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** A clockwise turn, for directional icons: each is drawn pointing one way (a chevron points right). */
export type LutIconRotation = 0 | 90 | 180 | 270;

/** The canvas of a master drawing, in px. */
export type LutIconCanvas = 24 | 28 | 32;

/** A filled area. */
type LutIconFill = {
  paint: 'fill';
  d: string;
  fillRule?: 'evenodd';
};

/** A line, with the width (in canvas units), caps and joins it was drawn with. */
type LutIconStroke = {
  paint: 'stroke';
  d: string;
  strokeWidth: number;
  linecap: 'butt' | 'round' | 'square';
  linejoin: 'miter' | 'round' | 'bevel';
  miterLimit?: number;
};

/** One shape of a drawing. */
export type LutIconPath = LutIconFill | LutIconStroke;

/** One master: its artboard size (it can be smaller than the canvas) and its shapes. */
export type LutIconMaster = {
  width: number;
  height: number;
  paths: readonly LutIconPath[];
};

/** An icon's drawings, one per master canvas. */
export type LutIconData = Readonly<Record<LutIconCanvas, LutIconMaster>>;
