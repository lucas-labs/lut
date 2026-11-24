import type { Padding } from '@/lib/padding';
import { profileLayer, useProfileAppearance } from '@/modules/profiles';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { resolvePreferences } from '@/modules/settings/resolvePreferences';
import type { TerminalCursorStyle } from '@/modules/settings/store';
import { findTheme, resolveTerminalFont, terminalTokensFor, useTheme } from '@/modules/theme';
import type { Theme } from '@/modules/theme/types';
import { useMemo } from 'react';
import { type TerminalGpuTheme, terminalGpuTheme } from '../ghostty/gpu/terminalVisuals';

export type PaneFont = {
  readonly fontFamily: string;
  readonly fontWeight: string;
  readonly fontSize: number;
};

/** How a pane's terminal looks: the global appearance with its profile's over it. */
export type PaneAppearance = {
  readonly theme: TerminalGpuTheme;
  readonly font: PaneFont;
  /** The global font, for a pane whose own font finds no room in the renderer. */
  readonly globalFont: PaneFont;
  readonly cursorStyle: TerminalCursorStyle;
  readonly cursorBlink: boolean;
  /** Lines of history; it applies when the terminal starts. */
  readonly scrollback: number;
  /** Space around the text; full-screen programs (the alternate screen) may fill the pane instead. */
  readonly padding: Padding;
};

/**
 * The appearance of a pane opened with `profileId` (none: the default profile), resolved global →
 * profile. Without a theme of its own the pane follows the app's theme, previews included; a
 * profile's theme shows in the app's light or dark mode. `null` until the profiles are first read and
 * the saved preferences are loaded (or failed to load).
 */
export function usePaneAppearance(profileId: string | undefined): PaneAppearance | null {
  const profile = useProfileAppearance(profileId);
  const preferences = usePreferencesStore();
  const { activeTheme, resolvedMode, customThemes } = useTheme();

  // A terminal keeps some values from its start (scrollback): it waits for the saved preferences.
  const resolved = useMemo(
    () =>
      profile === null || !preferences.settled
        ? null
        : resolvePreferences(
            { ...preferences, themeId: activeTheme.id },
            profile && profileLayer(profile),
          ),
    [profile, preferences, activeTheme],
  );
  // A theme the profile names but that no longer exists is left out, like an unset one.
  const theme = resolved && (findTheme(resolved.themeId, customThemes) ?? activeTheme);
  const colors = useMemo(
    () => theme && terminalGpuTheme(terminalTokensFor(theme, resolvedMode)),
    [theme, resolvedMode],
  );

  return useMemo(() => {
    if (!resolved || !theme || !colors) return null;
    const font = (fontTheme: Theme) =>
      resolveTerminalFont(
        {
          fontFamily: preferences.terminalFontFamily,
          fontWeight: preferences.terminalFontWeight,
          fontSize: preferences.terminalFontSize,
        },
        fontTheme,
        resolvedMode,
      );
    // Global, then the theme's font, then each font field the profile sets itself.
    const themed = font(theme);
    return {
      theme: colors,
      font: {
        fontFamily: profile?.fontFamily ?? themed.fontFamily,
        fontWeight: profile?.fontWeight ?? themed.fontWeight,
        fontSize: profile?.fontSize ?? themed.fontSize,
      },
      globalFont: font(activeTheme),
      cursorStyle: resolved.terminalCursorStyle,
      cursorBlink: resolved.terminalCursorBlink,
      scrollback: resolved.terminalScrollback,
      padding: resolved.terminalPadding,
    };
  }, [resolved, theme, colors, profile, preferences, activeTheme, resolvedMode]);
}
