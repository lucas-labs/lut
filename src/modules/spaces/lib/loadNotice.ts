import { toast } from 'sonner';
import type { SpacesLoad } from './store';

/** Tells the user what lut could not restore from the saved Spaces (E16-03). */
export function reportSpacesLoad({ data, recovered, brokenTabs }: SpacesLoad): void {
  if (recovered) {
    console.warn('[lut] spaces store unusable, started with the defaults:', recovered);
    toast.error('Could not load your Spaces', {
      description: recovered.backupPath
        ? `lut started with the defaults. The old file was kept at ${recovered.backupPath}.`
        : `lut started with the defaults and won't save your Spaces until the file can be read. ${recovered.reason}`,
      duration: Infinity,
    });
  }
  if (brokenTabs.length === 0) return;
  console.warn('[lut] saved tabs skipped:', brokenTabs);
  const spaceName = (id: string) => data.spaces.find((s) => s.id === id)?.name ?? id;
  toast.warning('Some saved tabs could not be restored', {
    description: brokenTabs
      .map(({ spaceId, index, reason }) => `${spaceName(spaceId)}, tab ${index + 1}: ${reason}`)
      .join('; '),
    duration: Infinity,
  });
}
