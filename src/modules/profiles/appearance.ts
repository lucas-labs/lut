import type { PreferenceLayer } from '@/modules/settings/resolvePreferences';
import type { ProfileEntry } from './model';

/**
 * A profile's appearance as a layer over the global preferences (`resolvePreferences`). A field
 * the profile leaves unset stays `undefined`, so the global value is kept.
 */
export function profileLayer(appearance: ProfileEntry['appearance']): PreferenceLayer {
  return {
    themeId: appearance.themeId,
    terminalFontFamily: appearance.fontFamily,
    terminalFontSize: appearance.fontSize,
    terminalFontWeight: appearance.fontWeight,
    terminalCursorStyle: appearance.cursorStyle,
    terminalCursorBlink: appearance.cursorBlink,
    terminalScrollback: appearance.scrollback,
  };
}
