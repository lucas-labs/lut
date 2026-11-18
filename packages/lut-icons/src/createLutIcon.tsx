import type { FC, Ref, SVGProps } from 'react';
import { resolveSize } from './sizes';
import type { LutIconData, LutIconRotation, LutIconSize } from './types';

export type LutIconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height' | 'viewBox'> & {
  size?: LutIconSize;
  /** Turns a directional icon clockwise; the box turns with it, so it stays on the pixel grid. */
  rotate?: LutIconRotation;
  ref?: Ref<SVGSVGElement>;
};

/** Any lut icon: what a config object stores when the icon is chosen at run time. */
export type LutIconComponent = FC<LutIconProps>;

/**
 * Makes an icon's component from its drawings. Every generated icon is made here; `defaults.rotate`
 * makes a turned variant to store in a config (a "down" chevron).
 */
export function createLutIcon(
  displayName: string,
  data: LutIconData,
  defaults: { rotate?: LutIconRotation } = {},
): LutIconComponent {
  function LutIcon({ size = 'md', rotate = defaults.rotate ?? 0, ref, style, ...props }: LutIconProps) {
    const { master, width, height, viewBox, transform, odd } = resolveSize(data, size, rotate);
    const paths = master.paths.map((p) =>
      p.paint === 'fill' ? (
        <path key={p.d} d={p.d} fill="currentColor" fillRule={p.fillRule} fillOpacity={p.opacity} />
      ) : (
        <path
          key={p.d}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={p.strokeWidth}
          strokeLinecap={p.linecap}
          strokeLinejoin={p.linejoin}
          strokeMiterlimit={p.miterLimit}
          strokeOpacity={p.opacity}
        />
      ),
    );
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        viewBox={viewBox}
        aria-hidden="true"
        focusable="false"
        // An odd side only centres on whole pixels in a box of odd size: the Button reads this to fit its box.
        data-odd={odd}
        {...props}
        // The drawing is only sharp at its own size: inline width/height win over CSS that sizes every svg
        // (such as the Button's `[&_svg]:size-3.5`), which would stretch it off the pixel grid.
        style={{ width, height, ...style }}
      >
        {transform ? <g transform={transform}>{paths}</g> : paths}
      </svg>
    );
  }
  LutIcon.displayName = displayName;
  return LutIcon;
}
