type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** A `width`/`height` attribute as a CSS length: a bare number is pixels, a percentage stays one. */
function cssLength(value: unknown): string | null {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (/^\d+(\.\d+)?$/.test(text)) return `${text}px`;
  if (/^\d+(\.\d+)?(px|%)$/.test(text)) return text;
  return null;
}

/**
 * Rehype plugin that turns an image's `width`/`height` attributes into inline style. The app's base styles give
 * every image `height: auto`, which overrides the attribute; a README sizing an SVG logo only by its height
 * (`<img src="logo.svg" height="112">`) would otherwise collapse to nothing, as an SVG with just a viewBox has no
 * width of its own.
 */
export function rehypeImageSize() {
  const visit = (node: HastNode): void => {
    if (node.type === 'element' && node.tagName === 'img' && node.properties) {
      const declarations = (['width', 'height'] as const).flatMap((side) => {
        const length = cssLength(node.properties?.[side]);
        return length ? [`${side}:${length}`] : [];
      });
      if (declarations.length) {
        const own = typeof node.properties.style === 'string' ? node.properties.style.trim() : '';
        node.properties.style = [own.replace(/;$/, ''), ...declarations].filter(Boolean).join(';');
      }
    }
    node.children?.forEach(visit);
  };
  return (tree: unknown) => visit(tree as HastNode);
}
