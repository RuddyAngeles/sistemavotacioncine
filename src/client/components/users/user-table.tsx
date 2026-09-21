import { KeyRound, MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import { formatRelative } from '@/client/lib/format'
import type { UserDTO } from '@/shared/types'

interface UserTableProps {
  users: UserDTO[]
  currentUserId: string | undefined
  onEdit: (user: UserDTO) => void
  onToggleStatus: (user: UserDTO) => void
  onResetPassword: (user: UserDTO) => void
  onDelete: (user: UserDTO) => void
}

export function UserTable({
  users,
  currentUserId,
  onEdit,
  onToggleStatus,
  onResetPassword,
  onDelete,
}: UserTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead className="hidden sm:table-cell">Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="hidden lg:table-cell">Ultimo acceso</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId

            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {user.name}
                    {isSelf ? (
                      <Badge variant="outline" className="text-[10px]">
                        Tu
                      </Badge>
                    ) : null}
                  </span>
                  {user.mustChangePassword ? (
                    <span className="mt-0.5 block text-xs text-warning">
                      Debe cambiar la contrasena
                    </span>
                  ) : null}
                </TableCell>

                <TableCell className="font-mono text-xs text-muted-foreground">
                  {user.username}
                </TableCell>

                <TableCell className="hidden sm:table-cell">
                  <Badge variant={user.role === 'ADMIN' ? 'secondary' : 'muted'}>
                    {user.role === 'ADMIN' ? 'Administrador' : 'Trabajador'}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Badge variant={user.status === 'ACTIVE' ? 'success' : 'muted'}>
                    {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>

                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca'}
                </TableCell>

                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={'Acciones para ' + user.name}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(user)}>
                        <Pencil />
                        Editar
                      </DropdownMenuItem>

                      <DropdownMenuItem onSelect={() => onResetPassword(user)}>
                        <KeyRound />
                        Restablecer contrasena
                      </DropdownMenuItem>

                      <DropdownMenuItem disabled={isSelf} onSelect={() => onToggleStatus(user)}>
                        {user.status === 'ACTIVE' ? <PowerOff /> : <Power />}
                        {user.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        variant="destructive"
                        disabled={isSelf}
                        onSelect={() => onDelete(user)}
                      >
                        <Trash2 />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
