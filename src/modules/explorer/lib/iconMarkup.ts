// What both halves of file icons share: the startup-safe `FileIcon` and the
// lazily loaded `iconEngine`. Keep it free of imports so it stays tiny.

/** Every Catppuccin icon is drawn on a 16 × 16 grid. */
export const ICON_VIEWBOX = '0 0 16 16';

/**
 * Stands for the rendered icon's own id inside the ids an icon declares (clip
 * paths, masks, gradients), so two copies of one icon on screen never share one.
 */
export const ICON_ID_TOKEN = '%icon%';

/** Gives an icon's markup the ids of one rendered copy; `uid` comes from `useId`. */
export function scopeIconIds(markup: string, uid: string): string {
  if (!markup.includes(ICON_ID_TOKEN)) return markup;
  return markup.split(ICON_ID_TOKEN).join(`i${uid.replace(/[^A-Za-z0-9_-]/g, '')}`);
}
