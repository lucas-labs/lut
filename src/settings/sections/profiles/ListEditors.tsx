import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { ProfileErrorCode } from '@/modules/profiles';
import { PlusIcon, XIcon } from '@lut/lut-icons';
import { useRef, useState } from 'react';
import { SettingRow } from '../../components/SettingRow';
import { FieldError } from './fields';

type Keyed<T> = T & { key: string };

/** Saved rows, keyed by their place in the saved list. */
const keyedSaved = <T extends object>(items: T[]): Keyed<T>[] =>
  items.map((item, i) => ({ ...item, key: `saved-${i}` }));

/**
 * Rows edited as a draft, each with a key of its own so a removed row takes its field with it. A list saved
 * elsewhere replaces them; the list this editor sent, coming back saved, leaves them (their keys, focus and any
 * edit made since) as they are.
 */
function useRows<T extends object>(saved: T[], same: (a: T[], b: T[]) => boolean) {
  const added = useRef(0);
  const [rows, setRows] = useState(() => keyedSaved(saved));
  const [rowsOf, setRowsOf] = useState(saved);
  // The list last sent, as native lists it, until a new list arrives.
  const [sent, setSent] = useState<T[] | null>(null);
  if (!same(saved, rowsOf)) {
    setRowsOf(saved);
    setSent(null);
    if (sent === null || !same(saved, sent)) setRows(keyedSaved(saved));
  }
  const add = (item: T) => {
    added.current += 1;
    setRows([...rows, { ...item, key: `added-${added.current}` }]);
  };
  return { rows, setRows, add, markSent: setSent };
}

const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};

/** One argument; `listed` once it is part of the profile, so an empty one is an argument, not an unused field. */
type Arg = { value: string; listed: boolean };

const sameArgs = (a: Arg[], b: Arg[]) => a.length === b.length && a.every((arg, i) => arg.value === b[i].value);

/**
 * The program's arguments, one field each. A field added here and left empty is not saved; once an argument is
 * part of the profile, clearing it saves an empty argument in its place, until it is removed.
 */
export function ArgsEditor({ args, onCommit }: { args: string[]; onCommit: (args: string[]) => void }) {
  const saved = args.map((value) => ({ value, listed: true }));
  const { rows, setRows, add, markSent } = useRows(saved, sameArgs);

  const commit = (next: Keyed<Arg>[]) => {
    const kept = next.filter((arg) => arg.value !== '' || arg.listed);
    if (sameArgs(kept, saved)) return;
    setRows(next.map((arg) => (kept.includes(arg) ? { ...arg, listed: true } : arg)));
    markSent(kept);
    onCommit(kept.map((arg) => arg.value));
  };

  return (
    <SettingRow
      title="Arguments"
      description="Passed to the program one by one."
      details={
        rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {rows.map((arg, index) => (
              <div key={arg.key} className="flex items-center gap-2">
                <Input
                  aria-label={`Argument ${index + 1}`}
                  value={arg.value}
                  onChange={(event) =>
                    setRows(rows.map((r) => (r.key === arg.key ? { ...r, value: event.target.value } : r)))
                  }
                  onBlur={() => commit(rows)}
                  onKeyDown={blurOnEnter}
                  className="flex-1 font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove argument ${index + 1}`}
                  onClick={() => {
                    const next = rows.filter((r) => r.key !== arg.key);
                    setRows(next);
                    commit(next);
                  }}
                >
                  <XIcon size="sm" />
                </Button>
              </div>
            ))}
          </div>
        ) : undefined
      }
    >
      <Button variant="outline" onClick={() => add({ value: '', listed: false })}>
        <PlusIcon size="sm" />
        Add argument
      </Button>
    </SettingRow>
  );
}

type EnvRow = { name: string; value: string; unset: boolean };

const toRows = (env: Record<string, string | null>): EnvRow[] =>
  Object.entries(env).map(([name, value]) => ({ name, value: value ?? '', unset: value === null }));

const toEnv = (rows: EnvRow[]): Record<string, string | null> =>
  Object.fromEntries(
    rows.filter((row) => row.name.trim() !== '').map((row) => [row.name, row.unset ? null : row.value]),
  );

/** The same variables, in any order. */
const sameEnv = (a: EnvRow[], b: EnvRow[]) => {
  const other = toEnv(b);
  const own = toEnv(a);
  return (
    Object.keys(own).length === Object.keys(other).length &&
    Object.entries(own).every(([n, v]) => other[n] === v && n in other)
  );
};

type EnvEditorProps = {
  env: Record<string, string | null>;
  onCommit: (env: Record<string, string | null>) => void;
  /** Refused variables, by field path (`env.<NAME>`). */
  errors: Record<string, ProfileErrorCode>;
};

/**
 * The variables the profile sets, or unsets so the process does not inherit them. A row without a name is kept
 * here, not saved, until it has one.
 */
export function EnvEditor({ env, onCommit, errors }: EnvEditorProps) {
  const saved = toRows(env);
  const { rows, setRows, add, markSent } = useRows(saved, sameEnv);

  const commit = (next: EnvRow[]) => {
    const env = toEnv(next);
    if (sameEnv(toRows(env), saved)) return;
    markSent(toRows(env));
    onCommit(env);
  };
  const update = (key: string, patch: Partial<EnvRow>) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r));

  return (
    <SettingRow
      title="Variables"
      description="Set for this profile only. Unset removes a variable the program would inherit."
      details={
        rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {rows.map((row, index) => {
              const error = errors[`env.${row.name}`];
              return (
                <div key={row.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Variable ${index + 1} name`}
                      value={row.name}
                      placeholder="NAME"
                      onChange={(event) => setRows(update(row.key, { name: event.target.value }))}
                      onBlur={() => commit(rows)}
                      onKeyDown={blurOnEnter}
                      aria-invalid={error ? true : undefined}
                      className="w-40 font-mono"
                    />
                    <Input
                      aria-label={`Variable ${index + 1} value`}
                      value={row.value}
                      placeholder={row.unset ? 'Unset' : 'value'}
                      disabled={row.unset}
                      onChange={(event) => setRows(update(row.key, { value: event.target.value }))}
                      onBlur={() => commit(rows)}
                      onKeyDown={blurOnEnter}
                      className="min-w-0 flex-1 font-mono"
                    />
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Switch
                        aria-label={`Unset variable ${index + 1}`}
                        checked={row.unset}
                        onCheckedChange={(unset) => {
                          const next = update(row.key, { unset });
                          setRows(next);
                          commit(next);
                        }}
                      />
                      <span aria-hidden>Unset</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove variable ${index + 1}`}
                      onClick={() => {
                        const next = rows.filter((r) => r.key !== row.key);
                        setRows(next);
                        commit(next);
                      }}
                    >
                      <XIcon size="sm" />
                    </Button>
                  </div>
                  <FieldError code={error} />
                </div>
              );
            })}
          </div>
        ) : undefined
      }
    >
      <Button variant="outline" onClick={() => add({ name: '', value: '', unset: false })}>
        <PlusIcon size="sm" />
        Add variable
      </Button>
    </SettingRow>
  );
}
