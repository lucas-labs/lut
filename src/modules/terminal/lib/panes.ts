export type PaneId = number;

export type SplitDir = 'row' | 'col';
export type PaneDirection = 'left' | 'right' | 'up' | 'down';
export type PaneBounds = {
  id: PaneId;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PaneNode =
  | { kind: 'leaf'; id: PaneId; slotId?: PaneId; cwd?: string }
  | {
      kind: 'split';
      id: PaneId;
      dir: SplitDir;
      children: PaneNode[];
      /** Each child's share of the split, in child order; they sum to 1. */
      ratios: number[];
    };

/** Matches the renderer slot pool size — over this we'd evict an active leaf. */
export const MAX_PANES_PER_TAB = 4;

/** Whether one more pane fits in the tree. */
export function canAddPane(tree: PaneNode): boolean {
  return leafIds(tree).length < MAX_PANES_PER_TAB;
}

function equalRatios(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

/**
 * Scales `ratios` to sum 1 for `count` children. A list of the wrong length or with a
 * non-positive or non-finite share gives equal shares instead.
 */
export function normaliseRatios(ratios: readonly number[], count: number): number[] {
  if (ratios.length !== count || ratios.some((r) => !(r > 0) || !Number.isFinite(r))) {
    return equalRatios(count);
  }
  const total = ratios.reduce((sum, r) => sum + r, 0);
  return ratios.map((r) => r / total);
}

/** A split with equal shares for its children. */
export function splitNode(id: PaneId, dir: SplitDir, children: PaneNode[]): PaneNode {
  return { kind: 'split', id, dir, children, ratios: equalRatios(children.length) };
}

/** Sets one split's shares (normalised); the tree is returned as is when nothing changes. */
export function setSplitRatios(
  tree: PaneNode,
  splitId: PaneId,
  ratios: readonly number[],
): PaneNode {
  if (isLeaf(tree)) return tree;
  if (tree.id === splitId) {
    const next = normaliseRatios(ratios, tree.children.length);
    const same = next.every((r, i) => Math.abs(r - tree.ratios[i]) < 1e-6);
    return same ? tree : { ...tree, ratios: next };
  }
  let changed = false;
  const children = tree.children.map((c) => {
    const u = setSplitRatios(c, splitId, ratios);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...tree, children } : tree;
}

export function isLeaf(n: PaneNode): n is Extract<PaneNode, { kind: 'leaf' }> {
  return n.kind === 'leaf';
}

export function leafIds(n: PaneNode): PaneId[] {
  if (isLeaf(n)) return [n.id];
  return n.children.flatMap(leafIds);
}

export function firstLeafSlotId(n: PaneNode): PaneId {
  if (isLeaf(n)) return n.slotId ?? n.id;
  return firstLeafSlotId(n.children[0]);
}

export function findLeafCwd(n: PaneNode, id: PaneId): string | undefined {
  if (isLeaf(n)) return n.id === id ? n.cwd : undefined;
  for (const c of n.children) {
    const found = findLeafCwd(c, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function setLeafCwd(n: PaneNode, id: PaneId, cwd: string): PaneNode {
  if (isLeaf(n)) {
    if (n.id !== id || n.cwd === cwd) return n;
    return { ...n, cwd };
  }
  let changed = false;
  const next = n.children.map((c) => {
    const u = setLeafCwd(c, id, cwd);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...n, children: next } : n;
}

export type LeafNode = Extract<PaneNode, { kind: 'leaf' }>;

/**
 * Insert a new leaf next to `targetId` in direction `dir`.
 *
 * If the target's enclosing split already runs in `dir`, the new leaf is
 * appended as a sibling there (avoids nested same-direction splits — keeps
 * the tree shallow and the resize handles aligned).
 */
export function splitLeaf(
  tree: PaneNode,
  targetId: PaneId,
  newSplitId: PaneId,
  newLeafId: PaneId,
  dir: SplitDir,
  newCwd?: string,
): PaneNode {
  return insertLeaf(tree, targetId, newSplitId, { kind: 'leaf', id: newLeafId, cwd: newCwd }, dir);
}

/** `splitLeaf` with an existing leaf, such as one detached from another tab. */
export function insertLeaf(
  tree: PaneNode,
  targetId: PaneId,
  newSplitId: PaneId,
  newLeaf: LeafNode,
  dir: SplitDir,
): PaneNode {
  if (tree.kind === 'split' && tree.dir === dir) {
    const idx = tree.children.findIndex((c) => c.kind === 'leaf' && c.id === targetId);
    if (idx >= 0) {
      // The new pane takes half of the target's share; the other panes keep theirs.
      const half = tree.ratios[idx] / 2;
      return {
        ...tree,
        children: [...tree.children.slice(0, idx + 1), newLeaf, ...tree.children.slice(idx + 1)],
        ratios: [...tree.ratios.slice(0, idx), half, half, ...tree.ratios.slice(idx + 1)],
      };
    }
  }
  if (isLeaf(tree)) {
    if (tree.id !== targetId) return tree;
    return splitNode(newSplitId, dir, [tree, newLeaf]);
  }
  return {
    ...tree,
    children: tree.children.map((c) => insertLeaf(c, targetId, newSplitId, newLeaf, dir)),
  };
}

/**
 * Takes a leaf out of its tree, for moving it elsewhere: the leaf (without its layout slot,
 * which belongs to this tree) and what remains, `null` when it was the only leaf.
 */
export function detachLeaf(
  tree: PaneNode,
  leafId: PaneId,
): { leaf: LeafNode; rest: PaneNode | null } | null {
  const leaf = findLeaf(tree, leafId);
  if (!leaf) return null;
  const { slotId: _slot, ...moved } = leaf;
  return { leaf: moved, rest: removeLeaf(tree, leafId) };
}

/**
 * Remove a leaf and collapse single-child splits left in its wake. The removed child's share
 * goes to the remaining children in proportion to theirs. Returns `null` when the entire
 * subtree is gone.
 */
export function removeLeaf(tree: PaneNode, targetId: PaneId): PaneNode | null {
  if (isLeaf(tree)) return tree.id === targetId ? null : tree;
  const children: PaneNode[] = [];
  const ratios: number[] = [];
  let changed = false;
  tree.children.forEach((c, i) => {
    const r = removeLeaf(c, targetId);
    if (r !== c) changed = true;
    if (r === null) return;
    children.push(r);
    ratios.push(tree.ratios[i]);
  });
  if (!changed) return tree;
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...tree, children, ratios: normaliseRatios(ratios, children.length) };
}

export function nextLeafId(tree: PaneNode, currentId: PaneId, delta: 1 | -1): PaneId {
  const ids = leafIds(tree);
  if (ids.length === 0) return currentId;
  const idx = ids.indexOf(currentId);
  if (idx < 0) return ids[0];
  return ids[(idx + delta + ids.length) % ids.length];
}

// Closest neighbor of `leafId` within its enclosing split — prefer the
// next sibling, fall back to the previous. Used to pick the new focus
// when a pane closes (so focus stays in the same neighborhood instead of
// snapping to the first pane in the tree).
export function siblingLeafOf(tree: PaneNode, leafId: PaneId): PaneId | null {
  if (isLeaf(tree)) return null;
  for (let i = 0; i < tree.children.length; i++) {
    const c = tree.children[i];
    if (isLeaf(c) && c.id === leafId) {
      const sibling = tree.children[i + 1] ?? tree.children[i - 1];
      if (!sibling) return null;
      return leafIds(sibling)[0] ?? null;
    }
  }
  for (const c of tree.children) {
    if (!isLeaf(c)) {
      const r = siblingLeafOf(c, leafId);
      if (r !== null) return r;
    }
  }
  return null;
}

export function hasLeaf(tree: PaneNode, id: PaneId): boolean {
  return leafIds(tree).includes(id);
}

type PaneRect = { id: PaneId; x: number; y: number; width: number; height: number };

function paneRects(node: PaneNode, x = 0, y = 0, width = 1, height = 1): PaneRect[] {
  if (isLeaf(node)) return [{ id: node.id, x, y, width, height }];
  let offset = 0;
  return node.children.flatMap((child, index) => {
    const share = node.ratios[index];
    const start = offset;
    offset += share;
    return node.dir === 'row'
      ? paneRects(child, x + width * start, y, width * share, height)
      : paneRects(child, x, y + height * start, width, height * share);
  });
}

function directionalTarget(
  rects: PaneRect[],
  active: PaneRect,
  direction: PaneDirection,
): PaneId | null {
  const horizontal = direction === 'left' || direction === 'right';
  const forward = direction === 'right' || direction === 'down';
  const center = (r: PaneRect) => (horizontal ? r.x + r.width / 2 : r.y + r.height / 2);
  const crossCenter = (r: PaneRect) => (horizontal ? r.y + r.height / 2 : r.x + r.width / 2);
  const crossStart = (r: PaneRect) => (horizontal ? r.y : r.x);
  const crossEnd = (r: PaneRect) => (horizontal ? r.y + r.height : r.x + r.width);
  const overlaps = (r: PaneRect) =>
    crossStart(r) < crossEnd(active) && crossEnd(r) > crossStart(active);
  const others = rects.filter((r) => r.id !== active.id && overlaps(r));
  if (others.length === 0) return null;

  const ahead = others.filter((r) =>
    forward ? center(r) > center(active) : center(r) < center(active),
  );
  const candidates = ahead.length > 0 ? ahead : others;
  candidates.sort((a, b) => {
    const axisA =
      ahead.length > 0 ? Math.abs(center(a) - center(active)) : forward ? center(a) : -center(a);
    const axisB =
      ahead.length > 0 ? Math.abs(center(b) - center(active)) : forward ? center(b) : -center(b);
    return (
      axisA - axisB ||
      Math.abs(crossCenter(a) - crossCenter(active)) -
        Math.abs(crossCenter(b) - crossCenter(active))
    );
  });
  return candidates[0]?.id ?? null;
}

function findLeaf(node: PaneNode, id: PaneId): Extract<PaneNode, { kind: 'leaf' }> | null {
  if (isLeaf(node)) return node.id === id ? node : null;
  for (const child of node.children) {
    const found = findLeaf(child, id);
    if (found) return found;
  }
  return null;
}

function swapLeaves(
  node: PaneNode,
  first: Extract<PaneNode, { kind: 'leaf' }>,
  second: Extract<PaneNode, { kind: 'leaf' }>,
): PaneNode {
  if (isLeaf(node)) {
    const slotId = node.slotId ?? node.id;
    if (node.id === first.id) return { ...second, slotId };
    if (node.id === second.id) return { ...first, slotId };
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) => swapLeaves(child, first, second)),
  };
}

function rectsFromBounds(bounds: PaneBounds[]): PaneRect[] {
  return bounds
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top)
    .map((rect) => ({
      id: rect.id,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    }));
}

export function swapLeafInDirection(
  tree: PaneNode,
  activeId: PaneId,
  direction: PaneDirection,
  liveBounds?: PaneBounds[],
): PaneNode {
  const liveRects = liveBounds ? rectsFromBounds(liveBounds) : [];
  const liveIds = new Set(liveRects.map((rect) => rect.id));
  const hasCompleteLiveLayout = leafIds(tree).every((id) => liveIds.has(id));
  const rects = hasCompleteLiveLayout ? liveRects : paneRects(tree);
  const active = rects.find((rect) => rect.id === activeId);
  if (!active || rects.length < 2) return tree;
  const targetId = directionalTarget(rects, active, direction);
  if (targetId === null) return tree;
  const first = findLeaf(tree, activeId);
  const second = findLeaf(tree, targetId);
  return first && second ? swapLeaves(tree, first, second) : tree;
}
