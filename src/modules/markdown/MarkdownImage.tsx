import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type ComponentProps, createContext, useContext, useState } from 'react';

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
  const [open, setOpen] = useState(false);
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="inline-block max-w-full cursor-zoom-in rounded-lg align-top focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {image}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-auto max-w-[calc(100vw-4rem)] gap-0 rounded-xl bg-card p-3 sm:max-w-[calc(100vw-4rem)]"
          showCloseButton
        >
          <DialogTitle className="sr-only">{alt || 'Image'}</DialogTitle>
          <DialogDescription className="sr-only">The image at full size.</DialogDescription>
          <img
            src={src}
            alt={alt}
            className="h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-[calc(100vw-5.5rem)] max-w-[calc(100vw-5.5rem)] object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
