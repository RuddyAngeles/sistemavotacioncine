import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/client/lib/utils'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-soft',
        'placeholder:text-muted-foreground resize-y',
        'transition-[border-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/25',
        className,
      )}
      {...props}
    />
  )
}
