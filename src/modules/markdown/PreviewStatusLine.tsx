import { FileIcon } from '@lut/lut-icons';

/** The strip under a rendered markdown file, shaped like the editor's: the file, and that this is its preview. */
export function PreviewStatusLine({ path }: { path: string }) {
  return (
    <footer
      aria-label="Preview status"
      className="flex h-5 shrink-0 items-center gap-3.5 border-t border-border bg-card pr-2 pl-3 text-[11px] leading-3.5 whitespace-nowrap text-muted-foreground"
    >
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <FileIcon size="xs" className="shrink-0" />
        <span className="truncate">{path}</span>
      </span>
      <span className="flex-1" />
      <span className="shrink-0">Preview</span>
    </footer>
  );
}
