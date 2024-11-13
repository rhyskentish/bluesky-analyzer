import React from 'react'
import { cn } from "@/lib/utils"

const Button = React.forwardRef(({ className, children, disabled, ...props }, ref) => {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        "disabled:opacity-50 disabled:pointer-events-none",
        "bg-slate-900 text-white hover:bg-slate-800",
        "h-10 py-2 px-4",
        className
      )}
      ref={ref}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
})
Button.displayName = "Button"

export { Button }