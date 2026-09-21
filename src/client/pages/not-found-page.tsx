import { Link } from 'react-router-dom'
import { Button } from '@/client/components/ui/button'
import { useAuth } from '@/client/hooks/use-auth'

export function NotFoundPage() {
  const { user } = useAuth()
  const home = user ? (user.role === 'ADMIN' ? '/admin' : '/app') : '/login'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Pagina no encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        El enlace no existe o ya no esta disponible.
      </p>
      <Button asChild>
        <Link to={home}>Volver al inicio</Link>
      </Button>
    </div>
  )
}
