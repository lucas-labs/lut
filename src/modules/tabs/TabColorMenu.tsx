import { ColorPicker, ColorSwatch } from '@/components/ui/color-picker';
import { ContextMenuLabel, ContextMenuRadioGroup, ContextMenuSwatchItem } from '@/components/ui/context-menu';
import { colorCss, currentHex, isHexColor, THEME_COLORS } from '@/modules/theme';
import { useState } from 'react';

type Props = {
  /** The tab's colour: a theme colour's name or a `#rrggbb` hex; null for none. */
  color: string | null;
  /** Picking a swatch or applying a custom colour; null removes it. The caller closes the menu. */
  onChoose: (color: string | null) => void;
};

/**
 * The colour row of a tab's menu (E11-04 design): "No color", the theme's colours and a custom one. The custom swatch
 * keeps the menu open and shows a picker under the row; Apply keeps its hex. A theme colour is kept by name, so it
 * follows a theme change.
 */
export function TabColorMenu({ color, onChoose }: Props) {
  const [picking, setPicking] = useState(false);
  const custom = color !== null && isHexColor(color) ? color.toLowerCase() : null;
  const value = color === null ? 'none' : custom ? 'custom' : color;
  const startHex = () => custom ?? currentHex(colorCss(color ?? '') ?? 'var(--primary)') ?? '#808080';

  return (
    <>
      <ContextMenuLabel>Color</ContextMenuLabel>
      <ContextMenuRadioGroup
        value={value}
        aria-label="Tab color"
        className="flex flex-wrap items-center gap-0.5 px-1 pb-1.5"
      >
        <ContextMenuSwatchItem
          value="none"
          aria-label="No color"
          title="No color"
          textValue="No color"
          onSelect={() => onChoose(null)}
        >
          <ColorSwatch kind="none" />
        </ContextMenuSwatchItem>
        {THEME_COLORS.map((theme) => (
          <ContextMenuSwatchItem
            key={theme.name}
            value={theme.name}
            aria-label={theme.label}
            title={theme.label}
            textValue={theme.label}
            onSelect={() => onChoose(theme.name)}
          >
            <ColorSwatch kind="color" color={theme.css} />
          </ContextMenuSwatchItem>
        ))}
        <ContextMenuSwatchItem
          value="custom"
          aria-label="Custom color"
          aria-expanded={picking}
          title="Custom color"
          textValue="Custom color"
          onSelect={(e) => {
            e.preventDefault();
            setPicking((open) => !open);
          }}
        >
          <ColorSwatch kind="custom" color={custom} />
        </ContextMenuSwatchItem>
      </ContextMenuRadioGroup>
      {picking && (
        // Keys typed here stay here: the menu would take letters for its search and Tab for itself.
        <div className="px-2 pb-2" onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}>
          <ColorPicker initial={startHex()} autoFocus onApply={(hex) => onChoose(hex)} />
        </div>
      )}
    </>
  );
}
