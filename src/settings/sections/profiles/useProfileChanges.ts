import {
  errorsByField,
  type ProfileEntry,
  type ProfileErrorCode,
  readFailure,
  saveProfile,
  setDetectedOverride,
  type TerminalProfile,
  toTerminalProfile,
} from '@/modules/profiles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** What the form can change: a custom profile's fields, or a detected one's visibility and style. */
export type ProfileChange = Partial<Omit<TerminalProfile, 'id'>> & { hidden?: boolean };

/** The profile as last saved, or as listed. */
export type Edited = TerminalProfile & { hidden: boolean };

const edited = (entry: ProfileEntry): Edited => ({
  ...toTerminalProfile(entry),
  hidden: entry.hidden,
});

/** Whether a refused field (`name`, `env.PATH`) belongs to one of the changed keys (`name`, `env`). */
const touches = (field: string, keys: string[]) =>
  keys.some((key) => field === key || field.startsWith(`${key}.`));

/**
 * Saves each change of `entry` as it is made (a patch, or one made from the profile as last saved for a field
 * inside an object, like one appearance setting): a custom profile whole through `profiles_save`, a detected one's
 * visibility, appearance and tab through its override. Changes queue, each on top of the last one saved, so two
 * quick edits never undo each other while the list catches up. Fields native refused keep their error until a
 * change to them is saved. One profile per use: the form remounts for another.
 */
export function useProfileChanges(entry: ProfileEntry) {
  const [errors, setErrors] = useState<Record<string, ProfileErrorCode>>({});
  const latest = useRef(edited(entry));
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // The listed entry is the saved one once no change is on its way.
  useEffect(() => {
    if (pending.current === 0) latest.current = edited(entry);
  }, [entry]);

  const change = useCallback(
    (update: ProfileChange | ((current: Edited) => ProfileChange)) => {
      pending.current += 1;
      queue.current = queue.current
        .then(async () => {
          const patch = typeof update === 'function' ? update(latest.current) : update;
          const keys = Object.keys(patch);
          const next: Edited = { ...latest.current, ...patch };
          try {
            if (entry.source === 'detected') {
              await setDetectedOverride(next.id, {
                hidden: next.hidden,
                appearance: next.appearance,
                tab: next.tab,
              });
            } else {
              const { hidden: _hidden, ...profile } = next;
              await saveProfile(profile);
            }
            latest.current = next;
            setErrors((current) =>
              Object.fromEntries(
                Object.entries(current).filter(([field]) => !touches(field, keys)),
              ),
            );
          } catch (error) {
            const failure = readFailure(error);
            if (failure.kind === 'invalid') {
              setErrors((current) => ({ ...current, ...errorsByField(failure.errors, next.id) }));
            } else {
              toast.error("Couldn't save the profile", { description: failure.message });
            }
          }
        })
        .finally(() => {
          pending.current -= 1;
        });
    },
    [entry.source],
  );

  return { errors, change };
}
