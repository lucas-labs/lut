import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DeleteIcon, PencilIcon, PlusIcon } from '@lut/lut-icons';
import { type ReactNode, useEffect, useRef, useState } from 'react';

/** The rail's fixed width (E27-01): it hides and shows like the sidebar, but never resizes. */
export const COMPACT_RAIL_WIDTH = 32;

type CompactRailSpace = { id: string; name: string };

type Props = {
  spaces: readonly CompactRailSpace[];
  activeSpaceId: string | null;
  onSwitchSpace: (id: string) => void;
  onNewSpace: () => void;
  /** The Spaces view's menu actions. */
  onRenameSpace: (id: string, name: string) => void;
  onNewTabInSpace: (id: string) => void;
  onDeleteSpace: (id: string) => void;
};

/** A space's mark on the rail: the first character of its name, upper-cased; an emoji stays whole. */
export function spaceInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** A rail button's name, shown to the right of the rail, over the terminals. */
function RailTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** The space's new name, beside its button: Enter or leaving the field keeps it, Escape drops it. */
function RenameField({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  // Focused on the next frame, once the menu that opened it has closed and let go of focus (as InlineRename does).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <Input
      ref={ref}
      size="xs"
      defaultValue={initial}
      aria-label="Rename space"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={(e) => {
        if (!document.hasFocus()) return;
        finish(e.currentTarget.value);
      }}
    />
  );
}

/**
 * The compact sidebar (E27-01): a 32 px rail in place of the sidebar and the vertical tab column, with one button per
 * space and one that opens a new space. The spaces scroll on their own, so the + always shows.
 */
export function CompactRail({
  spaces,
  activeSpaceId,
  onSwitchSpace,
  onNewSpace,
  onRenameSpace,
  onNewTabInSpace,
  onDeleteSpace,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Set when the menu's Rename is chosen, so the menu leaves focus to the rename field instead of the button.
  const renaming = useRef(false);

  return (
    <nav aria-label="Compact sidebar" className="flex h-full min-h-0 flex-col items-center gap-1 py-2">
      <div className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto">
        {spaces.map((space) => (
          <Popover
            key={space.id}
            open={renamingId === space.id}
            onOpenChange={(open) => {
              if (!open) setRenamingId(null);
            }}
          >
            <ContextMenu>
              <PopoverAnchor asChild>
                <ContextMenuTrigger asChild>
                  <span className="flex shrink-0">
                    <RailTip label={space.name}>
                      <Button
                        variant="rail"
                        size="icon-sm"
                        aria-label={space.name}
                        aria-current={space.id === activeSpaceId ? 'true' : undefined}
                        onClick={() => onSwitchSpace(space.id)}
                      >
                        <span className="font-semibold">{spaceInitial(space.name)}</span>
                      </Button>
                    </RailTip>
                  </span>
                </ContextMenuTrigger>
              </PopoverAnchor>
              {/* The Spaces view's menu, less Expand: the rail lists no space's tabs. */}
              <ContextMenuContent
                onCloseAutoFocus={(e) => {
                  if (!renaming.current) return;
                  renaming.current = false;
                  e.preventDefault();
                }}
              >
                <ContextMenuItem
                  onSelect={() => {
                    renaming.current = true;
                    setRenamingId(space.id);
                  }}
                >
                  <PencilIcon size="sm" />
                  <span className="flex-1">Rename space</span>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onNewTabInSpace(space.id)}>
                  <PlusIcon size="sm" />
                  <span className="flex-1">New tab</span>
                </ContextMenuItem>
                {spaces.length > 1 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => onDeleteSpace(space.id)}>
                      <DeleteIcon size="sm" />
                      <span className="flex-1">Delete space</span>
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={6}
              className="w-56 p-2"
              // It opens while focus is still in the closing menu; the field's own blur ends the rename.
              onOpenAutoFocus={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
              <RenameField
                initial={space.name}
                onDone={(name) => {
                  const value = name?.trim();
                  if (value) onRenameSpace(space.id, value);
                  setRenamingId(null);
                }}
              />
            </PopoverContent>
          </Popover>
        ))}
      </div>
      <RailTip label="Open space">
        <Button variant="rail" size="icon-sm" aria-label="Open space" onClick={onNewSpace} className="mt-1 shrink-0">
          <PlusIcon size="sm" />
        </Button>
      </RailTip>
    </nav>
  );
}
