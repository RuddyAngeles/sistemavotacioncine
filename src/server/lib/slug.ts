const RESERVED = new Set(['api', 'admin', 'app', 'login', 'logout', 'new', 'assets', 'media'])

/** Convierte un titulo en un slug legible y seguro para URLs. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')

  if (base.length === 0 || RESERVED.has(base)) return `votacion-${randomSuffix()}`
  return base
}

export function randomSuffix(length = 5): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}

/**
 * Busca un slug libre. El slug NO es un secreto ni una medida de seguridad:
 * conocer la URL no da acceso, siempre hay que iniciar sesion.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base)
  if (!(await exists(root))) return root

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${root}-${randomSuffix()}`
    if (!(await exists(candidate))) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}
