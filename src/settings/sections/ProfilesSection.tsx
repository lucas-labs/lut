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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IS_WINDOWS } from '@/modules/platform';
import {
  deleteProfile,
  newProfileId,
  type ProfileEntry,
  ProfileIcon,
  readFailure,
  readProfilesAgain,
  saveProfile,
  setDefaultProfile,
  toTerminalProfile,
  useProfiles,
  useProfilesRead,
} from '@/modules/profiles';
import { useState } from 'react';
import { toast } from 'sonner';
import { SectionHeader } from '../components/SectionHeader';
import { NewProfileDialog } from './profiles/NewProfileDialog';
import { ProfileForm } from './profiles/ProfileForm';

function tellFailure(title: string) {
  return (error: unknown) => {
    const failure = readFailure(error);
    toast.error(title, {
      description: failure.kind === 'other' ? failure.message : 'The profile has fields native refused.',
    });
  };
}

/** The terminal profiles: the detected and custom ones on the left, the chosen one's settings on the right. */
export function ProfilesSection() {
  const list = useProfiles();
  const read = useProfilesRead();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProfileEntry | null>(null);

  const header = <SectionHeader title="Profiles" description="The programs a terminal tab can open." />;
  if (list === null) {
    return (
      <div className="flex flex-col">
        {header}
        {read === 'failed' ? (
          <div className="mt-6 flex items-center gap-3 text-muted-foreground">
            Could not read the profiles.
            <Button variant="outline" onClick={readProfilesAgain}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-muted-foreground">Loading profiles...</p>
        )}
      </div>
    );
  }

  const { profiles, defaultProfileId } = list;
  const chosen =
    profiles.find((p) => p.id === chosenId) ?? profiles.find((p) => p.id === defaultProfileId) ?? profiles[0];
  const detected = profiles.filter((p) => p.source === 'detected');
  const custom = profiles.filter((p) => p.source === 'custom');
  const distros = detected.flatMap((p) =>
    p.environment.kind === 'wsl' && p.environment.distro ? [p.environment.distro] : [],
  );

  const duplicate = (entry: ProfileEntry) => {
    const copy = { ...toTerminalProfile(entry), id: newProfileId(), name: `${entry.name} copy` };
    saveProfile(copy).then(() => setChosenId(copy.id), tellFailure("Couldn't duplicate the profile"));
  };

  const group = (title: string, entries: ProfileEntry[]) => (
    <>
      <h2 className="mt-4 mb-1 px-2.5 text-[12px] leading-4 text-muted-foreground first:mt-0">{title}</h2>
      {entries.map((entry) => {
        const current = entry.id === chosen?.id;
        return (
          <Button
            key={entry.id}
            variant="ghost"
            aria-current={current ? 'true' : undefined}
            onClick={() => setChosenId(entry.id)}
            className="w-full justify-start aria-[current=true]:bg-accent aria-[current=true]:text-foreground"
          >
            <ProfileIcon profile={entry} />
            <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
            {entry.hidden ? <span className="text-[11px] text-muted-foreground">Hidden</span> : null}
            {entry.id === defaultProfileId ? <Badge variant="soft">Default</Badge> : null}
          </Button>
        );
      })}
    </>
  );

  return (
    <div className="flex flex-col">
      {header}
      <div className="mt-6 flex items-start gap-6">
        <nav aria-label="Profiles" className="flex w-48 shrink-0 flex-col gap-0.5">
          {detected.length > 0 ? group('Detected', detected) : null}
          {group('Custom', custom)}
          <NewProfileDialog onCreated={setChosenId} />
        </nav>
        <div className="min-w-0 flex-1">
          {chosen ? (
            <ProfileForm
              key={chosen.id}
              entry={chosen}
              isDefault={chosen.id === defaultProfileId}
              distros={distros}
              onSetDefault={() =>
                void setDefaultProfile(chosen.id).catch(tellFailure("Couldn't set the default profile"))
              }
              onDuplicate={() => duplicate(chosen)}
              onDelete={() => setDeleting(chosen)}
            />
          ) : (
            <p className="text-muted-foreground">No profiles yet.</p>
          )}
        </div>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogWarning />
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Terminals open with it keep running. New ones can no longer use it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter actionFirst={IS_WINDOWS}>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              tone="danger"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                deleteProfile(id).then(
                  () => setChosenId((current) => (current === id ? null : current)),
                  tellFailure("Couldn't delete the profile"),
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
