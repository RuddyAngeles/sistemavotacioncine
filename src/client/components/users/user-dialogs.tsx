import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Field, fieldAria } from '@/client/components/common/field'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Switch } from '@/client/components/ui/switch'
import {
  createUserFormSchema,
  editUserFormSchema,
  resetPasswordFormSchema,
  type CreateUserFormValues,
  type EditUserFormValues,
  type ResetPasswordFormValues,
} from '@/client/lib/form-schemas'
import type { UserDTO } from '@/shared/types'

/** Genera una contrasena temporal legible para entregar al trabajador. */
function suggestPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))

  let out = ''
  for (let i = 0; i < 8; i += 1) out += alphabet[(bytes[i] as number) % alphabet.length]
  out += digits[(bytes[8] as number) % digits.length]
  out += digits[(bytes[9] as number) % digits.length]
  return out
}

function PasswordInput({
  id,
  value,
  onChange,
  onSuggest,
  disabled,
  error,
  autoComplete = 'new-password',
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onSuggest?: () => void
  disabled?: boolean
  error?: string | undefined
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          {...fieldAria(id, false, error)}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          className="pr-10 font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={visible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {onSuggest ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onSuggest}
          aria-label="Generar contrasena"
        >
          <RefreshCw />
        </Button>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Crear usuario
// ---------------------------------------------------------------------------

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting?: boolean
  onSubmit: (values: CreateUserFormValues) => void
}

export function CreateUserDialog({
  open,
  onOpenChange,
  submitting = false,
  onSubmit,
}: CreateUserDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      name: '',
      username: '',
      password: '',
      role: 'VOTER',
      status: 'ACTIVE',
      mustChangePassword: true,
    },
  })

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogDescription>
            Entrega el usuario y la contrasena al trabajador por un canal interno. No se envia
            ningun correo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Field id="name" label="Nombre" required error={errors.name?.message}>
            <Input
              {...register('name')}
              {...fieldAria('name', false, errors.name?.message, true)}
              placeholder="Carlos Perez"
              autoComplete="off"
              disabled={submitting}
            />
          </Field>

          <Field
            id="username"
            label="Usuario"
            required
            hint="Minusculas, numeros, punto, guion y guion bajo."
            error={errors.username?.message}
          >
            <Input
              {...register('username')}
              {...fieldAria('username', true, errors.username?.message, true)}
              placeholder="carlos01"
              autoComplete="off"
              className="font-mono"
              disabled={submitting}
            />
          </Field>

          <Field
            id="password"
            label="Contrasena"
            required
            hint="Minimo 8 caracteres, con al menos una letra y un numero."
            error={errors.password?.message}
          >
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <PasswordInput
                  id="password"
                  value={field.value}
                  onChange={field.onChange}
                  onSuggest={() => setValue('password', suggestPassword(), { shouldValidate: true })}
                  disabled={submitting}
                  error={errors.password?.message}
                />
              )}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="role" label="Rol" error={errors.role?.message}>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VOTER">Trabajador</SelectItem>
                      <SelectItem value="ADMIN">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field id="status" label="Estado" error={errors.status?.message}>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Activo</SelectItem>
                      <SelectItem value="INACTIVE">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Controller
            control={control}
            name="mustChangePassword"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <label htmlFor="mustChangePassword" className="text-sm font-medium">
                    Pedir cambio de contrasena
                  </label>
                  <p className="text-xs text-muted-foreground">
                    El trabajador debera elegir su propia contrasena la primera vez que entre.
                  </p>
                </div>
                <Switch
                  id="mustChangePassword"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={submitting}
                />
              </div>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Editar usuario
// ---------------------------------------------------------------------------

interface EditUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserDTO | null
  submitting?: boolean
  onSubmit: (values: EditUserFormValues) => void
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  submitting = false,
  onSubmit,
}: EditUserDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: { name: '', username: '', role: 'VOTER', status: 'ACTIVE' },
  })

  useEffect(() => {
    if (open && user) {
      reset({ name: user.name, username: user.username, role: user.role, status: user.status })
    }
  }, [open, user, reset])

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Cambiar el nombre de usuario o desactivar la cuenta cierra sus sesiones abiertas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Field id="edit-name" label="Nombre" required error={errors.name?.message}>
            <Input
              {...register('name')}
              {...fieldAria('edit-name', false, errors.name?.message, true)}
              disabled={submitting}
            />
          </Field>

          <Field id="edit-username" label="Usuario" required error={errors.username?.message}>
            <Input
              {...register('username')}
              {...fieldAria('edit-username', false, errors.username?.message, true)}
              className="font-mono"
              disabled={submitting}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="edit-role" label="Rol" error={errors.role?.message}>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger id="edit-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VOTER">Trabajador</SelectItem>
                      <SelectItem value="ADMIN">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field id="edit-status" label="Estado" error={errors.status?.message}>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={submitting}>
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Activo</SelectItem>
                      <SelectItem value="INACTIVE">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Restablecer contrasena
// ---------------------------------------------------------------------------

interface ResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserDTO | null
  submitting?: boolean
  onSubmit: (values: ResetPasswordFormValues) => void
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
  submitting = false,
  onSubmit,
}: ResetPasswordDialogProps) {
  const {
    handleSubmit,
    control,
    reset,
    setValue,
    register,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '', mustChangePassword: true },
  })

  useEffect(() => {
    if (open) reset({ password: '', confirmPassword: '', mustChangePassword: true })
  }, [open, reset])

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Restablecer contrasena
          </DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Fijaras una contrasena nueva para{' '}
                <span className="font-medium text-foreground">{user.name}</span>. La contrasena
                actual no se puede consultar: solo existe su hash.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Field id="reset-password" label="Nueva contrasena" required error={errors.password?.message}>
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <PasswordInput
                  id="reset-password"
                  value={field.value}
                  onChange={field.onChange}
                  onSuggest={() => {
                    const generated = suggestPassword()
                    setValue('password', generated, { shouldValidate: true })
                    setValue('confirmPassword', generated, { shouldValidate: true })
                  }}
                  disabled={submitting}
                  error={errors.password?.message}
                />
              )}
            />
          </Field>

          <Field
            id="reset-confirm"
            label="Repetir contrasena"
            required
            error={errors.confirmPassword?.message}
          >
            <Input
              {...register('confirmPassword')}
              {...fieldAria('reset-confirm', false, errors.confirmPassword?.message, true)}
              type="password"
              className="font-mono"
              autoComplete="new-password"
              disabled={submitting}
            />
          </Field>

          <Controller
            control={control}
            name="mustChangePassword"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <label htmlFor="reset-must-change" className="text-sm font-medium">
                    Pedir cambio al iniciar sesion
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Recomendado: la contrasena temporal deja de ser valida en cuanto el trabajador
                    elija la suya.
                  </p>
                </div>
                <Switch
                  id="reset-must-change"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={submitting}
                />
              </div>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Restablecer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
