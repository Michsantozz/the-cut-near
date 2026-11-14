import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Buttons of the design: 2px ink border, heavy Inter label, optional hard shadow that "presses" on click.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 border-2 border-ink font-extrabold whitespace-nowrap transition-[transform,box-shadow,background-color] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-blue text-paper hover:bg-blue/90",
        lime: "bg-lime text-ink hover:bg-lime/85",
        black: "bg-ink text-paper hover:bg-ink-2",
        outline: "bg-paper text-ink hover:bg-canvas",
        soft: "bg-canvas text-ink hover:bg-line",
        ghost: "border-transparent bg-transparent text-ink-3 hover:text-ink",
        link: "h-auto border-transparent bg-transparent p-0 font-bold text-ink underline underline-offset-4",
      },
      size: {
        xs: "h-[26px] gap-1 rounded-full px-2.5 text-[11.5px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-full px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-9 rounded-md px-3.5 text-[13px]",
        default: "h-10 rounded-md px-4 text-sm",
        lg: "h-[42px] rounded-[13px] px-[18px] text-[15px]",
        xl: "h-12 rounded-xl px-[22px] text-[15px]",
        icon: "size-[42px] rounded-[13px]",
        "icon-sm": "size-[38px] rounded-md",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
      elevated: {
        true: "shadow-hard-sm active:translate-x-px active:translate-y-px active:shadow-hard-xs",
        false: "active:translate-y-px",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
      shape: "default",
      elevated: false,
    },
  }
)

function Button({
  className,
  variant = "outline",
  size = "default",
  shape = "default",
  elevated = false,
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
      className={cn(buttonVariants({ variant, size, shape, elevated, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
