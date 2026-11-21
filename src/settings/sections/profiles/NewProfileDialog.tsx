import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  errorsByField,
  newProfileId,
  type ProfileErrorCode,
  readFailure,
  saveProfile,
  type TerminalProfile,
} from '@/modules/profiles';
import { PlusIcon } from '@lut/lut-icons';
import { useId, useRef, useState } from 'react';
import { FieldError } from './fields';

/** A new custom profile with nothing set but what it runs. */
function blankProfile(name: string, executable: string): TerminalProfile {
  return {
    id: newProfileId(),
    name: name.trim(),
    executable: executable.trim() || undefined,
    args: [],
    env: {},
    loadUserProfile: true,
    environment: { kind: 'native' },
    appearance: {},
    tab: { allowShellTitle: true },
    closeBehavior: 'close',
  };
}

/** Creates a custom profile from its name and program; its other settings are edited once it is listed. */
export function NewProfileDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [executable, setExecutable] = useState('');
  const [errors, setErrors] = useState<Record<string, ProfileErrorCode>>({});
  const [failure, setFailure] = useState<string | null>(null);
  // A profile is being created: another submit would create a second one under another id.
  const creating = useRef(false);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const reset = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setName('');
    setExecutable('');
    setErrors({});
    setFailure(null);
  };

  const create = () => {
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    const profile = blankProfile(name, executable);
    const settled = () => {
      creating.current = false;
      setBusy(false);
    };
    saveProfile(profile).then(
      () => {
        settled();
        reset(false);
        onCreated(profile.id);
      },
      (error: unknown) => {
        settled();
        const read = readFailure(error);
        if (read.kind === 'invalid') {
          setErrors(errorsByField(read.errors, profile.id));
          setFailure(null);
        } else {
          setFailure(read.message);
        }
      },
    );
  };

  return (
    // While a profile is created the dialog stays open, so its answer lands in the dialog that asked for it.
    <Dialog open={open} onOpenChange={(next) => !creating.current && reset(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="mt-2 w-full justify-start">
          <PlusIcon size="sm" />
          New profile
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New profile</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-name`}>Name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              placeholder="Python"
              aria-invalid={errors.name ? true : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError code={errors.name} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${formId}-executable`}>Executable</Label>
            <Input
              id={`${formId}-executable`}
              value={executable}
              placeholder="python"
              aria-invalid={errors.executable ? true : undefined}
              onChange={(event) => setExecutable(event.target.value)}
              className="font-mono"
            />
            <FieldError code={errors.executable} />
          </div>
          {failure ? <p className="text-[12px] text-destructive">{failure}</p> : null}
          <DialogFooter>
            <Button type="submit" size="lg" disabled={busy}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
