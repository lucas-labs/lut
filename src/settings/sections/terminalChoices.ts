/** Choices the Terminal settings and a profile's appearance offer alike. */

export const TERMINAL_FONT_WEIGHTS = [
  { value: 'normal', label: 'Normal' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semi-Bold' },
  { value: 'bold', label: 'Bold' },
] as const;

export const TERMINAL_CURSOR_STYLES = [
  { value: 'bar', label: 'Bar' },
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
] as const;
