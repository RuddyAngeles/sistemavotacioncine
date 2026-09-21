import { z } from 'zod'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  POLL_KINDS,
  POLL_STATUSES,
  ROLES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  USER_STATUSES,
} from './constants'

/**
 * Fuente unica de verdad para la validacion.
 * El backend valida SIEMPRE con estos esquemas; el frontend los reutiliza
 * para dar feedback inmediato, nunca como sustituto.
 */

// ---------------------------------------------------------------------------
// Primitivas reutilizables
// ---------------------------------------------------------------------------

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(min, `${label} debe tener al menos ${min} caracteres`)
        .max(max, `${label} no puede superar ${max} caracteres`),
    )

const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} no puede superar ${max} caracteres`)
    .transform((value) => {
      const next = value.trim()
      return next.length === 0 ? null : next
    })
    .nullable()
    .optional()

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha u hora invalida')
  .transform((value) => new Date(value).toISOString())

const nullableIsoDateTime = isoDateTime.nullable().optional()

export const usernameSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, `El usuario debe tener al menos ${USERNAME_MIN_LENGTH} caracteres`)
      .max(USERNAME_MAX_LENGTH, `El usuario no puede superar ${USERNAME_MAX_LENGTH} caracteres`)
      .regex(USERNAME_PATTERN, 'Solo se permiten minusculas, numeros, punto, guion y guion bajo'),
  )

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contrasena debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `La contrasena no puede superar ${PASSWORD_MAX_LENGTH} caracteres`)
  .refine((value) => /[a-zA-Z]/.test(value), 'La contrasena debe incluir al menos una letra')
  .refine((value) => /[0-9]/.test(value), 'La contrasena debe incluir al menos un numero')

// ---------------------------------------------------------------------------
// Autenticacion
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  // En login no aplicamos el patron estricto: solo normalizamos.
  // Asi un usuario mal escrito devuelve "credenciales invalidas",
  // no un error de validacion que revele como son los usuarios validos.
  username: z
    .string()
    .min(1, 'Introduce tu usuario')
    .max(USERNAME_MAX_LENGTH, 'Usuario o contrasena incorrectos')
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, 'Introduce tu contrasena').max(PASSWORD_MAX_LENGTH),
})

/**
 * Datos que cada persona puede cambiar de si misma.
 *
 * Solo el nombre visible. El usuario, el rol y el estado los gobierna el
 * administrador: si cada cual pudiera cambiarlos, el control de acceso
 * dejaria de estar en un solo sitio.
 */
export const updateProfileSchema = z.object({
  name: trimmed(2, 80, 'El nombre'),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Introduce tu contrasena actual'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contrasena debe ser distinta de la actual',
    path: ['newPassword'],
  })

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  name: trimmed(2, 80, 'El nombre'),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ROLES).default('VOTER'),
  status: z.enum(USER_STATUSES).default('ACTIVE'),
  mustChangePassword: z.boolean().default(false),
})

export const updateUserSchema = z
  .object({
    name: trimmed(2, 80, 'El nombre').optional(),
    username: usernameSchema.optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'No hay cambios que guardar')

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  /** Por defecto obligamos a cambiarla en el siguiente inicio de sesion. */
  mustChangePassword: z.boolean().default(true),
})

export const listUsersQuerySchema = z.object({
  q: z.string().max(80).optional(),
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

// ---------------------------------------------------------------------------
// Votaciones
// ---------------------------------------------------------------------------

export const pollSettingsSchema = z.object({
  allowVoteChange: z.boolean(),
  showLiveResults: z.boolean(),
  showResultsAfterClose: z.boolean(),
  allowNotAttending: z.boolean(),
})

const pollScheduleRefinement = <T extends { startsAt?: string | null; endsAt?: string | null }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.startsAt && data.endsAt && Date.parse(data.endsAt) <= Date.parse(data.startsAt)) {
    ctx.addIssue({
      code: 'custom',
      message: 'La fecha de finalizacion debe ser posterior a la de inicio',
      path: ['endsAt'],
    })
  }
}

export const createPollSchema = z
  .object({
    title: trimmed(3, 120, 'El titulo'),
    description: optionalText(2000, 'La descripcion'),
    kind: z.enum(POLL_KINDS).default('MOVIE_NIGHT'),
    allowVoteChange: z.boolean().default(true),
    showLiveResults: z.boolean().default(false),
    showResultsAfterClose: z.boolean().default(true),
    // Por defecto activo: en una Movie Night siempre hay quien no puede ir.
    allowNotAttending: z.boolean().default(true),
    startsAt: nullableIsoDateTime,
    endsAt: nullableIsoDateTime,
  })
  .superRefine(pollScheduleRefinement)

export const updatePollSchema = z
  .object({
    title: trimmed(3, 120, 'El titulo').optional(),
    description: optionalText(2000, 'La descripcion'),
    kind: z.enum(POLL_KINDS).optional(),
    allowVoteChange: z.boolean().optional(),
    showLiveResults: z.boolean().optional(),
    showResultsAfterClose: z.boolean().optional(),
    allowNotAttending: z.boolean().optional(),
    startsAt: nullableIsoDateTime,
    endsAt: nullableIsoDateTime,
  })
  .superRefine(pollScheduleRefinement)

export const listPollsQuerySchema = z.object({
  q: z.string().max(120).optional(),
  status: z.enum(POLL_STATUSES).optional(),
  /** `history` limita a CLOSED/ARCHIVED, `live` excluye archivadas. */
  scope: z.enum(['all', 'live', 'history']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const duplicatePollSchema = z.object({
  title: trimmed(3, 120, 'El titulo').optional(),
})

// ---------------------------------------------------------------------------
// Opciones / peliculas
// ---------------------------------------------------------------------------

export const createOptionSchema = z.object({
  title: trimmed(1, 160, 'El titulo'),
  description: optionalText(2000, 'La sinopsis'),
  genre: optionalText(80, 'El genero'),
  year: z.coerce
    .number()
    .int()
    .min(1888, 'Ano invalido')
    .max(2200, 'Ano invalido')
    .nullable()
    .optional(),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(1, 'La duracion debe ser mayor que cero')
    .max(1000, 'Duracion invalida')
    .nullable()
    .optional(),
  showtime: optionalText(20, 'La hora'),
  posterKey: optionalText(200, 'La cartelera'),
})

export const updateOptionSchema = createOptionSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'No hay cambios que guardar',
)

export const reorderOptionsSchema = z.object({
  optionIds: z
    .array(z.string().min(1))
    .min(1, 'Debes enviar al menos una opcion')
    .max(200, 'Demasiadas opciones'),
})

// ---------------------------------------------------------------------------
// Votos
// ---------------------------------------------------------------------------

/**
 * Un voto es una de dos cosas, nunca las dos ni ninguna:
 *
 *   { optionId: "..." }      asiste y elige esa pelicula
 *   { notAttending: true }   no asiste
 *
 * Se modela como union en lugar de dos campos opcionales para que sea
 * imposible enviar una combinacion sin sentido.
 */
export const castVoteSchema = z.union([
  z.object({ optionId: z.string().min(1, 'Selecciona una pelicula') }),
  z.object({ notAttending: z.literal(true) }),
])

/** `true` si el voto recibido es un "no asistire". */
export function isNotAttendingVote(input: CastVoteInput): input is { notAttending: true } {
  return 'notAttending' in input
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export const listAuditQuerySchema = z.object({
  action: z.string().max(80).optional(),
  entity: z.string().max(40).optional(),
  actorId: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const participationQuerySchema = z.object({
  /** Revelar la eleccion individual de cada usuario (queda auditado). */
  includeChoices: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
})

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
export type CreatePollInput = z.infer<typeof createPollSchema>
export type UpdatePollInput = z.infer<typeof updatePollSchema>
export type ListPollsQuery = z.infer<typeof listPollsQuerySchema>
export type DuplicatePollInput = z.infer<typeof duplicatePollSchema>
export type CreateOptionInput = z.infer<typeof createOptionSchema>
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>
export type ReorderOptionsInput = z.infer<typeof reorderOptionsSchema>
export type CastVoteInput = z.infer<typeof castVoteSchema>
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>

/** Entrada del formulario antes de aplicar defaults/transformaciones. */
export type CreateUserFormInput = z.input<typeof createUserSchema>
export type CreatePollFormInput = z.input<typeof createPollSchema>
export type CreateOptionFormInput = z.input<typeof createOptionSchema>
