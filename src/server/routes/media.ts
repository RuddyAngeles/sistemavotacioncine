import { Hono } from 'hono'
import { AUDIT_ACTIONS, ERROR_CODES } from '../../shared/constants'
import type { ALLOWED_IMAGE_MIME_TYPES } from '../../shared/constants'
import type { AppEnv } from '../env'
import { maxUploadBytes } from '../env'
import { newId } from '../lib/crypto'
import { AppError, notFound } from '../lib/errors'
import { requireAdmin, requireAuth, requireFreshPassword } from '../middleware/auth'
import { recordAudit } from '../services/audit'

export const mediaRoutes = new Hono<AppEnv>()

const POSTER_PREFIX = 'posters/'
/** Solo aceptamos claves generadas por nosotros: bloquea travesia de rutas. */
const SAFE_KEY = /^posters\/[a-f0-9-]{36}\.(jpg|png|webp)$/

interface DetectedImage {
  mimeType: (typeof ALLOWED_IMAGE_MIME_TYPES)[number]
  extension: 'jpg' | 'png' | 'webp'
}

/**
 * Detecta el tipo real por los bytes de cabecera.
 *
 * No nos fiamos ni de la extension ni del `Content-Type` que envia el
 * navegador: los dos los controla el cliente. Un .exe renombrado a .jpg no
 * pasa de aqui.
 */
function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (bytes.length < 12) return null

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((byte, index) => bytes[index] === byte)) {
    return { mimeType: 'image/png', extension: 'png' }
  }

  const ascii = (start: number, end: number): string =>
    String.fromCharCode(...bytes.subarray(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' }
  }

  return null
}

/**
 * POST /api/uploads/poster
 *
 * Sube una cartelera a R2. La imagen NUNCA se guarda en D1: en la base solo
 * queda la clave del objeto.
 */
mediaRoutes.post('/uploads/poster', requireAdmin, requireFreshPassword, async (c) => {
  const limit = maxUploadBytes(c.env)

  // Corte temprano por cabecera, antes de leer el cuerpo entero.
  const declaredLength = Number.parseInt(c.req.header('Content-Length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > limit + 4096) {
    throw new AppError(
      413,
      ERROR_CODES.UPLOAD_INVALID,
      'La imagen supera el tamano maximo de ' + Math.round(limit / 1024 / 1024) + ' MB',
    )
  }

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new AppError(400, ERROR_CODES.UPLOAD_INVALID, 'No se ha podido leer el archivo enviado')
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new AppError(400, ERROR_CODES.UPLOAD_INVALID, 'Adjunta un archivo en el campo "file"')
  }

  if (file.size === 0) {
    throw new AppError(400, ERROR_CODES.UPLOAD_INVALID, 'El archivo esta vacio')
  }
  if (file.size > limit) {
    throw new AppError(
      413,
      ERROR_CODES.UPLOAD_INVALID,
      'La imagen supera el tamano maximo de ' + Math.round(limit / 1024 / 1024) + ' MB',
    )
  }

  const buffer = await file.arrayBuffer()
  const detected = detectImageType(new Uint8Array(buffer.slice(0, 16)))
  if (!detected) {
    throw new AppError(
      415,
      ERROR_CODES.UPLOAD_INVALID,
      'Formato no admitido. Usa JPG, PNG o WEBP.',
    )
  }

  // El nombre lo generamos nosotros: el original del usuario se descarta.
  const key = POSTER_PREFIX + newId() + '.' + detected.extension

  await c.env.MEDIA.put(key, buffer, {
    httpMetadata: {
      contentType: detected.mimeType,
      cacheControl: 'private, max-age=31536000, immutable',
    },
    customMetadata: {
      uploadedBy: c.get('user')?.id ?? 'unknown',
      uploadedAt: new Date().toISOString(),
    },
  })

  await recordAudit(c, {
    action: AUDIT_ACTIONS.MEDIA_UPLOADED,
    entity: 'media',
    entityId: key,
    metadata: { size: file.size, mimeType: detected.mimeType },
  })

  return c.json({ key, url: '/api/media/' + key }, 201)
})

/**
 * GET /api/media/posters/:file
 *
 * Las carteleras se sirven por el Worker, no desde una URL publica de R2:
 * el bucket permanece privado y la imagen exige sesion, igual que el resto
 * de la aplicacion.
 */
mediaRoutes.get('/media/*', requireAuth, requireFreshPassword, async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace('/api/media/', ''))

  if (!SAFE_KEY.test(key)) throw notFound('Imagen no encontrada')

  const object = await c.env.MEDIA.get(key)
  if (!object) throw notFound('Imagen no encontrada')

  const etag = object.httpEtag
  if (c.req.header('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      // La clave es unica por imagen, asi que el contenido nunca cambia.
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: etag,
    },
  })
})
