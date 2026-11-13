import { cn } from "cn"

// Placeholder blocks that keep the layout steady while data loads.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-line-2", className)}
      {...props}
    />
  )
}

export { Skeleton }
