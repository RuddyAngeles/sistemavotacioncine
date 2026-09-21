import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Genera las carteleras de prueba usadas por los tests E2E.
 *
 * Son PNG de color solido en relacion 2:3 (la de un cartel de cine), creados
 * a mano para no meter binarios grandes ni una dependencia de imagenes solo
 * para los tests. Ejecutar con: node tests/e2e/fixtures/make-posters.mjs
 */

function crc32(buffer) {
  let crc = 0xffffffff
  for (let n = 0; n < buffer.length; n += 1) {
    let c = (crc ^ buffer[n]) & 0xff
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function solidPng(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profundidad de bits
  ihdr[9] = 2 // color: RGB

  const raw = Buffer.alloc(height * (1 + width * 3))
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0 // filtro de la fila
    offset += 1
    for (let x = 0; x < width; x += 1) {
      const shade = 0.65 + 0.35 * (y / height)
      raw[offset] = Math.round(r * shade)
      raw[offset + 1] = Math.round(g * shade)
      raw[offset + 2] = Math.round(b * shade)
      offset += 3
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const here = dirname(fileURLToPath(import.meta.url))
const posters = [
  ['poster-azul.png', [37, 99, 235]],
  ['poster-rojo.png', [190, 24, 93]],
  ['poster-verde.png', [22, 163, 74]],
]

for (const [name, color] of posters) {
  writeFileSync(join(here, name), solidPng(400, 600, color))
}

console.warn('Carteleras de prueba generadas en tests/e2e/fixtures/')
