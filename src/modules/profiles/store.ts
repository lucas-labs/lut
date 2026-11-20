import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { create } from 'zustand';
import { parseProfilesList, type ProfilesList } from './model';

/** Native emits it after any change to the list: an edit, a new default or a detection. */
const PROFILES_CHANGED_EVENT = 'lut:profiles-changed';

type State = {
  /** `null` until the first `profiles_list` answer arrives. */
  list: ProfilesList | null;
};

const useProfilesStore = create<State>(() => ({ list: null }));

let latestRequest = 0;

async function load(): Promise<void> {
  const request = ++latestRequest;
  try {
    const list = parseProfilesList(await invoke('profiles_list'));
    // An older answer arriving late must not replace a newer one.
    if (request === latestRequest) useProfilesStore.setState({ list });
  } catch (error) {
    console.error('[lut] could not list terminal profiles:', error);
  }
}

let watching: Promise<void> | null = null;

/** Keeps this window's list current: subscribes once, then reads it, so no change is missed. */
function watchProfiles(): Promise<void> {
  watching ??= listen(PROFILES_CHANGED_EVENT, () => void load()).then(
    () => load(),
    (error: unknown) => {
      // Not subscribed: a later call tries again.
      watching = null;
      console.error('[lut] could not watch terminal profiles:', error);
      return load();
    },
  );
  return watching;
}

/** The listed profiles, kept current; `null` until they are first read. */
export function useProfiles(): ProfilesList | null {
  useEffect(() => void watchProfiles(), []);
  return useProfilesStore((state) => state.list);
}

export function setDefaultProfile(id: string): Promise<void> {
  return invoke('profiles_set_default', { id });
}
