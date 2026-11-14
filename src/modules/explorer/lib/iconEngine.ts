// The heavy half of file icons: the whole Catppuccin SVG set (~300 kB) plus the
// name/extension/language maps. Never import this statically from startup code;
// `iconResolver.ts` loads it on demand and `src/app/eager-budget.test.ts` +
// `src/app/dist-budget.test.ts` fail if it lands in either window's startup graph.
import catppuccinIcons from '@iconify-json/catppuccin/icons.json';
import { EXT_TO_LANGUAGE_ID } from './constants';
import * as fileIconsMod from './fileIcons';
import * as folderIconsMod from './folderIcons';
import { ICON_ID_TOKEN } from './iconMarkup';

export type IconifySet = {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
};

/**
 * The Catppuccin (Macchiato) colours the icons are drawn with, by name. Each one
 * becomes `--file-icon-<name>`, which `globals.css` points at the theme, the
 * muted text colour, or nothing (the colour itself) per the "File icon colors"
 * setting. Colours outside it only paint inside masks, clip paths and gradients.
 */
export const CATPPUCCIN_PALETTE: Readonly<Record<string, string>> = {
  '#cad3f5': 'text',
  '#8087a2': 'overlay1',
  '#8aadf4': 'blue',
  '#7dc4e4': 'sapphire',
  '#91d7e3': 'sky',
  '#8bd5ca': 'teal',
  '#a6da95': 'green',
  '#eed49f': 'yellow',
  '#f5a97f': 'peach',
  '#c6a0f6': 'mauve',
  '#b7bdf8': 'lavender',
  '#f4dbd6': 'rosewater',
  '#ed8796': 'red',
  '#f5bde6': 'pink',
  '#ee99a0': 'maroon',
  '#f0c6c6': 'flamingo',
};

const TAG = /<[a-zA-Z][^>]*>/g;
const PAINT = /\s(stroke|fill|stop-color)="(#[0-9a-fA-F]{3,8})"/g;
const STYLE = /\sstyle="([^"]*)"/;

/**
 * Moves each palette colour of an icon's markup into its style as
 * `var(--file-icon-<name>, <colour>)` (presentation attributes cannot read CSS
 * variables), and marks its ids with `ICON_ID_TOKEN` for `scopeIconIds`.
 */
export function recolor(body: string): string {
  const painted = body.replace(TAG, (tag) => {
    const declarations: string[] = [];
    const rest = tag.replace(PAINT, (attr: string, property: string, hex: string) => {
      const name = CATPPUCCIN_PALETTE[hex.toLowerCase()];
      if (!name) return attr;
      declarations.push(`${property}:var(--file-icon-${name},${hex})`);
      return '';
    });
    if (declarations.length === 0) return tag;
    const style = declarations.join(';');
    if (STYLE.test(rest)) {
      return rest.replace(
        STYLE,
        (_, own: string) => ` style="${own.replace(/;?\s*$/, ';')}${style}"`,
      );
    }
    return rest.replace(/\s*(\/?)>$/, ` style="${style}"$1>`);
  });
  return painted
    .replace(/\sid="([^"]+)"/g, ` id="${ICON_ID_TOKEN}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${ICON_ID_TOKEN}-$1)`);
}

export type IconMaps = {
  /** exact (lowercased) file name -> icon name */
  fileNames: Record<string, string>;
  /** extension (no dot, may be compound like `d.ts`) -> icon name */
  fileExtensions: Record<string, string>;
  /** language id -> icon name */
  languageIds: Record<string, string>;
  /** extension -> language id, consulted when `fileExtensions` has no entry */
  extToLanguageId: Record<string, string>;
  /** lowercased folder name -> icon name */
  folderNames: Record<string, string>;
};

/** Each lookup returns an icon's markup for a 16 × 16 `<svg>` (see `iconMarkup.ts`). */
export type IconEngine = {
  fileIconSvg: (name: string) => string;
  folderIconSvg: (name: string, expanded: boolean) => string;
};

const DEFAULT_FILE = 'file';
const DEFAULT_FOLDER = 'folder';
const DEFAULT_FOLDER_OPEN = 'folder-open';

// Catppuccin's manifest emits names like `folder_src`/`typescript-react`, but
// the iconify export normalizes everything to hyphenated slugs.
function toIconifySlug(name: string): string {
  return name.replace(/_/g, '-');
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.indexOf('.');
  if (dot === -1 || dot === lower.length - 1) return '';
  return lower.slice(dot + 1);
}

/** Pure factory so the resolution rules are testable against tiny fixtures. */
export function createIconEngine(set: IconifySet, maps: IconMaps): IconEngine {
  const markupCache = new Map<string, string>();

  function body(iconName: string): string | null {
    const slug = toIconifySlug(iconName);
    const direct = set.icons[slug];
    if (direct) return direct.body;
    const alias = set.aliases?.[slug];
    if (alias) {
      const parent = set.icons[alias.parent];
      if (parent) return parent.body;
    }
    return null;
  }

  function markup(iconName: string): string | null {
    const cached = markupCache.get(iconName);
    if (cached !== undefined) return cached || null;
    const svgBody = body(iconName);
    const recolored = svgBody ? recolor(svgBody) : '';
    markupCache.set(iconName, recolored);
    return recolored || null;
  }

  return {
    fileIconSvg(name) {
      const lower = name.toLowerCase();

      const byName = maps.fileNames[lower];
      if (byName) {
        const svg = markup(byName);
        if (svg) return svg;
      }

      let ext = extOf(lower);
      while (ext) {
        const iconName = maps.fileExtensions[ext];
        if (iconName) {
          const svg = markup(iconName);
          if (svg) return svg;
        }
        const langId = maps.extToLanguageId[ext];
        if (langId) {
          const iconByLang = maps.languageIds[langId];
          if (iconByLang) {
            const svg = markup(iconByLang);
            if (svg) return svg;
          }
        }
        const nextDot = ext.indexOf('.');
        if (nextDot === -1) break;
        ext = ext.slice(nextDot + 1);
      }

      return markup(DEFAULT_FILE) ?? '';
    },

    folderIconSvg(name, expanded) {
      const mapped = maps.folderNames[name.toLowerCase()];
      if (mapped) {
        const slug = toIconifySlug(mapped);
        const svg = markup(expanded ? `${slug}-open` : slug);
        if (svg) return svg;
      }
      return markup(expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER) ?? '';
    },
  };
}

export const iconEngine: IconEngine = createIconEngine(catppuccinIcons as unknown as IconifySet, {
  fileNames: fileIconsMod.fileNames as Record<string, string>,
  fileExtensions: fileIconsMod.fileExtensions as Record<string, string>,
  languageIds: fileIconsMod.languageIds as Record<string, string>,
  extToLanguageId: EXT_TO_LANGUAGE_ID,
  folderNames: folderIconsMod.folderNames as Record<string, string>,
});
