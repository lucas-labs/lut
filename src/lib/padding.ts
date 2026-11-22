/** Space on each side of a box, in CSS pixels. */
export type Padding = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

/** One edit of a padding control: sides set to a value, or opposite sides joined (right to left, bottom to top). */
export type PaddingEdit =
  | { readonly kind: 'set'; readonly sides: readonly (keyof Padding)[]; readonly value: number }
  | { readonly kind: 'join' };

/** `padding` with `edit` made on it. */
export function applyPaddingEdit(padding: Padding, edit: PaddingEdit): Padding {
  if (edit.kind === 'join') return { ...padding, right: padding.left, bottom: padding.top };
  return { ...padding, ...Object.fromEntries(edit.sides.map((side) => [side, edit.value])) };
}
