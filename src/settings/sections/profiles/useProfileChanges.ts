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

type Writer = {
  /** The profile as last saved, or as last listed. */
  latest: Edited;
  /** The listed entry `latest` last took. */
  listed: ProfileEntry;
  pending: number;
  queue: Promise<void>;
};

/**
 * One queue per profile, shared by every form that shows it: choosing another profile and coming back remounts the
 * form, and its saves still go after the ones already on their way, each on top of the last.
 */
const writers = new Map<string, Writer>();

/** The profile's writer, which takes a newly listed entry (a save read back, or a change made elsewhere) once idle. */
function writerFor(entry: ProfileEntry): Writer {
  const writer = writers.get(entry.id);
  if (!writer) {
    const created = { latest: edited(entry), listed: entry, pending: 0, queue: Promise.resolve() };
    writers.set(entry.id, created);
    return created;
  }
  if (writer.pending === 0 && writer.listed !== entry) {
    writer.latest = edited(entry);
    writer.listed = entry;
  }
  return writer;
}

/**
 * Saves each change of `entry` as it is made (a patch, or one made from the profile as last saved for a field
 * inside an object, like one appearance setting): a custom profile whole through `profiles_save`, a detected one's
 * visibility, appearance and tab through its override. Changes queue per profile, each on top of the last one
 * saved, so quick edits never undo each other while the list catches up. Fields native refused keep their error
 * until a change to them is saved. One profile per use: the form remounts for another.
 */
export function useProfileChanges(entry: ProfileEntry) {
  const [errors, setErrors] = useState<Record<string, ProfileErrorCode>>({});
  const listed = useRef(entry);
  useEffect(() => {
    listed.current = entry;
    writerFor(entry);
  }, [entry]);

  const change = useCallback((update: ProfileChange | ((current: Edited) => ProfileChange)) => {
    const shown = listed.current;
    const writer = writerFor(shown);
    writer.pending += 1;
    writer.queue = writer.queue
      .then(async () => {
        const patch = typeof update === 'function' ? update(writer.latest) : update;
        const keys = Object.keys(patch);
        const next: Edited = { ...writer.latest, ...patch };
        try {
          if (shown.source === 'detected') {
            await setDetectedOverride(next.id, {
              hidden: next.hidden,
              appearance: next.appearance,
              tab: next.tab,
            });
          } else {
            const { hidden: _hidden, ...profile } = next;
            await saveProfile(profile);
          }
          writer.latest = next;
          setErrors((current) =>
            Object.fromEntries(Object.entries(current).filter(([field]) => !touches(field, keys))),
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
        writer.pending -= 1;
      });
  }, []);

  return { errors, change };
}
