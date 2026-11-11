import type { ComponentProps } from 'react';

/**
 * The Windows caption glyphs (minimize, maximize, restore, close): one-pixel strokes on a
 * 10×10 grid, drawn as the system draws them. From lucode's parla.
 */
type IconProps = ComponentProps<'svg'>;

export function MinimizeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 10 10" width={10} height={10} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M10,5H0V4H10Z" />
    </svg>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 10 10" width={10} height={10} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M0,1V9a1,1,0,0,0,1,1H9a1,1,0,0,0,1-1V1A1,1,0,0,0,9,0H1A1,1,0,0,0,0,1ZM9,9H1V1H9Z" />
    </svg>
  );
}

export function RestoreIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 10 10" width={10} height={10} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M0,3V9a1,1,0,0,0,1,1H7A1,1,0,0,0,8,9V3A1,1,0,0,0,7,2H1A1,1,0,0,0,0,3ZM1,9V3H7V9Zm9-7V6.5a.5.5,0,0,1-1,0V2A1,1,0,0,0,8,1H3.5a.5.5,0,0,1,0-1H8A2,2,0,0,1,10,2Z" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      width={10}
      height={10}
      fill="none"
      stroke="currentColor"
      strokeMiterlimit={10}
      aria-hidden="true"
      {...props}
    >
      <line x2="10" y2="10" />
      <line y1="10" x2="10" />
    </svg>
  );
}
