import { Archive, CheckCircle2, CircleDot, Clock, FileEdit, Send } from 'lucide-react'
import type { ComponentType } from 'react'
import { Badge, type BadgeProps } from '@/client/components/ui/badge'
import { POLL_STATUS_LABELS } from '@/shared/constants'
import type { PollStatus } from '@/shared/types'
import { cn } from '@/client/lib/utils'

interface StatusStyle {
  variant: BadgeProps['variant']
  icon: ComponentType<{ className?: string }>
}

const STYLES: Record<PollStatus, StatusStyle> = {
  DRAFT: { variant: 'muted', icon: FileEdit },
  SCHEDULED: { variant: 'info', icon: Clock },
  PUBLISHED: { variant: 'secondary', icon: Send },
  ACTIVE: { variant: 'success', icon: CircleDot },
  CLOSED: { variant: 'outline', icon: CheckCircle2 },
  ARCHIVED: { variant: 'muted', icon: Archive },
}

export function PollStatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: PollStatus
  className?: string
  showIcon?: boolean
}) {
  const style = STYLES[status]
  const Icon = style.icon

  return (
    <Badge variant={style.variant} className={cn('uppercase tracking-wide', className)}>
      {showIcon ? (
        <Icon className={cn('size-3', status === 'ACTIVE' && 'animate-pulse')} aria-hidden="true" />
      ) : null}
      {POLL_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
