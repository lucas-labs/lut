import { cn } from '@/lib/utils';
import { type ComponentProps, createContext, useContext, useState } from 'react';
import { Enlargeable, ENLARGED_SIZE } from './Enlargeable';

type Props = ComponentProps<'img'> & { node?: unknown };

/**
 * True inside a markdown link (`[![badge](x.svg)](https://…)`): the click belongs to the link, and a button inside
 * an anchor is invalid nesting, so the image is drawn plain there.
 */
export const InsideLinkContext = createContext(false);

/**
 * An image in the markdown preview. Clicking it opens it as large as the window allows, to look at it closely;
 * Escape, the close button or a click outside closes it. An image that fails to load says so instead.
 */
export function MarkdownImage({ node: _node, className, alt, src, style, ...props }: Props) {
  const insideLink = useContext(InsideLinkContext);
  // The source that failed, not a flag: a live reload that fixes the path, or another image taking this element's
  // place, must load again (preview tabs stay mounted while hidden).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return (
      <span className="text-[12px] text-muted-foreground italic">
        {alt ? `${alt} (image not available)` : 'Image not available'}
      </span>
    );
  }
  const image = (
    <img
      {...props}
      src={src}
      alt={alt}
      style={style}
      onError={() => setFailedSrc(src)}
      className={cn('max-w-full rounded-lg', className)}
    />
  );
  if (insideLink) return image;
  const label = alt ? `Enlarge image: ${alt}` : 'Enlarge image';
  return (
    <Enlargeable
      label={label}
      title={alt || 'Image'}
      description="The image at full size."
      className="inline-block"
      enlarged={
        <img
          src={src}
          alt={alt}
          className={cn(ENLARGED_SIZE, 'max-h-[calc(100vh-6rem)] max-w-[calc(100vw-5.5rem)] object-contain')}
        />
      }
    >
      {image}
    </Enlargeable>
  );
}
