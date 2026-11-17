import { cn } from '@/lib/utils';
import { CodeIcon, EyeIcon, type LutIconComponent } from '@lut/lut-icons';
import { useId } from 'react';

type Mode = 'rendered' | 'raw';

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
  renderedDisabled?: boolean;
  renderedHint?: string;
};

const OPTIONS: readonly { mode: Mode; label: string; icon: LutIconComponent }[] = [
  { mode: 'raw', label: 'Raw', icon: CodeIcon },
  { mode: 'rendered', label: 'Rendered', icon: EyeIcon },
];

/** Switches a markdown file between its source and its rendered view, at the top right of the tab. */
export function MarkdownViewToggle({ mode, onChange, renderedDisabled, renderedHint }: Props) {
  const name = useId();
  return (
    <fieldset className="absolute top-2.5 right-3.5 z-10 m-0 flex min-w-0 rounded-[7px] border border-border bg-card p-0.5">
      <legend className="sr-only">Markdown view</legend>
      {OPTIONS.map((option) => {
        const checked = option.mode === mode;
        const disabled = option.mode === 'rendered' && renderedDisabled;
        return (
          <label
            key={option.mode}
            title={disabled ? renderedHint : undefined}
            className={cn(
              'flex h-[22px] cursor-pointer items-center gap-[5px] rounded-[5px] px-[9px] text-[12px] leading-4 has-focus-visible:ring-2 has-focus-visible:ring-ring/50',
              checked ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.mode}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.mode)}
              className="sr-only"
            />
            <option.icon size="sm" aria-hidden />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
