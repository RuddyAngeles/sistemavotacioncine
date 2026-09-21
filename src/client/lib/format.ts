import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/** Formateo en espanol, tolerante a valores nulos o corruptos. */

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = parseISO(value)
  if (!isValid(date)) return '—'
  return format(date, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
}

export function formatShortDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = parseISO(value)
  if (!isValid(date)) return '—'
  return format(date, 'dd/MM/yyyy HH:mm', { locale: es })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = parseISO(value)
  if (!isValid(date)) return '—'
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es })
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—'
  const date = parseISO(value)
  if (!isValid(date)) return '—'
  return formatDistanceToNow(date, { addSuffix: true, locale: es })
}

/** 169 -> "2h 49min" */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return rest + 'min'
  if (rest === 0) return hours + 'h'
  return hours + 'h ' + rest + 'min'
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%'
  return (Number.isInteger(value) ? value.toString() : value.toFixed(1)) + '%'
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? count + ' ' + singular : count + ' ' + plural
}

/**
 * Convierte un valor de `<input type="datetime-local">` (hora local, sin
 * zona) en ISO UTC, que es lo que espera la API.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!isValid(date)) return null
  return date.toISOString()
}

/** Camino inverso: ISO UTC -> valor para `<input type="datetime-local">`. */
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseISO(value)
  if (!isValid(date)) return ''
  return format(date, "yyyy-MM-dd'T'HH:mm")
}
