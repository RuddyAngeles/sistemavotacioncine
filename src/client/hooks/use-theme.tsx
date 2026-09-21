import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'movie-night-theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* modo privado o almacenamiento bloqueado: usamos el valor por defecto */
  }
  return 'system'
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSystemIsDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

/**
 * Tema claro / oscuro / sistema.
 *
 * El valor inicial ya lo aplica un script inline en index.html antes del
 * primer pintado, asi que no hay parpadeo al cargar.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme())

  /*
   * La preferencia del sistema es un almacen externo al que nos suscribimos.
   * `useSyncExternalStore` es la via correcta para leerlo: siempre devuelve
   * el valor actual, sin un estado paralelo que pueda quedarse obsoleto.
   */
  const systemIsDark = useSyncExternalStore(subscribeToSystemTheme, getSystemIsDark, () => false)

  // El tema aplicado se deriva; no necesita estado propio.
  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme

  // El efecto solo sincroniza el DOM, que es el sistema externo real.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* la preferencia no se puede guardar, pero la sesion actual funciona */
    }
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return context
}
