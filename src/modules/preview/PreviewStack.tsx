import { cn } from '@/lib/utils';
import type { PreviewTab, Tab } from '@/modules/tabs';
import { useCallback } from 'react';
import { PreviewPane, type PreviewPaneHandle } from './PreviewPane';

type Props = {
  tabs: Tab[];
  activeId: number;
  onUrlChange: (id: number, url: string) => void;
  registerHandle: (id: number, handle: PreviewPaneHandle | null) => void;
};

export function PreviewStack({ tabs, activeId, onUrlChange, registerHandle }: Props) {
  const previews = tabs.filter((t): t is PreviewTab => t.kind === 'preview' && !t.cold);

  if (previews.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {previews.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn('absolute inset-0', !visible && 'invisible pointer-events-none')}
            aria-hidden={!visible}
          >
            <PreviewSlot
              id={t.id}
              url={t.url}
              visible={visible}
              registerHandle={registerHandle}
              onUrlChange={onUrlChange}
            />
          </div>
        );
      })}
    </div>
  );
}

type SlotProps = Pick<Props, 'registerHandle' | 'onUrlChange'> & { id: number; url: string; visible: boolean };

/** One preview tab's pane, with callbacks that keep their identity while the tab lives. */
function PreviewSlot({ id, url, visible, registerHandle, onUrlChange }: SlotProps) {
  const ref = useCallback((h: PreviewPaneHandle | null) => registerHandle(id, h), [registerHandle, id]);
  const urlChange = useCallback((next: string) => onUrlChange(id, next), [onUrlChange, id]);
  return <PreviewPane ref={ref} url={url} visible={visible} onUrlChange={urlChange} />;
}
