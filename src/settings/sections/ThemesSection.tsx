import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { closeWindow } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import {
  EDITOR_THEME_AUTO,
  EDITOR_THEME_LABELS,
  EDITOR_THEME_MODE,
  EDITOR_THEMES,
  type EditorThemePref,
  setBackgroundBlur,
  setBackgroundImageId,
  setBackgroundKind,
  setBackgroundOpacity,
  setEditorTheme,
  setWindowVibrancy,
} from '@/modules/settings/store';
import { useTheme } from '@/modules/theme';
import { deleteBgImage, getBgImage, importBgImageFromFile } from '@/modules/theme/bgImageStore';
import { deleteCustomTheme, saveCustomTheme } from '@/modules/theme/customThemes';
import {
  deleteThemeFile,
  handOffThemeEdit,
  readThemeFileError,
  type ThemeEditRequest,
} from '@/modules/theme/themeFiles';
import { listBuiltinThemes } from '@/modules/theme/themes';
import { DEFAULT_THEME_ID, type Theme, type ThemeMode } from '@/modules/theme/types';
import { validateTheme } from '@/modules/theme/validateTheme';
import { type Backdrop, getBackdropKind } from '@/modules/theme/vibrancy';
import { AlertIcon, DeleteIcon, DownloadIcon, ImageIcon, PencilIcon, PlusIcon } from '@lut/lut-icons';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { RangeControl } from '../components/RangeControl';
import { SectionHeader } from '../components/SectionHeader';
import { SettingRow } from '../components/SettingRow';
import { SettingsGroup } from '../components/SettingsGroup';

/** Makes `file` the background image and deletes the one it replaces; returns the error to show, or null. */
async function replaceBackgroundImage(file: File, previousId: string | null): Promise<string | null> {
  try {
    const { id } = await importBgImageFromFile(file);
    await setBackgroundImageId(id);
    await setBackgroundKind('image');
    if (previousId && previousId !== id) await deleteBgImage(previousId).catch(() => undefined);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'failed to import image';
  }
}

/** Accepts dropped files on a group without the browser opening them. */
function dropZone(onFiles: (files: FileList) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onFiles(e.dataTransfer.files);
    },
  };
}

export function ThemesSection() {
  const { themeId, setThemeId, resolvedMode, customThemes } = useTheme();
  const builtinThemes = listBuiltinThemes();
  const themes = useMemo(() => [...builtinThemes, ...customThemes], [builtinThemes, customThemes]);
  const customIds = useMemo(() => new Set(customThemes.map((t) => t.id)), [customThemes]);
  const fileErrors = useThemeFileErrors(customThemes);

  const [importError, setImportError] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  // Editing happens in the main window's code editor, so Settings closes
  // (destroying its WebContent process) rather than hiding and staying resident.
  const startThemeEdit = (req: ThemeEditRequest) => void handOffThemeEdit(req, closeWindow);
  const onCreateTheme = () => startThemeEdit({ action: 'create' });
  const onEditTheme = (id: string) => startThemeEdit({ action: 'edit', id });

  const editorThemePref = usePreferencesStore((s) => s.editorTheme);
  const backgroundKind = usePreferencesStore((s) => s.backgroundKind);
  const backgroundImageId = usePreferencesStore((s) => s.backgroundImageId);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);
  const windowVibrancy = usePreferencesStore((s) => s.windowVibrancy);
  const imageId = backgroundKind === 'image' ? backgroundImageId : null;

  const [backdrop, setBackdrop] = useState<Backdrop>('none');
  useEffect(() => {
    let alive = true;
    void getBackdropKind().then((k) => {
      if (alive) setBackdrop(k);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleThemeFiles = async (files: FileList | null) => {
    setImportError(null);
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const result = validateTheme(parsed);
        if (!result.ok) {
          setImportError(`${file.name}: ${result.error}`);
          return;
        }
        await saveCustomTheme(result.theme);
        setThemeId(result.theme.id);
      } catch (e) {
        setImportError(`${file.name}: ${e instanceof Error ? e.message : 'failed to read'}`);
        return;
      }
    }
  };

  const onPickThemeFile = () => fileInputRef.current?.click();

  const onRemoveCustomTheme = async (id: string) => {
    if (themeId === id) setThemeId(DEFAULT_THEME_ID);
    await deleteCustomTheme(id);
    void deleteThemeFile(id);
  };

  const onPickBgFile = () => bgInputRef.current?.click();

  const handleBgFiles = async (files: FileList | null) => {
    setBgError(null);
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setBgError(`${file.name}: not an image`);
      return;
    }
    setBgError(await replaceBackgroundImage(file, backgroundImageId));
  };

  const onRemoveBackground = async () => {
    setBgError(null);
    const prev = backgroundImageId;
    await setBackgroundKind('none');
    await setBackgroundImageId(null);
    if (prev) await deleteBgImage(prev).catch(() => undefined);
  };

  return (
    <div className="flex flex-col">
      <SectionHeader title="Themes" description="Theme, background image, and customization." />

      {backdrop === 'none' ? null : (
        <SettingsGroup title="Window backdrop">
          <SettingRow
            title={backdrop === 'mica' ? 'Mica background' : 'Window vibrancy'}
            description={
              backdrop === 'mica'
                ? 'Blend the header, status bar and gutters into the desktop wallpaper. Windows 11 only.'
                : 'Frost the header, status bar and gutters over what is behind the window. Panes stay solid.'
            }
          >
            {(a11y) => <Switch {...a11y} checked={windowVibrancy} onCheckedChange={(v) => void setWindowVibrancy(v)} />}
          </SettingRow>
        </SettingsGroup>
      )}

      <div role="presentation" {...dropZone((files) => void handleThemeFiles(files))}>
        <SettingsGroup
          title="Theme"
          actions={
            <>
              <Button variant="outline" onClick={onCreateTheme}>
                <PlusIcon size="sm" />
                Create
              </Button>
              <Button variant="outline" onClick={onPickThemeFile}>
                <DownloadIcon size="sm" />
                Import .lut-theme
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lut-theme,.json,application/json"
                className="hidden"
                onChange={(e) => {
                  void handleThemeFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          }
        >
          {importError ? <ErrorNote>{importError}</ErrorNote> : null}
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {themes.map((t) => (
              <ThemeCard
                key={t.id}
                theme={t}
                mode={resolvedMode}
                selected={themeId === t.id}
                custom={customIds.has(t.id)}
                onSelect={() => setThemeId(t.id)}
                onEdit={() => onEditTheme(t.id)}
                onRemove={() => void onRemoveCustomTheme(t.id)}
                fileError={fileErrors.get(t.id)}
              />
            ))}
          </div>
        </SettingsGroup>
      </div>

      <SettingsGroup title="Editor theme">
        <SettingRow title="Editor theme" description="Syntax colors for the code editor. Auto follows the app theme.">
          {(a11y) => (
            <Select value={editorThemePref} onValueChange={(v) => void setEditorTheme(v as EditorThemePref)}>
              <SelectTrigger {...a11y}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EDITOR_THEME_AUTO}>Auto (match app theme)</SelectItem>
                <SelectSeparator />
                {[...EDITOR_THEMES]
                  .sort(
                    (a, b) =>
                      (EDITOR_THEME_MODE[a] === resolvedMode ? 0 : 1) - (EDITOR_THEME_MODE[b] === resolvedMode ? 0 : 1),
                  )
                  .map((id) => (
                    <SelectItem key={id} value={id} disabled={EDITOR_THEME_MODE[id] !== resolvedMode}>
                      {EDITOR_THEME_LABELS[id]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
      </SettingsGroup>

      <div role="presentation" {...dropZone((files) => void handleBgFiles(files))}>
        <SettingsGroup title="Background">
          {bgError ? <ErrorNote>{bgError}</ErrorNote> : null}
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/75 p-3.5 text-[12px] leading-4 text-muted-foreground">
            <BackgroundThumbnail imageId={imageId} />
            <span className="min-w-0 flex-1">
              {imageId
                ? 'Drop an image here to replace it.'
                : "Drop an image here or pick one. Stored locally; doesn't affect the default look until set."}
            </span>
            <Button variant="outline" onClick={onPickBgFile}>
              {imageId ? 'Replace image' : 'Choose image'}
            </Button>
            {imageId ? (
              <Button variant="outline" onClick={() => void onRemoveBackground()}>
                Remove
              </Button>
            ) : null}
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleBgFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {imageId ? (
            <>
              <SettingRow title="Opacity">
                {(a11y) => (
                  <RangeControl
                    {...a11y}
                    value={backgroundOpacity}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => void setBackgroundOpacity(v)}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                )}
              </SettingRow>
              <SettingRow title="Blur">
                {(a11y) => (
                  <RangeControl
                    {...a11y}
                    value={backgroundBlur}
                    min={0}
                    max={64}
                    step={1}
                    onChange={(v) => void setBackgroundBlur(v)}
                    format={(v) => `${v} px`}
                  />
                )}
              </SettingRow>
            </>
          ) : null}
        </SettingsGroup>
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[12px] leading-4 text-destructive">
      {children}
    </div>
  );
}

type ThemeCardProps = {
  theme: Theme;
  mode: ThemeMode;
  selected: boolean;
  custom: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Why the theme's file, as last saved in the editor, is not applied. */
  fileError?: string;
};

/**
 * A theme to pick: its swatch, name and description. Custom themes add edit and remove, shown on hover or focus, and
 * the error of a file the editor saved that could not be applied.
 */
function ThemeCard({ theme, mode, selected, custom, onSelect, onEdit, onRemove, fileError }: ThemeCardProps) {
  const c = (theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light)?.colors;
  return (
    <div className="group/card relative min-w-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          'flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card p-2.5 text-left text-foreground transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          selected
            ? 'border-primary ring-1 ring-primary'
            : fileError
              ? 'border-destructive'
              : 'border-border hover:border-muted-foreground/75',
        )}
      >
        <span
          aria-hidden
          className="flex h-10 w-14 shrink-0 items-center justify-center gap-0.75 rounded-md border border-border"
          style={{ background: c?.background ?? 'var(--background)' }}
        >
          <span className="h-5 w-2 rounded-sm" style={{ background: c?.primary ?? c?.accent ?? 'var(--accent)' }} />
          <span
            className="h-5 w-2 rounded-sm opacity-70"
            style={{ background: c?.foreground ?? 'var(--foreground)' }}
          />
          <span className="h-5 w-2 rounded-sm" style={{ background: c?.muted ?? 'var(--muted)' }} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] leading-[18px] font-semibold">{theme.name}</span>
          {theme.description ? (
            <span className="truncate text-[12px] leading-4 text-muted-foreground">{theme.description}</span>
          ) : null}
          {fileError ? (
            <span className="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-destructive" title={fileError}>
              <AlertIcon size="xs" className="shrink-0" />
              <span className="truncate">{fileError}</span>
            </span>
          ) : null}
        </span>
      </button>
      {custom ? (
        <span className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
          <Button variant="secondary" size="icon-xs" aria-label={`Edit ${theme.name}`} onClick={onEdit}>
            <PencilIcon size="xs" />
          </Button>
          <Button variant="secondary" size="icon-xs" aria-label={`Remove ${theme.name}`} onClick={onRemove}>
            <DeleteIcon size="xs" />
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Why each custom theme's file is not applied, as "file: message", by theme id. Read when Settings opens: editing a
 * theme closes Settings, so reopening it reads what the editor last saved.
 */
function useThemeFileErrors(customThemes: readonly Theme[]): ReadonlyMap<string, string> {
  const ids = customThemes.map((t) => t.id).join('\n');
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let alive = true;
    void Promise.all(
      (ids ? ids.split('\n') : []).map(async (id) => [id, await readThemeFileError(id).catch(() => null)] as const),
    ).then((found) => {
      if (!alive) return;
      const next = new Map<string, string>();
      for (const [id, problem] of found) if (problem) next.set(id, `${problem.file}: ${problem.error}`);
      setErrors(next);
    });
    return () => {
      alive = false;
    };
  }, [ids]);
  return errors;
}

/** The background image, small; an image icon when none is set. */
function BackgroundThumbnail({ imageId }: { imageId: string | null }) {
  const url = useBgImageUrl(imageId);
  return (
    <span
      aria-hidden
      className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent text-muted-foreground"
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImageIcon size="md" />}
    </span>
  );
}

/** An object URL for a stored background image, revoked when the image changes or the thumbnail goes away. */
function useBgImageUrl(imageId: string | null): string | null {
  const [shown, setShown] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!imageId) return;
    let alive = true;
    let created: string | null = null;
    void getBgImage(imageId)
      .catch(() => null)
      .then((blob) => {
        if (!alive || !blob) return;
        created = URL.createObjectURL(blob);
        setShown({ id: imageId, url: created });
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [imageId]);
  return shown?.id === imageId ? shown.url : null;
}
