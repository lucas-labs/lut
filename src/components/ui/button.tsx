import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * lut's buttons (E13-07 design). Sizes: `lg` 30 px for dialogs, `default` 28 px for forms and settings, `sm` 26 px
 * for toolbars, `xs` 20 px for small text actions; `icon` 28, `icon-sm` 24, `icon-xs` 20 and `icon-2xs` 14 px squares
 * (`icon-2xs` fits inside a 16 px status-line pill). An icon square is 1 px smaller on a side where its lut icon is
 * an odd number of px (`data-odd`), so the icon stays centred on whole pixels;
 * `inline` takes the size of the text around it, for a link inside a sentence.
 * The design's bordered "ghost" button is `outline` here (forms, Settings) and its toolbar button `outline-subtle`,
 * with the faint border; its borderless icon button is `ghost`. `outline-hover` shows its border only on hover, and the
 * accent border while pressed: the shortcut buttons of Settings, at size `keys` (28 px, tight around their keys).
 * `rail` is `ghost` that stays filled while it is the current item (`aria-current`) or its view is open
 * (`aria-pressed`): the compact sidebar's rail.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-disabled:cursor-default aria-disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
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
        rail:
          "text-muted-foreground hover:bg-accent hover:text-foreground aria-[current]:bg-accent aria-[current]:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground",
        destructive: "bg-destructive font-medium text-white hover:brightness-108",
        "outline-hover":
          "text-muted-foreground hover:border-muted-foreground/75 aria-pressed:border-primary aria-pressed:text-foreground",
        link: "text-primary underline underline-offset-2 hover:text-foreground",
      },
      size: {
        lg: "h-7.5 gap-1.5 px-3.5 text-[13px]",
        default: "h-7 gap-1.5 px-2.5",
        sm: "h-6.5 gap-1.5 px-2",
        xs: "h-5 gap-1 rounded-sm px-1.5 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        icon: "size-7 has-[svg[data-odd*=x]]:w-6.75 has-[svg[data-odd*=y]]:h-6.75",
        "icon-sm": "size-6 has-[svg[data-odd*=x]]:w-5.75 has-[svg[data-odd*=y]]:h-5.75",
        "icon-xs":
          "size-5 rounded-sm has-[svg[data-odd*=x]]:w-4.75 has-[svg[data-odd*=y]]:h-4.75 [&_svg:not([class*='size-'])]:size-3",
        "icon-2xs":
          "size-3.5 rounded-sm has-[svg[data-odd*=x]]:w-3.25 has-[svg[data-odd*=y]]:h-3.25 [&_svg:not([class*='size-'])]:size-2.5",
        keys: "h-7 gap-1 px-1",
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
  type,
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
      // An action, not a form submit unless it says so: Enter in a form field must not press the first button.
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
