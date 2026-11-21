import { Button } from '@/components/ui/button';
import { PaddingInput } from '@/components/ui/padding-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProfileAppearance } from '@/modules/profiles';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { TERMINAL_FONT_SIZES, TERMINAL_PADDING_MAX, TERMINAL_SCROLLBACK_PRESETS } from '@/modules/settings/store';
import { listBuiltinThemes, useTheme } from '@/modules/theme';
import { SettingRow } from '../../components/SettingRow';
import { SettingsGroup } from '../../components/SettingsGroup';
import { TERMINAL_CURSOR_STYLES, TERMINAL_FONT_WEIGHTS } from '../terminalChoices';
import { TextSetting } from './fields';

/** The Select value of "no override": the profile follows the setting. */
const FOLLOW = 'follow';

type Choice = { value: string; label: string };

type OverrideSelectProps = {
  title: string;
  description: string;
  /** The profile's value, as a choice value; undefined follows the setting. */
  value: string | undefined;
  /** The setting it follows, as shown. */
  followed: string;
  choices: readonly Choice[];
  onChange: (value: string | undefined) => void;
};

/** One appearance setting: the profile's own value, or the one it follows. */
function OverrideSelect({ title, description, value, followed, choices, onChange }: OverrideSelectProps) {
  // A value saved outside these choices (a hand-edited file) stays shown.
  const all =
    value === undefined || choices.some((c) => c.value === value) ? choices : [...choices, { value, label: value }];
  return (
    <SettingRow title={title} description={description}>
      {(a11y) => (
        <Select value={value ?? FOLLOW} onValueChange={(v) => onChange(v === FOLLOW ? undefined : v)}>
          <SelectTrigger {...a11y}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FOLLOW}>Default ({followed})</SelectItem>
            {all.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  );
}

const labelOf = (choices: readonly Choice[], value: string) => choices.find((c) => c.value === value)?.label ?? value;

const FONT_SIZES: Choice[] = TERMINAL_FONT_SIZES.map((size) => ({ value: String(size), label: `${size} px` }));
const SCROLLBACKS: Choice[] = TERMINAL_SCROLLBACK_PRESETS.map((lines) => ({
  value: String(lines),
  label: `${lines.toLocaleString()} lines`,
}));
const BLINK: Choice[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

type Props = {
  appearance: ProfileAppearance;
  /** Sets the given fields; an undefined one follows the setting again. */
  onChange: (fields: Partial<ProfileAppearance>) => void;
};

/** The appearance the profile sets over the app and Terminal settings; each unset field follows them. */
export function AppearanceGroup({ appearance, onChange }: Props) {
  const { themeId, customThemes } = useTheme();
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const fontSize = usePreferencesStore((s) => s.terminalFontSize);
  const fontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const cursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const cursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const scrollback = usePreferencesStore((s) => s.terminalScrollback);
  const padding = usePreferencesStore((s) => s.terminalPadding);

  const themes: Choice[] = [...listBuiltinThemes(), ...customThemes].map((t) => ({ value: t.id, label: t.name }));
  const set = <K extends keyof ProfileAppearance>(key: K, value: ProfileAppearance[K]) => onChange({ [key]: value });
  const blink = appearance.cursorBlink === undefined ? undefined : appearance.cursorBlink ? 'on' : 'off';

  return (
    <SettingsGroup title="Appearance">
      <OverrideSelect
        title="Theme"
        description="Colors of this profile's terminals."
        value={appearance.themeId}
        followed={labelOf(themes, themeId)}
        choices={themes}
        onChange={(v) => set('themeId', v)}
      />
      <TextSetting
        title="Font family"
        description="Leave empty to use the Terminal font."
        value={appearance.fontFamily ?? ''}
        placeholder={fontFamily || 'Auto-detect'}
        mono
        onCommit={(v) => set('fontFamily', v.trim() === '' ? undefined : v.trim())}
      />
      <OverrideSelect
        title="Font size"
        description="Terminal text size."
        value={appearance.fontSize === undefined ? undefined : String(appearance.fontSize)}
        followed={`${fontSize} px`}
        choices={FONT_SIZES}
        onChange={(v) => set('fontSize', v === undefined ? undefined : Number(v))}
      />
      <OverrideSelect
        title="Font weight"
        description="Thickness of terminal characters."
        value={appearance.fontWeight}
        followed={labelOf(TERMINAL_FONT_WEIGHTS, fontWeight)}
        choices={TERMINAL_FONT_WEIGHTS}
        onChange={(v) => set('fontWeight', v)}
      />
      <OverrideSelect
        title="Cursor style"
        description="Shape of the terminal cursor."
        value={appearance.cursorStyle}
        followed={labelOf(TERMINAL_CURSOR_STYLES, cursorStyle)}
        choices={TERMINAL_CURSOR_STYLES}
        onChange={(v) => set('cursorStyle', v as ProfileAppearance['cursorStyle'])}
      />
      <OverrideSelect
        title="Cursor blinking"
        description="Blink the terminal cursor."
        value={blink}
        followed={cursorBlink ? 'On' : 'Off'}
        choices={BLINK}
        onChange={(v) => set('cursorBlink', v === undefined ? undefined : v === 'on')}
      />
      <OverrideSelect
        title="Scrollback"
        description="Lines of history kept per terminal."
        value={appearance.scrollback === undefined ? undefined : String(appearance.scrollback)}
        followed={`${scrollback.toLocaleString()} lines`}
        choices={SCROLLBACKS}
        onChange={(v) => set('scrollback', v === undefined ? undefined : Number(v))}
      />
      <SettingRow
        title="Padding"
        description={appearance.padding ? 'Space around the text in each pane (px).' : 'Follows the Terminal padding.'}
      >
        {(a11y) => (
          <div className="flex items-center gap-2">
            {appearance.padding ? (
              <Button variant="ghost" size="sm" onClick={() => set('padding', undefined)}>
                Use default
              </Button>
            ) : null}
            <PaddingInput
              {...a11y}
              value={appearance.padding ?? padding}
              max={TERMINAL_PADDING_MAX}
              onChange={(v) => set('padding', v)}
            />
          </div>
        )}
      </SettingRow>
    </SettingsGroup>
  );
}
