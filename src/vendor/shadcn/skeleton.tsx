// Published source: https://ui.shadcn.com/r/styles/new-york/skeleton.json
// Catalog: https://21st.dev/@shadcn/components/skeleton
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
