import { Slider } from '@/components/ui/slider';
import type { SettingRowA11y } from './SettingRow';

type Props = SettingRowA11y & {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** The value as shown next to the slider, e.g. "100%" or "12 px". */
  format: (value: number) => string;
};

/** A setting row's slider: 180 px wide with its value on the right, named by the row. */
export function RangeControl({ value, min, max, step, onChange, format, ...a11y }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <Slider
        className="w-45"
        {...a11y}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
      <output className="w-11 text-right text-[12px] leading-4 text-muted-foreground tabular-nums">
        {format(value)}
      </output>
    </div>
  );
}
