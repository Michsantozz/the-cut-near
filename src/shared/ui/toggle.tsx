"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Toggle as TogglePrimitive } from "radix-ui"

// "chip" is the design's sort/filter pill: white with an ink border, solid ink when on.
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "rounded-md bg-transparent text-ink hover:bg-canvas data-[state=on]:bg-canvas",
        chip: "rounded-full border-2 border-ink bg-paper text-ink hover:bg-canvas data-[state=on]:bg-ink data-[state=on]:text-paper",
      },
      size: {
        sm: "h-[26px] px-[9px] text-[11.5px]",
        default: "h-8 px-3 text-xs font-extrabold",
        lg: "h-9 px-3.5 text-[13px] font-extrabold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
