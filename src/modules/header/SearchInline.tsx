import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EditorPaneHandle } from '@/modules/editor';
import { ShortcutKeys, useShortcutHint, useShortcutLabel } from '@/modules/shortcuts';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

const TERM_DECORATIONS = {
  matchBackground: '#515c6a',
  activeMatchBackground: '#d18616',
  matchOverviewRuler: '#d18616',
  activeMatchColorOverviewRuler: '#d18616',
};

export type SearchTarget =
  | { kind: 'terminal'; addon: TerminalSearchController; focus: () => void }
  | { kind: 'editor'; handle: EditorPaneHandle; focus: () => void }
  | {
      kind: 'git-history';
      handle: { setQuery: (q: string) => void; clearQuery: () => void };
      focus: () => void;
    }
  | null;

export type SearchInlineHandle = { focus: () => void };

type Props = {
  target: SearchTarget;
  /** When true, collapse to an icon-only button until the user opens it. */
  compact?: boolean;
};

export const SearchInline = forwardRef<SearchInlineHandle, Props>(function SearchInline({ target, compact }, ref) {
  const [q, setQ] = useState('');
  // In compact mode the field is hidden behind an icon until activated.
  // In normal mode the field is always present.
  const [openInCompact, setOpenInCompact] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocusRef = useRef(false);
  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (!el || !pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    el.focus();
  }, []);

  const shortcutLabel = useShortcutLabel('search.focus');
  const shortcutText = useShortcutHint('search.focus');

  // One label for every target: the shortcut hint beside it leaves no room for a longer one.
  const baseLabel = 'Search';

  const tooltipTitle = useMemo(() => {
    return shortcutText ? `${baseLabel} (${shortcutText})` : baseLabel;
  }, [shortcutText]);

  const expanded = !compact || openInCompact;

  const focus = useCallback(() => {
    pendingFocusRef.current = true;
    if (compact) setOpenInCompact(true);
    else inputRef.current?.focus();
    if (inputRef.current) pendingFocusRef.current = false;
  }, [compact]);

  useImperativeHandle(ref, () => ({ focus }), [focus]);

  const clearTarget = useCallback(() => {
    if (!target) return;
    if (target.kind === 'terminal') target.addon.clearDecorations();
    else target.handle.clearQuery();
  }, [target]);

  const restoreTargetFocus = useCallback(() => {
    if (!target) return;
    target.focus();
  }, [target]);

  // Target switched (terminal ↔ editor) or removed → drop highlights.
  useEffect(() => clearTarget, [clearTarget]);

  const applyIncremental = (next: string) => {
    if (!target) return;
    if (target.kind === 'terminal') {
      if (next) {
        target.addon.findNext(next, {
          incremental: true,
          decorations: TERM_DECORATIONS,
        });
      } else {
        target.addon.clearDecorations();
      }
    } else {
      target.handle.setQuery(next);
    }
  };

  const findDirection = (forward: boolean) => {
    if (!target || !q) return;
    if (target.kind === 'terminal') {
      const opts = { decorations: TERM_DECORATIONS };
      if (forward) target.addon.findNext(q, opts);
      else target.addon.findPrevious(q, opts);
    } else if (target.kind === 'editor') {
      if (forward) target.handle.findNext();
      else target.handle.findPrevious();
    }
    // git-history: the list filters live; Enter has no next/prev semantics.
  };

  return (
    <div
      className="relative h-[22px] shrink-0 transition-[width] duration-200 ease-out"
      style={{ width: expanded ? 168 : 22 }}
    >
      {expanded ? (
        <div className="absolute inset-0 animate-in fade-in-0 duration-150">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
          />
          {!q && shortcutText ? (
            <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 rounded-sm bg-accent px-1 font-mono text-[11px] leading-4 text-muted-foreground">
              <ShortcutKeys label={shortcutLabel} />
            </span>
          ) : null}
          <Input
            ref={setInputRef}
            value={q}
            placeholder={baseLabel}
            aria-label={tooltipTitle}
            title={tooltipTitle}
            className="h-[22px] border-border pr-6 pl-[26px] hover:border-ring/60"
            onChange={(e) => {
              const next = e.target.value;
              setQ(next);
              applyIncremental(next);
            }}
            onBlur={() => {
              if (compact && !q) setOpenInCompact(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                findDirection(!e.shiftKey);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                clearTarget();
                setQ('');
                if (compact) {
                  setOpenInCompact(false);
                }
                restoreTargetFocus();
              }
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                clearTarget();
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </button>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-end animate-in fade-in-0 duration-150">
          <Button
            variant="ghost"
            size="icon"
            className="size-[22px] shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={focus}
            aria-label={tooltipTitle}
            title={tooltipTitle}
          >
            <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={1.75} />
          </Button>
        </div>
      )}
    </div>
  );
});
