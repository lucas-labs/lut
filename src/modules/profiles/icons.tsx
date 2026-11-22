import { cn } from '@/lib/utils';
import {
  AgentClaudeIcon,
  AgentCodexIcon,
  AgentGeminiIcon,
  AgentGrokIcon,
  AgentPiIcon,
  BookIcon,
  BoxIcon,
  BugIcon,
  CloudIcon,
  CodeIcon,
  FlashIcon,
  FolderIcon,
  GlobeIcon,
  HeartIcon,
  KeyIcon,
  LUT_ICON_SIZES,
  type LutIconComponent,
  type LutIconSize,
  PackageIcon,
  RocketIcon,
  ServerIcon,
  ShellBashIcon,
  ShellCmdIcon,
  ShellDebianIcon,
  ShellFishIcon,
  ShellGitbashIcon,
  ShellLinuxIcon,
  ShellNuIcon,
  ShellPwshIcon,
  ShellUbuntuIcon,
  ShellWslIcon,
  ShellZshIcon,
  SpaceContainerIcon,
  SpaceDatabaseIcon,
  StarIcon,
  TerminalIcon,
  TestIcon,
} from '@lut/lut-icons';
import { useEffect, useState } from 'react';
import { readProfileIcon } from './commands';
import type { TerminalProfile } from './model';

export type BuiltInIcon = {
  /** The value `tab.icon` stores: the icon's name in lut-icons. */
  id: string;
  label: string;
  group: 'shells' | 'general';
  Icon: LutIconComponent;
};

export const BUILT_IN_ICONS: readonly BuiltInIcon[] = [
  { id: 'terminal', label: 'Terminal', group: 'shells', Icon: TerminalIcon },
  { id: 'shell-pwsh', label: 'PowerShell', group: 'shells', Icon: ShellPwshIcon },
  { id: 'shell-cmd', label: 'Command Prompt', group: 'shells', Icon: ShellCmdIcon },
  { id: 'shell-bash', label: 'Bash', group: 'shells', Icon: ShellBashIcon },
  { id: 'shell-gitbash', label: 'Git Bash', group: 'shells', Icon: ShellGitbashIcon },
  { id: 'shell-zsh', label: 'Zsh', group: 'shells', Icon: ShellZshIcon },
  { id: 'shell-fish', label: 'fish', group: 'shells', Icon: ShellFishIcon },
  { id: 'shell-nu', label: 'Nushell', group: 'shells', Icon: ShellNuIcon },
  { id: 'shell-wsl', label: 'WSL', group: 'shells', Icon: ShellWslIcon },
  { id: 'shell-linux', label: 'Linux', group: 'shells', Icon: ShellLinuxIcon },
  { id: 'shell-ubuntu', label: 'Ubuntu', group: 'shells', Icon: ShellUbuntuIcon },
  { id: 'shell-debian', label: 'Debian', group: 'shells', Icon: ShellDebianIcon },
  { id: 'agent-claude', label: 'Claude', group: 'shells', Icon: AgentClaudeIcon },
  { id: 'agent-codex', label: 'Codex', group: 'shells', Icon: AgentCodexIcon },
  { id: 'agent-gemini', label: 'Gemini', group: 'shells', Icon: AgentGeminiIcon },
  { id: 'agent-grok', label: 'Grok', group: 'shells', Icon: AgentGrokIcon },
  { id: 'agent-pi', label: 'Pi', group: 'shells', Icon: AgentPiIcon },
  { id: 'server', label: 'Server', group: 'general', Icon: ServerIcon },
  { id: 'space-database', label: 'Database', group: 'general', Icon: SpaceDatabaseIcon },
  { id: 'space-container', label: 'Container', group: 'general', Icon: SpaceContainerIcon },
  { id: 'package', label: 'Package', group: 'general', Icon: PackageIcon },
  { id: 'box', label: 'Box', group: 'general', Icon: BoxIcon },
  { id: 'cloud', label: 'Cloud', group: 'general', Icon: CloudIcon },
  { id: 'globe', label: 'Web', group: 'general', Icon: GlobeIcon },
  { id: 'rocket', label: 'Rocket', group: 'general', Icon: RocketIcon },
  { id: 'test', label: 'Test', group: 'general', Icon: TestIcon },
  { id: 'bug', label: 'Debug', group: 'general', Icon: BugIcon },
  { id: 'key', label: 'Key', group: 'general', Icon: KeyIcon },
  { id: 'book', label: 'Docs', group: 'general', Icon: BookIcon },
  { id: 'folder', label: 'Folder', group: 'general', Icon: FolderIcon },
  { id: 'code', label: 'Code', group: 'general', Icon: CodeIcon },
  { id: 'star', label: 'Star', group: 'general', Icon: StarIcon },
  { id: 'heart', label: 'Heart', group: 'general', Icon: HeartIcon },
  { id: 'flash', label: 'Flash', group: 'general', Icon: FlashIcon },
];

const BY_ID = new Map(BUILT_IN_ICONS.map((icon) => [icon.id, icon]));
const TERMINAL_ICON = BUILT_IN_ICONS[0];

/** `tab.icon` of a profile whose icon is an image: this prefix, then the name of lut's copy. */
export const IMAGE_ICON_PREFIX = 'image:';

/** Icons of the shells lut detects, by detected id source and by executable name. */
const SHELL_ICONS: Record<string, string> = {
  pwsh: 'shell-pwsh',
  powershell: 'shell-pwsh',
  cmd: 'shell-cmd',
  'git-bash': 'shell-gitbash',
  bash: 'shell-bash',
  zsh: 'shell-zsh',
  fish: 'shell-fish',
  nu: 'shell-nu',
  wsl: 'shell-wsl',
};

const DETECTED_PREFIX = 'detected:';

type IconSource = Pick<TerminalProfile, 'id' | 'executable' | 'environment'>;

/** The icon of a profile with none chosen: its distro's, its shell's, or the terminal. */
export function defaultIconId(profile: IconSource): string {
  if (profile.environment.kind === 'wsl') {
    const distro = profile.environment.distro?.toLowerCase();
    if (!distro) return 'shell-wsl';
    if (distro.startsWith('ubuntu')) return 'shell-ubuntu';
    if (distro.startsWith('debian')) return 'shell-debian';
    return 'shell-linux';
  }
  if (profile.id.startsWith(DETECTED_PREFIX)) {
    const byId = SHELL_ICONS[profile.id.slice(DETECTED_PREFIX.length)];
    if (byId) return byId;
  }
  const program = profile.executable
    ?.split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, '');
  return (program && SHELL_ICONS[program]) || 'terminal';
}

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

/** This window's images, by copy name: a URL, or `null` when the copy could not be read. */
const loading = new Map<string, Promise<string | null>>();
const loaded = new Map<string, string | null>();

function loadImage(name: string): Promise<string | null> {
  let image = loading.get(name);
  if (!image) {
    const type = MEDIA_TYPES[name.slice(name.lastIndexOf('.') + 1)] ?? '';
    image = readProfileIcon(name)
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type })))
      // A missing or unreadable copy shows the profile's default icon, without telling.
      .catch(() => null)
      .then((url) => {
        loaded.set(name, url);
        return url;
      });
    loading.set(name, image);
  }
  return image;
}

/**
 * The URL of an image icon, once read; `null` while reading or when it cannot be shown. An image this window read
 * already shows from the first render.
 */
function useImage(name: string | null): string | null {
  const [image, setImage] = useState(() => (name ? { name, url: loaded.get(name) ?? null } : null));
  useEffect(() => {
    if (!name) return;
    let alive = true;
    void loadImage(name).then((url) => {
      if (alive) setImage({ name, url });
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return image?.name === name ? image.url : null;
}

type ProfileIconProps = {
  profile: IconSource & Pick<TerminalProfile, 'tab'>;
  size?: LutIconSize;
  className?: string;
};

/** A profile's chosen icon, built-in or image, or its default one. */
export function ProfileIcon({ profile, size = 'sm', className }: ProfileIconProps) {
  const chosen = profile.tab.icon;
  const imageName = chosen?.startsWith(IMAGE_ICON_PREFIX) ? chosen.slice(IMAGE_ICON_PREFIX.length) : null;
  const url = useImage(imageName);
  const [broken, setBroken] = useState<string | null>(null);
  if (url && url !== broken) {
    const px = LUT_ICON_SIZES[size].px;
    return (
      <img
        src={url}
        alt=""
        width={px}
        height={px}
        draggable={false}
        onError={() => setBroken(url)}
        className={cn('shrink-0 object-contain', className)}
      />
    );
  }
  const shown = (chosen && !imageName && BY_ID.get(chosen)) || BY_ID.get(defaultIconId(profile)) || TERMINAL_ICON;
  const Icon = shown.Icon;
  return <Icon size={size} className={className} />;
}
