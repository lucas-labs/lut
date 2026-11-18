import { useEffect } from 'react';
import { toast } from 'sonner';
import { takeProfilesLoadError } from './loadError';

/** Tells the user, once, that their profiles file was unusable and lut started without it. */
export function useProfilesLoadNotice(): void {
  useEffect(() => {
    let disposed = false;
    void takeProfilesLoadError().then((error) => {
      if (disposed || !error) return;
      toast.error('Could not load your terminal profiles', {
        description: error.backupPath
          ? `lut started with the defaults. The old file was kept at ${error.backupPath}.`
          : `lut started with the defaults. ${error.reason}`,
        duration: Infinity,
      });
    });
    return () => {
      disposed = true;
    };
  }, []);
}
