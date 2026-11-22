import type { Padding } from '@/lib/padding';
import { shapeReaders } from '@/lib/shape';

/**
 * The terminal profile model as native serializes it (`profiles/model.rs`), with parsers that check
 * each `profiles_list` answer before the app reads it.
 */

export type ProfileEnvironment = { kind: 'native' } | { kind: 'wsl'; distro?: string };

type CursorStyle = 'bar' | 'block' | 'underline';

/** Appearance a profile sets over the global settings; every field is optional. */
export type ProfileAppearance = {
  themeId?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  cursorStyle?: CursorStyle;
  cursorBlink?: boolean;
  scrollback?: number;
  padding?: Padding;
};

export type ProfileTab = {
  icon?: string;
  allowShellTitle: boolean;
};

/** What a pane does when its process exits. */
export type CloseBehavior = 'ask' | 'close' | 'keepOpen';

export type TerminalProfile = {
  id: string;
  name: string;
  executable?: string;
  args: string[];
  /** `null` removes an inherited variable. */
  env: Record<string, string | null>;
  loadUserProfile: boolean;
  startingDirectory?: string;
  environment: ProfileEnvironment;
  appearance: ProfileAppearance;
  tab: ProfileTab;
  closeBehavior: CloseBehavior;
};

/** A listed profile: detected ones come from the machine, custom ones from the user's file. */
export type ProfileEntry = TerminalProfile & {
  source: 'detected' | 'custom';
  hidden: boolean;
};

export type ProfilesList = {
  profiles: ProfileEntry[];
  /** The profile a terminal opens without one: the stored default, or the first visible profile. */
  defaultProfileId: string | null;
};

const { fail, dict, text, flag, count, optional, oneOf, list } =
  shapeReaders('terminal profile data');

const cursorStyle = oneOf<CursorStyle>(['bar', 'block', 'underline']);
const closeBehavior = oneOf<CloseBehavior>(['ask', 'close', 'keepOpen']);
const source = oneOf<ProfileEntry['source']>(['detected', 'custom']);

function environment(value: unknown, path: string): ProfileEnvironment {
  const raw = dict(value, path);
  if (raw.kind === 'native') return { kind: 'native' };
  if (raw.kind === 'wsl')
    return { kind: 'wsl', distro: optional(raw.distro, `${path}.distro`, text) };
  return fail(`${path}.kind`);
}

function appearance(value: unknown, path: string): ProfileAppearance {
  const raw = dict(value, path);
  return {
    themeId: optional(raw.themeId, `${path}.themeId`, text),
    fontFamily: optional(raw.fontFamily, `${path}.fontFamily`, text),
    fontSize: optional(raw.fontSize, `${path}.fontSize`, count),
    fontWeight: optional(raw.fontWeight, `${path}.fontWeight`, text),
    cursorStyle: optional(raw.cursorStyle, `${path}.cursorStyle`, cursorStyle),
    cursorBlink: optional(raw.cursorBlink, `${path}.cursorBlink`, flag),
    scrollback: optional(raw.scrollback, `${path}.scrollback`, count),
    padding: optional(raw.padding, `${path}.padding`, padding),
  };
}

function padding(value: unknown, path: string): Padding {
  const raw = dict(value, path);
  return {
    top: count(raw.top, `${path}.top`),
    right: count(raw.right, `${path}.right`),
    bottom: count(raw.bottom, `${path}.bottom`),
    left: count(raw.left, `${path}.left`),
  };
}

function tab(value: unknown, path: string): ProfileTab {
  const raw = dict(value, path);
  return {
    icon: optional(raw.icon, `${path}.icon`, text),
    allowShellTitle: flag(raw.allowShellTitle, `${path}.allowShellTitle`),
  };
}

function env(value: unknown, path: string): Record<string, string | null> {
  const raw = dict(value, path);
  const vars: Record<string, string | null> = {};
  for (const [name, entry] of Object.entries(raw))
    vars[name] = entry === null ? null : text(entry, `${path}.${name}`);
  return vars;
}

const args = list(text);

function entry(value: unknown, path: string): ProfileEntry {
  const raw = dict(value, path);
  return {
    id: text(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`),
    executable: optional(raw.executable, `${path}.executable`, text),
    args: args(raw.args, `${path}.args`),
    env: env(raw.env, `${path}.env`),
    loadUserProfile: flag(raw.loadUserProfile, `${path}.loadUserProfile`),
    startingDirectory: optional(raw.startingDirectory, `${path}.startingDirectory`, text),
    environment: environment(raw.environment, `${path}.environment`),
    appearance: appearance(raw.appearance, `${path}.appearance`),
    tab: tab(raw.tab, `${path}.tab`),
    closeBehavior: closeBehavior(raw.closeBehavior, `${path}.closeBehavior`),
    source: source(raw.source, `${path}.source`),
    hidden: flag(raw.hidden, `${path}.hidden`),
  };
}

/** The profile a listed entry describes, as `profiles_save` takes it. */
export function toTerminalProfile({
  source: _source,
  hidden: _hidden,
  ...profile
}: ProfileEntry): TerminalProfile {
  return profile;
}

/** Reads a `profiles_list` answer; throws when it does not match the model. */
export function parseProfilesList(value: unknown): ProfilesList {
  const raw = dict(value, 'profilesList');
  if (!Array.isArray(raw.profiles)) return fail('profilesList.profiles');
  const defaultProfileId = raw.defaultProfileId;
  return {
    profiles: raw.profiles.map((profile, index) => entry(profile, `profiles[${index}]`)),
    defaultProfileId:
      defaultProfileId === null ? null : text(defaultProfileId, 'profilesList.defaultProfileId'),
  };
}
