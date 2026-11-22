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
  /** The last listed entry seen. */
  listed: ProfileEntry;
  /** A save succeeded that the list has not shown yet: a listed entry until then is older than `latest`. */
  awaiting: boolean;
  pending: number;
  queue: Promise<void>;
};

/** A value with its object keys sorted and undefined fields left out, to compare two profiles. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const fields = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(fields)
      .sort()
      .filter((key) => fields[key] !== undefined)
      .map((key) => [key, canonical(fields[key])]),
  );
}

const sameProfile = (a: Edited, b: Edited) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * One queue per profile, shared by every form that shows it: choosing another profile and coming back remounts the
 * form, and its saves still go after the ones already on their way, each on top of the last.
 */
const writers = new Map<string, Writer>();

/** Forgets every writer, for tests that list the same profiles again from scratch. */
export function forgetProfileWriters(): void {
  writers.clear();
}

/**
 * The profile's writer, told of each listed entry. An entry that shows the last save confirms it; while a save is
 * unconfirmed, an entry listed before it is ignored. With every save confirmed and none on its way, an entry that
 * differs is a change made elsewhere, which becomes the base of the next save.
 */
function writerFor(entry: ProfileEntry): Writer {
  const writer = writers.get(entry.id);
  if (!writer) {
    const created = {
      latest: edited(entry),
      listed: entry,
      awaiting: false,
      pending: 0,
      queue: Promise.resolve(),
    };
    writers.set(entry.id, created);
    return created;
  }
  if (writer.listed !== entry) {
    writer.listed = entry;
    const shown = edited(entry);
    if (sameProfile(shown, writer.latest)) writer.awaiting = false;
    else if (writer.pending === 0 && !writer.awaiting) writer.latest = shown;
  }
  return writer;
}

/**
 * Saves each change of `entry` as it is made (a patch, or one made from the profile as last saved for a field
 * inside an object, like one appearance setting): a custom profile whole through `profiles_save`, a detected one's
 * visibility, appearance and tab through its override. Changes queue per profile, each on top of the last one
 * saved, so quick edits never undo each other while the list catches up. Fields native refused keep their error
 * until a change to them is saved. Each change tells whether it was saved. One profile per use: the form remounts
 * for another.
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
    let saved = false;
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
          saved = true;
          // Native tells of the change before it answers, so the list may already show it; a save that changed
          // nothing is never listed again.
          writer.awaiting = !sameProfile(edited(writer.listed), next);
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
        // A change made elsewhere, listed while this save was on its way, with no save of ours waiting to be listed
        // (this one failed): it is the base of the next save, even one already queued. A save that succeeded never
        // gets here, as it waits for the list when the list does not show it.
        const shownNow = edited(writer.listed);
        if (!writer.awaiting && !sameProfile(shownNow, writer.latest)) {
          writer.latest = shownNow;
        }
      });
    return writer.queue.then(() => saved);
  }, []);

  return { errors, change };
}
