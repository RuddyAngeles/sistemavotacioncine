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


/**
 * Cambia de cuenta dentro de un mismo test.
 *
 * Ir a /login con la sesion abierta no sirve: el guardian redirige y el
 * formulario no llega a aparecer. Hay que cerrar sesion primero.
 */
async function entrarComo(page: Page, user: { username: string; password: string }) {
  await page.request.post('http://localhost:5173/api/auth/logout', {
    headers: { Origin: 'http://localhost:5173' },
  })
  await login(page, user)
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
    /*
     * La lista se pinta de dos formas segun el ancho: tarjetas en movil y
     * tabla en escritorio, y las dos estan en el DOM. Se filtra por la que
     * esta visible, que es justo lo que interesa comprobar.
     */
    await expect(page.getByText('Zz Prueba 54').filter({ visible: true })).toBeVisible()

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

test.describe('encuestas', () => {
  /**
   * Recorrido completo de una encuesta anonima.
   *
   * Se comprueba lo que promete el modulo: que sin permiso no se participa,
   * que las cuatro clases de pregunta funcionan, y que al final el admin ve
   * quien respondio y los totales pero no puede saber quien dijo que.
   */
  test('encuesta anonima: del borrador a los resultados sin poder desanonimizar', async ({
    page,
  }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }
    const titulo = 'Clima E2E ' + Date.now()

    // --- Admin: crear la encuesta -----------------------------------------
    await login(page, ADMIN)

    /*
     * La base local se comparte entre ejecuciones, asi que el permiso puede
     * venir ya activado de una pasada anterior. El test fija su propio punto
     * de partida en lugar de confiar en el orden.
     */
    await page.request.post(base + '/api/surveys/permissions/bulk', {
      headers,
      data: { canAnswerSurveys: false },
    })

    await page.goto('/admin/encuestas/nueva')
    await page.locator('#title').fill(titulo)
    await page.locator('#anonymous').click()

    // Al marcarla anonima, el cambio de respuesta queda desactivado.
    await expect(page.getByText('no se podra cambiar la respuesta')).toBeVisible()
    await expect(page.locator('#allowResponseChange')).toBeDisabled()

    await page.getByRole('button', { name: 'Continuar: anadir preguntas' }).click()
    await expect(page).toHaveURL(/\/admin\/encuestas\/[0-9a-f-]+/)
    const idEncuesta = page.url().split('/').pop() ?? ''

    // --- Una pregunta de cada tipo ----------------------------------------
    const tipos: Array<[string, string]> = [
      ['Opcion unica', 'Que dia prefieres?'],
      ['Opcion multiple', 'Que mejorarias?'],
      ['Texto libre', 'Comentarios'],
      ['Valoracion del 1 al 10', 'Como valoras el ambiente?'],
    ]

    for (const [etiqueta, enunciado] of tipos) {
      await page.getByRole('button', { name: 'Anadir pregunta' }).click()
      const dialogo = page.getByRole('dialog')
      await dialogo.locator('#tipo').click()
      await page.getByRole('option', { name: etiqueta }).click()
      await dialogo.locator('#enunciado').fill(enunciado)

      const opciones = dialogo.getByLabel(/^Opcion \d$/)
      const total = await opciones.count()
      for (let i = 0; i < total; i++) await opciones.nth(i).fill('Opcion ' + (i + 1))

      await dialogo.getByRole('button', { name: 'Anadir pregunta' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    await expect(page.getByText('4 preguntas · 0 respuestas')).toBeVisible()

    // --- Sin permiso, nadie puede responder --------------------------------
    await expect(page.getByText('Nadie puede responder todavia')).toBeVisible()

    await page.getByRole('button', { name: 'Publicar' }).click()
    await page.getByRole('button', { name: 'Abrir', exact: true }).click()
    await expect(page.getByText('ACTIVA')).toBeVisible()

    // El trabajador la ve, pero no puede contestar.
    await entrarComo(page, CARLOS)
    await page.goto('/app/encuestas')
    await expect(page.getByText('No puedes participar en encuestas')).toBeVisible()

    // --- Admin: dar el permiso a todos ------------------------------------
    await entrarComo(page, ADMIN)
    await page.goto('/admin/encuestas')
    await page.getByRole('button', { name: 'Activar a todos' }).click()
    // Se comprueba el efecto, no el mensaje: la encuesta deja de avisar de
    // que no hay nadie que pueda responder.
    await page.goto('/admin/encuestas/' + idEncuesta)
    await expect(page.getByText('Nadie puede responder todavia')).toHaveCount(0)
    await expect(page.getByText(/cuentas pueden participar/)).toBeVisible()

    // --- Trabajador: responder --------------------------------------------
    await entrarComo(page, CARLOS)
    await page.goto('/app/encuestas')
    await page.getByText(titulo).click()
    await expect(page).toHaveURL(/\/app\/encuesta\//)
    await expect(page.getByText('Esta encuesta es anonima')).toBeVisible()

    const contenido = page.locator('#contenido')
    // 1. Opcion unica
    await contenido.getByRole('radio', { name: 'Opcion 1' }).first().click()
    // 2. Opcion multiple: dos casillas
    await contenido.getByRole('checkbox', { name: 'Opcion 1' }).click()
    await contenido.getByRole('checkbox', { name: 'Opcion 2' }).click()
    // 3. Texto libre
    await contenido.getByPlaceholder('Escribe tu respuesta').fill('Todo bien, gracias.')
    // 4. Valoracion
    await contenido.getByRole('radio', { name: 'Valoracion 8' }).click()

    await page.getByRole('button', { name: 'Enviar respuestas' }).click()
    await expect(contenido.getByText('Respuesta registrada')).toBeVisible()

    // Al ser anonima no se puede cambiar ni releer.
    await expect(page.getByRole('button', { name: 'Cambiar respuesta' })).toHaveCount(0)
    await expect(contenido.getByText('no se puede consultar ni cambiar')).toBeVisible()

    // --- Admin: resultados y participacion --------------------------------
    await entrarComo(page, ADMIN)
    await page.goto('/admin/encuestas/' + idEncuesta)

    await page.getByRole('tab', { name: 'Resultados' }).click()
    await expect(page.getByText('de media')).toBeVisible()

    /*
     * Los comentarios empiezan plegados: con 82 personas y varias preguntas
     * de texto, desplegarlos de golpe entierra el resto de resultados. Hay
     * que abrirlos, y entonces si se leen.
     */
    await page.getByRole('button', { name: /Comentarios/ }).click()
    await expect(page.getByText('Todo bien, gracias.')).toBeVisible()

    await page.getByRole('tab', { name: 'Participacion' }).click()
    await expect(page.getByText('quien ha participado')).toBeVisible()

    // Y el servidor no envia ningun vinculo persona-respuesta.
    const participacion = await page.request.get(
      base + '/api/surveys/' + idEncuesta + '/participation',
      { headers },
    )
    const crudo = await participacion.text()
    expect(crudo).toContain('carlos01')
    expect(crudo).not.toContain('Todo bien, gracias.')
    expect(crudo).not.toContain('scale')
  })
})

test.describe('movil', () => {
  /**
   * El permiso de encuestas se puede dar desde el telefono.
   *
   * La lista de usuarios era una tabla, y en un movil no caben todas las
   * columnas: las que se ocultaban eran justo el rol y este permiso. Ahora en
   * pantalla estrecha se pintan tarjetas, donde cabe todo. Este test corre en
   * los dos tamanos, asi que cubre las dos formas de pintarlo.
   */
  test('el permiso de encuestas se puede cambiar en cualquier tamano de pantalla', async ({
    page,
  }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }

    await login(page, ADMIN)

    // Punto de partida conocido: sin permiso para nadie.
    await page.request.post(base + '/api/surveys/permissions/bulk', {
      headers,
      data: { canAnswerSurveys: false },
    })

    await page.goto('/admin/usuarios')

    const interruptor = page
      .getByLabel(/^Permitir a Carlos Perez.*participar en encuestas$/)
      .filter({ visible: true })

    await expect(interruptor).toBeVisible()
    await expect(interruptor).toHaveAttribute('data-state', 'unchecked')

    await interruptor.click()
    await expect(interruptor).toHaveAttribute('data-state', 'checked')

    // Y el cambio es real, no solo visual.
    const lista = await page.request.get(base + '/api/users?q=carlos01')
    const { items } = (await lista.json()) as {
      items: Array<{ username: string; canAnswerSurveys: boolean }>
    }
    expect(items.find((u) => u.username === 'carlos01')?.canAnswerSurveys).toBe(true)

    // El rol tambien se ve, que era la otra columna que se perdia.
    await expect(page.getByText('Trabajador').filter({ visible: true }).first()).toBeVisible()
  })
})

test.describe('enlace fijo de encuestas', () => {
  /**
   * `/responder` es a las encuestas lo que `/votar` a las votaciones: se
   * reparte una sola vez y siempre lleva a la que este abierta.
   */
  test('con una encuesta abierta, el enlace fijo lleva directo a ella', async ({ page }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }
    const titulo = 'Enlace encuesta E2E ' + Date.now()

    await login(page, ADMIN)

    // Punto de partida: sin encuestas abiertas y con permiso para todos.
    const abiertas = await page.request.get(base + '/api/surveys?status=ACTIVE')
    const { items } = (await abiertas.json()) as { items: Array<{ id: string }> }
    for (const encuesta of items) {
      await page.request.post(base + '/api/surveys/' + encuesta.id + '/close', { headers })
    }
    await page.request.post(base + '/api/surveys/permissions/bulk', {
      headers,
      data: { canAnswerSurveys: true },
    })

    // Sin nada abierto, el enlace lo explica en vez de dar un error.
    await page.goto('/responder')
    await expect(page.getByText('no hay ninguna encuesta abierta')).toBeVisible()

    // El administrador tiene el enlace a mano en la pantalla de Encuestas.
    await page.goto('/admin/encuestas')
    await expect(page.locator('#enlace-encuestas')).toHaveValue(base + '/responder')

    // Se crea una y se abre.
    const creada = await page.request.post(base + '/api/surveys', {
      headers,
      data: { title: titulo },
    })
    const { id } = (await creada.json()) as { id: string }
    await page.request.post(base + '/api/surveys/' + id + '/questions', {
      headers,
      data: { type: 'SINGLE', text: 'Te gusta?', options: [{ text: 'Si' }, { text: 'No' }] },
    })
    await page.request.post(base + '/api/surveys/' + id + '/publish', { headers })
    await page.request.post(base + '/api/surveys/' + id + '/open', { headers })

    // Ahora el mismo enlace entra directo a responderla.
    await entrarComo(page, CARLOS)
    await page.goto('/responder')
    await expect(page).toHaveURL(/\/app\/encuesta\//)
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible()

    // Limpieza.
    await entrarComo(page, ADMIN)
    await page.request.post(base + '/api/surveys/' + id + '/close', { headers })
  })
})

test.describe('configuracion de una encuesta', () => {
  /**
   * Los ajustes se pueden cambiar con la encuesta ya abierta.
   *
   * Al principio solo se podian poner al crearla: la API los aceptaba
   * despues, pero no habia pantalla desde donde hacerlo. Esto cubre el caso
   * real: decidir a mitad que los resultados no se comparten.
   */
  test('se puede apagar "mostrar resultados" con la encuesta ya abierta', async ({ page }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }

    await login(page, ADMIN)

    const creada = await page.request.post(base + '/api/surveys', {
      headers,
      data: {
        title: 'Ajustes E2E ' + Date.now(),
        anonymous: true,
        showResultsAfterClose: true,
      },
    })
    const { id } = (await creada.json()) as { id: string }
    await page.request.post(base + '/api/surveys/' + id + '/questions', {
      headers,
      data: { type: 'TEXT', text: 'Comentarios' },
    })
    await page.request.post(base + '/api/surveys/' + id + '/publish', { headers })
    await page.request.post(base + '/api/surveys/' + id + '/open', { headers })

    await page.goto('/admin/encuestas/' + id)
    await page.getByRole('tab', { name: 'Configuracion' }).click()

    const alCerrar = page.locator('#showResultsAfterClose')
    await expect(alCerrar).toHaveAttribute('data-state', 'checked')

    // El anonimato si sigue bloqueado, y se explica por que.
    await expect(page.locator('#anonymous')).toBeDisabled()
    await expect(page.getByText('solo se toca mientras la encuesta es un borrador')).toBeVisible()

    await alCerrar.click()
    await expect(page.getByText('solo para administradores')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar configuracion' }).click()

    // Se guarda de verdad y la encuesta sigue abierta.
    // Texto exacto: 'ACTIVA' a secas coincide tambien con 'Activarlo ahora
    // no anonimizaria...' del aviso del anonimato.
    await expect(page.getByText('Activa', { exact: true })).toBeVisible()
    const tras = await page.request.get(base + '/api/surveys/' + id)
    const detalle = (await tras.json()) as { showResultsAfterClose: boolean; status: string }
    expect(detalle.showResultsAfterClose).toBe(false)
    expect(detalle.status).toBe('ACTIVE')

    await page.request.delete(base + '/api/surveys/' + id, { headers })
  })
})

test.describe('resultados de una encuesta larga', () => {
  /**
   * Con 26 preguntas, una lista de 26 graficos no se lee.
   *
   * Las que comparten las mismas opciones se agrupan en una tabla ordenada,
   * para ver de un vistazo que esta mejor y que peor, y el detalle pregunta
   * a pregunta sigue disponible en su pestana.
   */
  test('las preguntas con la misma escala se agrupan y se ordenan', async ({ page }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }

    await login(page, ADMIN)
    await page.request.post(base + '/api/surveys/permissions/bulk', {
      headers,
      data: { canAnswerSurveys: true },
    })

    const creada = await page.request.post(base + '/api/surveys', {
      headers,
      data: { title: 'Clima E2E ' + Date.now() },
    })
    const { id, slug } = (await creada.json()) as { id: string; slug: string }

    const escala = [{ text: 'De acuerdo' }, { text: 'Neutral' }, { text: 'En desacuerdo' }]
    for (const texto of ['Primera afirmacion', 'Segunda afirmacion', 'Tercera afirmacion']) {
      await page.request.post(base + '/api/surveys/' + id + '/questions', {
        headers,
        data: { type: 'SINGLE', text: texto, options: escala },
      })
    }
    // Una con otras opciones: no debe entrar en el grupo.
    const ultima = await page.request.post(base + '/api/surveys/' + id + '/questions', {
      headers,
      data: { type: 'SINGLE', text: 'Turno preferido', options: [{ text: 'Manana' }, { text: 'Tarde' }] },
    })
    const detalle = (await ultima.json()) as {
      questions: Array<{ id: string; text: string; options: Array<{ id: string }> }>
    }

    await page.request.post(base + '/api/surveys/' + id + '/publish', { headers })
    await page.request.post(base + '/api/surveys/' + id + '/open', { headers })

    // Carlos responde: acuerdo en la primera, desacuerdo en la tercera.
    await entrarComo(page, CARLOS)
    await page.request.post(base + '/api/me/surveys/' + slug + '/respuestas', {
      headers,
      data: {
        answers: [
          { questionId: detalle.questions[0]!.id, optionIds: [detalle.questions[0]!.options[0]!.id] },
          { questionId: detalle.questions[1]!.id, optionIds: [detalle.questions[1]!.options[1]!.id] },
          { questionId: detalle.questions[2]!.id, optionIds: [detalle.questions[2]!.options[2]!.id] },
          { questionId: detalle.questions[3]!.id, optionIds: [detalle.questions[3]!.options[0]!.id] },
        ],
      },
    })

    await entrarComo(page, ADMIN)
    await page.goto('/admin/encuestas/' + id)
    await page.getByRole('tab', { name: 'Resultados' }).click()

    // Las tres de la misma escala van juntas; la del turno queda fuera.
    await expect(page.getByText('3 afirmaciones comparables')).toBeVisible()
    await expect(page.getByText(/Ordenadas por/)).toBeVisible()

    // Y ordenadas: la que tiene mas "De acuerdo" va primero.
    const filas = page.locator('[role="meter"]')
    const primera = await filas.first().getAttribute('aria-label')
    expect(primera).toContain('Primera afirmacion')
    expect(primera).toContain('100')

    // El detalle sigue estando, con las cuatro preguntas.
    await page.getByRole('tab', { name: 'Detalle' }).click()
    await expect(page.getByText('Turno preferido')).toBeVisible()
    await expect(page.getByText('Segunda afirmacion')).toBeVisible()

    await page.request.post(base + '/api/surveys/' + id + '/close', { headers })
  })
})

test.describe('gestion de una encuesta', () => {
  /**
   * Dos cosas que el administrador no podia hacer desde la pantalla.
   *
   * La API admitia las dos desde el principio; lo que faltaba era el sitio
   * donde hacerlas. Se prueban juntas porque las dos son lo mismo: una
   * funcion que existia y no se podia encontrar.
   */
  test('se puede eliminar una encuesta y darse permiso para responderla', async ({ page }) => {
    const base = 'http://localhost:5173'
    const headers = { Origin: base }

    await login(page, ADMIN)

    // --- Eliminar ---------------------------------------------------------
    const creada = await page.request.post(base + '/api/surveys', {
      headers,
      data: { title: 'Para borrar E2E ' + Date.now() },
    })
    const { id } = (await creada.json()) as { id: string }
    await page.request.post(base + '/api/surveys/' + id + '/questions', {
      headers,
      data: { type: 'TEXT', text: 'Comentario' },
    })

    await page.goto('/admin/encuestas/' + id)
    await page.getByRole('button', { name: 'Eliminar la encuesta' }).click()

    // Sin respuestas, lo dice y no alarma de mas.
    await expect(page.getByRole('alertdialog')).toContainText('no tiene')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()

    await expect(page).toHaveURL(/\/admin\/encuestas$/)
    const comprobar = await page.request.get(base + '/api/surveys/' + id)
    expect(comprobar.status()).toBe(404)

    // --- Permiso propio ---------------------------------------------------
    await page.request.post(base + '/api/surveys/permissions/bulk', {
      headers,
      data: { canAnswerSurveys: false },
    })

    const otra = await page.request.post(base + '/api/surveys', {
      headers,
      data: { title: 'Sin permiso E2E ' + Date.now() },
    })
    const encuesta = (await otra.json()) as { id: string; slug: string }
    await page.request.post(base + '/api/surveys/' + encuesta.id + '/questions', {
      headers,
      data: { type: 'TEXT', text: 'Comentario' },
    })
    await page.request.post(base + '/api/surveys/' + encuesta.id + '/publish', { headers })
    await page.request.post(base + '/api/surveys/' + encuesta.id + '/open', { headers })

    await page.goto('/app/encuesta/' + encuesta.slug)

    // Quien la creo no puede responderla, y se le explica por que.
    await expect(page.getByText('No puedes participar en encuestas')).toBeVisible()
    await expect(page.getByText(/aparte de administrar/)).toBeVisible()

    // Un clic y ya puede, sin salir de aqui.
    await page.getByRole('button', { name: 'Activarmelo' }).click()
    await expect(page.getByRole('button', { name: 'Enviar respuestas' })).toBeVisible()

    await page.request.delete(base + '/api/surveys/' + encuesta.id + '?descartarRespuestas=true', {
      headers,
    })
  })
})
