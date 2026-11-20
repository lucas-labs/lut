import type { Preferences } from './store';

/**
 * Layered preferences: global values overridden by a profile, then by a space (E14-02).
 *
 * This is lut's only preference resolver. Later layers (the pane override of E14-16) are
 * appended to the end of the layer list, so existing callers keep working; no separate
 * terminal-appearance resolver is added. Preferences hold appearance choices such as the
 * theme id; the theme's colour tokens live in `modules/theme`, apart from them.
 */
export type PreferenceLayer = Partial<Preferences>;

/**
 * Resolves `global` through the given layers, most specific last. A missing layer, or a key
 * left `undefined` in one, keeps the value from the layer before it. Values replace whole:
 * objects and arrays are not merged key by key. Inputs are never mutated.
 */
export function resolvePreferences(
  global: Preferences,
  profile?: PreferenceLayer,
  space?: PreferenceLayer,
): Preferences {
  const layers = [profile, space];
  const resolved: Preferences = { ...global };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of Object.keys(layer) as (keyof Preferences)[]) {
      const value = layer[key];
      if (value !== undefined) Object.assign(resolved, { [key]: value });
    }
  }
  return resolved;
}
