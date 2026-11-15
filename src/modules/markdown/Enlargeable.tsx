import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type CSSProperties, type ReactNode, useState } from 'react';

type Props = {
  /** The button's accessible name, e.g. "Enlarge image: Logo". */
  label: string;
  /** The dialog's name for screen readers. */
  title: string;
  description: string;
  /** What the preview shows in place. */
  children: ReactNode;
  /** The same content drawn as large as the window allows. */
  enlarged: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** The size an enlarged image or diagram fills: the window, less the dialog's margin. */
export const ENLARGED_SIZE = 'h-[calc(100vh-6rem)] w-[calc(100vw-5.5rem)]';

/**
 * Something in the markdown preview that opens as large as the window allows on click, to look at it closely; Escape,
 * the close button or a click outside closes it. Images and diagrams share it.
 */
export function Enlargeable({ label, title, description, children, enlarged, className, style }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        style={style}
        className={cn(
          'max-w-full cursor-zoom-in rounded-lg align-top focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          className,
        )}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-auto max-w-[calc(100vw-4rem)] gap-0 rounded-xl bg-card p-3 sm:max-w-[calc(100vw-4rem)]"
          showCloseButton
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {enlarged}
        </DialogContent>
      </Dialog>
    </>
  );
}
