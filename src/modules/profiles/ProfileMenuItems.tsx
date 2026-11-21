import { Badge } from '@/components/ui/badge';
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu';
import { TerminalIcon } from '@lut/lut-icons';
import type { ReactNode } from 'react';
import { visibleProfiles } from './catalogue';
import type { ProfilesList } from './model';

type Props = {
  list: ProfilesList;
  onPick: (profileId: string) => void;
  /** Shown beside the default profile: the shortcut that opens it. */
  defaultHint?: ReactNode;
};

/** A dropdown item per profile a picker offers (`visibleProfiles`), the default one tagged. */
export function ProfileMenuItems({ list, onPick, defaultHint }: Props) {
  return visibleProfiles(list).map((profile) => {
    const isDefault = profile.id === list.defaultProfileId;
    return (
      <DropdownMenuItem key={profile.id} onSelect={() => onPick(profile.id)}>
        <TerminalIcon size="sm" />
        <span className="min-w-0 flex-1 truncate">{profile.name}</span>
        {isDefault && <Badge variant="soft">Default</Badge>}
        {isDefault && defaultHint ? <DropdownMenuShortcut>{defaultHint}</DropdownMenuShortcut> : null}
      </DropdownMenuItem>
    );
  });
}
