import { MotionConfig } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import {
  HomeRedirect,
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
} from '@/client/components/layout/guards'
import { Toaster } from '@/client/components/ui/sonner'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { ActivePollPage } from '@/client/pages/active-poll-page'
import { ChangePasswordPage } from '@/client/pages/change-password-page'
import { LoginPage } from '@/client/pages/login-page'
import { NotFoundPage } from '@/client/pages/not-found-page'
import { ProfilePage } from '@/client/pages/profile-page'
import { VotePage } from '@/client/pages/vote-page'
import { VoterHomePage } from '@/client/pages/voter-home-page'

/**
 * El area de administracion se carga bajo demanda.
 *
 * La mayoria de accesos son trabajadores votando desde el movil: no tiene
 * sentido que descarguen las tablas, el reordenamiento por arrastre ni el
 * panel de auditoria, que solo usa el administrador.
 */
const AdminLayout = lazy(() =>
  import('@/client/components/layout/admin-layout').then((m) => ({ default: m.AdminLayout })),
)
const DashboardPage = lazy(() =>
  import('@/client/pages/admin/dashboard-page').then((m) => ({ default: m.DashboardPage })),
)
const PollsPage = lazy(() =>
  import('@/client/pages/admin/polls-page').then((m) => ({ default: m.PollsPage })),
)
const HistoryPage = lazy(() =>
  import('@/client/pages/admin/polls-page').then((m) => ({ default: m.HistoryPage })),
)
const PollNewPage = lazy(() =>
  import('@/client/pages/admin/poll-new-page').then((m) => ({ default: m.PollNewPage })),
)
const PollEditorPage = lazy(() =>
  import('@/client/pages/admin/poll-editor-page').then((m) => ({ default: m.PollEditorPage })),
)
const UsersPage = lazy(() =>
  import('@/client/pages/admin/users-page').then((m) => ({ default: m.UsersPage })),
)
const AuditPage = lazy(() =>
  import('@/client/pages/admin/audit-page').then((m) => ({ default: m.AuditPage })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Cargando" />
    </div>
  )
}

/**
 * Mapa de rutas.
 *
 * Todas menos `/login` exigen sesion. Las guardas del cliente son solo
 * navegacion: el control real esta en cada endpoint del Worker.
 */
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* La raiz lleva al panel o a la pantalla de votacion segun el rol. */}
            <Route path="/" element={<HomeRedirect />} />

            <Route
              path="/login"
              element={
                <RedirectIfAuthenticated>
                  <LoginPage />
                </RedirectIfAuthenticated>
              }
            />

            {/*
              Cambio de contrasena. `RequireAuth` no redirige aqui cuando ya
              estamos en esta ruta, asi que tambien sirve para el cambio forzado.
            */}
            <Route
              path="/cambiar-contrasena"
              element={
                <RequireAuth>
                  <ChangePasswordPage />
                </RequireAuth>
              }
            />

            {/* Area del trabajador */}
            <Route element={<RequireAuth />}>
              {/*
                Enlace fijo que se reparte una sola vez: lleva siempre a la
                votacion abierta en ese momento.
              */}
              <Route path="/votar" element={<ActivePollPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              <Route path="/app" element={<VoterHomePage />} />
              <Route path="/app/votacion/:slug" element={<VotePage />} />
            </Route>

            {/* Area de administracion */}
            <Route element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<DashboardPage />} />
                <Route path="/admin/votaciones" element={<PollsPage />} />
                <Route path="/admin/votaciones/nueva" element={<PollNewPage />} />
                <Route path="/admin/votaciones/:id" element={<PollEditorPage />} />
                <Route path="/admin/usuarios" element={<UsersPage />} />
                <Route path="/admin/historial" element={<HistoryPage />} />
                <Route path="/admin/auditoria" element={<AuditPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>

        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  )
}
