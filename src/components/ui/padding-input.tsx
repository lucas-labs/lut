import * as React from "react"
import {
  SpaceAllSidesIcon,
  SpaceBottomIcon,
  SpaceHorizontalIcon,
  SpaceLeftIcon,
  SpaceRightIcon,
  SpaceTopIcon,
  SpaceVerticalIcon,
} from "@lut/lut-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Padding } from "@/lib/padding"
import { cn } from "@/lib/utils"

type Side = keyof Padding

type Field = {
  label: string
  icon: typeof SpaceTopIcon
  /** The sides the field sets; it shows the first one's value. */
  sides: readonly Side[]
}

const AXES: readonly Field[] = [
  { label: "Horizontal padding", icon: SpaceVerticalIcon, sides: ["left", "right"] },
  { label: "Vertical padding", icon: SpaceHorizontalIcon, sides: ["top", "bottom"] },
]

const SIDES: readonly Field[] = [
  { label: "Left padding", icon: SpaceLeftIcon, sides: ["left"] },
  { label: "Top padding", icon: SpaceTopIcon, sides: ["top"] },
  { label: "Right padding", icon: SpaceRightIcon, sides: ["right"] },
  { label: "Bottom padding", icon: SpaceBottomIcon, sides: ["bottom"] },
]

type PaddingInputProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  value: Padding
  onChange: (value: Padding) => void
  /** The largest value of a side, in px; the smallest is 0. */
  max?: number
}

/**
 * Padding in px, like Figma's: a horizontal (left + right) and a vertical (top + bottom) field, and a button that
 * splits them into one field per side. It opens split when opposite sides differ and stays split until the button
 * joins them, which sets left and right to the left value, and top and bottom to the top one.
 */
function PaddingInput({ value, onChange, max = Number.POSITIVE_INFINITY, className, ...props }: PaddingInputProps) {
  const differs = value.left !== value.right || value.top !== value.bottom
  // Split stays split while a side is edited, even when the sides match on the way; only the
  // toggle joins them. A value that arrives with differing sides opens it.
  const [split, setSplit] = React.useState(differs)
  if (differs && !split) setSplit(true)
  const fields = split ? SIDES : AXES

  const toggle = () => {
    if (split && differs) {
      onChange({ top: value.top, right: value.left, bottom: value.top, left: value.left })
    }
    setSplit(!split)
  }

  const set = (field: Field, n: number) => {
    const next = { ...value }
    for (const side of field.sides) next[side] = n
    onChange(next)
  }

  return (
    <div
      role="group"
      data-slot="padding-input"
      className={cn("grid grid-cols-[4.5rem_4.5rem_auto] items-center gap-1.5", className)}
      {...props}
    >
      {fields.map((field, index) => (
        <React.Fragment key={field.label}>
          <PaddingField field={field} value={value[field.sides[0]]} max={max} onCommit={(n) => set(field, n)} />
          {index === 1 && (
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={split}
              aria-label="Set each side"
              title="Set each side"
              onClick={toggle}
            >
              <SpaceAllSidesIcon size="sm" />
            </Button>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function PaddingField({
  field,
  value,
  max,
  onCommit,
}: {
  field: Field
  value: number
  max: number
  onCommit: (value: number) => void
}) {
  // What is being typed: an empty field is kept until it holds a number again, or loses focus.
  const [draft, setDraft] = React.useState<string | null>(null)
  const Icon = field.icon
  return (
    <div className="relative">
      <Icon
        size="sm"
        className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={Number.isFinite(max) ? max : undefined}
        step={1}
        aria-label={field.label}
        className="pl-7 tabular-nums"
        value={draft ?? String(value)}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          const n = Number(text)
          if (text.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(0, Math.round(n))))
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

export { PaddingInput }
