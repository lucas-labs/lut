import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * lut's text field (E13-07 design): 6 px radius, a 1 px border and the accent border on focus. `default` has the
 * strong outline of forms and Settings, `subtle` the faint one of toolbar filters. Sizes: `default` 28, `sm` 26
 * (toolbars), `xs` 22 px.
 */
const inputVariants = cva(
  "w-full min-w-0 rounded-md border bg-transparent px-2 text-xs text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "border-muted-foreground/75",
        subtle: "border-input",
      },
      size: {
        default: "h-7",
        sm: "h-6.5",
        xs: "h-5.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Input({
  className,
  type,
  variant,
  size,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Input }
