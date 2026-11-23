import { detectMonoFontFamily } from '@/lib/fonts';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  AbsoluteIconData,
  BoxIconData,
  BracketsIconData,
  BulletListIconData,
  CodeIconData,
  FileIconData,
  FlashIconData,
  FolderIconData,
  FunctionIconData,
  HashtagIconData,
  KeyIconData,
  type LutIconData,
  MathIconData,
  PackageIconData,
  PuzzleIconData,
  TextFontIconData,
  toSvgString,
} from '@lut/lut-icons/data';

type IconGroup = 'fn' | 'val' | 'type' | 'iface' | 'misc';
type ThemeSpec = Parameters<typeof EditorView.theme>[0];

/** A completion kind's icon as a CSS mask, at the 14 px of `.cm-completionIcon`. */
function iconMask(icon: LutIconData): string {
  return `url("data:image/svg+xml,${encodeURIComponent(toSvgString(icon, 'sm'))}")`;
}

const ICONS: [kind: string, icon: LutIconData, group: IconGroup][] = [
  ['function', FunctionIconData, 'fn'],
  ['method', FunctionIconData, 'fn'],
  ['constructor', FunctionIconData, 'fn'],
  ['variable', AbsoluteIconData, 'val'],
  ['property', HashtagIconData, 'val'],
  ['field', HashtagIconData, 'val'],
  ['class', BoxIconData, 'type'],
  ['struct', BoxIconData, 'type'],
  ['enum', BulletListIconData, 'type'],
  ['enummember', BulletListIconData, 'type'],
  ['event', FlashIconData, 'type'],
  ['interface', PuzzleIconData, 'iface'],
  ['type', BracketsIconData, 'iface'],
  ['typeparameter', BracketsIconData, 'iface'],
  ['namespace', PackageIconData, 'iface'],
  ['module', PackageIconData, 'iface'],
  ['keyword', KeyIconData, 'misc'],
  ['constant', MathIconData, 'misc'],
  ['snippet', CodeIconData, 'misc'],
  ['text', TextFontIconData, 'misc'],
  ['unit', CodeIconData, 'misc'],
  ['value', CodeIconData, 'misc'],
  ['operator', CodeIconData, 'misc'],
  ['reference', CodeIconData, 'misc'],
  ['file', FileIconData, 'misc'],
  ['folder', FolderIconData, 'misc'],
  ['color', CodeIconData, 'misc'],
];

const GROUP_COLORS: Record<IconGroup, { light: string; dark: string }> = {
  fn: { light: '#8a7bb8', dark: '#b3a6d9' },
  val: { light: '#6889b8', dark: '#93b0d6' },
  type: { light: '#b3925f', dark: '#d1b285' },
  iface: { light: '#5f9e96', dark: '#8ec4bc' },
  misc: { light: '#848a93', dark: '#9aa0a8' },
};

const SEVERITY_COLORS = {
  error: { light: 'var(--destructive)', dark: 'var(--destructive)' },
  warning: { light: 'var(--warning)', dark: 'var(--warning)' },
  info: { light: 'var(--info)', dark: 'var(--info)' },
  hint: { light: '#6b7280', dark: '#9ca3af' },
} as const;

function iconRules(mode: 'light' | 'dark'): ThemeSpec {
  const rules: ThemeSpec = {};
  for (const [kind, icon, group] of ICONS) {
    const mask = iconMask(icon);
    rules[`.cm-completionIcon-${kind}`] = {
      backgroundColor: GROUP_COLORS[group][mode],
      WebkitMaskImage: mask,
      maskImage: mask,
    };
  }
  return rules;
}

function lintRules(mode: 'light' | 'dark'): ThemeSpec {
  const rules: ThemeSpec = {};
  for (const [severity, colors] of Object.entries(SEVERITY_COLORS)) {
    const color = colors[mode];
    rules[`.cm-lintRange-${severity}`] = {
      backgroundImage: 'none',
      textDecoration: `underline wavy ${color}`,
      textDecorationThickness: '1px',
      textUnderlineOffset: '4px',
    };
    rules[`.cm-diagnostic-${severity}`] = {
      borderLeft: `3px solid ${color}`,
    };
  }
  return rules;
}

function modeTheme(mode: 'light' | 'dark'): Extension {
  return EditorView.theme({ ...iconRules(mode), ...lintRules(mode) }, { dark: mode === 'dark' });
}

const TOOLTIP_ENTER = {
  animation: 'cm-tooltip-enter var(--dur-fast, 120ms) var(--ease-premium, ease-out)',
};

const chrome = EditorView.theme({
  '@keyframes cm-tooltip-enter': {
    from: { opacity: 0, transform: 'scale(0.98) translateY(2px)' },
    to: { opacity: 1, transform: 'scale(1) translateY(0)' },
  },

  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    ...TOOLTIP_ENTER,
  },

  '.cm-tooltip .documentation': {
    padding: '8px 10px',
    maxWidth: '420px',
    maxHeight: '320px',
    overflowY: 'auto',
    fontSize: '12px',
    lineHeight: '1.55',
    fontFamily: 'inherit',
    '& p': { margin: '0 0 6px 0' },
    '& p:last-child': { margin: '0' },
    '& a': { color: 'var(--primary)' },
    '& h1, & h2, & h3, & h4': {
      fontSize: '12px',
      fontWeight: '600',
      margin: '8px 0 4px 0',
    },
    '& ul, & ol': { margin: '4px 0', paddingLeft: '18px' },
    '& code': {
      fontFamily: detectMonoFontFamily(),
      fontSize: '11px',
      backgroundColor: 'color-mix(in srgb, var(--muted) 70%, transparent)',
      borderRadius: '4px',
      padding: '1px 4px',
    },
    '& pre': {
      fontFamily: detectMonoFontFamily(),
      fontSize: '11px',
      backgroundColor: 'color-mix(in srgb, var(--muted) 70%, transparent)',
      border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
      borderRadius: '6px',
      padding: '6px 8px',
      margin: '6px 0',
      overflowX: 'auto',
      '& code': {
        backgroundColor: 'transparent',
        padding: '0',
        borderRadius: '0',
      },
    },
  },

  '.cm-tooltip.cm-tooltip-autocomplete': {
    padding: '4px',
    '& > ul': {
      fontFamily: detectMonoFontFamily(),
      fontSize: '12px',
      maxHeight: '246px',
      minWidth: '220px',
      maxWidth: '460px',
    },
    '& > ul > li': {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 6px',
      borderRadius: '5px',
      lineHeight: '1.4',
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'var(--accent)',
      color: 'var(--accent-foreground)',
    },
  },
  '.cm-completionLabel': {
    flex: '0 1 auto',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--primary)',
    fontWeight: '600',
  },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    paddingLeft: '12px',
    fontStyle: 'normal',
    fontSize: '10.5px',
    color: 'var(--muted-foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '40%',
  },
  '.cm-completionIcon': {
    boxSizing: 'border-box',
    width: '14px',
    height: '14px',
    flexShrink: '0',
    opacity: '1',
    padding: '0',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    '&:after': { content: 'none' },
  },
  '.cm-tooltip.cm-completionInfo': {
    padding: '0',
    marginLeft: '6px',
    marginRight: '6px',
  },

  '.cm-tooltip-lint': {
    padding: '0',
  },
  '.cm-diagnostic': {
    padding: '6px 10px',
    fontSize: '12px',
    lineHeight: '1.5',
    fontFamily: 'inherit',
  },
  '.cm-diagnostic:not(:last-child)': {
    borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
  },
  '.cm-diagnosticSource': {
    fontSize: '10px',
    color: 'var(--muted-foreground)',
    opacity: '1',
    marginTop: '2px',
  },
  '.cm-lint-marker': { display: 'none' },

  '.cm-panel.cm-search, .cm-panel.cm-gotoLine': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    backgroundColor: 'var(--popover)',
    borderBottom: '1px solid var(--border)',
  },
  '.cm-panel.cm-search br': { display: 'none' },
  '.cm-panel .cm-textfield': {
    fontFamily: detectMonoFontFamily(),
    fontSize: '12px',
    backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '3px 8px',
    outline: 'none',
    '&:focus': {
      borderColor: 'color-mix(in srgb, var(--ring) 60%, var(--border))',
    },
  },
  '.cm-panel.cm-search .cm-textfield': { minWidth: '180px' },
  '.cm-panel .cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'color-mix(in srgb, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '3px 10px',
    fontSize: '11.5px',
    cursor: 'pointer',
    textTransform: 'capitalize',
    '&:hover': { backgroundColor: 'var(--accent)' },
    '&:active': { backgroundImage: 'none' },
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: 'var(--muted-foreground)',
    textTransform: 'capitalize',
  },
  '.cm-panel.cm-search input[type=checkbox]': {
    accentColor: 'var(--primary)',
  },
  '.cm-panel.cm-search button[name=close]': {
    position: 'absolute',
    top: '4px',
    right: '6px',
    width: '20px',
    height: '20px',
    lineHeight: '1',
    borderRadius: '5px',
    border: 'none',
    background: 'transparent',
    color: 'var(--muted-foreground)',
    fontSize: '14px',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: 'var(--accent)',
      color: 'var(--foreground)',
    },
  },

  '.cm-lsp-rename-panel': {
    display: 'flex',
    gap: '6px',
    padding: '6px 8px',
    backgroundColor: 'var(--popover)',
    borderTop: '1px solid var(--border)',
  },
  '.cm-lsp-rename-input': {
    flex: '1',
    fontFamily: detectMonoFontFamily(),
    fontSize: '12px',
    backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '3px 8px',
    outline: 'none',
    '&:focus': {
      borderColor: 'color-mix(in srgb, var(--ring) 60%, var(--border))',
    },
  },

  '.cm-lsp-locations': {
    fontFamily: detectMonoFontFamily(),
    fontSize: '12px',
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    '& .cm-lsp-locations-header': {
      padding: '5px 10px',
      fontSize: '11px',
      color: 'var(--muted-foreground)',
      borderBottom: '1px solid var(--border)',
    },
    '& ul': {
      listStyle: 'none',
      margin: '0',
      padding: '4px',
      maxHeight: '220px',
      overflowY: 'auto',
      outline: 'none',
    },
    '& li': {
      padding: '3px 8px',
      borderRadius: '5px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      '&:hover': { backgroundColor: 'var(--accent)' },
    },
    '& li.cm-lsp-locations-active': {
      backgroundColor: 'var(--accent)',
      color: 'var(--accent-foreground)',
    },
  },

  '.cm-tooltip ::-webkit-scrollbar': { width: '8px', height: '8px' },
  '.cm-tooltip ::-webkit-scrollbar-thumb': {
    backgroundColor: 'color-mix(in srgb, var(--muted-foreground) 30%, transparent)',
    borderRadius: '4px',
    backgroundClip: 'padding-box',
    border: '2px solid transparent',
  },
  '.cm-tooltip ::-webkit-scrollbar-track': { background: 'transparent' },
});

const THEME: Extension = Object.freeze([chrome, modeTheme('light'), modeTheme('dark')]);

export function chromeTheme(): Extension {
  return THEME;
}
