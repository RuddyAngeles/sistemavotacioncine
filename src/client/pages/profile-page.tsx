import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, KeyRound, Loader2, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Field, fieldAria } from '@/client/components/common/field'
import { PageHeader } from '@/client/components/common/page-header'
import { AppShell } from '@/client/components/layout/app-shell'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { authQueryKey, useAuth } from '@/client/hooks/use-auth'
import { api, errorMessage } from '@/client/lib/api'
import { profileFormSchema, type ProfileFormValues } from '@/client/lib/form-schemas'
import type { SessionUserDTO } from '@/shared/types'

/**
 * Mi perfil.
 *
 * Deja a cualquier persona (trabajador o administrador) cambiar el nombre
 * con el que aparece en la aplicacion. Es el nombre que se ve en la lista de
 * participacion de cada votacion, asi que conviene que sea el suyo real y no
 * una etiqueta generica.
 */
export function ProfilePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: user?.name ?? '' },
  })

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      api.patch<{ user: SessionUserDTO }>('/auth/me', { name: values.name }),
    onSuccess: async (response) => {
      queryClient.setQueryData(authQueryKey, response.user)
      reset({ name: response.user.name })
      toast.success('Nombre actualizado', {
        description: 'Asi apareceras en las votaciones.',
      })
      // La lista de usuarios y las de participacion muestran el nombre.
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      await queryClient.invalidateQueries({ queryKey: ['polls'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'No se ha podido guardar el nombre')),
  })

  if (!user) return null

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-8">
        <div>
          <Link
            to={user.role === 'ADMIN' ? '/admin' : '/app'}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
        </div>

        <PageHeader
          title="Mi perfil"
          description="El nombre que se ve en la aplicacion y en la lista de participacion de cada votacion."
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-muted-foreground" />
              Nombre visible
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={handleSubmit((values) => mutation.mutate(values))}
              className="space-y-5"
              noValidate
            >
              <Field id="profile-name" label="Nombre" required error={errors.name?.message}>
                <Input
                  {...register('name')}
                  {...fieldAria('profile-name', false, errors.name?.message, true)}
                  placeholder="Tu nombre y apellido"
                  autoComplete="name"
                  disabled={mutation.isPending}
                />
              </Field>

              <div className="space-y-1 rounded-lg border border-border bg-surface-subtle p-3.5">
                <p className="text-xs text-muted-foreground">
                  Usuario:{' '}
                  <span className="font-mono text-foreground">{user.username}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Rol: {user.role === 'ADMIN' ? 'Administrador' : 'Trabajador'}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  El usuario y el rol solo los puede cambiar un administrador desde la seccion
                  Usuarios.
                </p>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={mutation.isPending || !isDirty}>
                  {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
                  Guardar nombre
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                Contrasena
              </p>
              <p className="text-xs text-muted-foreground">
                Cambiala cuando quieras. Se cerraran tus otras sesiones abiertas.
              </p>
            </div>

            <Button asChild variant="outline" className="shrink-0">
              <Link to="/cambiar-contrasena">Cambiar contrasena</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
