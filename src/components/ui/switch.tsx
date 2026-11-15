import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** How far the knob travels from off to on, in px. */
const KNOB_TRAVEL = 14
/** The pressed pill is 3 px longer, so it travels 3 px less. */
const PRESSED_TRAVEL = 11
/** Pointer travel below this is a click, not a drag. */
const DRAG_SLOP = 3

type Drag = {
  pointerId: number
  startX: number
  /** Screen px per CSS px, so a zoomed window still tracks the pointer. */
  scale: number
  wasOn: boolean
  x: number
  moved: boolean
}

/**
 * lut's switch (E13-07 design): 34×20, an outlined track with a 12 px knob that turns accent when on. It behaves like
 * Windows 11's: the knob grows on hover, stretches toward the middle while pressed, and follows the pointer when
 * dragged; releasing past the middle switches it. A plain click and the keyboard toggle it as usual.
 */
function Switch({
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const [pressed, setPressed] = React.useState(false)
  const [dragX, setDragX] = React.useState<number | null>(null)
  const drag = React.useRef<Drag | null>(null)
  // A drag that ends on the side it started from must not toggle through the click that follows it.
  const swallowClick = React.useRef(false)

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>, released: boolean) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    setPressed(false)
    setDragX(null)
    if (released && d.moved) swallowClick.current = d.x > KNOB_TRAVEL / 2 === d.wasOn
  }

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-pressed={pressed || undefined}
      className={cn(
        "peer group/switch relative inline-flex h-5 w-8.5 shrink-0 touch-none items-center rounded-full border border-muted-foreground/75 bg-transparent px-0.75 transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive data-checked:border-primary data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className
      )}
      onPointerDown={(e) => {
        onPointerDown?.(e)
        const el = e.currentTarget
        if (e.defaultPrevented || e.button !== 0 || el.disabled) return
        el.setPointerCapture(e.pointerId)
        const wasOn = el.dataset.state === "checked"
        drag.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          scale: el.getBoundingClientRect().width / el.offsetWidth || 1,
          wasOn,
          x: wasOn ? KNOB_TRAVEL : 0,
          moved: false,
        }
        swallowClick.current = false
        setPressed(true)
      }}
      onPointerMove={(e) => {
        onPointerMove?.(e)
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        const dx = (e.clientX - d.startX) / d.scale
        if (!d.moved && Math.abs(dx) < DRAG_SLOP) return
        d.moved = true
        d.x = Math.min(KNOB_TRAVEL, Math.max(0, (d.wasOn ? KNOB_TRAVEL : 0) + dx))
        setDragX(d.x)
      }}
      onPointerUp={(e) => {
        onPointerUp?.(e)
        endDrag(e, true)
      }}
      onPointerCancel={(e) => {
        onPointerCancel?.(e)
        endDrag(e, false)
      }}
      onClick={(e) => {
        onClick?.(e)
        if (!swallowClick.current) return
        swallowClick.current = false
        // Radix skips its toggle for a prevented click.
        e.preventDefault()
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        // While dragged the 17 px pill travels 11 px: its outer end lands where the 14 px knob's would.
        style={
          dragX === null
            ? undefined
            : { translate: `${(dragX * PRESSED_TRAVEL) / KNOB_TRAVEL}px 0`, transitionProperty: "width, height, margin" }
        }
        className={cn(
          "pointer-events-none block size-3 shrink-0 rounded-full bg-muted-foreground transition-[width,height,margin,translate,background-color] duration-150 ease-out data-checked:translate-x-3.5 data-checked:bg-primary-foreground data-unchecked:translate-x-0",
          // Hover: 14 px, around its centre.
          "[:enabled:hover:not([data-pressed])>&]:-ml-px [:enabled:hover:not([data-pressed])>&]:size-3.5",
          // Pressed or dragged: a 17×14 pill, stretched from the side it rests on toward the middle.
          "[[data-pressed]>&]:-ml-px [[data-pressed]>&]:h-3.5 [[data-pressed]>&]:w-[17px] [[data-pressed]>&]:data-checked:translate-x-2.75"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
