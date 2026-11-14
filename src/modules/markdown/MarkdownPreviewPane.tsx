import { checkReadable } from '@/lib/security/security';
import { useAssetGrant } from '@/lib/useAssetGrant';
import { cn } from '@/lib/utils';
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { defaultRehypePlugins, Streamdown, type StreamdownProps } from 'streamdown';
import { type LocalImagesOptions, previewBoundary, rehypeLocalImages } from './lib/assetPath';
import { rehypeGithubAlerts } from './lib/githubAlerts';
import { rehypeImageCaptions } from './lib/imageCaptions';
import { rehypeImageSize } from './lib/imageSize';
import { markdownComponents } from './MarkdownElements';
import { MarkdownViewToggle } from './MarkdownViewToggle';
import { PreviewStatusLine } from './PreviewStatusLine';
import { useMarkdownDocument } from './useMarkdownDocument';

type Props = {
  path: string;
  /** Images load only from beneath this folder (the document's own folder if it lies outside). */
  workspaceRoot?: string | null;
  visible: boolean;
  onSetView: (mode: 'rendered' | 'raw') => void;
};

/** What a local image shows while its asset grant is on its way: nothing, rather than harden's "blocked" text. */
const PENDING_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const identities = new WeakMap<object, number>();
let lastIdentity = 0;

/** A stable number per object, to tell Streamdown that a function or plugin list is a new one. */
function identityOf(value: object): number {
  let id = identities.get(value);
  if (id === undefined) {
    id = ++lastIdentity;
    identities.set(value, id);
  }
  return id;
}

export function MarkdownPreviewPane({ path, workspaceRoot = null, visible, onSetView }: Props) {
  const status = useMarkdownDocument(path, visible);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const content = status.kind === 'ready' ? status.content : null;

  // A retargeted preview starts at the top, not at the old document's offset.
  // path is the trigger.
  useLayoutEffect(() => {
    scrollTopRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [path]);

  const onScroll = useCallback(() => {
    scrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
  }, []);

  // New text replaces blocks in place; put the view back where the reader was
  // in case the swap collapsed the document for a frame.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && content !== null && el.scrollTop !== scrollTopRef.current) {
      el.scrollTop = scrollTopRef.current;
    }
  }, [content]);

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-background',
        !visible && 'pointer-events-none',
      )}
    >
      <MarkdownViewToggle mode="rendered" onChange={onSetView} />
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <article className="lut-md mx-auto max-w-[880px] px-12 pt-11 pb-12 font-sans text-[14px] leading-[22px] text-foreground">
          {status.kind === 'loading' && <p className="text-[12px] text-muted-foreground">Loading…</p>}
          {status.kind === 'error' && (
            <p className="text-[12px] text-destructive">Failed to read file: {status.message}</p>
          )}
          {status.kind === 'binary' && (
            <p className="text-[12px] text-muted-foreground">Binary file — cannot render as markdown.</p>
          )}
          {status.kind === 'toolarge' && (
            <p className="text-[12px] text-muted-foreground">
              File is {status.size} bytes; limit {status.limit}.
            </p>
          )}
          {content !== null && (
            <MarkdownBody path={path} boundary={previewBoundary(path, workspaceRoot)} content={content} />
          )}
        </article>
      </div>
      <PreviewStatusLine path={path} />
    </div>
  );
}

const MarkdownBody = memo(function MarkdownBody({
  path,
  boundary,
  content,
}: {
  path: string;
  boundary: string;
  content: string;
}) {
  const { urlFor: assetUrlFor, error: assetError, retry } = useAssetGrant(boundary);
  const rehypePlugins = useMemo((): NonNullable<StreamdownProps['rehypePlugins']> => {
    const d = defaultRehypePlugins;
    return [
      d.raw,
      d.sanitize,
      rehypeGithubAlerts,
      [
        rehypeLocalImages,
        {
          basePath: path,
          boundary,
          grant: String(identityOf(assetUrlFor)),
          toUrl: (abs: string) => assetUrlFor(abs) ?? PENDING_IMAGE,
          isReadable: (abs: string) => checkReadable(abs).ok,
        } satisfies LocalImagesOptions,
      ],
      rehypeImageCaptions,
      rehypeImageSize,
      d.harden,
    ];
  }, [path, boundary, assetUrlFor]);

  return (
    <>
      {assetError && (
        <div className="mb-3 text-xs text-muted-foreground">
          <p role="alert">Local images unavailable: {assetError}</p>
          <button type="button" className="underline" onClick={retry}>
            Retry images
          </button>
        </div>
      )}
      {/* Streamdown's memo ignores rehypePlugins: without a new key a grant that lands after the first render
          would never reach the images. */}
      <Streamdown
        key={identityOf(rehypePlugins)}
        className="space-y-0 select-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        components={markdownComponents}
        rehypePlugins={rehypePlugins}
        mode="static"
        parseIncompleteMarkdown={false}
      >
        {content}
      </Streamdown>
    </>
  );
});
