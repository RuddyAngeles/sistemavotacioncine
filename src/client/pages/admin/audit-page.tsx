import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/client/components/common/page-header'
import { Pagination } from '@/client/components/common/pagination'
import { EmptyState, ErrorState } from '@/client/components/common/states'
import { Badge } from '@/client/components/ui/badge'
import { Card } from '@/client/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Skeleton } from '@/client/components/ui/skeleton'
import { errorMessage } from '@/client/lib/api'
import { formatShortDateTime } from '@/client/lib/format'
import { auditApi, queryKeys, type AuditFilters } from '@/client/lib/queries'
import { AUDIT_ACTION_LABELS } from '@/shared/constants'

const ENTITIES = [
  { value: 'all', label: 'Todas las entidades' },
  { value: 'user', label: 'Usuarios' },
  { value: 'poll', label: 'Votaciones' },
  { value: 'option', label: 'Peliculas' },
  { value: 'session', label: 'Sesiones' },
  { value: 'media', label: 'Carteleras' },
  { value: 'participation', label: 'Participacion' },
]

const PAGE_SIZE = 50

/** Registro de acciones administrativas y de seguridad. */
export function AuditPage() {
  const [entity, setEntity] = useState('all')
  const [page, setPage] = useState(1)

  const filters: AuditFilters = {
    page,
    pageSize: PAGE_SIZE,
    ...(entity !== 'all' ? { entity } : {}),
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.audit(filters as Record<string, unknown>),
    queryFn: () => auditApi.list(filters),
    staleTime: 10_000,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-8">
      <PageHeader
        title="Auditoria"
        description="Quien hizo que y cuando. Se conserva un ano y despues se purga automaticamente."
      />

      <div className="flex items-center gap-3">
        <Select
          value={entity}
          onValueChange={(value) => {
            setEntity(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-56" aria-label="Filtrar por entidad">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin registros" description="Aun no hay actividad registrada." />
      ) : (
        <>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {items.map((log) => (
                <li key={log.id} className="flex flex-col gap-1.5 px-5 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <Badge variant="muted" className="font-mono text-[10px]">
                      {log.entity}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {formatShortDateTime(log.createdAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Por{' '}
                      <span className="font-mono text-foreground">
                        {log.actorUsername ?? 'desconocido'}
                      </span>
                    </span>
                    {log.ip ? <span className="font-mono">{log.ip}</span> : null}
                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <span className="truncate font-mono">{JSON.stringify(log.metadata)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            label="registros"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
