export interface Version {
  major: number;
  minor: number;
  patch: number;
  beta: number | null;
}

export function parseVersion(text: string): Version | null;
export function compareVersions(a: string, b: string): number;
export function isNewer(version: string, than: string | null): boolean;
export function versionOfTag(tag: string): string | null;
export function cargoVersions(toml: string): [string, string];
export function setCargoVersion(toml: string, version: string): string;
export function setPackageVersion(json: string, version: string): string;
export function fileVersions(
  packageJson: string,
  cargoToml: string,
):
  | { version: string; mismatch?: undefined }
  | { version?: undefined; mismatch: Record<string, string> };
export function releaseProblem(version: string, current: string): string | null;
export function channelHeads(tags: string[]): { stable: string | null; beta: string | null };
