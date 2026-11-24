import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { programName, programNames } from '@/lib/programName';
import { PlusIcon, XIcon } from '@lut/lut-icons';
import type { ReactNode } from 'react';
import { blurOnEnter, type Keyed, useRows } from './listRows';
import { SettingRow } from './SettingRow';

type Program = { value: string };

const sameNames = (a: Program[], b: Program[]) => {
  const left = programNames(a.map((p) => p.value));
  const right = programNames(b.map((p) => p.value));
  return left.length === right.length && left.every((name, i) => name === right[i]);
};

type Props = {
  title: ReactNode;
  description: ReactNode;
  /** The saved names, as `programName` gives them. */
  programs: string[];
  /** Saves the names; whether they were saved, when known. */
  onCommit: (programs: string[]) => Promise<boolean> | void;
};

/**
 * Program names, one field each. A name is saved as the backend names running programs (`nvim.exe` is `nvim`)
 * and once; a field added here and left empty is not saved.
 */
export function ProgramListEditor({ title, description, programs, onCommit }: Props) {
  const saved = programs.map((value) => ({ value }));
  const { rows, setRows, add, send, last } = useRows(saved, sameNames);

  const commit = (next: Keyed<Program>[]) => {
    const seen = new Set<string>();
    const shown = next.flatMap((row) => {
      const value = programName(row.value);
      if (value !== '' && seen.has(value)) return [];
      seen.add(value);
      return [{ ...row, value }];
    });
    setRows(shown);
    const kept = shown.filter((row) => row.value !== '').map(({ value }) => ({ value }));
    if (sameNames(kept, last)) return;
    send(kept, onCommit(kept.map((program) => program.value)));
  };

  return (
    <SettingRow
      title={title}
      description={description}
      details={
        rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {rows.map((program, index) => (
              <div key={program.key} className="flex items-center gap-2">
                <Input
                  aria-label={`Program ${index + 1}`}
                  value={program.value}
                  placeholder="nvim"
                  onChange={(event) =>
                    setRows(rows.map((r) => (r.key === program.key ? { ...r, value: event.target.value } : r)))
                  }
                  onBlur={() => commit(rows)}
                  onKeyDown={blurOnEnter}
                  className="flex-1 font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove program ${index + 1}`}
                  onClick={() => commit(rows.filter((r) => r.key !== program.key))}
                >
                  <XIcon size="sm" />
                </Button>
              </div>
            ))}
          </div>
        ) : undefined
      }
    >
      <Button variant="outline" onClick={() => add({ value: '' })}>
        <PlusIcon size="sm" />
        Add program
      </Button>
    </SettingRow>
  );
}
