import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** A colour as hue (0–360), saturation and value (0–1). */
type Hsv = { h: number; s: number; v: number }

const HEX = /^#?([0-9a-f]{6})$/i

/** `#rrggbb` from what the user typed (with or without `#`, any case); null when it is not one. */
function parseHex(text: string): string | null {
  const match = HEX.exec(text.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

function hexToHsv(hex: string): Hsv {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  let h = 0
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max }
}

function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0")
  }
  return `#${channel(5)}${channel(3)}${channel(1)}`
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

/** Where a pointer is in `element`, as shares (0–1) of its width and height. */
function shareOf(element: HTMLElement, e: React.PointerEvent): { x: number; y: number } {
  const box = element.getBoundingClientRect()
  return {
    x: clamp((e.clientX - box.left) / (box.width || 1)),
    y: clamp((e.clientY - box.top) / (box.height || 1)),
  }
}

/** Pointer handlers that follow a press and its drag over an element, capturing the pointer. */
function useDrag(onMove: (element: HTMLElement, e: React.PointerEvent) => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      e.currentTarget.focus()
      onMove(e.currentTarget, e)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) onMove(e.currentTarget, e)
    },
  }
}

const KNOB =
  "pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.45)]"

type ColorSwatchProps = {
  /** `none` is no colour, `custom` opens a picker and shows `color` once one is set. */
  kind: "none" | "color" | "custom"
  /** The CSS colour it shows. */
  color?: string | null
  className?: string
}

/**
 * One round swatch of a colour row (E11-04 design): a colour, "no colour" (a ring crossed by a line) or "custom" (a
 * hue wheel until a custom colour is set). It is only the look: the control around it says what it does, and its
 * `data-state="checked"` (a Radix radio item's) rings it.
 */
function ColorSwatch({ kind, color, className }: ColorSwatchProps) {
  const fill =
    kind === "none"
      ? undefined
      : kind === "custom" && !color
        ? "conic-gradient(#f2665f,#e8c25a,#9fd65a,#5cc8c0,#6cb0f5,#d98ad6,#f2665f)"
        : (color ?? undefined)
  return (
    <span
      aria-hidden
      data-slot="color-swatch"
      className={cn(
        "relative block size-[18px] shrink-0 rounded-full transition-transform",
        "group-data-highlighted/swatch:scale-110 group-hover/swatch:scale-110",
        "group-data-[state=checked]/swatch:ring-[1.5px] group-data-[state=checked]/swatch:ring-foreground group-data-[state=checked]/swatch:ring-offset-2 group-data-[state=checked]/swatch:ring-offset-popover",
        kind === "none" &&
          "shadow-[inset_0_0_0_1px_var(--muted-foreground)] after:absolute after:inset-x-[3px] after:top-1/2 after:h-[1.5px] after:-translate-y-1/2 after:-rotate-45 after:bg-muted-foreground",
        className
      )}
      style={fill ? { background: fill } : undefined}
    />
  )
}

type ColorPickerProps = {
  /** The `#rrggbb` it starts from. */
  initial: string
  /** The `#rrggbb` the user applied. */
  onApply: (hex: string) => void
  /** Focus the hex field when it shows, so the keyboard starts there. */
  autoFocus?: boolean
  className?: string
}

/**
 * A custom colour (E11-04 design): a saturation and brightness area, a hue bar, a preview, the hex and Apply. The
 * area and the bar are sliders that also move with the arrow keys (Shift for bigger steps); Enter in the hex field
 * applies it. Apply stays off while the hex is not a `#rrggbb` colour.
 */
function ColorPicker({ initial, onApply, autoFocus, className }: ColorPickerProps) {
  const [hsv, setHsv] = React.useState(() => hexToHsv(parseHex(initial) ?? "#808080"))
  const [text, setText] = React.useState(() => parseHex(initial) ?? "#808080")
  const hex = parseHex(text)

  const change = (next: Hsv) => {
    setHsv(next)
    setText(hsvToHex(next))
  }

  const area = useDrag((element, e) => {
    const { x, y } = shareOf(element, e)
    change({ ...hsv, s: x, v: 1 - y })
  })
  const hueBar = useDrag((element, e) => change({ ...hsv, h: shareOf(element, e).x * 360 }))

  const onAreaKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step) },
      ArrowRight: { s: clamp(hsv.s + step) },
      ArrowUp: { v: clamp(hsv.v + step) },
      ArrowDown: { v: clamp(hsv.v - step) },
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    change({ ...hsv, ...move })
  }

  const onHueKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
    const by = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key]
    if (by === undefined) return
    e.preventDefault()
    change({ ...hsv, h: clamp(hsv.h + by, 0, 360) })
  }

  const apply = () => {
    if (hex) onApply(hex)
  }

  return (
    <div data-slot="color-picker" role="group" aria-label="Custom color" className={cn("flex flex-col gap-2", className)}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        className="relative h-30 cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex({ h: hsv.h, s: 1, v: 1 })})`,
        }}
        onKeyDown={onAreaKey}
        {...area}
      >
        <span className={KNOB} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-2.5 cursor-pointer touch-none rounded-full bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onKeyDown={onHueKey}
        {...hueBar}
      >
        <span className={cn(KNOB, "top-1/2")} style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-6 shrink-0 rounded-[5px] border border-border"
          style={{ background: hex ?? "transparent" }}
        />
        <Input
          size="sm"
          aria-label="Hex color"
          autoFocus={autoFocus}
          aria-invalid={hex === null}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const parsed = parseHex(e.target.value)
            if (parsed) setHsv(hexToHsv(parsed))
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            apply()
          }}
        />
        <Button size="sm" disabled={hex === null} onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  )
}

export { ColorPicker, ColorSwatch, hexToHsv, hsvToHex, parseHex }
