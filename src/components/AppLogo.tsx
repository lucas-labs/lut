import { type LutIconSize, LutLogoCompactIcon, LutLogoIcon } from '@lut/lut-icons';

/**
 * lut's logo: the "lut" wordmark of lut-icons, or its compact mark (`compact`) where the width is short, as on the
 * compact sidebar's rail. Shapes the drawing gives the theme's primary colour follow the theme; the rest take the text
 * colour. The app icon is `AppIcon`.
 */
export function AppLogo({
  size = 'xs',
  compact = false,
  className,
}: {
  size?: LutIconSize;
  compact?: boolean;
  className?: string;
}) {
  const Logo = compact ? LutLogoCompactIcon : LutLogoIcon;
  return (
    <>
      <Logo size={size} className={className} />
      <span className="sr-only">lut</span>
    </>
  );
}
