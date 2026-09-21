import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/client/components/common/confirm-dialog'
import { PageHeader } from '@/client/components/common/page-header'
import { Pagination } from '@/client/components/common/pagination'
import { EmptyState, ErrorState } from '@/client/components/common/states'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Skeleton } from '@/client/components/ui/skeleton'
import {
  CreateUserDialog,
  EditUserDialog,
  ResetPasswordDialog,
} from '@/client/components/users/user-dialogs'
import { UserTable } from '@/client/components/users/user-table'
import { useAuth } from '@/client/hooks/use-auth'
import { errorMessage } from '@/client/lib/api'
import type {
  CreateUserFormValues,
  EditUserFormValues,
  ResetPasswordFormValues,
} from '@/client/lib/form-schemas'
import { queryKeys, usersApi, type UserFilters } from '@/client/lib/queries'
import type { UserDTO } from '@/shared/types'

/**
 * Cuantos usuarios se piden por pagina.
 *
 * Con una plantilla normal caben todos en una sola pagina; la paginacion
 * esta ahi para que la lista nunca se recorte en silencio al crecer.
 */
const PAGE_SIZE = 100

/** Gestion de cuentas. Unica via de alta en el sistema. */
export function UsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserDTO | null>(null)
  const [resetting, setResetting] = useState<UserDTO | null>(null)
  const [deleting, setDeleting] = useState<UserDTO | null>(null)

  const filters: UserFilters = {
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(status !== 'all' ? { status } : {}),
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.users(filters as Record<string, unknown>),
    queryFn: () => usersApi.list(filters),
    staleTime: 15_000,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['users'] })
    await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
  }

  const createMutation = useMutation({
    mutationFn: (values: CreateUserFormValues) => usersApi.create(values),
    onSuccess: async (response) => {
      setCreating(false)
      toast.success('Usuario creado', {
        description: 'Entrega las credenciales a ' + response.user.name + ' por un canal interno.',
      })
      await invalidate()
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<EditUserFormValues> }) =>
      usersApi.update(id, values),
    onSuccess: async () => {
      setEditing(null)
      toast.success('Usuario actualizado')
      await invalidate()
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  })

  const resetMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ResetPasswordFormValues }) =>
      usersApi.resetPassword(id, {
        password: values.password,
        mustChangePassword: values.mustChangePassword,
      }),
    onSuccess: async () => {
      setResetting(null)
      toast.success('Contrasena restablecida', {
        description: 'Se han cerrado las sesiones abiertas de ese usuario.',
      })
      await invalidate()
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: async () => {
      setDeleting(null)
      toast.success('Usuario eliminado')
      await invalidate()
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  })

  const users = data?.items ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Usuarios"
        description="Las cuentas solo se crean desde aqui. No existe registro publico ni recuperacion por correo."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Crear usuario
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por nombre o usuario…"
            className="pl-9"
            aria-label="Buscar usuarios"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-48" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ACTIVE">Activos</SelectItem>
            <SelectItem value="INACTIVE">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={search || status !== 'all' ? 'Sin resultados' : 'No hay usuarios todavia'}
          description={
            search || status !== 'all'
              ? 'Prueba con otros filtros.'
              : 'Crea las cuentas de los trabajadores para que puedan votar.'
          }
          action={
            !search && status === 'all' ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                Crear usuario
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <UserTable
            users={users}
            currentUserId={currentUser?.id}
            onEdit={setEditing}
            onResetPassword={setResetting}
            onDelete={setDeleting}
            onToggleStatus={(user) =>
              updateMutation.mutate({
                id: user.id,
                values: { status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
              })
            }
          />

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? users.length}
            label="usuarios"
            onPageChange={setPage}
          />
        </div>
      )}

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        submitting={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      <EditUserDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        user={editing}
        submitting={updateMutation.isPending}
        onSubmit={(values) => {
          if (editing) updateMutation.mutate({ id: editing.id, values })
        }}
      />

      <ResetPasswordDialog
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
        user={resetting}
        submitting={resetMutation.isPending}
        onSubmit={(values) => {
          if (resetting) resetMutation.mutate({ id: resetting.id, values })
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar usuario?"
        description={
          <>
            Se eliminara la cuenta de <strong>{deleting?.name}</strong>, sus sesiones abiertas y los
            votos que haya emitido. Esta accion no se puede deshacer. Si solo quieres retirarle el
            acceso, desactivalo en su lugar.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id)
        }}
      />
    </div>
  )
}
