import { cn } from "@/lib/utils"
import { type LutIconProps, SpinnerIcon } from "@lut/lut-icons"

function Spinner({ className, size = "md", ...props }: LutIconProps) {
  return (
    <SpinnerIcon
      role="status"
      aria-label="Loading"
      size={size}
      className={cn("animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
