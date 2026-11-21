import { NO_PADDING, type Padding } from '@/lib/padding';
import type { TerminalFontMetrics } from './terminalVisuals';

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 512;
const MIN_ROWS = 1;
const MAX_ROWS = 256;
const DEVICE_ROUNDING_TOLERANCE_PX = 0.02;

/**
 * CSS pixels kept free at the right of the grid for the overlay scrollbar and breathing room:
 * the xterm fit this replaced left the same 14 px, and without it text runs to the pane's edge
 * and under the scrollbar, worst in narrow split panes (#1362). A pane too narrow to hold two
 * columns beside the gutter still gets its two columns.
 */
export const TERMINAL_RIGHT_GUTTER_CSS_PX = 14;

export type TerminalDeviceBounds = {
  readonly width: number;
  readonly height: number;
};

export type TerminalViewportFit = {
  readonly cols: number;
  readonly rows: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
};

/**
 * Fits whole integer device cells into a host box. `deviceBounds` is the exact
 * device-pixel content box from `ResizeObserver` when the engine reports it;
 * otherwise the CSS size is converted and rounded. The CSS size of the result
 * is the device size divided by the ratio, so a canvas styled with it maps
 * 1:1 onto the device pixel grid. `gutter` (CSS pixels) is held back from the
 * right edge before columns are counted (a pane keeps at least two columns).
 */
export function fitTerminalViewport(
  hostWidth: number,
  hostHeight: number,
  metrics: TerminalFontMetrics,
  deviceBounds?: TerminalDeviceBounds | null,
  gutter = 0,
): TerminalViewportFit | null {
  const { deviceCellWidth, deviceCellHeight, scale } = metrics;
  if (
    !isPositiveFinite(hostWidth) ||
    !isPositiveFinite(hostHeight) ||
    !isPositiveFinite(deviceCellWidth) ||
    !isPositiveFinite(deviceCellHeight) ||
    !isPositiveFinite(scale)
  ) {
    return null;
  }
  const hostDeviceWidth = deviceBounds?.width ?? hostWidth * scale;
  const deviceHeight = deviceBounds?.height ?? hostHeight * scale;
  const reserved = Math.round(Math.max(0, gutter) * scale);
  if (
    hostDeviceWidth + DEVICE_ROUNDING_TOLERANCE_PX < MIN_COLUMNS * deviceCellWidth ||
    deviceHeight + DEVICE_ROUNDING_TOLERANCE_PX < MIN_ROWS * deviceCellHeight
  ) {
    return null;
  }

  // The gutter never takes a pane below its minimum two columns, and never makes a wider
  // pane fit fewer columns than a narrower one.
  const cols = clamp(
    Math.floor((hostDeviceWidth - reserved + DEVICE_ROUNDING_TOLERANCE_PX) / deviceCellWidth),
    MIN_COLUMNS,
    MAX_COLUMNS,
  );
  const rows = clamp(
    Math.floor((deviceHeight + DEVICE_ROUNDING_TOLERANCE_PX) / deviceCellHeight),
    MIN_ROWS,
    MAX_ROWS,
  );
  const pixelWidth = cols * deviceCellWidth;
  const pixelHeight = rows * deviceCellHeight;
  return {
    cols,
    rows,
    cssWidth: pixelWidth / scale,
    cssHeight: pixelHeight / scale,
    pixelWidth,
    pixelHeight,
  };
}

export type TerminalPaddedFit = {
  readonly fit: TerminalViewportFit | null;
  /** The padding the host had room for, in CSS pixels: the grid's inset in the host. */
  readonly padding: Padding;
  /** The same padding in whole device pixels: where the grid starts in the host's rectangle. */
  readonly devicePadding: Padding;
};

/**
 * Fits the grid into a host less its `padding` (CSS pixels). The padding is taken in whole device
 * pixels, as the grid is, so a host too small for it still keeps the minimum grid (two columns, one
 * row) at any pixel ratio: each axis gives up the padding it has no room for, shared between its two
 * sides as they asked for it. The CSS padding is the device one over the ratio, so the grid drawn
 * and the root measured for the pointer start at the same place.
 */
export function fitPaddedViewport(
  hostWidth: number,
  hostHeight: number,
  metrics: TerminalFontMetrics,
  deviceBounds: TerminalDeviceBounds | null | undefined,
  padding: Padding,
  gutter = 0,
): TerminalPaddedFit {
  const { scale } = metrics;
  const toDevice = (value: number) => Math.round(Math.max(0, value) * scale);
  const room = (start: number, end: number, size: number, min: number): [number, number] => {
    const free = Math.max(0, Math.floor(size + DEVICE_ROUNDING_TOLERANCE_PX) - min);
    if (start + end <= free) return [start, end];
    const share = free / (start + end);
    return [Math.floor(start * share), Math.floor(end * share)];
  };
  const [left, right] = room(
    toDevice(padding.left),
    toDevice(padding.right),
    deviceBounds?.width ?? hostWidth * scale,
    MIN_COLUMNS * metrics.deviceCellWidth,
  );
  const [top, bottom] = room(
    toDevice(padding.top),
    toDevice(padding.bottom),
    deviceBounds?.height ?? hostHeight * scale,
    MIN_ROWS * metrics.deviceCellHeight,
  );
  if (!left && !right && !top && !bottom) {
    return {
      fit: fitTerminalViewport(hostWidth, hostHeight, metrics, deviceBounds, gutter),
      padding: NO_PADDING,
      devicePadding: NO_PADDING,
    };
  }
  const devicePadding = { top, right, bottom, left };
  const css = {
    top: top / scale,
    right: right / scale,
    bottom: bottom / scale,
    left: left / scale,
  };
  const fit = fitTerminalViewport(
    hostWidth - css.left - css.right,
    hostHeight - css.top - css.bottom,
    metrics,
    deviceBounds && {
      width: deviceBounds.width - left - right,
      height: deviceBounds.height - top - bottom,
    },
    gutter,
  );
  return { fit, padding: css, devicePadding };
}

/**
 * CSS translation that moves an element whose layout origin is `left`/`top`
 * onto the nearest device pixel boundary. Zero when already aligned.
 */
export function snapOffsetCss(
  left: number,
  top: number,
  scale: number,
): { readonly x: number; readonly y: number } {
  return { x: snapAxis(left, scale), y: snapAxis(top, scale) };
}

function snapAxis(origin: number, scale: number): number {
  if (!Number.isFinite(origin) || !isPositiveFinite(scale)) return 0;
  const device = origin * scale;
  const offset = (Math.round(device) - device) / scale;
  return Math.abs(offset * scale) < 1e-6 ? 0 : offset;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
