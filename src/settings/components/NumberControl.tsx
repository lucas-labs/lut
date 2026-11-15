import { Input } from '@/components/ui/input';
import { useState } from 'react';
import type { SettingRowA11y } from './SettingRow';

type Props = SettingRowA11y & {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Brings a typed number into range before it is saved. */
  clamp: (value: number) => number;
  onChange: (value: number) => void;
  /** The unit after the field, e.g. "ms". */
  unit: string;
};

/**
 * A setting row's number field, 88 px wide with its unit on the right, named by the row. The typed text is a draft
 * until the field loses focus or Enter: then it is clamped and saved, or put back when it is empty or not a number.
 */
export function NumberControl({ value, min, max, step, clamp, onChange, unit, ...a11y }: Props) {
  const [draft, setDraft] = useState(String(value));
  // A change saved elsewhere replaces the draft.
  const [draftOf, setDraftOf] = useState(value);
  if (value !== draftOf) {
    setDraftOf(value);
    setDraft(String(value));
  }

  const commit = () => {
    const n = Number(draft);
    // An empty field is not 0: put the saved value back.
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = clamp(n);
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        {...a11y}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-22 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[11px] text-muted-foreground">{unit}</span>
    </div>
  );
}
