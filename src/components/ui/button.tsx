import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * lut's buttons (E13-07 design). Sizes: `lg` 30 px for dialogs, `default` 28 px for forms and settings, `sm` 26 px
 * for toolbars, `xs` 20 px for small text actions; `icon` 28, `icon-sm` 24 and `icon-xs` 20 px squares;
 * `inline` takes the size of the text around it, for a link inside a sentence.
 * The design's bordered "ghost" button is `outline` here (forms, Settings) and its toolbar button `outline-subtle`,
 * with the faint border; its borderless icon button is `ghost`.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary font-medium text-primary-foreground hover:brightness-106",
        outline:
          "border-muted-foreground/75 bg-transparent text-foreground hover:bg-accent aria-expanded:bg-accent",
        "outline-subtle":
          "border-border bg-transparent text-foreground hover:bg-accent aria-expanded:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive: "bg-destructive font-medium text-white hover:brightness-108",
        link: "text-primary underline underline-offset-2 hover:text-foreground",
      },
      size: {
        lg: "h-7.5 gap-1.5 px-3.5 text-[13px]",
        default: "h-7 gap-1.5 px-2.5",
        sm: "h-6.5 gap-1.5 px-2",
        xs: "h-5 gap-1 rounded-sm px-1.5 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        icon: "size-7",
        "icon-sm": "size-6",
        "icon-xs": "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        inline: "gap-1 rounded-sm border-0 p-0 align-baseline text-[length:inherit] leading-[inherit]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
