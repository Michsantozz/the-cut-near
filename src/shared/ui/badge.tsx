import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Small pills: tags on rows ("YOUR 400", "NEW", "DELETED"), the "Cut" mark and the LIVE dot.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border-[1.5px] border-ink font-extrabold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        lime: "bg-lime text-ink",
        ink: "bg-ink text-paper",
        danger: "bg-danger text-paper",
        paper: "bg-paper text-ink",
        cutline: "border-danger bg-danger-tint text-ink",
      },
      size: {
        xs: "px-[5px] text-[8.5px] leading-3 tracking-[0.03em]",
        sm: "px-[7px] text-[10px] leading-[15px] tracking-[0.04em]",
        md: "px-2.5 text-[12.5px] leading-[21px]",
      },
    },
    defaultVariants: {
      variant: "lime",
      size: "sm",
    },
  }
)

function Badge({
  className,
  variant = "lime",
  size = "sm",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
