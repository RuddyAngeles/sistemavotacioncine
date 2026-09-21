import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { LoginInput } from '@/shared/schemas'
import type { SessionUserDTO } from '@/shared/types'
import { ApiError, api } from '@/client/lib/api'

interface AuthContextValue {
  user: SessionUserDTO | null
  isLoading: boolean
  isAdmin: boolean
  login: (input: LoginInput) => Promise<SessionUserDTO>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const authQueryKey = ['auth', 'me'] as const

/**
 * Estado de autenticacion.
 *
 * La unica fuente de verdad es `GET /api/auth/me`, que el servidor resuelve
 * a partir de la cookie HttpOnly. No hay ningun token ni rol guardado en el
 * navegador que se pueda manipular desde la consola.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: authQueryKey,
    queryFn: async (): Promise<SessionUserDTO | null> => {
      try {
        const response = await api.get<{ user: SessionUserDTO }>('/auth/me')
        return response.user
      } catch (error) {
        // 401 no es un fallo: significa "todavia no has iniciado sesion".
        if (error instanceof ApiError && error.isUnauthorized) return null
        throw error
      }
    },
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  })

  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const response = await api.post<{ user: SessionUserDTO }>('/auth/login', input)
      return response.user
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authQueryKey, user)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    onSettled: () => {
      queryClient.setQueryData(authQueryKey, null)
      // Al cerrar sesion se descarta toda la cache: ningun dato de la
      // sesion anterior debe quedar visible para el siguiente usuario.
      queryClient.clear()
    },
  })

  const login = useCallback(
    (input: LoginInput) => loginMutation.mutateAsync(input),
    [loginMutation],
  )

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync()
  }, [logoutMutation])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: authQueryKey })
  }, [queryClient])

  const user = data ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAdmin: user?.role === 'ADMIN',
      login,
      logout,
      refresh,
    }),
    [user, isLoading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return context
}
