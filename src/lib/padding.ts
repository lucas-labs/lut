/** Space on each side of a box, in CSS pixels. */
export type Padding = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
