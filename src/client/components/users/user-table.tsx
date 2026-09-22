import { KeyRound, MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Switch } from '@/client/components/ui/switch'
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
  onToggleSurveys: (user: UserDTO) => void
  onResetPassword: (user: UserDTO) => void
  onDelete: (user: UserDTO) => void
}

/**
 * Lista de usuarios.
 *
 * En pantallas anchas es una tabla; en un movil, una lista de tarjetas.
 *
 * No es una preferencia estetica: una tabla estrecha obliga a esconder
 * columnas, y aqui las que sobraban eran el rol y el permiso de encuestas.
 * Es decir, desde el telefono no se podia ver quien era administrador ni dar
 * el permiso de participar. Con tarjetas cabe todo y no hay que ocultar nada.
 */
export function UserTable(props: UserTableProps) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {props.users.map((user) => (
          <TarjetaUsuario key={user.id} user={user} {...props} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Encuestas</TableHead>
              <TableHead className="hidden lg:table-cell">Ultimo acceso</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {props.users.map((user) => {
              const esUnoMismo = user.id === props.currentUserId

              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {user.name}
                      {esUnoMismo ? <EtiquetaTu /> : null}
                    </span>
                    {user.mustChangePassword ? <AvisoContrasena /> : null}
                  </TableCell>

                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {user.username}
                  </TableCell>

                  <TableCell>
                    <InsigniaRol user={user} />
                  </TableCell>

                  <TableCell>
                    <InsigniaEstado user={user} />
                  </TableCell>

                  <TableCell>
                    <InterruptorEncuestas user={user} onToggleSurveys={props.onToggleSurveys} />
                  </TableCell>

                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca'}
                  </TableCell>

                  <TableCell>
                    <MenuAcciones user={user} esUnoMismo={esUnoMismo} {...props} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** Una cuenta en formato tarjeta, para pantallas estrechas. */
function TarjetaUsuario({ user, ...props }: UserTableProps & { user: UserDTO }) {
  const esUnoMismo = user.id === props.currentUserId

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{user.name}</span>
            {esUnoMismo ? <EtiquetaTu /> : null}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">{user.username}</p>
        </div>

        <MenuAcciones user={user} esUnoMismo={esUnoMismo} {...props} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <InsigniaRol user={user} />
        <InsigniaEstado user={user} />
        <span className="text-xs text-muted-foreground">
          {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca ha entrado'}
        </span>
      </div>

      {user.mustChangePassword ? (
        <div className="mt-2">
          <AvisoContrasena />
        </div>
      ) : null}

      <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-subtle p-3">
        <span className="text-sm">Puede participar en encuestas</span>
        <InterruptorEncuestas user={user} onToggleSurveys={props.onToggleSurveys} />
      </label>
    </div>
  )
}

function EtiquetaTu() {
  return (
    <Badge variant="outline" className="shrink-0 text-[10px]">
      Tu
    </Badge>
  )
}

function AvisoContrasena(): ReactNode {
  return <span className="block text-xs text-warning">Debe cambiar la contrasena</span>
}

function InsigniaRol({ user }: { user: UserDTO }) {
  return (
    <Badge variant={user.role === 'ADMIN' ? 'secondary' : 'muted'}>
      {user.role === 'ADMIN' ? 'Administrador' : 'Trabajador'}
    </Badge>
  )
}

function InsigniaEstado({ user }: { user: UserDTO }) {
  return (
    <Badge variant={user.status === 'ACTIVE' ? 'success' : 'muted'}>
      {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
    </Badge>
  )
}

/** Permiso aparte del rol: poder participar en encuestas. */
function InterruptorEncuestas({
  user,
  onToggleSurveys,
}: {
  user: UserDTO
  onToggleSurveys: (user: UserDTO) => void
}) {
  return (
    <Switch
      checked={user.canAnswerSurveys}
      aria-label={'Permitir a ' + user.name + ' participar en encuestas'}
      onCheckedChange={() => onToggleSurveys(user)}
    />
  )
}

function MenuAcciones({
  user,
  esUnoMismo,
  onEdit,
  onResetPassword,
  onToggleStatus,
  onDelete,
}: UserTableProps & { user: UserDTO; esUnoMismo: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          `size-10` en movil: un objetivo de 32px se falla con el dedo. En
          escritorio, donde se apunta con el raton, se queda compacto.
        */}
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 sm:size-8"
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

        <DropdownMenuItem disabled={esUnoMismo} onSelect={() => onToggleStatus(user)}>
          {user.status === 'ACTIVE' ? <PowerOff /> : <Power />}
          {user.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" disabled={esUnoMismo} onSelect={() => onDelete(user)}>
          <Trash2 />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
