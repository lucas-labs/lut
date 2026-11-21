import { describe, expect, it } from 'vitest';
import {
  fitPaddedViewport,
  fitTerminalViewport,
  snapOffsetCss,
  TERMINAL_RIGHT_GUTTER_CSS_PX,
} from './TerminalFit';
import { deriveFontMetrics, type TerminalFontMetrics } from './terminalVisuals';

const FONT = {
  family: 'JetBrains Mono',
  size: 14,
  lineHeight: 1.2,
  letterSpacing: 0,
  weight: '400',
} as const;
const RATIOS = [1, 1.25, 1.5, 1.75, 2, 2.25, 3] as const;

function metricsAt(scale: number): TerminalFontMetrics {
  return deriveFontMetrics(FONT, scale, {
    advance: 8.4 * scale,
    ascent: 11 * scale,
    descent: 3 * scale,
  });
}

describe('fitTerminalViewport right gutter', () => {
  const GUTTER = TERMINAL_RIGHT_GUTTER_CSS_PX;

  it.each(RATIOS)(
    'always leaves at least the gutter free to the right of the grid at %s',
    (scale) => {
      const metrics = metricsAt(scale);
      for (let width = 120; width <= 1400; width += 7.3) {
        const fit = fitTerminalViewport(width, 400, metrics, null, GUTTER);
        if (!fit) continue;
        const free = width * scale - fit.pixelWidth;
        expect(free, `${width}px`).toBeGreaterThanOrEqual(Math.round(GUTTER * scale) - 0.02);
      }
    },
  );

  it('takes the gutter from the device box where the engine reports one', () => {
    const metrics = metricsAt(2);
    const plain = fitTerminalViewport(700, 400, metrics, {
      width: 1400,
      height: 800,
    });
    const gutter = fitTerminalViewport(700, 400, metrics, { width: 1400, height: 800 }, GUTTER);
    expect(gutter?.cols).toBeLessThan(plain?.cols ?? 0);
    expect(1400 - (gutter?.pixelWidth ?? 0)).toBeGreaterThanOrEqual(GUTTER * 2);
  });

  it('changes nothing without a gutter', () => {
    const metrics = metricsAt(1.25);
    expect(fitTerminalViewport(500, 300, metrics, null, 0)).toEqual(
      fitTerminalViewport(500, 300, metrics),
    );
  });

  it('keeps two columns in a pane too narrow for two beside the gutter', () => {
    const metrics = metricsAt(1);
    const cell = metrics.deviceCellWidth;
    for (const width of [2 * cell, 2 * cell + 5, 2 * cell + GUTTER - 1]) {
      expect(fitTerminalViewport(width, 100, metrics, null, GUTTER)?.cols, `${width}px`).toBe(2);
    }
    expect(fitTerminalViewport(cell, 100, metrics, null, GUTTER)).toBeNull();
  });

  it.each(RATIOS)(
    'never fits fewer columns in a wider pane, at the gutter threshold or anywhere else, at %s',
    (scale) => {
      const metrics = metricsAt(scale);
      let previous = 0;
      for (let width = 1; width <= 1600; width += 0.25) {
        const fit = fitTerminalViewport(width, 400, metrics, null, GUTTER);
        const cols = fit?.cols ?? 0;
        expect(cols, `${width}px`).toBeGreaterThanOrEqual(previous);
        previous = cols;
      }
      expect(previous).toBeGreaterThan(2);
    },
  );

  it('steps from three columns to the next exactly where the gutter allows it', () => {
    // Cells of 9 px at scale 1: 3 columns need 27 + 14 = 41 px.
    const metrics = metricsAt(1);
    expect(metrics.deviceCellWidth).toBe(9);
    const cols = (width: number) => fitTerminalViewport(width, 100, metrics, null, GUTTER)?.cols;
    expect([31, 32, 40].map(cols)).toEqual([2, 2, 2]);
    expect([41, 49].map(cols)).toEqual([3, 3]);
  });

  it('keeps a half-width split pane clear of its edge by more than a column', () => {
    // A 1440 px window split in two: each pane is about 718 px wide.
    const metrics = metricsAt(2);
    const fit = fitTerminalViewport(718.5, 800, metrics, null, GUTTER);
    expect(718.5 * 2 - (fit?.pixelWidth ?? 0)).toBeGreaterThanOrEqual(GUTTER * 2);
  });
});

describe('fitTerminalViewport', () => {
  it.each(RATIOS)('fits whole integer device cells and sizes the canvas 1:1 at %s', (scale) => {
    const metrics = metricsAt(scale);
    const fit = fitTerminalViewport(731.4, 431.7, metrics);
    expect(fit).not.toBeNull();
    if (!fit) return;
    expect(Number.isInteger(fit.pixelWidth)).toBe(true);
    expect(fit.pixelWidth).toBe(fit.cols * metrics.deviceCellWidth);
    expect(fit.pixelHeight).toBe(fit.rows * metrics.deviceCellHeight);
    // CSS size times ratio is the backing size, so nothing is resampled.
    expect(fit.cssWidth * scale).toBeCloseTo(fit.pixelWidth, 9);
    expect(fit.cssHeight * scale).toBeCloseTo(fit.pixelHeight, 9);
    // The whole grid fits and one more cell would not.
    expect(fit.pixelWidth).toBeLessThanOrEqual(Math.round(731.4 * scale) + 1);
    expect(fit.pixelWidth + metrics.deviceCellWidth).toBeGreaterThan(Math.round(731.4 * scale));
  });

  it("prefers the engine's device-pixel content box over CSS rounding", () => {
    const metrics = metricsAt(1.25);
    const css = fitTerminalViewport(800, 400, metrics);
    const device = fitTerminalViewport(800, 400, metrics, {
      width: 1000 - 1,
      height: 500,
    });
    expect(css?.cols).toBe(Math.floor(1000 / metrics.deviceCellWidth));
    expect(device?.cols).toBe(Math.floor(999 / metrics.deviceCellWidth));
  });

  it('round-trips CSS and device sizes without drift', () => {
    for (const scale of RATIOS) {
      const metrics = metricsAt(scale);
      for (const cols of [2, 80, 117, 512]) {
        const cssWidth = (cols * metrics.deviceCellWidth) / scale;
        expect(Math.round(cssWidth * scale)).toBe(cols * metrics.deviceCellWidth);
        expect(Math.floor(cssWidth / metrics.cellWidth + 1e-9)).toBe(cols);
      }
    }
  });

  it('tolerates browser subpixel noise at an exact cell boundary', () => {
    const metrics = metricsAt(2);
    const edge = (80 * metrics.deviceCellWidth) / 2;
    expect(fitTerminalViewport(edge - 0.004, 432, metrics)).toMatchObject({
      cols: 80,
    });
  });

  it('does not create an overflowing two-column viewport for a tiny pane', () => {
    const metrics = metricsAt(2);
    expect(fitTerminalViewport(16.9, 100, metrics)).toBeNull();
    expect(fitTerminalViewport(100, 16.9, metrics)).toBeNull();
  });

  it('caps pathological layouts before they reach a renderer allocation', () => {
    const metrics = metricsAt(2);
    expect(fitTerminalViewport(100_000, 100_000, metrics)).toMatchObject({
      cols: 512,
      rows: 256,
      pixelWidth: 512 * metrics.deviceCellWidth,
      pixelHeight: 256 * metrics.deviceCellHeight,
    });
  });
});

describe('snapOffsetCss', () => {
  it.each(RATIOS)('lands the canvas origin on a device pixel at %s', (scale) => {
    for (const origin of [0, 0.3, 41.25, 100.4, 233.333, 1000.99]) {
      const { x, y } = snapOffsetCss(origin, origin + 7.7, scale);
      const deviceX = (origin + x) * scale;
      const deviceY = (origin + 7.7 + y) * scale;
      expect(Math.abs(deviceX - Math.round(deviceX))).toBeLessThan(1e-6);
      expect(Math.abs(deviceY - Math.round(deviceY))).toBeLessThan(1e-6);
      // Never moves further than half a device pixel.
      expect(Math.abs(x * scale)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('does nothing for an aligned origin or invalid input', () => {
    expect(snapOffsetCss(40, 80, 1)).toEqual({ x: 0, y: 0 });
    expect(snapOffsetCss(40, 80, 2)).toEqual({ x: 0, y: 0 });
    expect(snapOffsetCss(Number.NaN, 4, 2).x).toBe(0);
    expect(snapOffsetCss(4, 4, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('fitPaddedViewport (E14-21)', () => {
  const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

  it('fits the grid in the host less its padding', () => {
    const metrics = metricsAt(1);
    const padding = { top: 10, right: 20, bottom: 30, left: 40 };
    const padded = fitPaddedViewport(
      800,
      400,
      metrics,
      null,
      padding,
      TERMINAL_RIGHT_GUTTER_CSS_PX,
    );
    expect(padded.fit).toEqual(
      fitTerminalViewport(740, 360, metrics, null, TERMINAL_RIGHT_GUTTER_CSS_PX),
    );
    expect(padded.padding).toEqual(padding);
    expect(padded.devicePadding).toEqual(padding);
  });

  it('is the plain fit without padding', () => {
    const metrics = metricsAt(1.5);
    const bounds = { width: 1200, height: 600 };
    expect(fitPaddedViewport(800, 400, metrics, bounds, NONE).fit).toEqual(
      fitTerminalViewport(800, 400, metrics, bounds),
    );
  });

  it('takes the padding off the exact device box in whole device pixels', () => {
    const metrics = metricsAt(1.25);
    const padded = fitPaddedViewport(
      800,
      400,
      metrics,
      { width: 1000, height: 500 },
      {
        top: 3,
        right: 3,
        bottom: 3,
        left: 3,
      },
    );
    expect(padded.devicePadding).toEqual({ top: 4, right: 4, bottom: 4, left: 4 });
    expect(padded.fit).toEqual(fitTerminalViewport(794, 394, metrics, { width: 992, height: 492 }));
  });

  it('keeps the minimum grid at a fractional ratio, where the padding rounds up in device pixels', () => {
    const metrics = metricsAt(1.25);
    expect(metrics.deviceCellWidth).toBe(11);
    // 45.6 CSS px holds two 8.8 px columns and 2 × 14 px of padding exactly; in device pixels the
    // padding rounds to 2 × 18 of 57 and would leave 21 for the 22 the columns need.
    const padded = fitPaddedViewport(
      45.6,
      100,
      metrics,
      { width: 57, height: 125 },
      {
        top: 0,
        right: 14,
        bottom: 0,
        left: 14,
      },
    );
    expect(padded.fit).toMatchObject({ cols: 2 });
    expect(padded.devicePadding.left + padded.devicePadding.right).toBeLessThanOrEqual(57 - 22);
    expect(padded.padding.left).toBeCloseTo(padded.devicePadding.left / 1.25, 6);
  });

  it('keeps the minimum grid in a pane too small for its padding, sharing what is left', () => {
    const metrics = metricsAt(1);
    const cell = { width: metrics.cellWidth, height: metrics.cellHeight };
    // Room for two columns and one row, and 10 px more each way.
    const width = 2 * cell.width + 10;
    const height = cell.height + 10;
    const padded = fitPaddedViewport(width, height, metrics, null, {
      top: 30,
      right: 10,
      bottom: 10,
      left: 30,
    });
    expect(padded.fit).toMatchObject({ cols: 2, rows: 1 });
    expect(padded.padding.left + padded.padding.right).toBeLessThanOrEqual(10);
    expect(padded.padding.left).toBeGreaterThan(padded.padding.right);
    expect(padded.padding.top + padded.padding.bottom).toBeLessThanOrEqual(10);
    expect(
      fitPaddedViewport(cell.width, cell.height, metrics, null, padded.padding).padding,
    ).toEqual(NONE);
  });
});
