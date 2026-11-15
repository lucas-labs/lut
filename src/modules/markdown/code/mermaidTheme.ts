/** The app tokens a diagram is painted with, as `--<name>` CSS variables. */
export type ThemeToken =
  | 'background'
  | 'foreground'
  | 'card'
  | 'popover'
  | 'secondary'
  | 'accent'
  | 'muted-foreground'
  | 'border';

/**
 * Mermaid's `base` theme variables from the app's colours. The diagram sits on the page; nodes take the secondary
 * surface and lines the muted text, so a diagram reads like the rest of the preview in either mode.
 */
export function mermaidThemeVariables(
  token: (name: ThemeToken) => string,
  dark: boolean,
  fontFamily: string,
): Record<string, string | boolean> {
  return {
    darkMode: dark,
    fontFamily,
    fontSize: '13px',
    background: token('background'),
    primaryColor: token('secondary'),
    primaryTextColor: token('foreground'),
    primaryBorderColor: token('muted-foreground'),
    secondaryColor: token('accent'),
    tertiaryColor: token('popover'),
    lineColor: token('muted-foreground'),
    textColor: token('foreground'),
    edgeLabelBackground: token('background'),
    clusterBkg: token('card'),
    clusterBorder: token('border'),
    noteBkgColor: token('popover'),
    noteTextColor: token('foreground'),
    noteBorderColor: token('border'),
    // Mermaid 12's default "neo" look adds a light grey glow and gradient borders, made for a white page; lut's
    // surfaces are flat.
    dropShadow: 'none',
    useGradient: false,
  };
}

const HEX = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
let probe: CanvasRenderingContext2D | null | undefined;

/**
 * A theme colour as `#rrggbb`. Mermaid derives shades from its variables and only understands hex, rgb and hsl, while
 * a custom theme may write any CSS colour; painting one pixel lets the browser convert it.
 */
export function toHexColor(color: string): string {
  if (HEX.test(color)) return color;
  if (probe === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return color;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
