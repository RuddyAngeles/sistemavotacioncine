import { motion } from 'framer-motion'
import type { ComponentType, ReactNode } from 'react'
import { Card } from '@/client/components/ui/card'
import { cn } from '@/client/lib/utils'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ComponentType<{ className?: string }>
  accent?: 'default' | 'success' | 'warning' | 'info'
  index?: number
  className?: string
}

const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
}

/** Tarjeta de metrica del panel. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'default',
  index = 0,
  className,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: 'easeOut' }}
    >
      <Card className={cn('p-5', className)}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon ? <Icon className={cn('size-4 shrink-0', ACCENTS[accent])} /> : null}
        </div>
        <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </Card>
    </motion.div>
  )
}
