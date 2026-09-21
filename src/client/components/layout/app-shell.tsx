import { Clapperboard, LayoutDashboard } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/client/components/common/theme-toggle'
import { UserMenu } from '@/client/components/layout/user-menu'
import { Button } from '@/client/components/ui/button'
import { useAuth } from '@/client/hooks/use-auth'
import { cn } from '@/client/lib/utils'

/** Marca de la aplicacion. */
export function Brand({ className, to = '/app' }: { className?: string; to?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-md font-semibold tracking-tight transition-opacity hover:opacity-80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Clapperboard className="size-4" />
      </span>
      <span>Movie Night</span>
    </Link>
  )
}

/**
 * Estructura de las pantallas del trabajador: barra superior fija y
 * contenido centrado. Pensada primero para movil, que es desde donde la
 * mayoria votara.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            {/*
              Acceso directo al panel para el administrador: si entra por la
              pantalla de votacion, no deberia tener que buscarlo dentro de un
              desplegable.
            */}
            {isAdmin ? (
              <Button asChild variant="outline" size="sm" className="mr-1">
                <Link to="/admin">
                  <LayoutDashboard />
                  <span className="hidden sm:inline">Panel</span>
                  <span className="sr-only sm:hidden">Panel de administracion</span>
                </Link>
              </Button>
            ) : null}
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-border py-6">
        <p className="mx-auto max-w-5xl px-4 text-xs text-muted-foreground sm:px-6">
          Sistema interno de votaciones. Acceso restringido al personal autorizado.
        </p>
      </footer>
    </div>
  )
}
