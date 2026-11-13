import { useLatest } from '@/lib/useLatest';
import { type EditorPaneHandle, useApplyEditorFontSize, useEditorFileSync } from '@/modules/editor';
import { setLspNavigator } from '@/modules/lsp';
import { useNavigationStore } from '@/modules/navigation';
import { useSpaces } from '@/modules/spaces';
import type { Tab } from '@/modules/tabs';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

/** Where to put an editor that is still loading once it registers: a line, and whether to focus it. */
type PendingNavigation = { line?: number; focus: boolean };

/** A file the control bridge (`lut <file>`) asks to open. */
type ControlOpen = { path: string; line?: number; focus: boolean; spaceId: string };

/**
 * The editor panes as the shell sees them (E09-08): their handles, the active one, the editor font size and file
 * sync, and opening a file at a line, for the palette, the control bridge and LSP navigation. A line asked for
 * before the editor loaded is applied when it registers.
 */
export function useEditorPanes({ tabs, activeId }: { tabs: Tab[]; activeId: number }) {
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const pendingEditorNavigation = useRef<Map<number, PendingNavigation>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] = useState<EditorPaneHandle | null>(null);
  useApplyEditorFontSize();
  useEditorFileSync({ tabs, editorRefs });

  useEffect(() => {
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId]);

  // Stable, so an editor's ref callback is not swapped (detached and attached again) when the active tab changes.
  const active = useLatest(activeId);
  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) {
        editorRefs.current.set(id, h);
        const pending = pendingEditorNavigation.current.get(id);
        if (pending != null) {
          pendingEditorNavigation.current.delete(id);
          if (pending.line === undefined) h.focus();
          else h.gotoLine(pending.line, { focus: pending.focus });
        }
      } else {
        editorRefs.current.delete(id);
      }
      if (id === active.current) setActiveEditorHandle(h);
    },
    [active],
  );

  /** Drops a closed tab's handle. */
  const forgetEditor = useCallback((id: number) => {
    editorRefs.current.delete(id);
  }, []);

  /** Opens `path` pinned and moves to `line`. */
  const openFileAtLine = useCallback((path: string, line: number) => {
    const id = nav().openFileTab(path, true);
    if (id == null) return;
    const h = editorRefs.current.get(id);
    if (h) h.gotoLine(line);
    else pendingEditorNavigation.current.set(id, { line, focus: true });
  }, []);

  const openControlFile = useCallback(({ path, line, focus, spaceId }: ControlOpen) => {
    if (focus && useSpaces.getState().activeId !== spaceId) {
      useSpaces.getState().setActive(spaceId);
    }
    const id = nav().openFileTab(path, true, {
      spaceId,
      activate: focus,
    });
    const editor = editorRefs.current.get(id);
    if (line !== undefined) {
      if (editor) editor.gotoLine(line, { focus });
      else pendingEditorNavigation.current.set(id, { line, focus });
    } else if (focus) {
      if (editor) editor.focus();
      else pendingEditorNavigation.current.set(id, { focus: true });
    }
    return id;
  }, []);

  useEffect(() => {
    setLspNavigator({ openFile: openFileAtLine });
    return () => setLspNavigator(null);
  }, [openFileAtLine]);

  const onDirtyChange = useCallback(
    (id: number, dirty: boolean) => nav().updateTab(id, { dirty }),
    [],
  );

  return {
    editorRefs,
    activeEditorHandle,
    registerEditorHandle,
    forgetEditor,
    openFileAtLine,
    openControlFile,
    onDirtyChange,
  };
}
