import { cn, isMarkdownPath } from '@/lib/utils';
import { MarkdownViewToggle } from '@/modules/markdown';
import { registerDirtyContentProvider } from '@/modules/navigation';
import type { EditorTab, Tab } from '@/modules/tabs';
import { useWindowInactive } from '@/modules/theme/WindowActivityBridge';
import { useCallback, useEffect } from 'react';
import { EditorPane, type EditorPaneHandle } from './EditorPane';
import { editorHasUnsavedChanges } from './lib/dirtyContent';

type Props = {
  tabs: Tab[];
  activeId: number;
  onDirtyChange: (id: number, dirty: boolean) => void;
  registerHandle: (id: number, handle: EditorPaneHandle | null) => void;
  onCloseTab: (id: number) => void;
  onSetMarkdownView: (id: number, mode: 'rendered' | 'raw') => void;
};

export function EditorStack({ tabs, activeId, onDirtyChange, registerHandle, onCloseTab, onSetMarkdownView }: Props) {
  const editors = tabs.filter((t): t is EditorTab => t.kind === 'editor' && !t.cold);

  // The close guards ask the editor about unsaved changes while it is loaded.
  useEffect(() => registerDirtyContentProvider(editorHasUnsavedChanges), []);

  const windowInactive = useWindowInactive();

  if (editors.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {editors.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn('absolute inset-0', !visible && 'invisible pointer-events-none')}
            aria-hidden={!visible}
          >
            <div className="relative h-full overflow-hidden bg-background">
              {isMarkdownPath(t.path) && (
                <MarkdownViewToggle
                  mode="raw"
                  onChange={(mode) => onSetMarkdownView(t.id, mode)}
                  renderedDisabled={t.dirty}
                  renderedHint="Save to preview"
                />
              )}
              <EditorSlot
                tab={t}
                mediaActive={visible && !windowInactive}
                registerHandle={registerHandle}
                onDirtyChange={onDirtyChange}
                onCloseTab={onCloseTab}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type SlotProps = Pick<Props, 'registerHandle' | 'onDirtyChange' | 'onCloseTab'> & {
  tab: EditorTab;
  mediaActive: boolean;
};

/**
 * One editor tab's pane. Its callbacks keep their identity while the tab lives: a new `ref` callback makes React
 * detach and attach the handle, and a new `onDirtyChange` is called again with the same state.
 */
function EditorSlot({ tab, mediaActive, registerHandle, onDirtyChange, onCloseTab }: SlotProps) {
  const { id } = tab;
  const ref = useCallback((h: EditorPaneHandle | null) => registerHandle(id, h), [registerHandle, id]);
  const dirtyChange = useCallback((dirty: boolean) => onDirtyChange(id, dirty), [onDirtyChange, id]);
  const close = useCallback(() => onCloseTab(id), [onCloseTab, id]);
  return (
    <EditorPane
      ref={ref}
      path={tab.path}
      overrideLanguage={tab.overrideLanguage}
      onDirtyChange={dirtyChange}
      onClose={close}
      mediaActive={mediaActive}
    />
  );
}
