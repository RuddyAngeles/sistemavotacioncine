/**
 * Constantes compartidas entre frontend y backend.
 * Cambiar un valor aqui lo cambia en los dos lados a la vez.
 */

export const SESSION_COOKIE_NAME = 'mn_session'

export const ROLES = ['ADMIN', 'VOTER'] as const
export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export const POLL_KINDS = ['MOVIE_NIGHT', 'GENERIC'] as const
export const POLL_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'ARCHIVED'] as const

/** Estados en los que la votacion ya no admite cambios de contenido. */
export const LOCKED_POLL_STATUSES = ['CLOSED', 'ARCHIVED'] as const

/**
 * Tope duro de iteraciones de PBKDF2 en Cloudflare Workers.
 *
 * No es una preferencia nuestra: WebCrypto en workerd rechaza cualquier
 * valor superior con `Pbkdf2 failed: iteration counts above 100000 are not
 * supported`. Configurar mas dejaria el login inservible, asi que el valor
 * se recorta aqui en lugar de confiar en que nadie se pase.
 */
export const PBKDF2_MAX_ITERATIONS = 100_000
export const PBKDF2_MIN_ITERATIONS = 1_000
export const PBKDF2_DEFAULT_ITERATIONS = 100_000

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32
/** Solo minusculas, numeros, punto, guion y guion bajo. */
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const
export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Limites anti fuerza bruta en el login. */
export const LOGIN_RATE_LIMIT = {
  /** Ventana deslizante en minutos. */
  windowMinutes: 15,
  /** Intentos fallidos por usuario antes de bloquear temporalmente. */
  maxAttemptsPerIdentifier: 8,
  /** Intentos fallidos por IP antes de bloquear temporalmente. */
  maxAttemptsPerIp: 30,
  /** Bloqueo en minutos una vez superado el limite. */
  lockoutMinutes: 15,
} as const

/** Codigos de error estables: la UI decide el mensaje a partir de ellos. */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  CSRF_ORIGIN_MISMATCH: 'CSRF_ORIGIN_MISMATCH',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  POLL_NOT_OPEN: 'POLL_NOT_OPEN',
  POLL_NOT_STARTED: 'POLL_NOT_STARTED',
  POLL_ENDED: 'POLL_ENDED',
  VOTE_ALREADY_CAST: 'VOTE_ALREADY_CAST',
  VOTE_CHANGE_NOT_ALLOWED: 'VOTE_CHANGE_NOT_ALLOWED',
  VOTE_NOT_FOUND: 'VOTE_NOT_FOUND',
  NOT_ATTENDING_DISABLED: 'NOT_ATTENDING_DISABLED',
  RESULTS_HIDDEN: 'RESULTS_HIDDEN',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  POLL_HAS_NO_OPTIONS: 'POLL_HAS_NO_OPTIONS',
  UPLOAD_INVALID: 'UPLOAD_INVALID',
  LAST_ADMIN: 'LAST_ADMIN',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** Acciones registradas en `audit_logs`. */
export const AUDIT_ACTIONS = {
  USER_LOGIN: 'user.login',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_LOGOUT: 'user.logout',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ACTIVATED: 'user.activated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_DELETED: 'user.deleted',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_PASSWORD_CHANGED: 'user.password_changed',

  POLL_CREATED: 'poll.created',
  POLL_UPDATED: 'poll.updated',
  POLL_SETTINGS_UPDATED: 'poll.settings_updated',
  POLL_DELETED: 'poll.deleted',
  POLL_PUBLISHED: 'poll.published',
  POLL_SCHEDULED: 'poll.scheduled',
  POLL_OPENED: 'poll.opened',
  POLL_CLOSED: 'poll.closed',
  POLL_ARCHIVED: 'poll.archived',
  POLL_REOPENED: 'poll.reopened',
  POLL_DUPLICATED: 'poll.duplicated',
  POLL_AUTO_OPENED: 'poll.auto_opened',
  POLL_AUTO_CLOSED: 'poll.auto_closed',

  OPTION_CREATED: 'option.created',
  OPTION_UPDATED: 'option.updated',
  OPTION_DELETED: 'option.deleted',
  OPTIONS_REORDERED: 'option.reordered',

  MEDIA_UPLOADED: 'media.uploaded',

  /** Un admin desveló quien voto que: se deja constancia explicita. */
  PARTICIPATION_CHOICES_VIEWED: 'participation.choices_viewed',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/** Etiquetas en espanol para la UI de auditoria. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.USER_LOGIN]: 'Inicio de sesion',
  [AUDIT_ACTIONS.USER_LOGIN_FAILED]: 'Intento de inicio de sesion fallido',
  [AUDIT_ACTIONS.USER_LOGOUT]: 'Cierre de sesion',
  [AUDIT_ACTIONS.USER_CREATED]: 'Usuario creado',
  [AUDIT_ACTIONS.USER_UPDATED]: 'Usuario editado',
  [AUDIT_ACTIONS.USER_ACTIVATED]: 'Usuario activado',
  [AUDIT_ACTIONS.USER_DEACTIVATED]: 'Usuario desactivado',
  [AUDIT_ACTIONS.USER_DELETED]: 'Usuario eliminado',
  [AUDIT_ACTIONS.USER_PASSWORD_RESET]: 'Contrasena restablecida',
  [AUDIT_ACTIONS.USER_PASSWORD_CHANGED]: 'Contrasena modificada',
  [AUDIT_ACTIONS.POLL_CREATED]: 'Votacion creada',
  [AUDIT_ACTIONS.POLL_UPDATED]: 'Votacion editada',
  [AUDIT_ACTIONS.POLL_SETTINGS_UPDATED]: 'Configuracion modificada',
  [AUDIT_ACTIONS.POLL_DELETED]: 'Votacion eliminada',
  [AUDIT_ACTIONS.POLL_PUBLISHED]: 'Votacion publicada',
  [AUDIT_ACTIONS.POLL_SCHEDULED]: 'Votacion programada',
  [AUDIT_ACTIONS.POLL_OPENED]: 'Votacion abierta',
  [AUDIT_ACTIONS.POLL_CLOSED]: 'Votacion cerrada',
  [AUDIT_ACTIONS.POLL_ARCHIVED]: 'Votacion archivada',
  [AUDIT_ACTIONS.POLL_REOPENED]: 'Votacion reabierta',
  [AUDIT_ACTIONS.POLL_DUPLICATED]: 'Votacion duplicada',
  [AUDIT_ACTIONS.POLL_AUTO_OPENED]: 'Votacion abierta automaticamente',
  [AUDIT_ACTIONS.POLL_AUTO_CLOSED]: 'Votacion cerrada automaticamente',
  [AUDIT_ACTIONS.OPTION_CREATED]: 'Pelicula agregada',
  [AUDIT_ACTIONS.OPTION_UPDATED]: 'Pelicula editada',
  [AUDIT_ACTIONS.OPTION_DELETED]: 'Pelicula eliminada',
  [AUDIT_ACTIONS.OPTIONS_REORDERED]: 'Peliculas reordenadas',
  [AUDIT_ACTIONS.MEDIA_UPLOADED]: 'Cartelera subida',
  [AUDIT_ACTIONS.PARTICIPATION_CHOICES_VIEWED]: 'Consulta de elecciones individuales',
}

export const POLL_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programada',
  PUBLISHED: 'Publicada',
  ACTIVE: 'Activa',
  CLOSED: 'Cerrada',
  ARCHIVED: 'Archivada',
}
