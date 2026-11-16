import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * lut's multi-line field, as `Input` (E13-07 design): 6 px radius, a 1 px border and the accent border on focus.
 * `default` has the strong outline of forms, `subtle` the faint one; `bare` draws no border, for a field inside a
 * box that draws it (the commit message and its counter).
 */
const textareaVariants = cva(
  "block w-full min-w-0 resize-none rounded-md border bg-transparent px-2.5 py-2 text-[13px] leading-[18px] text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "border-muted-foreground/75",
        subtle: "border-input",
        bare: "rounded-none border-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea data-slot="textarea" className={cn(textareaVariants({ variant, className }))} {...props} />
  )
}

export { Textarea }
