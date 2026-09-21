import { KeyRound, LayoutDashboard, LogOut, User as UserIcon, Vote } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { useAuth } from '@/client/hooks/use-auth'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function UserMenu() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 pl-1.5 pr-2.5" aria-label="Menu de usuario">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
          >
            {initials(user.name)}
          </span>
          <span className="hidden max-w-32 truncate text-sm sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="space-y-0.5 py-2">
          <p className="text-sm font-medium text-foreground">{user.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{user.username}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => navigate('/app')}>
          <Vote />
          Votaciones
        </DropdownMenuItem>

        {isAdmin ? (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <LayoutDashboard />
            Panel de administracion
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem onSelect={() => navigate('/perfil')}>
          <UserIcon />
          Mi perfil
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => navigate('/cambiar-contrasena')}>
          <KeyRound />
          Cambiar contrasena
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOut />
          Cerrar sesion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { UserIcon }
