import { cn } from '@/lib/utils';
import { type SVGProps, useId, useState, useSyncExternalStore } from 'react';
import { ICON_VIEWBOX, scopeIconIds } from './lib/iconMarkup';
import { peekFileIconSvg, peekFolderIconSvg, subscribeFileIcons } from './lib/iconResolver';

type IconSvgProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'dangerouslySetInnerHTML' | 'viewBox'>;

const serverSnapshot = () => '';

/**
 * Draws an icon's markup inline, so its colours follow the "File icon colors"
 * setting and the theme through CSS. While the lazily loaded icon set is still
 * on its way it is an empty slot with the same box, so nothing shifts when it
 * lands; a slot that was blank at mount fades the icon in instead of popping it.
 * The markup comes from the bundled icon set, never from user input.
 */
function IconSlot({ markup, className, ...rest }: IconSvgProps & { markup: string }) {
  const [arrivedLate] = useState(markup === '');
  const uid = useId();
  if (!markup) {
    return <span aria-hidden className={cn('block', className)} />;
  }
  return (
    <svg
      {...rest}
      viewBox={ICON_VIEWBOX}
      aria-hidden
      className={cn(className, arrivedLate && 'lut-icon-in')}
      dangerouslySetInnerHTML={{ __html: scopeIconIds(markup, uid) }}
    />
  );
}

/** Icon for a file name (extension / well-known name aware). */
export function FileIcon({ name, ...props }: IconSvgProps & { name: string }) {
  const markup = useSyncExternalStore(subscribeFileIcons, () => peekFileIconSvg(name), serverSnapshot);
  return <IconSlot {...props} markup={markup} />;
}

/** Icon for a folder name, open or closed. */
export function FolderIcon({ name, expanded = false, ...props }: IconSvgProps & { name: string; expanded?: boolean }) {
  const markup = useSyncExternalStore(subscribeFileIcons, () => peekFolderIconSvg(name, expanded), serverSnapshot);
  return <IconSlot {...props} markup={markup} />;
}
