import { resolveRelativeAsset } from './assetPath';

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export type LocalLinksOptions = {
  /** The markdown file the relative links are relative to. Plain data, so Streamdown's processor cache sees it. */
  basePath: string;
};

/**
 * Rehype plugin (pass it as `[rehypeLocalLinks, options]`) that marks a link to a relative path with the file it
 * points at (`data-local-path`, absolute), so the preview opens it in lut instead of letting the webview navigate.
 * Remote links, mailto and the like, and links within the page (`#section`) are left alone.
 */
export function rehypeLocalLinks({ basePath }: LocalLinksOptions) {
  const visit = (node: HastNode): void => {
    if (node.type === 'element' && node.tagName === 'a' && node.properties) {
      const href = node.properties.href;
      if (typeof href === 'string' && !href.startsWith('#')) {
        const path = resolveRelativeAsset(basePath, href);
        if (path) node.properties.dataLocalPath = path;
      }
    }
    node.children?.forEach(visit);
  };
  return (tree: unknown) => visit(tree as HastNode);
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** GitHub's heading anchor: lower case, punctuation and emoji dropped, each space a dash. */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Rehype plugin that gives each heading the id GitHub would (`## Schema versions` → `schema-versions`, repeats as
 * `-1`, `-2`), so a `#section` link in the document can scroll to it. It runs after sanitize, which would prefix ids.
 */
export function rehypeHeadingIds() {
  return (tree: unknown) => {
    const seen = new Map<string, number>();
    const visit = (node: HastNode): void => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '') && !node.properties?.id) {
        const base = headingSlug(textOf(node));
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        node.properties = { ...node.properties, id: count ? `${base}-${count}` : base };
      }
      node.children?.forEach(visit);
    };
    visit(tree as HastNode);
  };
}
