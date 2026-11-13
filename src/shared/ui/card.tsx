import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Cards of the design: rounded, 2px ink border, hard offset shadow. Padding is set by each screen.
const cardVariants = cva("relative rounded-3xl border-2 border-ink", {
  variants: {
    tone: {
      paper: "bg-card text-card-foreground",
      canvas: "bg-canvas text-ink",
      lime: "bg-lime text-ink",
      violet: "bg-violet text-paper",
      ink: "bg-ink text-paper",
      pink: "bg-pink text-ink",
    },
    elevation: {
      none: "",
      sm: "shadow-hard-sm",
      md: "shadow-hard",
    },
  },
  defaultVariants: { tone: "paper", elevation: "md" },
})

function Card({
  className,
  tone,
  elevation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-tone={tone ?? "paper"}
      className={cn(cardVariants({ tone, elevation }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1 px-4 pt-4", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-[22px] leading-[26px] font-extrabold tracking-[-0.02em]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[13px] leading-[18px] font-semibold text-ink-3", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-4", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2 px-4 pb-4", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
