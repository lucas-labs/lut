import { cn } from '@/lib/utils';
import {
  Alert02Icon,
  AlertCircleIcon,
  AlertDiamondIcon,
  BulbIcon,
  Image01Icon,
  InformationCircleIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { MarkdownCode } from './code/markdown-code';
import { REFUSED_IMAGE_TAG } from './lib/assetPath';
import type { AlertKind } from './lib/githubAlerts';
import { MarkdownImage } from './MarkdownImage';
import { MarkdownLink } from './MarkdownLink';

/** Streamdown hands every component its hast node; it never goes to the DOM. */
type HastProps<T extends keyof React.JSX.IntrinsicElements> = ComponentProps<T> & { node?: HastElement };

type HastElement = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastElement[];
};

const ALERTS: Record<AlertKind, { title: string; icon: IconSvgElement; color: string }> = {
  note: { title: 'Note', icon: InformationCircleIcon, color: 'var(--success)' },
  tip: { title: 'Tip', icon: BulbIcon, color: 'var(--terminal-ansi-green)' },
  important: { title: 'Important', icon: AlertDiamondIcon, color: 'var(--terminal-ansi-magenta)' },
  warning: { title: 'Warning', icon: Alert02Icon, color: 'var(--warning)' },
  caution: { title: 'Caution', icon: AlertCircleIcon, color: 'var(--destructive)' },
};

const isAlertKind = (value: unknown): value is AlertKind => typeof value === 'string' && value in ALERTS;

function heading(Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', className: string) {
  return function Heading({ node: _node, className: own, ...props }: HastProps<typeof Tag>) {
    return <Tag {...props} className={cn(className, own)} />;
  };
}

const MINOR_HEADING = 'mt-[18px] mb-1.5 text-[12px] leading-4 font-semibold tracking-[.02em] text-muted-foreground';

function Paragraph({ node: _node, className, ...props }: HastProps<'p'>) {
  return <p {...props} className={cn('mb-3', className)} />;
}

const isTaskList = (className: unknown) => typeof className === 'string' && className.includes('contains-task-list');

function UnorderedList({ node: _node, className, ...props }: HastProps<'ul'>) {
  return (
    <ul
      {...props}
      className={cn(
        'mb-3 [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0',
        isTaskList(className) ? 'list-none pl-0 [&_ul]:pl-6' : 'list-disc pl-5 marker:text-muted-foreground',
        className,
      )}
    />
  );
}

function OrderedList({ node: _node, className, ...props }: HastProps<'ol'>) {
  return (
    <ol
      {...props}
      className={cn(
        'mb-3 list-decimal pl-5 marker:text-muted-foreground marker:tabular-nums [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0',
        isTaskList(className) && 'list-none pl-0',
        className,
      )}
    />
  );
}

/** The checkbox a GFM task item opens with, and whether it is ticked. */
function taskState(node: HastElement | undefined): boolean | null {
  const input = node?.children?.find((child) => child.tagName === 'input');
  if (!input || input.properties?.type !== 'checkbox') return null;
  return input.properties.checked === true;
}

function ListItem({ node, className, children, ...props }: HastProps<'li'>) {
  const done = taskState(node);
  return (
    <li
      {...props}
      className={cn('mb-1', done !== null && 'relative pl-[22px]', done === true && 'text-muted-foreground', className)}
    >
      {children}
    </li>
  );
}

/** A task item's box: read-only, as the file is the place to tick it. */
function TaskBox({ node: _node, type, checked, className, ...props }: HastProps<'input'>) {
  if (type !== 'checkbox') return <input {...props} type={type} checked={checked} className={className} readOnly />;
  return (
    <span className="absolute top-1 left-0 flex size-3.5 items-center justify-center text-primary-foreground">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        readOnly
        className={cn(
          'absolute inset-0 m-0 appearance-none rounded-[3px] border',
          checked ? 'border-primary bg-primary' : 'border-muted-foreground/50',
        )}
      />
      {checked && <HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={3} aria-hidden className="relative" />}
    </span>
  );
}

function Blockquote({ node: _node, className, children, ...props }: HastProps<'blockquote'>) {
  const kind = (props as Record<string, unknown>)['data-alert'];
  if (isAlertKind(kind)) {
    const alert = ALERTS[kind];
    return (
      <div
        role="note"
        data-alert={kind}
        style={{ '--alert': alert.color } as CSSProperties}
        className="relative my-3 overflow-hidden rounded-md border border-border bg-card py-2.5 pr-3.5 pl-[17px] [&_p:last-child]:mb-0"
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-(--alert)" />
        <p className="mb-0.5 flex items-center gap-1.5 text-[12px] leading-4 font-semibold text-(--alert)">
          <HugeiconsIcon icon={alert.icon} size={13} strokeWidth={2} aria-hidden />
          {alert.title}
        </p>
        {children}
      </div>
    );
  }
  return (
    <blockquote
      {...props}
      className={cn(
        'relative my-3 overflow-hidden py-0.5 pl-[17px] text-muted-foreground italic [&_p:last-child]:mb-0',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-[2px] bg-muted-foreground/40" />
      {children}
    </blockquote>
  );
}

function Rule({ node: _node, className, ...props }: HastProps<'hr'>) {
  return <hr {...props} className={cn('my-7 h-px border-0 bg-border', className)} />;
}

function Link({ node: _node, className, ...props }: HastProps<'a'>) {
  return (
    <MarkdownLink
      {...props}
      className={cn(
        'cursor-pointer text-primary underline decoration-1 underline-offset-2 hover:text-foreground',
        className,
      )}
    />
  );
}

function Figure({ node: _node, className, ...props }: HastProps<'figure'>) {
  return <figure {...props} className={cn('mx-0 mt-3 mb-4', className)} />;
}

function Caption({ node: _node, className, ...props }: HastProps<'figcaption'>) {
  return (
    <figcaption
      {...props}
      className={cn('mt-1.5 text-center text-[12px] leading-4 text-muted-foreground', className)}
    />
  );
}

/** A local image the preview may not load: where it would be, as the document wrote it. */
function RefusedImage({ 'data-src': src }: { 'data-src'?: string; children?: ReactNode }) {
  return (
    <span
      data-image-placeholder
      className="flex h-40 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/40 bg-card font-mono text-[11px] text-muted-foreground"
    >
      <HugeiconsIcon icon={Image01Icon} size={22} strokeWidth={1.5} aria-hidden />
      <span className="max-w-full truncate px-4">
        <span className="sr-only">Image not loaded: </span>
        {src}
      </span>
    </span>
  );
}

/**
 * The preview's own look for each markdown element. Images open enlarged on click. Tables keep Streamdown's
 * components (and their copy, download and fullscreen controls); `markdown-preview.css` styles those.
 */
export const markdownComponents = {
  h1: heading('h1', 'mb-3 text-[24px] leading-8 font-semibold'),
  h2: heading('h2', 'mt-7 mb-2 text-[16px] leading-[22px] font-semibold'),
  h3: heading('h3', 'mt-[22px] mb-1.5 text-[14px] leading-5 font-semibold'),
  h4: heading('h4', MINOR_HEADING),
  h5: heading('h5', MINOR_HEADING),
  h6: heading('h6', MINOR_HEADING),
  p: Paragraph,
  ul: UnorderedList,
  ol: OrderedList,
  li: ListItem,
  input: TaskBox,
  blockquote: Blockquote,
  hr: Rule,
  a: Link,
  code: MarkdownCode,
  img: MarkdownImage,
  figure: Figure,
  figcaption: Caption,
  [REFUSED_IMAGE_TAG]: RefusedImage,
};
