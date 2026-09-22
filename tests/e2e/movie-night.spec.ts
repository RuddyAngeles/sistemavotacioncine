import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

/**
 * Recorrido end-to-end sobre la interfaz real.
 *
 * Requisitos previos (ver README):
 *   npm run db:migrate:local
 *   npm run seed
 *
 * Usa las credenciales de desarrollo que crea el seed. Playwright arranca
 * `npm run dev` por su cuenta (ver playwright.config.ts).
 */

const ADMIN = { username: 'admin', password: 'Admin2026' }
const CARLOS = { username: 'carlos01', password: 'Movie2026' }

/** Cartelera de prueba: tres peliculas, cada una con su imagen. */
const PELICULAS = [
  { titulo: 'Interstellar', hora: '20:00', cartelera: 'poster-azul.png' },
  { titulo: 'Origen', hora: '20:30', cartelera: 'poster-rojo.png' },
  { titulo: 'Gladiator', hora: '21:00', cartelera: 'poster-verde.png' },
]

const poster = (nombre: string) =>
  fileURLToPath(new URL('./fixtures/' + nombre, import.meta.url))

async function login(page: Page, user: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Usuario', { exact: true }).fill(user.username)
  await page.getByLabel('Contrasena', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Iniciar sesion' }).click()

  // Esperamos a salir de /login: la pantalla de acceso tiene su propio h1 y
  // su propio selector de tema, y buscarlos antes de la redireccion daria
  // con los de la pagina equivocada.
  await expect(page).not.toHaveURL(/\/login/)
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Menu de usuario' }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesion' }).click()
  await expect(page).toHaveURL(/\/login/)
}

/** Confirma un dialogo de accion critica pulsando su boton principal. */
async function confirm(page: Page, label: string) {
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click()
}

/**
 * Cierra por API cualquier votacion que quedara abierta.
 *
 * Los tests comparten la base local, asi que una prueba que dependa de "no
 * hay ninguna votacion abierta" tiene que asegurarselo ella misma en lugar
 * de confiar en el orden de ejecucion.
 */
async function cerrarVotacionesAbiertas(page: Page) {
  const base = 'http://localhost:5173'
  const headers = { Origin: base }

  await page.request.post(base + '/api/auth/login', {
    headers,
    data: { username: ADMIN.username, password: ADMIN.password },
  })

  const response = await page.request.get(base + '/api/polls?status=ACTIVE')
  const { items } = (await response.json()) as { items: Array<{ id: string }> }

  for (const poll of items) {
    await page.request.post(base + '/api/polls/' + poll.id + '/close', { headers })
  }

  await page.request.post(base + '/api/auth/logout', { headers })
}

/** Crea por API una votacion con una pelicula y la deja abierta. */
async function abrirVotacionDePrueba(
  page: Page,
  titulo: string,
  settings: Record<string, unknown> = {},
  peliculas: string[] = ['Interstellar'],
): Promise<string> {
  const base = 'http://localhost:5173'
  const headers = { Origin: base }

  await page.request.post(base + '/api/auth/login', {
    headers,
    data: { username: ADMIN.username, password: ADMIN.password },
  })

  const created = await page.request.post(base + '/api/polls', {
    headers,
    data: { title: titulo, ...settings },
  })
  const poll = (await created.json()) as { id: string; slug: string }

  for (const pelicula of peliculas) {
    await page.request.post(base + '/api/polls/' + poll.id + '/options', {
      headers,
      data: { title: pelicula },
    })
  }
  await page.request.post(base + '/api/polls/' + poll.id + '/publish', { headers })
  await page.request.post(base + '/api/polls/' + poll.id + '/open', { headers })
  await page.request.post(base + '/api/auth/logout', { headers })

  return poll.slug
}

test.describe('acceso', () => {
  test('una URL privada redirige al login y vuelve a ella despues de entrar', async ({ page }) => {
    await page.goto('/admin/usuarios')
    await expect(page).toHaveURL(/\/login/)

    await page.getByLabel('Usuario', { exact: true }).fill(ADMIN.username)
    await page.getByLabel('Contrasena', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Iniciar sesion' }).click()

    await expect(page).toHaveURL(/\/admin\/usuarios/)
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()
  })

  test('las credenciales incorrectas no dan acceso', async ({ page }) => {
    // Sin el ayudante `login`, que espera salir de /login: aqui no se sale.
    await page.goto('/login')
    await page.getByLabel('Usuario', { exact: true }).fill('admin')
    await page.getByLabel('Contrasena', { exact: true }).fill('claveIncorrecta1')
    await page.getByRole('button', { name: 'Iniciar sesion' }).click()

    await expect(page.getByRole('alert')).toContainText('incorrectos')
    await expect(page).toHaveURL(/\/login/)
  })

  test('un trabajador no ve el panel de administracion', async ({ page }) => {
    await login(page, CARLOS)
    await expect(page).toHaveURL(/\/app/)

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/app/)
  })


  test('el administrador entra en la raiz y aterriza en su panel', async ({ page }) => {
    await login(page, ADMIN)

    await page.goto('/')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible()
  })

  test('el trabajador entra en la raiz y aterriza en sus votaciones', async ({ page }) => {
    await login(page, CARLOS)

    await page.goto('/')
    await expect(page).toHaveURL(/\/app$/)
  })

  test('desde la pantalla de votacion el admin llega al panel en un clic', async ({ page }) => {
    await login(page, ADMIN)

    await page.goto('/app')
    await page.getByRole('link', { name: /Panel/ }).click()
    await expect(page).toHaveURL(/\/admin/)
  })

  test('no existe ninguna opcion de registro publico', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText(/crear cuenta|registrarse|sign up/i)).toHaveCount(0)
    await expect(page.getByText(/continuar con google|iniciar con facebook/i)).toHaveCount(0)
  })
})

test.describe('Movie Night completa', () => {
  test('el administrador prepara la votacion y el trabajador vota', async ({ page }) => {
    const title = 'Movie Night E2E ' + Date.now()

    // --- Administrador: crear borrador -------------------------------------
    await login(page, ADMIN)
    await expect(page).toHaveURL(/\/admin/)

    await page.goto('/admin/votaciones/nueva')
    // Localizamos por id: las etiquetas de los campos obligatorios llevan un
    // asterisco decorativo, asi que el texto exacto no es un selector fiable.
    await page.locator('#title').fill(title)
    await page.locator('#description').fill('Elige la pelicula del viernes.')

    // Voto unico: se desactiva "permitir cambiar el voto".
    await page.locator('#allowVoteChange').click()
    await page.getByRole('button', { name: 'Continuar: agregar peliculas' }).click()

    await expect(page).toHaveURL(/\/admin\/votaciones\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    /*
     * Cartelera: tres peliculas, cada una con su imagen, encadenadas con
     * "Guardar y agregar otra" sin cerrar el dialogo entre una y otra.
     */
    await page.getByRole('button', { name: 'Agregar pelicula', exact: true }).first().click()
    const dialog = page.getByRole('dialog')

    for (const [index, movie] of PELICULAS.entries()) {
      await dialog.locator('#option-title').fill(movie.titulo)
      await dialog.locator('#option-showtime').fill(movie.hora)
      await dialog.locator('input[type=file]').setInputFiles(poster(movie.cartelera))
      await expect(dialog.getByText('Cartelera cargada')).toBeVisible({ timeout: 20_000 })

      const ultima = index === PELICULAS.length - 1
      await dialog
        .getByRole('button', { name: ultima ? 'Agregar y cerrar' : 'Guardar y agregar otra' })
        .click()

      if (!ultima) {
        // El dialogo sigue abierto y el formulario vuelve a estar limpio.
        await expect(dialog).toBeVisible()
        await expect(dialog.locator('#option-title')).toHaveValue('')
      }
    }

    await expect(dialog).toBeHidden()

    // Las tres aparecen en la cartelera, todas con su miniatura.
    for (const movie of PELICULAS) {
      await expect(page.getByText(movie.titulo, { exact: true })).toBeVisible()
    }
    await expect(page.getByText('Sin cartelera')).toHaveCount(0)

    // --- Administrador: publicar y abrir -----------------------------------
    await page.getByRole('button', { name: 'Publicar votacion' }).click()
    await confirm(page, 'Publicar')
    await expect(page.getByText('Publicada', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Abrir votacion' }).click()
    await confirm(page, 'Abrir')
    await expect(page.getByText('Activa', { exact: true })).toBeVisible()

    await logout(page)

    // --- Trabajador: votar --------------------------------------------------
    await login(page, CARLOS)
    await page.getByRole('link', { name: new RegExp(title) }).click()

    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    /*
     * Las tres carteleras se ven, y se ven en fila: misma altura y posiciones
     * horizontales crecientes. Es lo que se pidio, asi que se comprueba con
     * geometria real y no solo con "la imagen existe".
     */
    const carteleras = page.locator('main img')
    await expect(carteleras).toHaveCount(PELICULAS.length)

    const cajas = await carteleras.evaluateAll((imgs) =>
      imgs.map((img) => {
        const rect = img.getBoundingClientRect()
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width) }
      }),
    )

    // Todas cargadas de verdad (no rotas).
    const cargadas = await carteleras.evaluateAll((imgs) =>
      imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
    )
    expect(cargadas).toBe(true)

    const ancho = page.viewportSize()?.width ?? 0

    if (ancho >= 1024) {
      // En escritorio, las tres en la misma fila y de izquierda a derecha.
      expect(new Set(cajas.map((caja) => caja.y)).size).toBe(1)
      expect(cajas[0].x).toBeLessThan(cajas[1].x)
      expect(cajas[1].x).toBeLessThan(cajas[2].x)
    } else {
      // En movil se apilan: misma columna y bajando.
      expect(new Set(cajas.map((caja) => caja.x)).size).toBe(1)
      expect(cajas[0].y).toBeLessThan(cajas[1].y)
      expect(cajas[1].y).toBeLessThan(cajas[2].y)
    }

    // En ningun caso quedan diminutas.
    expect(cajas.every((caja) => caja.w > 100)).toBe(true)

    await page.getByRole('button', { name: 'Elegir pelicula' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar voto' }).click()

    await expect(page.locator('#contenido').getByText('Respuesta registrada')).toBeVisible()

    // Con el cambio de voto desactivado no debe existir el boton.
    await expect(page.getByRole('button', { name: 'Cambiar respuesta' })).toHaveCount(0)
    await expect(page.getByText('no permite cambiar la respuesta')).toBeVisible()

    // Y los resultados siguen ocultos mientras la votacion esta abierta.
    await expect(page.getByText('Resultados ocultos')).toBeVisible()

    // Al recargar, el sistema recuerda que ya voto.
    await page.reload()
    await expect(page.locator('#contenido').getByText('Respuesta registrada')).toBeVisible()
  })
})

test.describe('interfaz', () => {
  test('la pantalla de votacion funciona en movil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, CARLOS)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Sin desplazamiento horizontal: todo cabe en el ancho del telefono.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflows).toBe(false)
  })

  test('el tema oscuro se puede activar y se recuerda', async ({ page }) => {
    await login(page, CARLOS)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'Cambiar tema' }).click()
    await page.getByRole('menu').getByRole('menuitem', { name: 'Oscuro' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('enlace fijo', () => {
  test('con una votacion abierta, el enlace fijo lleva directo a ella', async ({ page }) => {
    await cerrarVotacionesAbiertas(page)
    const slug = await abrirVotacionDePrueba(page, 'Enlace fijo E2E ' + Date.now())

    await login(page, CARLOS)
    await page.goto('/votar')

    // El enlace fijo resuelve solo a la votacion abierta de ese momento.
    await expect(page).toHaveURL(new RegExp('/app/votacion/' + slug))
    await expect(page.getByRole('button', { name: 'Elegir pelicula' }).first()).toBeVisible()
  })

  test('sin votacion abierta explica que no hay nada y mantiene el enlace', async ({ page }) => {
    await cerrarVotacionesAbiertas(page)
    await login(page, CARLOS)

    await page.goto('/votar')
    await expect(page.getByRole('heading', { name: /No hay ninguna votacion abierta/ })).toBeVisible()
  })

  test('sin sesion, el enlace fijo pasa por el login y vuelve solo', async ({ page }) => {
    await page.goto('/votar')
    await expect(page).toHaveURL(/\/login/)

    await page.getByLabel('Usuario', { exact: true }).fill(CARLOS.username)
    await page.getByLabel('Contrasena', { exact: true }).fill(CARLOS.password)
    await page.getByRole('button', { name: 'Iniciar sesion' }).click()

    // Vuelve a /votar y desde ahi resuelve a donde toque.
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('mi perfil', () => {
  test('cualquiera puede cambiar su nombre visible desde el menu', async ({ page }) => {
    await login(page, CARLOS)

    await page.getByRole('button', { name: 'Menu de usuario' }).click()
    await page.getByRole('menuitem', { name: 'Mi perfil' }).click()
    await expect(page).toHaveURL(/\/perfil/)

    const nuevo = 'Carlos Perez ' + Date.now()
    await page.locator('#profile-name').fill(nuevo)
    await page.getByRole('button', { name: 'Guardar nombre' }).click()

    // El nombre nuevo aparece de inmediato en la cabecera.
    await expect(page.getByRole('button', { name: 'Menu de usuario' })).toContainText(nuevo)

    // Y sigue ahi tras recargar: se ha guardado en el servidor.
    await page.reload()
    await expect(page.locator('#profile-name')).toHaveValue(nuevo)
  })

  test('el usuario y el rol no son editables desde el perfil', async ({ page }) => {
    await login(page, CARLOS)
    await page.goto('/perfil')

    await expect(page.getByText('carlos01')).toBeVisible()
    await expect(page.getByText('solo los puede cambiar un administrador')).toBeVisible()
    await expect(page.locator('#username')).toHaveCount(0)
  })
})

test.describe('lista de usuarios', () => {
  /*
   * La pantalla pedia 50 usuarios y no mostraba paginacion ni el total, asi
   * que con mas de 50 la lista se cortaba en silencio (llegaba hasta la M) y
   * el resto solo aparecia buscandolos. Esta prueba crea suficientes cuentas
   * para pasar de ese umbral y comprueba que ya no se pierde a nadie.
   */
  test('no se recorta en silencio cuando hay muchos usuarios', async ({ page }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }

    await page.request.post(base + '/api/auth/login', {
      headers,
      data: { username: ADMIN.username, password: ADMIN.password },
    })

    // Nos aseguramos de superar la antigua pagina de 50.
    const sufijo = String(Date.now()).slice(-6)
    for (let i = 0; i < 55; i += 1) {
      const n = String(i).padStart(2, '0')
      await page.request.post(base + '/api/users', {
        headers,
        data: {
          name: 'Zz Prueba ' + n,
          username: 'zz' + sufijo + n,
          password: 'Secreta123',
          role: 'VOTER',
          status: 'ACTIVE',
        },
      })
    }

    // La sesion ya esta abierta por la API: ir a /login solo provocaria una
    // redireccion, asi que se navega directo.
    await page.goto('/admin/usuarios')

    // El total se anuncia, de modo que nunca parece que estan todos si no lo estan.
    const resumen = page.getByText(/\d+ usuarios$|Mostrando \d+/)
    await expect(resumen).toBeVisible()

    const texto = (await resumen.innerText()).match(/(\d+) usuarios/)
    const total = Number(texto?.[1] ?? '0')
    expect(total).toBeGreaterThan(50)

    // Y las cuentas del final del alfabeto se ven sin tener que buscarlas.
    await expect(page.getByText('Zz Prueba 54')).toBeVisible()

    // Limpieza.
    const lista = await page.request.get(base + '/api/users?q=zz' + sufijo + '&pageSize=100')
    const { items } = (await lista.json()) as { items: Array<{ id: string }> }
    for (const u of items) await page.request.delete(base + '/api/users/' + u.id, { headers })
  })
})

test.describe('asistencia', () => {
  test('un trabajador puede responder que no ira y el admin ve el recuento', async ({ page }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }

    await cerrarVotacionesAbiertas(page)
    const slug = await abrirVotacionDePrueba(page, 'Asistencia E2E ' + Date.now())

    // --- Trabajador: responde que no ira ---
    await login(page, CARLOS)
    await page.goto('/app/votacion/' + slug)

    await page.getByRole('button', { name: 'No podre ir', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()

    await expect(page.locator('#contenido').getByText('No asistiras')).toBeVisible()

    // Al recargar sigue registrado.
    await page.reload()
    await expect(page.locator('#contenido').getByText('No asistiras')).toBeVisible()

    // --- Admin: el resumen lo refleja ---
    await page.request.post(base + '/api/auth/login', {
      headers,
      data: { username: ADMIN.username, password: ADMIN.password },
    })
    const lista = await page.request.get(base + '/api/polls?status=ACTIVE')
    const { items } = (await lista.json()) as { items: Array<{ id: string; slug: string }> }
    const activa = items.find((p) => p.slug === slug)
    if (!activa) throw new Error('No se ha encontrado la votacion de prueba')

    const res = await page.request.get(base + '/api/polls/' + activa.id + '/results')
    const { results } = (await res.json()) as {
      results: { overview: { attendance: { attending: number; notAttending: number } } }
    }
    expect(results.overview.attendance.notAttending).toBe(1)
    expect(results.overview.attendance.attending).toBe(0)

    // Y la pantalla de resultados muestra el resumen de entradas.
    await page.goto('/admin/votaciones/' + activa.id + '?tab=resultados')
    await expect(page.getByText('Entradas si la votacion cerrara ahora')).toBeVisible()
    await expect(page.getByText('No asisten')).toBeVisible()
  })

  /**
   * Con resultados en vivo, el trabajador ve que pelicula gana y nada mas.
   *
   * El censo y quien no va son datos del administrador. Se comprueba en la
   * pantalla, pero tambien en la respuesta del servidor: si viajaran los
   * numeros, ocultarlos no serviria de nada.
   */
  test('un trabajador con resultados en vivo no ve el resumen de asistencia', async ({ page }) => {
    const base = 'http://localhost:5173'

    await cerrarVotacionesAbiertas(page)
    const slug = await abrirVotacionDePrueba(page, 'En vivo E2E ' + Date.now(), {
      showLiveResults: true,
    })

    await login(page, CARLOS)
    await page.goto('/app/votacion/' + slug)

    await page.getByRole('button', { name: 'Elegir pelicula' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar voto' }).click()

    const contenido = page.locator('#contenido')

    // Ve el reparto por pelicula: la barra con su porcentaje y su recuento.
    await expect(contenido.getByRole('heading', { name: 'Resultados actuales' })).toBeVisible()
    await expect(contenido.getByRole('meter', { name: /^Interstellar: 100/ })).toBeVisible()
    // Dos veces: el total de la cabecera y el recuento de la propia barra.
    await expect(contenido.getByText('1 voto', { exact: true })).toHaveCount(2)

    // No ve el bloque de organizacion.
    await expect(contenido.getByText('Entradas si la votacion cerrara ahora')).toHaveCount(0)
    await expect(contenido.getByText('No asisten')).toHaveCount(0)
    await expect(contenido.getByText('Sin responder')).toHaveCount(0)
    await expect(contenido.getByText('Censo')).toHaveCount(0)
    await expect(contenido.getByText('de participacion')).toHaveCount(0)

    // Y el servidor tampoco se los envia.
    const view = await page.request.get(base + '/api/me/polls/' + slug)
    const cuerpo = await view.text()
    expect(cuerpo).not.toContain('notAttending')
    expect(cuerpo).not.toContain('eligibleVoters')
    expect((JSON.parse(cuerpo) as { results: { overview: unknown } }).results.overview).toBeNull()
  })
})

test.describe('integridad del voto', () => {
  /**
   * El intento de trampa mas obvio: abrir la sesion en dos navegadores.
   *
   * Son dos contextos de Playwright independientes, con su propio almacen
   * de cookies, igual que Chrome y Firefox abiertos a la vez. La misma
   * persona entra en los dos y trata de votar en cada uno.
   */
  test('la misma cuenta en dos navegadores no consigue votar dos veces', async ({ browser }) => {
    const base = 'http://localhost:5173'

    const preparacion = await browser.newContext()
    const paginaPreparacion = await preparacion.newPage()
    await cerrarVotacionesAbiertas(paginaPreparacion)
    const slug = await abrirVotacionDePrueba(
      paginaPreparacion,
      'Trampa E2E ' + Date.now(),
      { allowVoteChange: false, showLiveResults: true },
      ['Interstellar', 'Origen'],
    )
    await preparacion.close()

    // --- Navegador 1: vota ---
    const navegador1 = await browser.newContext()
    const pagina1 = await navegador1.newPage()
    await login(pagina1, CARLOS)
    await pagina1.goto('/app/votacion/' + slug)
    await pagina1.getByRole('button', { name: 'Elegir pelicula' }).first().click()
    await pagina1.getByRole('dialog').getByRole('button', { name: 'Confirmar voto' }).click()
    await expect(pagina1.locator('#contenido').getByText('Respuesta registrada')).toBeVisible()

    // --- Navegador 2: misma cuenta, sesion nueva ---
    const navegador2 = await browser.newContext()
    const pagina2 = await navegador2.newPage()
    await login(pagina2, CARLOS)

    // Las cookies son distintas: son dos sesiones de verdad.
    const galleta = async (contexto: typeof navegador1) =>
      (await contexto.cookies()).find((c) => c.name.includes('session'))?.value
    expect(await galleta(navegador1)).not.toBe(await galleta(navegador2))
    expect(await galleta(navegador2)).toBeTruthy()

    await pagina2.goto('/app/votacion/' + slug)

    // La pantalla ya no ofrece votar: reconoce a la persona, no al navegador.
    await expect(pagina2.locator('#contenido').getByText('Respuesta registrada')).toBeVisible()
    await expect(pagina2.getByRole('button', { name: 'Elegir pelicula' })).toHaveCount(0)

    /*
     * Y saltandose la interfaz tampoco.
     *
     * El voto forzado usa el id real de la OTRA pelicula, no uno inventado:
     * con un id falso la peticion se rechazaria por no existir la opcion y
     * no llegariamos a probar lo que interesa, que es el segundo voto.
     */
    const vista = await pagina2.evaluate(async () => {
      const r = await fetch('/api/me/polls/' + location.pathname.split('/').pop())
      return (await r.json()) as {
        poll: { id: string }
        options: Array<{ id: string; title: string }>
        myVote: { optionId: string } | null
      }
    })
    const idVotacion = vista.poll.id
    const otraPelicula = vista.options.find((o) => o.id !== vista.myVote?.optionId)
    expect(otraPelicula).toBeTruthy()

    const forzado = await pagina2.request.post(base + '/api/polls/' + idVotacion + '/vote', {
      headers: { Origin: base },
      data: { optionId: otraPelicula!.id },
    })
    expect(forzado.status()).toBe(409)

    const cambio = await pagina2.request.patch(base + '/api/polls/' + idVotacion + '/vote', {
      headers: { Origin: base },
      data: { notAttending: true },
    })
    expect(cambio.status()).toBe(409)

    // --- El recuento del administrador: un solo voto ---
    const revision = await browser.newContext()
    const paginaRevision = await revision.newPage()
    await paginaRevision.request.post(base + '/api/auth/login', {
      headers: { Origin: base },
      data: { username: ADMIN.username, password: ADMIN.password },
    })
    const res = await paginaRevision.request.get(base + '/api/polls/' + idVotacion + '/results')
    const { results } = (await res.json()) as {
      results: { overview: { totalVotes: number; attendance: { attending: number } } }
    }
    expect(results.overview.totalVotes).toBe(1)
    expect(results.overview.attendance.attending).toBe(1)

    const detalle = await paginaRevision.request.get(
      base + '/api/polls/' + idVotacion + '/participation',
    )
    const { participation } = (await detalle.json()) as { participation: { voted: number } }
    expect(participation.voted).toBe(1)

    await navegador1.close()
    await navegador2.close()
    await revision.close()
  })
})
