"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as SheetPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-scrim duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * `side="auto"` is the design's wallet sheet: a bottom sheet on the phone, a centered dialog on a laptop.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left" | "auto"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col bg-popover text-popover-foreground outline-none transition duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:max-w-sm data-[side=left]:border-r-2 data-[side=left]:data-open:slide-in-from-left-10 data-[side=left]:data-closed:slide-out-to-left-10",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:max-w-sm data-[side=right]:border-l-2 data-[side=right]:data-open:slide-in-from-right-10 data-[side=right]:data-closed:slide-out-to-right-10",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:rounded-b-4xl data-[side=top]:border-b-2 data-[side=top]:data-open:slide-in-from-top-10 data-[side=top]:data-closed:slide-out-to-top-10",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:rounded-t-4xl data-[side=bottom]:border-t-2 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=bottom]:data-closed:slide-out-to-bottom-10",
          "data-[side=auto]:inset-x-0 data-[side=auto]:bottom-0 data-[side=auto]:max-h-[90dvh] data-[side=auto]:overflow-y-auto data-[side=auto]:rounded-t-4xl data-[side=auto]:border-t-2 data-[side=auto]:data-open:slide-in-from-bottom-10 data-[side=auto]:data-closed:slide-out-to-bottom-10",
          "lg:data-[side=auto]:inset-auto lg:data-[side=auto]:top-1/2 lg:data-[side=auto]:left-1/2 lg:data-[side=auto]:w-[460px] lg:data-[side=auto]:-translate-x-1/2 lg:data-[side=auto]:-translate-y-1/2 lg:data-[side=auto]:rounded-[26px] lg:data-[side=auto]:border-[3px] lg:data-[side=auto]:shadow-hard-lg lg:data-[side=auto]:data-open:slide-in-from-bottom-4",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="outline" size="icon-sm" className="absolute top-4 right-4">
              <XIcon strokeWidth={2.8} />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 pr-12", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-2xl leading-7 font-extrabold text-ink lg:text-[28px] lg:leading-8",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm leading-5 text-ink-2 lg:text-[14.5px] lg:leading-[21px]", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
