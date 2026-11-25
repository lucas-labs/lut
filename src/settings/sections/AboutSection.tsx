import { AppIcon } from '@/components/AppIcon';
import { Button } from '@/components/ui/button';
import { AlertIcon, LinkIcon } from '@lut/lut-icons';
import { getIdentifier, getName, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { arch, platform } from '@tauri-apps/plugin-os';
import { type ReactNode, useEffect, useState } from 'react';
import { SettingRow } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';
import { UpdatesGroup } from './UpdatesGroup';

/** The package metadata from `Cargo.toml`, via the `app_about` command. */
type AppAbout = { authors: string[]; license: string; repository: string };

const PLATFORM_LABEL: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  freebsd: 'FreeBSD',
};

/** The platform and architecture lut runs on, e.g. "Windows · x86_64". */
function buildLabel(): string {
  try {
    const p = platform();
    return `${PLATFORM_LABEL[p] ?? p} · ${arch()}`;
  } catch {
    return '';
  }
}

/** The repository's GitHub path, e.g. "lucas-labs/lut". */
function repoLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '');
}

export function AboutSection() {
  const [version, setVersion] = useState('');
  const [name, setName] = useState('lut');
  const [identifier, setIdentifier] = useState('');
  const [about, setAbout] = useState<AppAbout | null>(null);
  const [build] = useState(buildLabel);

  useEffect(() => {
    void getVersion().then(setVersion);
    void getName().then(setName);
    void getIdentifier().then(setIdentifier);
    void invoke<AppAbout>('app_about')
      .then(setAbout)
      .catch(() => {});
  }, []);

  const repository = about?.repository ?? '';

  return (
    <div className="flex flex-col">
      <div className="mt-2 flex items-center gap-5 rounded-[10px] border border-border bg-card p-6">
        <AppIcon size={72} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[20px] leading-7 font-semibold">{name}</h1>
          <span className="text-muted-foreground">A terminal built around spaces, profiles and CLI agents</span>
          <span className="font-mono text-[12px] leading-4 text-muted-foreground">Version {version || '—'}</span>
        </div>
      </div>

      <SettingsGroup title="Details">
        <SettingRow title="Build">
          <Value mono>{build ? `${build} · ${version}` : version}</Value>
        </SettingRow>
        <SettingRow title="Bundle ID">
          <Value mono>{identifier}</Value>
        </SettingRow>
        <SettingRow title="License">
          <Value>{about?.license}</Value>
        </SettingRow>
        <SettingRow title="Author">
          <Value>{about?.authors.join(', ')}</Value>
        </SettingRow>
        <SettingRow title="Source code">
          {repository ? (
            <span className="font-mono text-[12px]">
              <Button variant="link" size="inline" onClick={() => void openUrl(repository)}>
                {repoLabel(repository)}
              </Button>
            </span>
          ) : (
            <Value />
          )}
        </SettingRow>
      </SettingsGroup>

      <UpdatesGroup version={version} />

      <div className="mt-5 flex gap-2">
        <Button variant="outline" disabled={!repository} onClick={() => void openUrl(repository)}>
          <LinkIcon size="sm" />
          View on GitHub
        </Button>
        <Button variant="outline" disabled={!repository} onClick={() => void openUrl(`${repository}/issues/new`)}>
          <AlertIcon size="sm" />
          Report an issue
        </Button>
      </div>
    </div>
  );
}

/** A detail's value, on the row's right; a dash until it loads. */
function Value({ children, mono }: { children?: ReactNode; mono?: boolean }) {
  return (
    <span className={mono ? 'font-mono text-[12px] text-muted-foreground' : 'text-[12px] text-muted-foreground'}>
      {children || '—'}
    </span>
  );
}
