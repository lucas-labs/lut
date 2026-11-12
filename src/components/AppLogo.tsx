import logo16 from '@/assets/logo/16.svg';
import logo48 from '@/assets/logo/48.svg';

/**
 * The artwork's vector exports (written by `pnpm icons`), each drawn on its own pixel grid: the 16 px one for small
 * marks, the 48 px one for large ones.
 */
const LOGOS = [
  { size: 16, src: logo16 },
  { size: 48, src: logo48 },
] as const;

/** The export drawn for the size closest to `size`. */
export function logoFor(size: number): string {
  return LOGOS.reduce((best, logo) => (Math.abs(logo.size - size) < Math.abs(best.size - size) ? logo : best)).src;
}

/**
 * lut's logo at `size` CSS px, from the vector export drawn for that size: it stays sharp at any pixel ratio, where a
 * larger bitmap shrunk to 16 px blurs the pixel art.
 */
export function AppLogo({ size, className }: { size: number; className?: string }) {
  return (
    <img
      src={logoFor(size)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
