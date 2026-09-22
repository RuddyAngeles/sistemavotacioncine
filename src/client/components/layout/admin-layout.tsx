import { AnimatePresence, motion } from 'framer-motion'
import {
  ClipboardList,
  History,
  LayoutDashboard,
  Menu,
  ScrollText,
  Users,
  Vote,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from '@/client/components/common/theme-toggle'
import { Brand } from '@/client/components/layout/app-shell'
import { UserMenu } from '@/client/components/layout/user-menu'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/utils'

const NAVIGATION = [
  { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/admin/votaciones', label: 'Votaciones', icon: Vote, end: false },
  { to: '/admin/encuestas', label: 'Encuestas', icon: ClipboardList, end: false },
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users, end: false },
  { to: '/admin/historial', label: 'Historial', icon: History, end: false },
  { to: '/admin/auditoria', label: 'Auditoria', icon: ScrollText, end: false },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Secciones de administracion">
      {NAVIGATION.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Estructura del area de administracion: barra lateral fija en escritorio. */
export function AdminLayout() {
  const location = useLocation()

  /*
   * El panel movil recuerda en que ruta se abrio. Al navegar, la ruta cambia
   * y el panel se considera cerrado sin necesidad de un efecto que sincronice
   * estado con estado.
   */
  const [menu, setMenu] = useState({ open: false, path: location.pathname })
  const mobileOpen = menu.open && menu.path === location.pathname

  const openMenu = () => setMenu({ open: true, path: location.pathname })
  const closeMenu = () => setMenu({ open: false, path: location.pathname })

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              onClick={openMenu}
            >
              <Menu />
            </Button>
            <Brand to="/admin" />
            <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground sm:inline">
              Administracion
            </span>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-r border-border p-4 lg:block">
          <NavItems />
        </aside>

        <main id="contenido" className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-label="Menu de administracion"
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-card p-4 shadow-raised"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            >
              <div className="mb-6 flex items-center justify-between">
                <Brand to="/admin" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar menu"
                  onClick={closeMenu}
                >
                  <X />
                </Button>
              </div>
              <NavItems onNavigate={closeMenu} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
