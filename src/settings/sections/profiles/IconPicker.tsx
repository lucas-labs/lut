import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  BUILT_IN_ICONS,
  type BuiltInIcon,
  IMAGE_ICON_PREFIX,
  importProfileIcon,
  MAX_ICON_BYTES,
  type ProfileEntry,
  ProfileIcon,
} from '@/modules/profiles';
import { ArrowTurnBackIcon, ImageIcon } from '@lut/lut-icons';
import { useEffect, useRef, useState } from 'react';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'];

const GROUPS: { group: BuiltInIcon['group']; title: string }[] = [
  { group: 'shells', title: 'Shells' },
  { group: 'general', title: 'General' },
];

type Props = {
  entry: ProfileEntry;
  /** A built-in icon id or `image:<name>`; `undefined` goes back to the profile's default icon. */
  onChoose: (icon: string | undefined) => void;
};

/** The profile's icon as a button that opens the built-in icons, an image file and the default icon. */
export function IconPicker({ entry, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /**
   * Counts the choices made: an image copied after another choice was made is not saved, nor one copied after the
   * picker left (another profile was chosen), which a choice in the picker shown again would not count.
   */
  const choices = useRef(0);
  useEffect(
    () => () => {
      choices.current += 1;
    },
    [],
  );
  const chosen = entry.tab.icon;
  const search = query.trim().toLowerCase();
  const matches = BUILT_IN_ICONS.filter((icon) => !search || icon.label.toLowerCase().includes(search));

  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setImageError(null);
    }
  };

  const choose = (icon: string | undefined) => {
    choices.current += 1;
    openChange(false);
    onChoose(icon);
  };

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      setImageError(`${file.name}: choose a PNG, JPEG, GIF, WebP, SVG or ICO image.`);
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setImageError(`${file.name}: images are limited to 1 MB.`);
      return;
    }
    setImporting(true);
    const choice = choices.current;
    await importProfileIcon(file).then(
      (name) => {
        setImporting(false);
        if (choices.current === choice) choose(`${IMAGE_ICON_PREFIX}${name}`);
      },
      (failure: unknown) => {
        setImporting(false);
        if (choices.current === choice) {
          setImageError(`${file.name}: ${failure instanceof Error ? failure.message : String(failure)}`);
        }
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change icon" title="Change icon">
          <ProfileIcon profile={entry} size="md" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-73 gap-2 p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons"
          aria-label="Search icons"
        />
        {matches.length === 0 ? (
          <p className="px-0.5 py-1 text-[12px] text-muted-foreground">No icons match.</p>
        ) : (
          GROUPS.map(({ group, title }) => {
            const icons = matches.filter((icon) => icon.group === group);
            if (icons.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-1.5">
                <h3 className="px-0.5 text-[11px] leading-3.5 text-muted-foreground">{title}</h3>
                <div className="grid grid-cols-8 gap-1">
                  {icons.map(({ id, label, Icon }) => (
                    <Button
                      key={id}
                      variant="outline-hover"
                      size="icon"
                      aria-label={label}
                      title={label}
                      aria-pressed={chosen === id}
                      onClick={() => choose(id)}
                    >
                      <Icon size="md" />
                    </Button>
                  ))}
                </div>
              </div>
            );
          })
        )}
        <Separator />
        <Button
          variant="ghost"
          className="justify-start"
          disabled={importing}
          onClick={() => fileInput.current?.click()}
        >
          <ImageIcon size="sm" />
          Choose image…
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_EXTENSIONS.map((extension) => `.${extension}`).join(',')}
          className="hidden"
          aria-label="Image file"
          onChange={(e) => {
            void chooseImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button variant="ghost" className="justify-start" disabled={!chosen} onClick={() => choose(undefined)}>
          <ArrowTurnBackIcon size="sm" />
          Reset to default
        </Button>
        {imageError ? (
          <p role="alert" className="px-0.5 text-[12px] leading-4 text-destructive">
            {imageError}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
