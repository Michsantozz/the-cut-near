"use client"

import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

// The design's switch: a 50x30 pill with an ink border, lime when on, and a white knob with an ink ring.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full border-2 border-ink px-[3px] transition-colors outline-none after:absolute after:-inset-x-2 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-lime data-unchecked:bg-canvas data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full border-2 border-ink bg-paper transition-[margin] group-data-checked/switch:ml-auto"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
