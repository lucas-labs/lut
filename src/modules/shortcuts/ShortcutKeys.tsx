import shiftIcon from '@/assets/icons/shift.svg';
import { IS_MAC, KEY_SEP } from '@/modules/platform';
import { type CSSProperties, Fragment } from 'react';

/**
 * Shift as Hugeicons' ArrowUpBig outline, drawn through a CSS mask so it takes the text's color: the browser loads the
 * file once for every key on screen. Text fonts have no Shift arrow of their own (Consolas and the bundled Source Code
 * Pro lack U+21E7), so a fallback font would draw it tiny.
 */
const SHIFT_MASK: CSSProperties = {
  maskImage: `url("${shiftIcon}")`,
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
};

/** One key of a shortcut as it reads on screen: off macOS, Ctrl is the caret terminals print (`^C`) and Shift its arrow. */
export function ShortcutKey({ token }: { token: string }) {
  if (IS_MAC) return token;
  if (token === 'Ctrl') return '^';
  if (token === 'Shift') {
    return (
      <>
        <span
          aria-hidden
          className="inline-block size-[1.15em] shrink-0 bg-current align-[-0.2em]"
          style={SHIFT_MASK}
        />
        <span className="sr-only">Shift</span>
      </>
    );
  }
  return token;
}

/**
 * A shortcut label (the space-separated tokens of `useShortcutLabel` / `shortcutLabel`) as it reads on screen:
 * `^+⇧+F` on Windows and Linux, `⇧⌘F` on macOS. Titles, aria labels and prose keep the plain-text form.
 */
export function ShortcutKeys({ label }: { label: string }) {
  const tokens = label.split(' ').filter(Boolean);
  return (
    <span className="inline-flex items-center">
      {/* A binding never repeats a token: modifiers appear once, then the key. */}
      {tokens.map((token, i) => (
        <Fragment key={token}>
          {i > 0 ? KEY_SEP : null}
          <ShortcutKey token={token} />
        </Fragment>
      ))}
    </span>
  );
}
