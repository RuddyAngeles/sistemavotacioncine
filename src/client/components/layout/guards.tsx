import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/client/hooks/use-auth'

function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Cargando" />
    </div>
  )
}

/**
 * Destino de la raiz (`/`) segun quien entre.
 *
 * Un administrador que abre la URL del sistema espera su panel, no la
 * pantalla de votacion del trabajador.
 */
export function HomeRedirect() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/cambiar-contrasena" replace />

  return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/app'} replace />
}

/**
 * Proteccion de rutas en el cliente.
 *
 * Es solo una comodidad de navegacion: quien manipule el router no consigue
 * nada, porque cada endpoint vuelve a comprobar sesion y rol en el servidor.
 * Sin esa comprobacion, estas pantallas se quedarian vacias.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageLoader />

  if (!user) {
    // Guardamos el destino para volver a el despues del login.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  // Contrasena marcada para cambio obligatorio: no se puede seguir sin hacerlo.
  if (user.mustChangePassword && location.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageLoader />
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (user.mustChangePassword) return <Navigate to="/cambiar-contrasena" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/app" replace />

  return children ? <>{children}</> : <Outlet />
}

/**
 * Evita que un usuario ya autenticado vuelva a la pantalla de login.
 *
 * Respeta el destino guardado por `RequireAuth`/`RequireAdmin`: en cuanto la
 * sesion existe, esta guarda se adelanta a la navegacion de la pantalla de
 * login, asi que es aqui donde hay que devolver al usuario a la URL privada
 * que intentaba abrir.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageLoader />
  if (user) {
    if (user.mustChangePassword) return <Navigate to="/cambiar-contrasena" replace />

    const state = location.state as { from?: string } | null
    const fallback = user.role === 'ADMIN' ? '/admin' : '/app'
    return <Navigate to={state?.from ?? fallback} replace />
  }

  return <>{children}</>
}
