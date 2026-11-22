import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { IS_WINDOWS } from '@/modules/platform';
import type { CloseBehavior, ProfileEntry, ProfileEnvironment } from '@/modules/profiles';
import { CopyIcon, DeleteIcon } from '@lut/lut-icons';
import { SettingRow } from '../../components/SettingRow';
import { SettingsGroup } from '../../components/SettingsGroup';
import { AppearanceGroup } from './AppearanceGroup';
import { FieldError, ReadOnlySetting, TextSetting } from './fields';
import { IconPicker } from './IconPicker';
import { ArgsEditor, EnvEditor } from './ListEditors';
import { useProfileChanges } from './useProfileChanges';

const CLOSE_BEHAVIORS: { value: CloseBehavior; label: string }[] = [
  { value: 'close', label: 'Close the pane' },
  { value: 'ask', label: 'Ask' },
  { value: 'keepOpen', label: 'Keep it open' },
];

/** The Select value of WSL's default distro. */
const DEFAULT_DISTRO = 'default';

const isPowerShell = (executable: string | undefined) =>
  executable !== undefined && /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(executable.trim());

const environmentLabel = (environment: ProfileEnvironment) =>
  environment.kind === 'native' ? 'Native' : `WSL · ${environment.distro ?? 'default distro'}`;

/** What the profile runs, as one line. */
function commandLine({ executable, args, environment }: ProfileEntry): string {
  const program =
    executable ?? (environment.kind === 'wsl' ? `${environment.distro ?? 'WSL'} login shell` : 'No program');
  return [program, ...args].join(' ');
}

type Props = {
  entry: ProfileEntry;
  isDefault: boolean;
  /** The distros of the detected WSL profiles, for a custom profile's environment. */
  distros: string[];
  onSetDefault: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

/**
 * The chosen profile, each change saved as it is made. A custom profile edits every field; a detected one shows
 * what it runs and edits only its visibility, appearance and tab title.
 */
export function ProfileForm({ entry, isDefault, distros, onSetDefault, onDuplicate, onDelete }: Props) {
  const { errors, change } = useProfileChanges(entry);
  const custom = entry.source === 'custom';

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <IconPicker entry={entry} onChoose={(icon) => void change((current) => ({ tab: { ...current.tab, icon } }))} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-[15px] font-semibold">{entry.name}</h2>
          <code className="truncate font-mono text-[12px] text-muted-foreground">{commandLine(entry)}</code>
        </div>
        {isDefault ? (
          <Badge variant="soft">Default</Badge>
        ) : (
          <Button variant="outline" onClick={onSetDefault}>
            Set as default
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Duplicate profile"
          title="Duplicate profile"
          onClick={onDuplicate}
        >
          <CopyIcon size="sm" />
        </Button>
        {custom ? (
          <Button variant="ghost" size="icon" aria-label="Delete profile" title="Delete profile" onClick={onDelete}>
            <DeleteIcon size="sm" />
          </Button>
        ) : null}
      </div>
      <div className="mt-1.5 px-1 empty:hidden">
        <FieldError code={errors['tab.icon']} />
      </div>

      {custom ? (
        <>
          <SettingsGroup title="Launch">
            <TextSetting
              title="Name"
              description="Shown in the menus and on tabs."
              value={entry.name}
              error={errors.name}
              onCommit={(name) => change({ name: name.trim() })}
            />
            <TextSetting
              title="Executable"
              description="The program to run."
              value={entry.executable ?? ''}
              error={errors.executable}
              placeholder={entry.environment.kind === 'wsl' ? 'Login shell' : undefined}
              mono
              onCommit={(executable) => change({ executable: executable.trim() || undefined })}
            />
            <ArgsEditor args={entry.args} onCommit={(args) => change({ args })} />
            <TextSetting
              title="Starting directory"
              description="Where the program starts when the tab has no folder of its own."
              value={entry.startingDirectory ?? ''}
              mono
              onCommit={(dir) => change({ startingDirectory: dir.trim() || undefined })}
            />
            {IS_WINDOWS || entry.environment.kind === 'wsl' ? (
              <EnvironmentSetting
                environment={entry.environment}
                distros={distros}
                onChange={(environment) => change({ environment })}
              />
            ) : null}
            {isPowerShell(entry.executable) ? (
              <SettingRow title="Load PowerShell profile" description="Run the user's profile script on start.">
                {(a11y) => (
                  <Switch
                    {...a11y}
                    checked={entry.loadUserProfile}
                    onCheckedChange={(loadUserProfile) => change({ loadUserProfile })}
                  />
                )}
              </SettingRow>
            ) : null}
          </SettingsGroup>
          <SettingsGroup title="Environment">
            <EnvEditor env={entry.env} errors={errors} onCommit={(env) => change({ env })} />
          </SettingsGroup>
        </>
      ) : (
        <SettingsGroup title="Launch">
          <ReadOnlySetting
            title="Executable"
            description="Found on this machine."
            value={entry.executable ?? commandLine(entry)}
          />
          {entry.args.length > 0 ? <ReadOnlySetting title="Arguments" value={entry.args.join(' ')} /> : null}
          <ReadOnlySetting title="Environment" value={environmentLabel(entry.environment)} />
        </SettingsGroup>
      )}

      <AppearanceGroup
        appearance={entry.appearance}
        onChange={(fields) =>
          change((current) => ({
            appearance: {
              ...current.appearance,
              ...(typeof fields === 'function' ? fields(current.appearance) : fields),
            },
          }))
        }
      />

      <SettingsGroup title="Behavior">
        {custom ? (
          <SettingRow title="When the program exits" description="What the pane does.">
            {(a11y) => (
              <Select
                value={entry.closeBehavior}
                onValueChange={(closeBehavior) => change({ closeBehavior: closeBehavior as CloseBehavior })}
              >
                <SelectTrigger {...a11y}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLOSE_BEHAVIORS.map((behavior) => (
                    <SelectItem key={behavior.value} value={behavior.value}>
                      {behavior.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SettingRow>
        ) : (
          <ReadOnlySetting
            title="When the program exits"
            value={CLOSE_BEHAVIORS.find((b) => b.value === entry.closeBehavior)?.label ?? entry.closeBehavior}
          />
        )}
        <SettingRow title="Shell sets the tab title" description="Titles the program sends rename its tab.">
          {(a11y) => (
            <Switch
              {...a11y}
              checked={entry.tab.allowShellTitle}
              onCheckedChange={(allowShellTitle) => change((current) => ({ tab: { ...current.tab, allowShellTitle } }))}
            />
          )}
        </SettingRow>
        {custom ? null : (
          <SettingRow title="Hidden" description="Left out of the new-tab and split menus and the palette.">
            {(a11y) => <Switch {...a11y} checked={entry.hidden} onCheckedChange={(hidden) => change({ hidden })} />}
          </SettingRow>
        )}
      </SettingsGroup>
    </div>
  );
}

type EnvironmentProps = {
  environment: ProfileEnvironment;
  distros: string[];
  onChange: (environment: ProfileEnvironment) => void;
};

/** Native, or WSL with its distro. */
function EnvironmentSetting({ environment, distros, onChange }: EnvironmentProps) {
  const distro = environment.kind === 'wsl' ? environment.distro : undefined;
  const choices = distro && !distros.includes(distro) ? [...distros, distro] : distros;
  return (
    <SettingRow title="Environment" description="Where the program runs.">
      {(a11y) => (
        <div className="flex items-center gap-2">
          <Select
            value={environment.kind}
            onValueChange={(kind) => onChange(kind === 'wsl' ? { kind: 'wsl' } : { kind: 'native' })}
          >
            <SelectTrigger {...a11y}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">Native</SelectItem>
              <SelectItem value="wsl">WSL</SelectItem>
            </SelectContent>
          </Select>
          {environment.kind === 'wsl' ? (
            <Select
              value={distro ?? DEFAULT_DISTRO}
              onValueChange={(v) => onChange({ kind: 'wsl', distro: v === DEFAULT_DISTRO ? undefined : v })}
            >
              <SelectTrigger aria-label="WSL distro">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_DISTRO}>Default distro</SelectItem>
                {choices.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      )}
    </SettingRow>
  );
}
