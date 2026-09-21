import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { Clapperboard, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field, fieldAria } from '@/client/components/common/field'
import { ThemeToggle } from '@/client/components/common/theme-toggle'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { useAuth } from '@/client/hooks/use-auth'
import { ApiError } from '@/client/lib/api'
import { loginFormSchema, type LoginFormValues } from '@/client/lib/form-schemas'

/**
 * Pantalla de acceso.
 *
 * No hay registro, ni acceso con redes sociales, ni recuperacion por correo:
 * las cuentas las crea el administrador y es quien restablece las claves.
 */
export function LoginPage() {
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { username: '', password: '' },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null)
    try {
      await login(values)

      /*
       * Aqui no se navega a proposito.
       *
       * En cuanto la sesion existe, <RedirectIfAuthenticated> lleva al
       * usuario a su destino (la URL privada que intentaba abrir, o su
       * pantalla de inicio segun el rol). Navegar tambien desde aqui
       * provocaria dos navegaciones seguidas al mismo sitio y un remontaje
       * innecesario de toda la pantalla.
       */
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        return
      }
      setFormError('No se ha podido iniciar sesion. Intentalo de nuevo.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised">
              <Clapperboard className="size-6" />
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Movie Night</h1>
              <p className="text-sm text-muted-foreground">Inicia sesion para continuar</p>
            </div>
          </div>

          {/*
            El formulario va encerrado en su propia tarjeta.
            Suelto sobre el fondo no se distinguia donde empezaba y donde
            acababa, sobre todo en modo oscuro. Por eso el borde es
            `border-strong` y no el discreto del resto de tarjetas: aqui no
            hay nada alrededor que delimite la zona.
          */}
          <Card className="rounded-2xl border-border-strong">
            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <Field id="username" label="Usuario" error={errors.username?.message}>
                  <Input
                    {...register('username')}
                    {...fieldAria('username', false, errors.username?.message)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    disabled={isSubmitting}
                  />
                </Field>

                <Field id="password" label="Contrasena" error={errors.password?.message}>
                  <div className="relative">
                    <Input
                      {...register('password')}
                      {...fieldAria('password', false, errors.password?.message)}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="pr-10"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>

                {formError ? (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
                  >
                    {formError}
                  </motion.p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Iniciar sesion
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-8 flex gap-3 rounded-lg border border-border bg-surface-subtle p-3.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sistema interno. Si has olvidado tu contrasena o no tienes cuenta, contacta con el
              administrador: es quien crea los accesos y restablece las claves.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
