import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Field, fieldAria } from '@/client/components/common/field'
import { ThemeToggle } from '@/client/components/common/theme-toggle'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { useAuth, authQueryKey } from '@/client/hooks/use-auth'
import { ApiError, api } from '@/client/lib/api'
import {
  changePasswordFormSchema,
  type ChangePasswordFormValues,
} from '@/client/lib/form-schemas'
import type { SessionUserDTO } from '@/shared/types'

/**
 * Cambio de contrasena por el propio usuario.
 *
 * Al guardarla, el servidor invalida todas las sesiones anteriores y crea
 * una nueva para este dispositivo.
 */
export function ChangePasswordPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const forced = user?.mustChangePassword ?? false

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordFormValues) =>
      api.post<{ user: SessionUserDTO }>('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(authQueryKey, response.user)
      toast.success('Contrasena actualizada')
      navigate(response.user.role === 'ADMIN' ? '/admin' : '/app', { replace: true })
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : 'No se ha podido guardar')
    },
  })

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-20 pt-4 sm:items-center sm:pt-0">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
              <KeyRound className="size-5" />
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Cambiar contrasena</h1>
              <p className="text-sm text-muted-foreground">
                {forced
                  ? 'Elige una contrasena propia antes de continuar.'
                  : 'Introduce tu contrasena actual y la nueva.'}
              </p>
            </div>
          </div>

          {/* Misma tarjeta que la pantalla de acceso: el formulario va encerrado. */}
          <Card className="rounded-2xl border-border-strong">
            <CardContent className="p-6 sm:p-8">
              <form
                onSubmit={handleSubmit((values) => {
                  setFormError(null)
                  mutation.mutate(values)
                })}
                className="space-y-5"
                noValidate
              >
                <Field
                  id="currentPassword"
                  label="Contrasena actual"
                  error={errors.currentPassword?.message}
                >
                  <Input
                    {...register('currentPassword')}
                    {...fieldAria('currentPassword', false, errors.currentPassword?.message)}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    disabled={mutation.isPending}
                  />
                </Field>

                <Field
                  id="newPassword"
                  label="Nueva contrasena"
                  hint="Minimo 8 caracteres, con al menos una letra y un numero."
                  error={errors.newPassword?.message}
                >
                  <Input
                    {...register('newPassword')}
                    {...fieldAria('newPassword', true, errors.newPassword?.message)}
                    type="password"
                    autoComplete="new-password"
                    disabled={mutation.isPending}
                  />
                </Field>

                <Field
                  id="confirmPassword"
                  label="Repetir nueva contrasena"
                  error={errors.confirmPassword?.message}
                >
                  <Input
                    {...register('confirmPassword')}
                    {...fieldAria('confirmPassword', false, errors.confirmPassword?.message)}
                    type="password"
                    autoComplete="new-password"
                    disabled={mutation.isPending}
                  />
                </Field>

                {formError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
                  >
                    {formError}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
                  Guardar contrasena
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (forced) {
                      void logout()
                      return
                    }
                    navigate(-1)
                  }}
                >
                  {forced ? 'Cerrar sesion' : 'Cancelar'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}
