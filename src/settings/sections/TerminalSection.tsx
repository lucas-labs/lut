import { Input } from '@/components/ui/input';
import { PaddingInput } from '@/components/ui/padding-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { IS_MAC } from '@/modules/platform';
import { type ProfileEntry, type ProfilesList, setDefaultProfile, useProfiles } from '@/modules/profiles';
import { usePreferencesStore } from '@/modules/settings/preferences';
import {
  coerceTerminalRenderer,
  setConfirmCloseRunningTerminal,
  setDefaultWorkspaceEnv,
  setTerminalCursorBlink,
  setTerminalCursorStyle,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalMacOptionAsAlt,
  setTerminalPadding,
  setTerminalRenderer,
  setTerminalScreenReader,
  setTerminalScrollback,
  setTerminalScrollSpeed,
  setTerminalSubpixelText,
  TERMINAL_FONT_SIZES,
  TERMINAL_PADDING_MAX,
  TERMINAL_SCROLLBACK_PRESETS,
} from '@/modules/settings/store';
import { subpixelTextUnavailable } from '@/modules/terminal/ghostty/gpu/subpixelText';
import { coerceMacOptionAsAlt } from '@/modules/terminal/ghostty/input/macOptionAsAlt';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SectionHeader } from '../components/SectionHeader';
import { SettingRow } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';
import { TERMINAL_CURSOR_STYLES, TERMINAL_FONT_WEIGHTS } from './terminalChoices';

const LETTER_SPACINGS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;
const OPTION_AS_ALT_CHOICES = [
  ['off', 'Off'],
  ['left', 'Left Option'],
  ['right', 'Right Option'],
  ['both', 'Both'],
] as const;
const SCROLL_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
const SUBPIXEL_TEXT_DESCRIPTION =
  'Draw terminal text with ClearType-style subpixel antialiasing: sharper on LCD screens, with colour fringes on OLED or rotated ones. Follows the ClearType colour order on Windows.';

type ShellInfo = { name: string; path: string; integrated: boolean };

const NO_PROFILES: ProfilesList = { profiles: [], defaultProfileId: null };

/** The profiles the default can be set to: the visible ones, and the current default even if hidden. */
function defaultChoices({ profiles, defaultProfileId }: ProfilesList): ProfileEntry[] {
  return profiles.filter((profile) => !profile.hidden || profile.id === defaultProfileId);
}

function chooseDefaultProfile(id: string) {
  setDefaultProfile(id).catch((error: unknown) => {
    toast.error("Couldn't set the default profile", {
      description:
        typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error),
    });
  });
}

export function TerminalSection() {
  const terminalRenderer = usePreferencesStore((s) => s.terminalRenderer);
  const terminalSubpixelText = usePreferencesStore((s) => s.terminalSubpixelText);
  const terminalScreenReader = usePreferencesStore((s) => s.terminalScreenReader);
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalFontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const defaultWorkspaceEnv = usePreferencesStore((s) => s.defaultWorkspaceEnv);
  const terminalLetterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);
  const terminalPadding = usePreferencesStore((s) => s.terminalPadding);
  const terminalScrollSpeed = usePreferencesStore((s) => s.terminalScrollSpeed);
  const terminalMacOptionAsAlt = usePreferencesStore((s) => s.terminalMacOptionAsAlt);
  const confirmCloseRunningTerminal = usePreferencesStore((s) => s.confirmCloseRunningTerminal);
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const profiles = useProfiles() ?? NO_PROFILES;
  const [wslDistros, setWslDistros] = useState<{ name: string }[]>([]);
  // Why this webview and renderer cannot draw subpixel text; unknown until the GPU answers.
  const [subpixelUnavailable, setSubpixelUnavailable] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void invoke<ShellInfo[]>('pty_list_shells')
      .then(setShells)
      .catch(() => {});
    void invoke<{ name: string }[]>('wsl_list_distros')
      .then(setWslDistros)
      .catch(() => {});
  }, []);

  const defaultProfile = profiles.profiles.find((p) => p.id === profiles.defaultProfileId);

  useEffect(() => {
    let current = true;
    void subpixelTextUnavailable(terminalRenderer).then((reason) => {
      if (current) setSubpixelUnavailable(reason);
    });
    return () => {
      current = false;
    };
  }, [terminalRenderer]);

  return (
    <div className="flex flex-col">
      <SectionHeader title="Terminal" description="Rendering, text, shell, and input." />

      <SettingsGroup title="Rendering">
        <SettingRow
          title="Terminal renderer"
          description="Automatic and WebGPU draw with WebGPU and fall back to WebGL where the webview has none. WebGL is a compatibility mode: it uses more CPU and holds at most 12 visible panes per window. Applies to new terminals."
        >
          {(a11y) => (
            <Select
              value={terminalRenderer}
              onValueChange={(value) => void setTerminalRenderer(coerceTerminalRenderer(value))}
            >
              <SelectTrigger {...a11y}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic</SelectItem>
                <SelectItem value="webgpu">WebGPU</SelectItem>
                <SelectItem value="webgl">WebGL</SelectItem>
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        <SettingRow
          title="Subpixel text"
          description={
            subpixelUnavailable ? `${SUBPIXEL_TEXT_DESCRIPTION} ${subpixelUnavailable}` : SUBPIXEL_TEXT_DESCRIPTION
          }
        >
          {(a11y) => (
            <Switch
              {...a11y}
              checked={terminalSubpixelText}
              // An enabled preference can always be turned off: WebGPU terminals opened before the
              // renderer changed to WebGL still draw it.
              disabled={subpixelUnavailable !== null && !terminalSubpixelText}
              onCheckedChange={(v) => void setTerminalSubpixelText(v)}
            />
          )}
        </SettingRow>
        <SettingRow
          title="Screen reader support"
          description="Expose terminal output as accessible text. Page Up and Page Down browse history when the output region is focused."
        >
          {(a11y) => (
            <Switch
              {...a11y}
              checked={terminalScreenReader}
              onCheckedChange={(value) => void setTerminalScreenReader(value)}
            />
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Text">
        <FontFamilyInput value={terminalFontFamily} onCommit={(v) => void setTerminalFontFamily(v)} />
        <SettingRow title="Font weight" description="Thickness of terminal characters">
          {(a11y) => (
            <Select value={terminalFontWeight} onValueChange={(v) => void setTerminalFontWeight(v)}>
              <SelectTrigger {...a11y} value={terminalFontWeight}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_FONT_WEIGHTS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        <SettingRow title="Font size" description="Terminal text size.">
          {(a11y) => (
            <Select value={String(terminalFontSize)} onValueChange={(v) => void setTerminalFontSize(Number(v))}>
              <SelectTrigger {...a11y} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        <SettingRow
          title="Letter spacing"
          description="Extra horizontal space between characters (px). Use negative values to tighten Nerd Fonts."
        >
          {(a11y) => (
            <Select
              value={String(terminalLetterSpacing)}
              onValueChange={(v) => void setTerminalLetterSpacing(Number(v))}
            >
              <SelectTrigger {...a11y} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LETTER_SPACINGS.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {v > 0 ? `+${v}` : v} px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        <SettingRow
          title="Padding"
          description="Space around the text in each pane (px). Full-screen programs fill the pane."
        >
          {(a11y) => (
            <PaddingInput
              {...a11y}
              value={terminalPadding}
              max={TERMINAL_PADDING_MAX}
              onChange={(v) => void setTerminalPadding(v)}
            />
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Cursor">
        <SettingRow
          title="Cursor blinking"
          description="Blink the terminal cursor, which marks the active pane. On by default."
        >
          {(a11y) => (
            <Switch {...a11y} checked={terminalCursorBlink} onCheckedChange={(v) => void setTerminalCursorBlink(v)} />
          )}
        </SettingRow>
        <SettingRow title="Cursor style" description="Shape of the terminal cursor.">
          {(a11y) => (
            <Select value={terminalCursorStyle} onValueChange={(v) => void setTerminalCursorStyle(v)}>
              <SelectTrigger {...a11y} value={terminalCursorStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_CURSOR_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Shell">
        <SettingRow
          title="Default profile"
          description={
            shells.find((s) => s.path === defaultProfile?.executable)?.integrated === false
              ? 'Command blocks and directory tracking are unavailable for this shell.'
              : 'Profile new terminal tabs open with. Existing tabs keep theirs.'
          }
        >
          {(a11y) => (
            <Select value={profiles.defaultProfileId ?? ''} onValueChange={chooseDefaultProfile}>
              <SelectTrigger {...a11y} value={profiles.defaultProfileId ?? ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {defaultChoices(profiles).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        {(wslDistros.length > 0 || defaultWorkspaceEnv !== 'local') && (
          <SettingRow
            title="Workspace environment"
            description="Where new spaces run: Windows or a WSL distro. Existing spaces keep theirs; switch any from the status bar."
          >
            {(a11y) => (
              <Select value={defaultWorkspaceEnv} onValueChange={(v) => void setDefaultWorkspaceEnv(v)}>
                <SelectTrigger {...a11y} value={defaultWorkspaceEnv}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Windows</SelectItem>
                  {wslDistros.map((d) => (
                    <SelectItem key={d.name} value={`wsl:${d.name}`}>
                      WSL: {d.name}
                    </SelectItem>
                  ))}
                  {defaultWorkspaceEnv.startsWith('wsl:') &&
                    !wslDistros.some((d) => `wsl:${d.name}` === defaultWorkspaceEnv) && (
                      <SelectItem value={defaultWorkspaceEnv}>
                        {defaultWorkspaceEnv.slice('wsl:'.length)} (unavailable)
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            )}
          </SettingRow>
        )}
        <SettingRow
          title="Confirm before killing a running process"
          description="Ask before closing a terminal tab or quitting while a command is still running. Unsaved editor changes are always confirmed."
        >
          {(a11y) => (
            <Switch
              {...a11y}
              checked={confirmCloseRunningTerminal}
              onCheckedChange={(v) => void setConfirmCloseRunningTerminal(v)}
            />
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Scrolling & input">
        <SettingRow
          title="Scrollback"
          description="Lines of history kept per terminal. Higher uses more RAM (~3 KB / line)."
        >
          {(a11y) => (
            <Select value={String(terminalScrollback)} onValueChange={(v) => void setTerminalScrollback(Number(v))}>
              <SelectTrigger {...a11y} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_SCROLLBACK_PRESETS.map((lines) => (
                  <SelectItem key={lines} value={String(lines)}>
                    {lines.toLocaleString()} lines
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        <SettingRow
          title="Scroll speed"
          description="Lines per wheel or trackpad movement, for history and for programs that read the mouse wheel."
        >
          {(a11y) => (
            <Select value={String(terminalScrollSpeed)} onValueChange={(v) => void setTerminalScrollSpeed(Number(v))}>
              <SelectTrigger {...a11y} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(SCROLL_SPEEDS.some((v) => v === terminalScrollSpeed)
                  ? SCROLL_SPEEDS
                  : [...SCROLL_SPEEDS, terminalScrollSpeed].sort((a, b) => a - b)
                ).map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {v}x
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        {IS_MAC && (
          <SettingRow
            title="Option as Alt"
            description="Send Option as Alt (Meta) so readline and editor shortcuts like Option+B and Option+F work. Off types the characters Option produces. Keys are matched by their position on a US keyboard, so layouts that type other letters on those keys are not followed."
          >
            {(a11y) => (
              <Select
                value={terminalMacOptionAsAlt}
                onValueChange={(v) => void setTerminalMacOptionAsAlt(coerceMacOptionAsAlt(v))}
              >
                <SelectTrigger {...a11y} size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTION_AS_ALT_CHOICES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SettingRow>
        )}
      </SettingsGroup>
    </div>
  );
}

function FontFamilyInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  // A change saved elsewhere replaces the draft.
  const [draftOf, setDraftOf] = useState(value);
  if (value !== draftOf) {
    setDraftOf(value);
    setDraft(value);
  }

  // Commit (and trim) only on blur/Enter so a trailing space can be typed
  // mid-edit, e.g. "JetBrains Mono ".
  const commit = () => {
    const next = draft.trim();
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <SettingRow
      title="Font family"
      description='Terminal font (e.g. "CaskaydiaCove Nerd Font Mono"). Icons render without a Nerd Font; leave blank to use an installed one when found.'
    >
      {(a11y) => (
        <Input
          {...a11y}
          type="text"
          value={draft}
          placeholder="Auto-detect"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-55 font-mono"
        />
      )}
    </SettingRow>
  );
}
