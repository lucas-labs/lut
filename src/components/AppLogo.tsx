import { type LutIconSize, LutLogoIcon } from '@lut/lut-icons';

/**
 * lut's logo: the "lut" wordmark of lut-icons. Its "l" takes the theme's primary colour and the rest the text colour,
 * so it follows the theme; the app icon is `AppIcon`.
 */
export function AppLogo({ size = 'xs', className }: { size?: LutIconSize; className?: string }) {
  return (
    <>
      <LutLogoIcon size={size} className={className} />
      <span className="sr-only">lut</span>
    </>
  );
}
