import { type PointerEvent, useRef } from 'react';

/** How far in px a drag on the rail's edge must go before the rail hides or shows (E27-05). */
const EDGE_DRAG_THRESHOLD = 24;

type Direction = 'left' | 'right';

/** Whether a drag `dx` px from where it started has passed the threshold in `direction`. */
export function edgeDragPassed(dx: number, direction: Direction): boolean {
  return (direction === 'left' ? -dx : dx) > EDGE_DRAG_THRESHOLD;
}

/**
 * A drag on an edge that does one thing in one jump: nothing moves before the threshold, and past it the thing is
 * done at once. Until the pointer is released the drag can still take it back, by going back over the threshold.
 * `onChange` reports each crossing, `onEnd` where the drag ended; both get the direction the drag started with.
 */
export function useEdgeDrag({
  direction,
  onChange,
  onEnd,
}: {
  direction: Direction;
  onChange: (passed: boolean, direction: Direction) => void;
  onEnd?: (passed: boolean, direction: Direction) => void;
}) {
  const drag = useRef<{ x: number; direction: Direction; passed: boolean } | null>(null);
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d) onEnd?.(d.passed, d.direction);
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, direction, passed: false };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const passed = edgeDragPassed(e.clientX - d.x, d.direction);
      if (passed === d.passed) return;
      d.passed = passed;
      onChange(passed, d.direction);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}
