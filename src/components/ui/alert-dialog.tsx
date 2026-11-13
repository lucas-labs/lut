import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/70 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-110 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-popover p-5 text-sm text-popover-foreground shadow-[0_16px_48px_rgba(0,0,0,0.4)] duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-97 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-97",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

/** Title and description; with an `AlertDialogMedia` first, the icon sits left of both. */
function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid gap-1 has-data-[slot=alert-dialog-media]:grid-cols-[auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-3",
        className
      )}
      {...props}
    />
  )
}

/**
 * The buttons, right-aligned. `actionFirst` puts the action left of Cancel (Windows' order); otherwise Cancel comes
 * first. Cancel stays first in the tab order either way.
 */
function AlertDialogFooter({
  className,
  actionFirst = false,
  ...props
}: React.ComponentProps<"div"> & { actionFirst?: boolean }) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "mt-1 flex gap-2",
        actionFirst ? "flex-row-reverse justify-start" : "justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "row-span-2 mt-px flex size-5 items-center justify-center *:[svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    />
  )
}

/** The warning mark for a confirmation that stops or discards something. */
function AlertDialogWarning() {
  return (
    <AlertDialogMedia>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2 20h20L12 3z" className="fill-warning" />
        <path
          d="M12 10v4M12 17h.01"
          className="stroke-primary-foreground"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </svg>
    </AlertDialogMedia>
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

const DIALOG_BUTTON =
  "inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3.5 text-sm whitespace-nowrap transition-[border-color,filter] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"

const ACTION_TONE = {
  primary: "bg-primary text-primary-foreground",
  danger: "bg-destructive text-white",
} as const

/** The confirming button; `danger` for one that stops or discards something. */
function AlertDialogAction({
  className,
  tone = "primary",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  tone?: keyof typeof ACTION_TONE
}) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(
        DIALOG_BUTTON,
        "border-transparent font-medium hover:brightness-108",
        ACTION_TONE[tone],
        className
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(
        DIALOG_BUTTON,
        "border-border bg-card text-foreground hover:border-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogWarning,
}
