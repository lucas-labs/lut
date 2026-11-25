export interface ListedPackage {
  name: string;
  versions: string[];
  paths: string[];
  author?: string;
  homepage?: string;
}

export const LICENSE_OVERRIDES: Record<string, string>;
export function parseAccepted(toml: string): string[];
export function expressionAccepted(expression: string, accepted: string[]): boolean;
export function readLicenseFile(directory: string): string | null;
export function mitText(author: string | undefined): string;
export function npmNotices(
  list: Record<string, ListedPackage[]>,
  accepted: string[],
  readText?: (directory: string) => string | null,
): { text: string; problems: string[] };
export function noticesFile(rust: string, npm: string): string;
