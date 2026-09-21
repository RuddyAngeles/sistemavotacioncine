import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/client/hooks/use-theme'

/** Notificaciones. Sigue el tema activo de la aplicacion. */
export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      position="top-center"
      richColors={false}
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-border bg-card text-foreground shadow-raised text-sm',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-md',
          cancelButton: 'bg-muted text-muted-foreground rounded-md',
          error: 'border-destructive/30',
          success: 'border-success/30',
        },
      }}
    />
  )
}
