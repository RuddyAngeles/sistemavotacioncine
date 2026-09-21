import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from '@/client/App'
import { AuthProvider } from '@/client/hooks/use-auth'
import { ThemeProvider } from '@/client/hooks/use-theme'
import { ApiError } from '@/client/lib/api'
import '@/client/index.css'

/**
 * Cliente de datos.
 *
 * Los 401/403 no se reintentan: significan "no autenticado" o "sin permiso",
 * no un fallo transitorio. Reintentarlos solo gastaria peticiones.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
    },
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('No se ha encontrado el elemento #root')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
