import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogWarning,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { IS_WINDOWS } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { setShortcuts } from '@/modules/settings/store';
import { ShortcutKey } from '@/modules/shortcuts/ShortcutKeys';
import {
  getBindingTokens,
  type KeyBinding,
  type Shortcut,
  SHORTCUT_GROUPS,
  type ShortcutId,
  SHORTCUTS,
} from '@/modules/shortcuts/shortcuts';
import { ArrowTurnBackwardIcon, Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { SettingRow, SettingRowList } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';

export function ShortcutsSection() {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const [search, setSearch] = useState('');
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const filteredShortcuts = useMemo(() => {
    // Filter out internal/non-overridable shortcuts like tab.selectByIndex.
    const base = SHORTCUTS.filter((s) => s.id !== 'tab.selectByIndex');
    if (!search) return base;
    const lower = search.toLowerCase();
    return base.filter((s) => s.label.toLowerCase().includes(lower) || s.group.toLowerCase().includes(lower));
  }, [search]);

  const onRecord = (id: ShortcutId, binding: KeyBinding) => {
    const next = { ...userShortcuts, [id]: [binding] };
    void setShortcuts(next);
    setRecordingId(null);
  };

  const onClear = (id: ShortcutId) => {
    const next = { ...userShortcuts, [id]: [] };
    void setShortcuts(next);
  };

  const onResetShortcut = (id: ShortcutId) => {
    const next = { ...userShortcuts };
    delete next[id];
    void setShortcuts(next);
  };

  const onResetAll = () => {
    void setShortcuts({});
    setResetDialogOpen(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <SectionHeader title="Shortcuts" description="View and customize keyboard shortcuts." />
        <Button variant="outline" onClick={() => setResetDialogOpen(true)}>
          <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={1.5} />
          Reset All
        </Button>
      </div>

      <div className="relative mt-4">
        <HugeiconsIcon
          icon={Search01Icon}
          size={14}
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search shortcuts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="flex flex-col">
        {SHORTCUT_GROUPS.map((group) => {
          const items = filteredShortcuts.filter((s) => s.group === group);
          if (items.length === 0) return null;

          return (
            <SettingsGroup key={group} title={group}>
              <SettingRowList>
                {items.map((s) => (
                  <ShortcutRow
                    key={s.id}
                    shortcut={s}
                    isRecording={recordingId === s.id}
                    onToggleRecording={() => setRecordingId((id) => (id === s.id ? null : s.id))}
                    onStopRecording={() => setRecordingId(null)}
                    onRecord={(b) => onRecord(s.id, b)}
                    onClear={() => onClear(s.id)}
                    onReset={() => onResetShortcut(s.id)}
                    userBindings={userShortcuts[s.id]}
                  />
                ))}
              </SettingRowList>
            </SettingsGroup>
          );
        })}
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogWarning />
            <AlertDialogTitle>Reset all shortcuts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert all your custom keyboard shortcuts to their factory defaults. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter actionFirst={IS_WINDOWS}>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction tone="danger" onClick={onResetAll}>
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  isRecording,
  onToggleRecording,
  onStopRecording,
  onRecord,
  onClear,
  onReset,
  userBindings,
}: {
  shortcut: Shortcut;
  isRecording: boolean;
  onToggleRecording: () => void;
  onStopRecording: () => void;
  onRecord: (b: KeyBinding) => void;
  onClear: () => void;
  onReset: () => void;
  userBindings?: KeyBinding[];
}) {
  const bindings = userBindings !== undefined ? userBindings : shortcut.defaultBindings;
  const isModified = userBindings !== undefined;
  const hasBindings = bindings && bindings.length > 0;
  // The button's name says what it does; its description reads the keys it holds, "Unassigned" or the recording note.
  const keysId = useId();
  useShortcutRecorder(isRecording, onRecord, onStopRecording);

  return (
    <SettingRow title={shortcut.label} description={shortcut.description}>
      <div className="flex items-center gap-1">
        {isModified && !isRecording && (
          <Button variant="link" onClick={onReset}>
            Reset to default
          </Button>
        )}
        {/* While recording, the ✕ cancels like Esc, and stays visible. */}
        {isRecording ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onStopRecording}
            aria-label="Cancel recording"
            title="Cancel recording"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
          </Button>
        ) : hasBindings ? (
          <Button
            variant="ghost"
            size="icon"
            // A changed shortcut shows it with its reset; the others on hover or focus.
            className={cn(
              !isModified &&
                'opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100',
            )}
            onClick={onClear}
            aria-label="Clear shortcut"
            title="Clear shortcut"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
          </Button>
        ) : null}
        <Button
          variant="outline-hover"
          size="keys"
          aria-label={`Record shortcut for ${shortcut.label}`}
          aria-describedby={keysId}
          aria-pressed={isRecording}
          onClick={onToggleRecording}
        >
          <span id={keysId} className="contents">
            {isRecording ? (
              'Recording... (Esc to cancel)'
            ) : hasBindings ? (
              <KbdGroup>
                {getBindingTokens(bindings[0]).map((t) => (
                  <Kbd key={t}>
                    <ShortcutKey token={t} />
                  </Kbd>
                ))}
              </KbdGroup>
            ) : (
              'Unassigned'
            )}
          </span>
        </Button>
      </div>
    </SettingRow>
  );
}

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

/** While `active`, the next key press with a modifier becomes the binding; Esc cancels. Other keys are swallowed. */
function useShortcutRecorder(active: boolean, onRecord: (b: KeyBinding) => void, onCancel: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (MODIFIER_KEYS.includes(e.key)) return;

      // Require at least one primary modifier (Ctrl, Alt, Meta).
      // Reject Shift‑only shortcuts that would insert a character.
      const hasPrimaryModifier = e.ctrlKey || e.altKey || e.metaKey;
      const isCharacterKey = e.key.length === 1; // anything that types a glyph
      // this blocks shortcuts such as Shift+2 which would be "@" and Shift+, which would be "<" on many layouts
      if (!hasPrimaryModifier && (!e.shiftKey || isCharacterKey)) {
        return;
      }
      onRecord({
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      });
    };
    // Space activates a focused button on key up: swallow it so it doesn't toggle the recording off.
    const onUp = (e: KeyboardEvent) => e.preventDefault();

    window.addEventListener('keydown', onDown, { capture: true });
    window.addEventListener('keyup', onUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onDown, { capture: true });
      window.removeEventListener('keyup', onUp, { capture: true });
    };
  }, [active, onRecord, onCancel]);
}
