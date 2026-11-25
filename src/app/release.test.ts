import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  platformKeys,
  publishedManifest,
  REQUIRED_PLATFORMS,
} from '../../scripts/build-manifest.mjs';
import {
  cargoVersions,
  channelHeads,
  compareVersions,
  fileVersions,
  isNewer,
  parseVersion,
  releaseProblem,
  setCargoVersion,
  setPackageVersion,
  versionOfTag,
} from '../../scripts/release.mjs';

const repoFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');
const changedLines = (before: string, after: string) =>
  after.split('\n').filter((line, i) => line !== before.split('\n')[i]).length;

describe('release versions (E25-02)', () => {
  it('accepts only X.Y.Z and X.Y.Z-beta.N', () => {
    expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, beta: null });
    expect(parseVersion('1.2.3-beta.4')).toEqual({ major: 1, minor: 2, patch: 3, beta: 4 });
    for (const bad of [
      '0.1',
      '0.1.0-rc.1',
      '0.1.0-alpha',
      '0.1.0-beta',
      '01.0.0',
      'v0.1.0',
      '0.1.0-beta.01',
    ]) {
      expect(parseVersion(bad), bad).toBeNull();
    }
  });

  it('orders versions as semver does, a beta before its stable release', () => {
    const ordered = [
      '0.0.0',
      '0.1.0-beta.1',
      '0.1.0-beta.2',
      '0.1.0-beta.10',
      '0.1.0',
      '0.1.1',
      '0.2.0',
      '1.0.0',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(
        compareVersions(ordered[i - 1], ordered[i]),
        `${ordered[i - 1]} < ${ordered[i]}`,
      ).toBeLessThan(0);
      expect(compareVersions(ordered[i], ordered[i - 1])).toBeGreaterThan(0);
    }
    expect(compareVersions('0.1.0-beta.1', '0.1.0-beta.1')).toBe(0);
  });

  it('treats a channel with no manifest yet as older than any release', () => {
    expect(isNewer('0.1.0-beta.1', null)).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
  });

  it('reads the version of a release tag', () => {
    expect(versionOfTag('v0.1.0-beta.1')).toBe('0.1.0-beta.1');
    expect(versionOfTag('0.1.0')).toBeNull();
    expect(versionOfTag('v0.1.0-rc.1')).toBeNull();
    expect(versionOfTag('updater')).toBeNull();
  });

  it('refuses a release that is not newer than the current version', () => {
    expect(releaseProblem('0.1.0', '0.0.0')).toBeNull();
    expect(releaseProblem('0.0.0', '0.0.0')).toMatch(/not newer/);
    expect(releaseProblem('0.1.0-beta.1', '0.1.0')).toMatch(/not newer/);
    expect(releaseProblem('0.2.0-rc.1', '0.1.0')).toMatch(/not X\.Y\.Z/);
  });

  const cargoFixture = [
    '[package]',
    'name = "lut"',
    'version = "0.1.0"',
    'edition = "2021"',
    '',
    '[workspace]',
    'members = ["crates/*"]',
    '',
    '[workspace.package]',
    'version = "0.1.0"',
    '',
    '[dependencies.serde]',
    'version = "1"',
    '',
  ].join('\n');
  const packageFixture =
    '{\n  "name": "lut",\n  "version": "0.1.0",\n  "engines": { "node": ">=22" }\n}\n';

  it('writes the version into the two Cargo.toml tables and package.json, and nothing else', () => {
    const updated = setCargoVersion(cargoFixture, '0.2.0-beta.1');
    expect(cargoVersions(updated)).toEqual(['0.2.0-beta.1', '0.2.0-beta.1']);
    expect(changedLines(cargoFixture, updated)).toBe(2);
    expect(updated).toContain('[dependencies.serde]\nversion = "1"');

    const written = setPackageVersion(packageFixture, '0.2.0-beta.1');
    expect(JSON.parse(written).version).toBe('0.2.0-beta.1');
    expect(changedLines(packageFixture, written)).toBe(1);
  });

  it('checks that the files agree', () => {
    expect(fileVersions(packageFixture, cargoFixture)).toEqual({ version: '0.1.0' });
    expect(
      fileVersions(setPackageVersion(packageFixture, '0.2.0'), cargoFixture).mismatch,
    ).toMatchObject({
      'package.json': '0.2.0',
      'Cargo.toml [package]': '0.1.0',
    });
  });

  it("agrees with lut's own files, whatever version they hold", () => {
    const cargo = repoFile('src-tauri/Cargo.toml');
    const json = repoFile('package.json');
    const { version, mismatch } = fileVersions(json, cargo);
    expect(mismatch).toBeUndefined();
    expect(parseVersion(version ?? '')).not.toBeNull();
    expect(changedLines(cargo, setCargoVersion(cargo, '999.0.0'))).toBe(2);
    expect(changedLines(json, setPackageVersion(json, '999.0.0'))).toBe(1);
  });

  it('names the release each channel serves', () => {
    expect(
      channelHeads([
        'updater',
        'v0.1.0-beta.1',
        'v0.1.0',
        'v0.2.0-beta.3',
        'v0.2.0-beta.10',
        'v0.0.9',
      ]),
    ).toEqual({
      stable: 'v0.1.0',
      beta: 'v0.2.0-beta.10',
    });
    expect(channelHeads(['v0.1.0-beta.1'])).toEqual({ stable: null, beta: 'v0.1.0-beta.1' });
    expect(channelHeads(['v0.2.0', 'v0.2.0-beta.4'])).toEqual({ stable: 'v0.2.0', beta: 'v0.2.0' });
    expect(channelHeads([])).toEqual({ stable: null, beta: null });
  });

  it('has Tauri read the version from package.json', () => {
    expect(JSON.parse(repoFile('src-tauri/tauri.conf.json')).version).toBe('../package.json');
  });
});

describe('the updater manifest (E25-02)', () => {
  const version = '0.1.0-beta.1';
  const names = [
    `lut_${version}_x64-setup.exe`,
    `lut_${version}_aarch64.app.tar.gz`,
    `lut_${version}_x64.app.tar.gz`,
    `lut_${version}_amd64.AppImage`,
    `lut_${version}_amd64.deb`,
    `lut-${version}-1.x86_64.rpm`,
    `lut_${version}_aarch64.AppImage`,
    `lut_${version}_arm64.deb`,
    `lut-${version}-1.aarch64.rpm`,
  ];
  const bundles = names.map((name) => ({ name, signature: `sig of ${name}\n` }));
  const build = (list = bundles) =>
    buildManifest({
      version,
      tag: `v${version}`,
      repo: 'lucas-labs/lut',
      bundles: list,
      pubDate: '2026-11-25T00:00:00Z',
    });

  it('names the keys the updater looks for, from the bundle names', () => {
    expect(platformKeys(`lut_${version}_x64-setup.exe`)).toEqual([
      'windows-x86_64',
      'windows-x86_64-nsis',
    ]);
    expect(platformKeys(`lut_${version}_aarch64.app.tar.gz`)).toEqual([
      'darwin-aarch64',
      'darwin-aarch64-app',
    ]);
    expect(platformKeys(`lut_${version}_amd64.AppImage`)).toEqual([
      'linux-x86_64',
      'linux-x86_64-appimage',
    ]);
    expect(platformKeys(`lut-${version}-1.aarch64.rpm`)).toEqual(['linux-aarch64-rpm']);
    expect(platformKeys(`lut_${version}_aarch64.dmg`)).toEqual([]);
  });

  it('serves every platform from the release, each with its signature', () => {
    const manifest = build();
    expect(Object.keys(manifest.platforms).sort()).toEqual([...REQUIRED_PLATFORMS].sort());
    expect(manifest.platforms['linux-x86_64']).toEqual({
      signature: `sig of lut_${version}_amd64.AppImage`,
      url: `https://github.com/lucas-labs/lut/releases/download/v${version}/lut_${version}_amd64.AppImage`,
    });
    expect(manifest.version).toBe(version);
  });

  it('fails when a platform has no bundle, or two bundles claim one', () => {
    expect(() => build(bundles.filter((b) => !b.name.endsWith('.rpm')))).toThrow(
      /linux-x86_64-rpm/,
    );
    expect(() =>
      build([...bundles, { name: `lut_${version}_x64.AppImage`, signature: 'x' }]),
    ).toThrow(/linux-x86_64 is served by both/);
  });

  it('takes the published release notes and date', () => {
    const published = publishedManifest(build(), '  Faster tabs.\n', '2026-11-26T10:00:00Z');
    expect(published).toMatchObject({ notes: 'Faster tabs.', pub_date: '2026-11-26T10:00:00Z' });
  });
});
