import { REFUSED_IMAGE_TAG } from './assetPath';

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const isImage = (node: HastNode) =>
  node.type === 'element' && (node.tagName === 'img' || node.tagName === REFUSED_IMAGE_TAG);

const isBlank = (node: HastNode) => node.type === 'text' && !node.value?.trim();

/**
 * Rehype plugin that turns a paragraph holding nothing but one image with an `alt` into a figure, the alt as its
 * caption. An image inside running text, or without an alt, stays as it is. It runs after the local-image rewrite,
 * so a refused image keeps its caption too.
 */
export function rehypeImageCaptions() {
  const visit = (node: HastNode): void => {
    node.children?.forEach((child) => {
      if (child.type !== 'element' || child.tagName !== 'p') return visit(child);
      const content = child.children?.filter((c) => !isBlank(c)) ?? [];
      const [image] = content;
      const alt = image?.properties?.alt;
      if (content.length !== 1 || !isImage(image) || typeof alt !== 'string' || !alt.trim()) return;
      child.tagName = 'figure';
      child.children = [
        image,
        {
          type: 'element',
          tagName: 'figcaption',
          properties: {},
          children: [{ type: 'text', value: alt.trim() }],
        },
      ];
    });
  };
  return (tree: unknown) => visit(tree as HastNode);
}
