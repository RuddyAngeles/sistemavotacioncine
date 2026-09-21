import { z } from 'zod'
import { passwordSchema, usernameSchema } from '@/shared/schemas'
import { POLL_KINDS, ROLES, USER_STATUSES } from '@/shared/constants'
import { localInputToIso } from './format'

/**
 * Esquemas de formulario.
 *
 * Los controles HTML solo manejan cadenas, asi que aqui se validan cadenas y
 * despues se construye el cuerpo que espera la API. Las reglas de fondo
 * (usuario, contrasena) se reutilizan de `shared/schemas` para que no haya
 * dos verdades. La validacion definitiva la hace siempre el servidor.
 */

// ---------------------------------------------------------------------------
// Autenticacion
// ---------------------------------------------------------------------------

export const loginFormSchema = z.object({
  username: z.string().min(1, 'Introduce tu usuario'),
  password: z.string().min(1, 'Introduce tu contrasena'),
})
export type LoginFormValues = z.infer<typeof loginFormSchema>

export const profileFormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
})
export type ProfileFormValues = z.infer<typeof profileFormSchema>

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Introduce tu contrasena actual'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Repite la nueva contrasena'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contrasena debe ser distinta de la actual',
    path: ['newPassword'],
  })
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export const createUserFormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  mustChangePassword: z.boolean(),
})
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>

export const editUserFormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  username: usernameSchema,
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
})
export type EditUserFormValues = z.infer<typeof editUserFormSchema>

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Repite la contrasena'),
    mustChangePassword: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  })
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>

// ---------------------------------------------------------------------------
// Votaciones
// ---------------------------------------------------------------------------

export const pollFormSchema = z
  .object({
    title: z.string().min(3, 'El titulo debe tener al menos 3 caracteres').max(120),
    description: z.string().max(2000, 'Maximo 2000 caracteres'),
    kind: z.enum(POLL_KINDS),
    allowVoteChange: z.boolean(),
    showLiveResults: z.boolean(),
    showResultsAfterClose: z.boolean(),
    allowNotAttending: z.boolean(),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .refine(
    (data) =>
      !data.startsAt || !data.endsAt || new Date(data.endsAt) > new Date(data.startsAt),
    { message: 'La finalizacion debe ser posterior al inicio', path: ['endsAt'] },
  )
export type PollFormValues = z.infer<typeof pollFormSchema>

export const emptyPollForm: PollFormValues = {
  title: '',
  description: '',
  kind: 'MOVIE_NIGHT',
  allowVoteChange: true,
  showLiveResults: false,
  showResultsAfterClose: true,
  allowNotAttending: true,
  startsAt: '',
  endsAt: '',
}

/** Traduce los valores del formulario al cuerpo que espera la API. */
export function pollFormToPayload(values: PollFormValues) {
  return {
    title: values.title,
    description: values.description.trim() === '' ? null : values.description,
    kind: values.kind,
    allowVoteChange: values.allowVoteChange,
    showLiveResults: values.showLiveResults,
    showResultsAfterClose: values.showResultsAfterClose,
    allowNotAttending: values.allowNotAttending,
    startsAt: localInputToIso(values.startsAt),
    endsAt: localInputToIso(values.endsAt),
  }
}

// ---------------------------------------------------------------------------
// Peliculas
// ---------------------------------------------------------------------------

const optionalNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .refine((value) => {
      if (value.trim() === '') return true
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed >= min && parsed <= max
    }, label)

export const optionFormSchema = z.object({
  title: z.string().min(1, 'El titulo es obligatorio').max(160),
  description: z.string().max(2000, 'Maximo 2000 caracteres'),
  genre: z.string().max(80),
  year: optionalNumber('Introduce un ano valido (1888-2200)', 1888, 2200),
  durationMinutes: optionalNumber('Introduce una duracion valida en minutos', 1, 1000),
  showtime: z.string().max(20, 'Maximo 20 caracteres'),
  posterKey: z.string().nullable(),
})
export type OptionFormValues = z.infer<typeof optionFormSchema>

export const emptyOptionForm: OptionFormValues = {
  title: '',
  description: '',
  genre: '',
  year: '',
  durationMinutes: '',
  showtime: '',
  posterKey: null,
}

export function optionFormToPayload(values: OptionFormValues) {
  const toNumber = (value: string): number | null =>
    value.trim() === '' ? null : Number(value)

  return {
    title: values.title,
    description: values.description.trim() === '' ? null : values.description,
    genre: values.genre.trim() === '' ? null : values.genre,
    year: toNumber(values.year),
    durationMinutes: toNumber(values.durationMinutes),
    showtime: values.showtime.trim() === '' ? null : values.showtime,
    posterKey: values.posterKey,
  }
}
