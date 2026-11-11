import type { ComponentType } from 'react';
import { useNavigationStore } from './store';
import type { Tab } from './types';

/** How one kind of tab shows itself in a navigator. */
export type TabPresenter = {
  /** The tab's icon. */
  Icon: ComponentType<{ tab: Tab }>;
  /** The icon as a menu trigger, for the tab strip (an editor's language picker). */
  IconMenu?: ComponentType<{ tab: Tab }>;
};

const presenters = new Map<Tab['kind'], TabPresenter>();

/** Registers how a tab kind is shown; the module that owns the kind calls it. Returns the undo. */
export function registerTabPresenter(kind: Tab['kind'], presenter: TabPresenter): () => void {
  presenters.set(kind, presenter);
  return () => {
    if (presenters.get(kind) === presenter) presenters.delete(kind);
  };
}

/** A tab's icon by id, from the presenter of its kind; `menu` asks for the strip's menu variant. */
export function TabIcon({ id, menu = false }: { id: number; menu?: boolean }) {
  const tab = useNavigationStore((s) => s.tabs.find((t) => t.id === id));
  if (!tab) return null;
  const presenter = presenters.get(tab.kind);
  if (!presenter) return null;
  const Icon = (menu && presenter.IconMenu) || presenter.Icon;
  return <Icon tab={tab} />;
}
