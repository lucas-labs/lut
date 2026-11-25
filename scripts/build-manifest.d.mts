export interface Manifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

export const REQUIRED_PLATFORMS: string[];
export function platformKeys(name: string): string[];
export function buildManifest(options: {
  version: string;
  tag: string;
  repo: string;
  bundles: { name: string; signature: string }[];
  pubDate: string;
}): Manifest;
export function publishedManifest(manifest: Manifest, notes: string, publishedAt: string): Manifest;
