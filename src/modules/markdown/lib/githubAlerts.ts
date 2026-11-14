// GitHub's alert syntax (`> [!NOTE]` and friends) for the markdown preview.

export const ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const MARKER = /^\s*\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n)?/i;

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const isElement = (node: HastNode, tag: string) => node.type === 'element' && node.tagName === tag;

/** The kind of alert `quote` opens with, after taking the marker out of its text; null for a plain quote. */
function takeMarker(quote: HastNode): AlertKind | null {
  const first = quote.children?.find((child) => child.type === 'element');
  if (!first || !isElement(first, 'p')) return null;
  const text = first.children?.[0];
  if (text?.type !== 'text' || typeof text.value !== 'string') return null;
  const match = MARKER.exec(text.value);
  if (!match) return null;

  text.value = text.value.slice(match[0].length);
  // A marker alone on its line leaves an empty text, sometimes followed by a line break.
  if (!text.value) {
    first.children?.shift();
    if (first.children?.[0] && isElement(first.children[0], 'br')) first.children.shift();
  }
  if (!first.children?.length) quote.children = quote.children?.filter((child) => child !== first);
  return match[1].toLowerCase() as AlertKind;
}

/**
 * Rehype plugin that marks a blockquote opening with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or
 * `[!CAUTION]` (any case) as that alert (`data-alert`) and drops the marker; the preview draws it with its title.
 * It runs after sanitize, which would strip the attribute.
 */
export function rehypeGithubAlerts() {
  const visit = (node: HastNode): void => {
    if (isElement(node, 'blockquote')) {
      const kind = takeMarker(node);
      if (kind) node.properties = { ...node.properties, dataAlert: kind };
    }
    node.children?.forEach(visit);
  };
  return (tree: unknown) => visit(tree as HastNode);
}
