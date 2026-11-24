/** How full-screen programs (the alternate screen) treat a pane's padding. */
export type FullScreenPadding = {
  /** They fill the pane: its padding goes while they run. */
  readonly fill: boolean;
  /** Programs, by `programName`, that keep the padding anyway. */
  readonly keepPadding: readonly string[];
};

/** Whether deciding for a full-screen program needs to know which programs run in the pane. */
export function needsRunningPrograms(rule: FullScreenPadding): boolean {
  return rule.fill && rule.keepPadding.length > 0;
}

/**
 * Whether a pane in full screen drops its padding. `programs` are what runs in it, by
 * `programName`, or null until they are known: the padding stays meanwhile, so the pane refits once.
 */
export function fillsFullScreen(
  rule: FullScreenPadding,
  programs: readonly string[] | null,
): boolean {
  if (!needsRunningPrograms(rule)) return rule.fill;
  return programs !== null && !programs.some((program) => rule.keepPadding.includes(program));
}
