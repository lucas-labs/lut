import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FORMATTER_LABELS, FORMATTERS } from '@/modules/editor/lib/externalFormat';
import { EXPOSED_LANGUAGES } from '@/modules/editor/lib/languageDefinitions';
import { usePreferencesStore } from '@/modules/settings/preferences';
import {
  AUTO_SAVE_DELAY_MAX,
  AUTO_SAVE_DELAY_MIN,
  clampAutoSaveDelay,
  clampEditorWordWrapColumn,
  EDITOR_FONT_SIZES,
  EDITOR_WORD_WRAP_COLUMN_MAX,
  EDITOR_WORD_WRAP_COLUMN_MIN,
  type EditorFormatter,
  setEditorAutoSave,
  setEditorAutoSaveDelay,
  setEditorCustomFormatCommand,
  setEditorFontSize,
  setEditorFormatOnSave,
  setEditorFormatter,
  setEditorFormatterByLang,
  setEditorWordWrap,
  setEditorWordWrapColumn,
  setVimMode,
} from '@/modules/settings/store';
import { useShortcutHint } from '@/modules/shortcuts';
import { PlusIcon, XIcon } from '@lut/lut-icons';
import { useState } from 'react';
import { LspServersGroup } from '../components/LspServersGroup';
import { NumberControl } from '../components/NumberControl';
import { SectionHeader } from '../components/SectionHeader';
import { SettingExpander, SettingRow, type SettingRowA11y } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';

const AUTO_SAVE_STEP = 100;

export function EditorSection() {
  const saveHint = useShortcutHint('editor.save');
  const editorFontSize = usePreferencesStore((s) => s.editorFontSize);
  const vimMode = usePreferencesStore((s) => s.vimMode);
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const editorWordWrapColumn = usePreferencesStore((s) => s.editorWordWrapColumn);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const editorAutoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);
  const editorFormatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
  const editorFormatter = usePreferencesStore((s) => s.editorFormatter);
  const editorFormatterByLang = usePreferencesStore((s) => s.editorFormatterByLang);
  const usesCustom = editorFormatter === 'custom' || Object.values(editorFormatterByLang).includes('custom');

  return (
    <div className="flex flex-col">
      <SectionHeader title="Editor" description="Editing behavior, saving, and language servers." />

      <SettingsGroup title="Appearance">
        <SettingRow title="Font size" description="Code editor text size.">
          {(a11y) => (
            <Select value={String(editorFontSize)} onValueChange={(v) => void setEditorFontSize(Number(v))}>
              <SelectTrigger {...a11y} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDITOR_FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Editing">
        <SettingRow title="Vim mode" description="Enable Vim keybindings in the code editor.">
          {(a11y) => <Switch {...a11y} checked={vimMode} onCheckedChange={(v) => void setVimMode(v)} />}
        </SettingRow>
        <SettingExpander
          open={editorWordWrap}
          setting={
            <SettingRow title="Word wrap" description="Wrap long lines instead of scrolling horizontally.">
              {(a11y) => (
                <Switch {...a11y} checked={editorWordWrap} onCheckedChange={(v) => void setEditorWordWrap(v)} />
              )}
            </SettingRow>
          }
        >
          <SettingRow
            title="Wrap column"
            description="Soft-wrap at this column, or earlier when the editor is narrower."
          >
            {(a11y) => (
              <NumberControl
                {...a11y}
                value={editorWordWrapColumn}
                min={EDITOR_WORD_WRAP_COLUMN_MIN}
                max={EDITOR_WORD_WRAP_COLUMN_MAX}
                step={1}
                clamp={clampEditorWordWrapColumn}
                onChange={(v) => void setEditorWordWrapColumn(v)}
                unit="columns"
              />
            )}
          </SettingRow>
        </SettingExpander>
      </SettingsGroup>

      <SettingsGroup title="Saving">
        <SettingExpander
          open={editorAutoSave}
          setting={
            <SettingRow
              title="Auto save"
              description="Automatically save files after a delay when changes are detected."
            >
              {(a11y) => (
                <Switch {...a11y} checked={editorAutoSave} onCheckedChange={(v) => void setEditorAutoSave(v)} />
              )}
            </SettingRow>
          }
        >
          <SettingRow title="Auto save delay" description="Delay before unsaved changes are saved automatically.">
            {(a11y) => (
              <NumberControl
                {...a11y}
                value={editorAutoSaveDelay}
                min={AUTO_SAVE_DELAY_MIN}
                max={AUTO_SAVE_DELAY_MAX}
                step={AUTO_SAVE_STEP}
                clamp={clampAutoSaveDelay}
                onChange={(v) => void setEditorAutoSaveDelay(v)}
                unit="ms"
              />
            )}
          </SettingRow>
        </SettingExpander>
        <SettingExpander
          open={editorFormatOnSave}
          setting={
            <SettingRow
              title="Format on save"
              description={`Format the file on explicit save (${saveHint} / :w) with the formatter below.`}
            >
              {(a11y) => (
                <Switch {...a11y} checked={editorFormatOnSave} onCheckedChange={(v) => void setEditorFormatOnSave(v)} />
              )}
            </SettingRow>
          }
        >
          <SettingRow
            title="Formatter"
            description="Language server formats the buffer before writing; external tools run on the saved file from your PATH."
          >
            {(a11y) => (
              <FormatterSelect {...a11y} value={editorFormatter} onChange={(v) => void setEditorFormatter(v)} />
            )}
          </SettingRow>
          <FormatterOverrides />
          {usesCustom && <CustomFormatCommandInput />}
        </SettingExpander>
      </SettingsGroup>

      <LspServersGroup />
    </div>
  );
}

const FORMATTER_OPTIONS: EditorFormatter[] = ['lsp', ...(Object.keys(FORMATTERS) as EditorFormatter[]), 'custom'];

type FormatterSelectProps = Partial<SettingRowA11y> & {
  value: EditorFormatter;
  onChange: (v: EditorFormatter) => void;
  'aria-label'?: string;
};

function FormatterSelect({ value, onChange, ...a11y }: FormatterSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as EditorFormatter)}>
      <SelectTrigger {...a11y}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FORMATTER_OPTIONS.map((id) => (
          <SelectItem key={id} value={id}>
            {FORMATTER_LABELS[id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomFormatCommandInput() {
  const stored = usePreferencesStore((s) => s.editorCustomFormatCommand);
  const [draft, setDraft] = useState(stored);
  // A change saved elsewhere replaces the draft.
  const [draftOf, setDraftOf] = useState(stored);
  if (stored !== draftOf) {
    setDraftOf(stored);
    setDraft(stored);
  }

  return (
    <SettingRow
      title="Custom command"
      description="Runs on the saved file; {file} is replaced with the quoted path (appended when omitted)."
    >
      {(a11y) => (
        <Input
          {...a11y}
          value={draft}
          placeholder="mytool --fix {file}"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== stored) void setEditorCustomFormatCommand(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-55 font-mono"
        />
      )}
    </SettingRow>
  );
}

const languageName = (ext: string) => EXPOSED_LANGUAGES.find((l) => l.ext === ext)?.name ?? ext;

function FormatterOverrides() {
  const byLang = usePreferencesStore((s) => s.editorFormatterByLang);
  const entries = Object.entries(byLang);
  const unused = EXPOSED_LANGUAGES.filter((l) => !(l.ext in byLang));

  const update = (next: Record<string, EditorFormatter>) => void setEditorFormatterByLang(next);

  return (
    <SettingRow
      title="Language overrides"
      description="Use a different formatter for specific languages (e.g. Ruff for Python)."
      details={
        entries.length > 0 ? (
          <div className="flex flex-col gap-2">
            {entries.map(([lang, formatter]) => (
              <div key={lang} className="flex items-center gap-2">
                <Select
                  value={lang}
                  onValueChange={(nextLang) => {
                    if (nextLang === lang) return;
                    const next = { ...byLang };
                    delete next[lang];
                    next[nextLang] = formatter;
                    update(next);
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPOSED_LANGUAGES.filter((l) => l.ext === lang || !(l.ext in byLang)).map((l) => (
                      <SelectItem key={l.ext} value={l.ext}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormatterSelect
                  aria-label={`Formatter for ${languageName(lang)}`}
                  value={formatter}
                  onChange={(v) => update({ ...byLang, [lang]: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${languageName(lang)} override`}
                  title="Remove override"
                  onClick={() => {
                    const next = { ...byLang };
                    delete next[lang];
                    update(next);
                  }}
                >
                  <XIcon size="sm" />
                </Button>
              </div>
            ))}
          </div>
        ) : undefined
      }
    >
      <Button
        variant="outline"
        disabled={unused.length === 0}
        onClick={() => {
          const first = unused[0];
          if (first) update({ ...byLang, [first.ext]: 'lsp' });
        }}
      >
        <PlusIcon size="sm" />
        Add override
      </Button>
    </SettingRow>
  );
}
