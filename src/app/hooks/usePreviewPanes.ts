import { useNavigationStore } from '@/modules/navigation';
import type { PreviewPaneHandle } from '@/modules/preview';
import { useCallback, useRef } from 'react';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

/**
 * The web preview panes as the shell sees them (E09-08): their handles, and opening a preview tab, whose address bar
 * takes the focus when it opens empty, even if the preview code is still loading (E07-04).
 */
export function usePreviewPanes() {
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  // A new empty preview tab wants its address bar focused; the preview code may still be loading (E07-04).
  const pendingPreviewFocusRef = useRef<number | null>(null);

  /** Focuses a pending preview's address bar once its pane exists, if its tab is still active. */
  const focusPendingPreview = useCallback((id: number) => {
    if (pendingPreviewFocusRef.current !== id) return;
    const handle = previewRefs.current.get(id);
    if (!handle) return; // still loading: registerPreviewHandle calls this again
    pendingPreviewFocusRef.current = null;
    if (nav().activeId === id) handle.focusAddressBar();
  }, []);

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = nav().newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type. If the pane is not registered yet, the
      // request waits for registerPreviewHandle.
      if (!url) {
        pendingPreviewFocusRef.current = id;
        setTimeout(() => focusPendingPreview(id), 0);
      }
      return id;
    },
    [focusPendingPreview],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) {
        previewRefs.current.set(id, h);
        if (pendingPreviewFocusRef.current === id) setTimeout(() => focusPendingPreview(id), 0);
      } else previewRefs.current.delete(id);
    },
    [focusPendingPreview],
  );

  /** Drops a closed tab's handle. */
  const forgetPreview = useCallback((id: number) => {
    previewRefs.current.delete(id);
  }, []);

  const onUrlChange = useCallback((id: number, url: string) => nav().updateTab(id, { url }), []);

  return { openPreviewTab, registerPreviewHandle, forgetPreview, onUrlChange };
}
