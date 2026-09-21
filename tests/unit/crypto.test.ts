import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { PBKDF2_MAX_ITERATIONS } from '../../src/shared/constants'
import { pbkdf2Iterations } from '../../src/server/env'
import {
  generateSessionToken,
  hashPassword,
  sha256Hex,
  timingSafeEqual,
  verifyPassword,
} from '../../src/server/lib/crypto'

const ITERATIONS = 1000

describe('hashPassword', () => {
  it('nunca devuelve la contrasena en claro', async () => {
    const hash = await hashPassword('MiClave2026', ITERATIONS)
    expect(hash).not.toContain('MiClave2026')
    expect(hash.startsWith('pbkdf2-sha256$' + ITERATIONS + '$')).toBe(true)
  })

  it('usa una sal distinta cada vez', async () => {
    const first = await hashPassword('MiClave2026', ITERATIONS)
    const second = await hashPassword('MiClave2026', ITERATIONS)
    expect(first).not.toBe(second)
  })
})

describe('verifyPassword', () => {
  it('acepta la contrasena correcta', async () => {
    const hash = await hashPassword('MiClave2026', ITERATIONS)
    const result = await verifyPassword('MiClave2026', hash, ITERATIONS)
    expect(result.valid).toBe(true)
    expect(result.needsRehash).toBe(false)
  })

  it('rechaza la contrasena incorrecta', async () => {
    const hash = await hashPassword('MiClave2026', ITERATIONS)
    expect((await verifyPassword('otraClave1', hash, ITERATIONS)).valid).toBe(false)
  })

  it('rechaza hashes con formato invalido sin lanzar excepcion', async () => {
    expect((await verifyPassword('x', 'basura', ITERATIONS)).valid).toBe(false)
    expect((await verifyPassword('x', 'pbkdf2-sha256$abc$aa$bb', ITERATIONS)).valid).toBe(false)
    expect((await verifyPassword('x', 'md5$1000$aa$bb', ITERATIONS)).valid).toBe(false)
  })

  it('marca para rehash los hashes con menos iteraciones de las actuales', async () => {
    const hash = await hashPassword('MiClave2026', 1000)
    const result = await verifyPassword('MiClave2026', hash, 5000)
    expect(result.valid).toBe(true)
    expect(result.needsRehash).toBe(true)
  })
})

describe('timingSafeEqual', () => {
  it('compara correctamente', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})

describe('tokens de sesion', () => {
  it('genera tokens unicos y suficientemente largos', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()))
    expect(tokens.size).toBe(50)
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(43)
  })

  it('el identificador guardado es el SHA-256 del token, no el token', async () => {
    const token = generateSessionToken()
    const id = await sha256Hex(token)
    expect(id).toHaveLength(64)
    expect(id).not.toBe(token)
    expect(await sha256Hex(token)).toBe(id)
  })
})

describe('limite de iteraciones del runtime', () => {
  /*
   * WebCrypto en Workers rechaza PBKDF2 por encima de 100 000 iteraciones.
   * Configurar mas dejaba el login devolviendo 500 en produccion, asi que el
   * valor se recorta y aqui se comprueba que sigue recortandose.
   */
  it('recorta cualquier valor configurado por encima del maximo', () => {
    const configurado = { ...env, AUTH_PBKDF2_ITERATIONS: '500000' }
    expect(pbkdf2Iterations(configurado)).toBe(PBKDF2_MAX_ITERATIONS)
  })

  it('respeta un valor valido y aplica un minimo razonable', () => {
    expect(pbkdf2Iterations({ ...env, AUTH_PBKDF2_ITERATIONS: '50000' })).toBe(50_000)
    expect(pbkdf2Iterations({ ...env, AUTH_PBKDF2_ITERATIONS: '10' })).toBe(1_000)
    expect(pbkdf2Iterations({ ...env, AUTH_PBKDF2_ITERATIONS: 'no-es-un-numero' })).toBe(
      PBKDF2_MAX_ITERATIONS,
    )
  })

  it('el runtime acepta el maximo que permitimos', async () => {
    const hash = await hashPassword('MiClave2026', PBKDF2_MAX_ITERATIONS)
    expect((await verifyPassword('MiClave2026', hash, PBKDF2_MAX_ITERATIONS)).valid).toBe(true)
  })

  /*
   * Nota importante: el workerd que usan estos tests NO aplica el limite de
   * 100 000 iteraciones; el de produccion si. Por eso no se puede comprobar
   * aqui que se rechace un valor mayor, y por eso el recorte tiene que estar
   * en el codigo (`pbkdf2Iterations`) y no delegarse a la validacion del
   * runtime: en local pasaria y en produccion romperia el login.
   */
})
