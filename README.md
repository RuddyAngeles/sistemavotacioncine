# Movie Night — Sistema privado de votaciones

Aplicación web **privada** para votaciones internas de empresa. Nace para las
*Movie Nights* (elegir película entre varias opciones), pero el modelo de datos
es genérico: una votación tiene opciones, y cada opción puede o no traer
metadatos de película.

No es una plataforma pública de encuestas. **No hay registro, ni login social,
ni acceso anónimo**: solo entran las cuentas que crea un administrador.

---

## Índice

1. [Qué hace](#qué-hace)
2. [Arquitectura](#arquitectura)
3. [Requisitos](#requisitos)
4. [Instalación y desarrollo local](#instalación-y-desarrollo-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Base de datos (D1)](#base-de-datos-d1)
7. [Almacenamiento de carteleras (R2)](#almacenamiento-de-carteleras-r2)
8. [Despliegue en Cloudflare](#despliegue-en-cloudflare)
9. [Crear el primer administrador](#crear-el-primer-administrador)
10. [Alta masiva de trabajadores](#alta-masiva-de-trabajadores)
11. [Uso del sistema](#uso-del-sistema)
12. [API](#api)
13. [Seguridad](#seguridad)
14. [Coste y límites del plan gratuito](#coste-y-límites-del-plan-gratuito)
15. [Pruebas](#pruebas)
16. [Estructura del proyecto](#estructura-del-proyecto)
17. [Decisiones técnicas](#decisiones-técnicas)
18. [Resolución de problemas](#resolución-de-problemas)

---

## Qué hace

**Administrador**

- Crea, edita, activa, desactiva y elimina cuentas de trabajadores.
- Restablece contraseñas (nunca puede ver la contraseña actual).
- Crea votaciones, añade películas con cartelera y las reordena.
- Controla el ciclo de vida paso a paso: guardar → publicar → abrir → cerrar → archivar.
- Programa opcionalmente hora de inicio y de finalización.
- Decide, por votación, cuatro reglas independientes:
  - si se puede cambiar el voto,
  - si se ven los resultados en vivo,
  - si se ven los resultados al cerrar,
  - si se puede responder «no asistiré».
- Consulta el **resumen de asistencia**: cuántas entradas comprar, cuántos no van y cuántos faltan por responder.
- Ve participación, resultados y (bajo petición explícita y auditada) qué votó cada persona.
- Duplica votaciones como plantilla y consulta el historial y la auditoría.

> Los administradores **también votan**: el rol decide qué puedes administrar,
> no si participas. Cualquier cuenta activa entra en el censo.

**Trabajador**

- Inicia sesión con usuario y contraseña.
- Ve las votaciones publicadas, elige película o responde que **no podrá ir**, y cambia su respuesta si está permitido.
- Ve los resultados solo si la configuración de la votación lo permite.
- Cambia su **nombre visible** y su contraseña desde *Mi perfil*, y cierra sesión.

---

## Arquitectura

Un único Worker de Cloudflare sirve **la API y el frontend**:

```
Navegador
    │
    │  cookie de sesión HttpOnly
    ▼
Cloudflare Worker  ──────────────┐
    │                            │
    ├── /api/*   → Hono + Zod    │  cabeceras de seguridad y noindex
    └── resto    → Static Assets │  aplicadas a TODAS las respuestas
                                 │
         ┌───────────────────────┴────────────┐
         ▼                                    ▼
   D1 (SQLite)                          R2 (carteleras)
   usuarios, votaciones,                bucket privado, servido
   opciones, votos,                     a través del Worker
   sesiones, auditoría
```

| Capa           | Tecnología                                                              |
| -------------- | ----------------------------------------------------------------------- |
| Interfaz       | React 19, TypeScript, Tailwind CSS 4, componentes shadcn/ui, Radix, Lucide, Framer Motion |
| Datos (cliente)| TanStack Query, React Hook Form, Zod                                     |
| API            | Hono, TypeScript, Zod                                                    |
| Base de datos  | Cloudflare D1 (SQLite) con sentencias preparadas                         |
| Ficheros       | Cloudflare R2 (bucket privado)                                           |
| Ejecución      | Cloudflare Workers + Static Assets + Cron Triggers                       |
| Pruebas        | Vitest sobre `workerd` (D1 real) y Playwright                            |

---

## Requisitos

- **Node.js 20 o superior** (probado con Node 25)
- **npm 10 o superior**
- Una cuenta de Cloudflare (el plan gratuito basta) solo para desplegar

Para desarrollo local no hace falta cuenta: `wrangler dev` levanta D1 y R2
simulados en tu máquina.

---

## Instalación y desarrollo local

```bash
# 1. Dependencias
npm install

# 2. Variables locales
cp .dev.vars.example .dev.vars

# 3. Crear el esquema en la base D1 local
npm run db:migrate:local

# 4. Datos de prueba (administrador + 4 trabajadores + una votación)
npm run seed

# 5. Arrancar
npm run dev
```

`npm run dev` levanta dos procesos:

| Proceso       | Puerto | Qué es                                            |
| ------------- | ------ | ------------------------------------------------- |
| Vite          | 5173   | Frontend con recarga en caliente **(abre este)**  |
| `wrangler dev`| 8787   | Worker con la API, D1 y R2 locales                |

Vite hace proxy de `/api` al Worker, así que el navegador ve un único origen y
las cookies de sesión funcionan igual que en producción.

**Abre <http://localhost:5173>** e inicia sesión con:

| Usuario    | Contraseña  | Rol           |
| ---------- | ----------- | ------------- |
| `admin`    | `Admin2026` | Administrador |
| `carlos01` | `Movie2026` | Trabajador    |
| `maria01`  | `Movie2026` | Trabajador    |
| `pedro01`  | `Movie2026` | Trabajador    |
| `ana01`    | `Movie2026` | Trabajador    |

> Estas credenciales son **solo para desarrollo** y están escritas en
> `scripts/seed.mjs`. Nunca ejecutes el seed contra producción.

### Comandos disponibles

| Comando                     | Qué hace                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `npm run dev`               | Frontend + API en local                                      |
| `npm run build`             | Compila el frontend a `dist/client`                          |
| `npm run preview`           | Compila y sirve todo desde el Worker, como en producción     |
| `npm run deploy`            | Compila y despliega a Cloudflare                             |
| `npm run typecheck`         | TypeScript estricto sobre cliente, Worker y scripts          |
| `npm run lint`              | ESLint                                                       |
| `npm test`                  | Pruebas unitarias y de integración (Vitest sobre `workerd`)  |
| `npm run test:e2e`          | Pruebas de interfaz (Playwright)                             |
| `npm run verify`            | typecheck + lint + test + build, en ese orden                |
| `npm run db:migrate:local`  | Aplica migraciones a la base local                           |
| `npm run db:migrate:remote` | Aplica migraciones a la base de Cloudflare                   |
| `npm run db:reset`          | Borra la base local y vuelve a migrar                        |
| `npm run seed`              | Datos de desarrollo                                          |
| `npm run create-admin`      | Crea una cuenta de administrador                             |
| `npm run create-users`      | Alta masiva de trabajadores a partir de una lista de nombres |
| `npm run hash-password`     | Genera un hash de contraseña para operaciones manuales       |

---

## Variables de entorno

En Cloudflare Workers las variables **no** se leen de un `.env`: se declaran en
`wrangler.jsonc` (valores no sensibles) o se cargan como secretos con
`wrangler secret put`. En local se leen de `.dev.vars`.

| Variable                 | Por defecto             | Para qué sirve                                                     |
| ------------------------ | ----------------------- | ------------------------------------------------------------------ |
| `ENVIRONMENT`            | `development`           | `production` activa HSTS y fuerza cookies `Secure`                 |
| `APP_ORIGIN`             | `http://localhost:5173` | Origen permitido en la comprobación anti-CSRF                       |
| `SESSION_TTL_HOURS`      | `12`                    | Duración de la sesión                                               |
| `AUTH_PBKDF2_ITERATIONS` | `100000`                | Coste del hash de contraseñas. **100000 es el máximo que admite el runtime** (ver [abajo](#el-tope-de-auth_pbkdf2_iterations)) |
| `MAX_UPLOAD_BYTES`       | `5242880`               | Tamaño máximo de cartelera (5 MiB)                                  |

`.env.example` y `.dev.vars.example` documentan todos los valores. Ninguno de
ellos es un secreto criptográfico: las sesiones usan tokens aleatorios y las
contraseñas llevan su propia sal, así que **no hay ninguna clave maestra que
custodiar**.

---

## Base de datos (D1)

### Modelo

```
users ──┬── sessions          (1:N, se borran en cascada)
        ├── votes             (1:N)
        └── audit_logs        (1:N)

polls ──┬── poll_options      (1:N, en cascada)
        └── votes             (1:N, en cascada)

poll_options ── votes         (1:N)
```

La restricción crítica vive en el esquema, no en el código:

```sql
UNIQUE (poll_id, user_id)
```

Un usuario, una votación, **un solo voto**. Cambiar el voto actualiza esa fila;
nunca crea otra.

### Crear la base en Cloudflare

```bash
npx wrangler d1 create movie-night-db
```

Copia el `database_id` que imprime y pégalo en `wrangler.jsonc`, en los dos
sitios donde pone `REEMPLAZAR_CON_TU_DATABASE_ID` (bloque raíz y
`env.production`). Después:

```bash
npm run db:migrate:remote
```

### Nuevas migraciones

```bash
npx wrangler d1 migrations create DB descripcion_del_cambio
# edita el .sql generado en migrations/
npm run db:migrate:local    # probar
npm run db:migrate:remote   # aplicar
```

Las migraciones son SQL plano y numerado. Nunca edites una que ya se haya
aplicado en producción: crea una nueva.

---

## Almacenamiento de carteleras (R2)

```bash
npx wrangler r2 bucket create movie-night-media
```

El bucket es **privado**: no se expone ninguna URL pública. Las imágenes se
sirven por `GET /api/media/posters/<id>.<ext>`, que exige sesión igual que el
resto de la aplicación. En D1 solo se guarda la clave del objeto.

Al subir una imagen, el Worker comprueba tamaño, tipo declarado y **los bytes
de cabecera del fichero**; el nombre original se descarta y se genera uno
propio. Un ejecutable renombrado a `.jpg` se rechaza con `415`.

---

## Despliegue en Cloudflare

```bash
# 1. Autenticarse
npx wrangler login

# 2. Crear los recursos (una sola vez)
npx wrangler d1 create movie-night-db
npx wrangler r2 bucket create movie-night-media

# 3. Editar wrangler.jsonc
#    - database_id  (en los dos bloques)
#    - APP_ORIGIN   (en env.production, con tu dominio real)

# 4. Esquema
npm run db:migrate:remote

# 5. Desplegar
npm run deploy

# 6. Primer administrador
npm run create-admin -- --username admin --name "Tu Nombre" --remote
```

`npm run deploy` compila el frontend y sube el Worker con los assets en una
sola operación. El cron trigger (`*/5 * * * *`) queda registrado solo: abre y
cierra las votaciones programadas y purga sesiones caducadas.

### Después del despliegue

1. Ajusta `APP_ORIGIN` en `wrangler.jsonc` al dominio definitivo y vuelve a
   desplegar. Si no coincide, las peticiones de escritura se rechazan por la
   comprobación de origen.
2. Inicia sesión con la cuenta creada y **cambia la contraseña**.
3. Crea las cuentas de los trabajadores desde *Usuarios*.

---

## Crear el primer administrador

Es la única alta que ocurre fuera de la aplicación.

```bash
# Contraseña generada automáticamente (recomendado)
npm run create-admin -- --username admin --name "Ana Ruiz" --remote

# O una elegida por ti
npm run create-admin -- --username admin --password "MiClave2026" --remote
```

Sin `--remote` la cuenta se crea en la base local de desarrollo.

La contraseña generada se muestra **una sola vez**: no se guarda en ningún
sitio, solo su hash. Si se pierde, usa `npm run create-admin` con otro usuario
o `npm run hash-password` para fijar una nueva a mano.

---

## Alta masiva de trabajadores

Dar de alta a la plantilla una por una en la interfaz es lento. Para eso está
`npm run create-users`: a partir de una lista de nombres genera un usuario
derivado del nombre y una contraseña aleatoria para cada persona, y los crea
todos de una vez.

```bash
# Simulacro: enseña qué usuarios y contraseñas saldrían, sin escribir nada
npm run create-users -- --nombres "Ana Ruiz, Carlos Perez" --seco

# De verdad, contra la base de Cloudflare
npm run create-users -- --remote --archivo nombres.txt
```

`nombres.txt` lleva un nombre por línea (las líneas que empiezan por `#` se
ignoran).

**Cómo se elige el usuario**, en este orden:

| Preferencia | Ejemplo para «Carlos Pérez» |
| --- | --- |
| 1. nombre + número | `carlos01` |
| 2. + inicial del apellido, si el anterior está cogido | `carlosp01` |
| 3. numerando esa variante | `carlosp02` … |
| 4. numerando el nombre suelto | `carlos02` … |

Los acentos y la ñ se normalizan (`Iñaki Muñoz` → `inaki01`) y nunca se repite
un usuario ya existente: el script consulta antes los que hay.

**Opciones útiles**

| Opción | Para qué |
| --- | --- |
| `--seco` | Simulacro, no escribe nada. Conviene ejecutarlo siempre primero |
| `--sin-cambio-obligatorio` | No exigir cambio de contraseña en el primer acceso |
| `--csv credenciales.csv` | Guardar las credenciales en un CSV para repartirlas |
| `--rol ADMIN` | Crear administradores en lugar de trabajadores |
| `--remote` | Actuar sobre Cloudflare en vez de la base local |

Por defecto cada persona **debe cambiar la contraseña** la primera vez que
entra: así la aleatoria que repartes deja de valer y ni siquiera el
administrador conoce la definitiva. Si prefieres evitar ese paso, usa
`--sin-cambio-obligatorio`.

Las contraseñas se muestran **una sola vez**. En la base solo queda su hash,
así que no hay forma de recuperarlas: si se pierde una, se restablece desde
*Usuarios*. El CSV contiene contraseñas en claro; bórralo en cuanto las hayas
repartido.

## Uso del sistema

### Preparar una Movie Night

```
Lunes      Crear votación  →  título, descripción y reglas
           Agregar películas (cartelera, género, año, duración, hora)
           Guardar borrador          ← los trabajadores no la ven

Martes     Publicar                  ← ya la ven, pero no pueden votar
           Compartir el enlace privado

Viernes    Abrir votación            ← empieza la votación
10:00      Los trabajadores votan

Viernes    Cerrar votación           ← no se admiten más votos
16:00      Archivar (opcional)       ← pasa al historial
```

Cada paso es un botón con confirmación. Nada ocurre solo salvo que indiques
fechas de inicio y finalización, en cuyo caso el sistema abre y cierra a su
hora (y también al primer acceso posterior, sin esperar al cron).

### El enlace fijo (`/votar`)

A los trabajadores se les reparte **una sola dirección, siempre la misma**:

```
https://<tu-dominio>/votar
```

Ese enlace lleva automáticamente a la votación que esté abierta en ese
momento, sin tener que avisar de nuevo cada mes:

| Situación | Qué ve el trabajador |
| --- | --- |
| Una votación abierta | Entra directamente a votar |
| Ninguna abierta | «No hay ninguna votación abierta», con la indicación de volver al mismo enlace |
| Varias abiertas | Lista para elegir en cuál participar |
| Sin iniciar sesión | Login y, al entrar, vuelve solo a la votación |

Lo tienes copiable en el **Panel** (tarjeta *Enlace para los trabajadores*) y
en el diálogo **Compartir** de cada votación, junto al enlace directo a esa
votación concreta por si quieres mandar un recordatorio puntual.

Una votación programada que llegue a su hora aparece en el enlace **al
instante**: el estado se recalcula al consultarlo, sin esperar al cron.

### Las carteleras

Cada película lleva su propia imagen, y se suben una por película desde la
pestaña **Cartelera** de la votación:

1. **Agregar película** abre el formulario. A la derecha hay un recuadro
   *Cartelera*: arrastra la imagen o haz clic para elegirla (JPG, PNG o WEBP,
   máximo 5 MB).
2. Para encadenar varias, pulsa **Guardar y agregar otra**: guarda esa
   película y deja el formulario limpio para la siguiente, sin cerrar el
   diálogo. En la última usa **Agregar y cerrar**.
3. En la lista verás la miniatura de cada una. Las que todavía no tengan
   imagen aparecen marcadas con **Sin cartelera**.

Al votar, las películas se muestran como tarjetas con su imagen: **en fila**
en escritorio (tres por fila) y apiladas en móvil, cada una con su hora de
proyección y su botón de elegir.

Las imágenes se guardan en R2, no en la base de datos, y se sirven a través
del Worker: hace falta sesión para verlas, igual que para todo lo demás.

### Las tres reglas configurables

| Regla                              | ON                                                  | OFF                                                        |
| ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| **Permitir cambiar el voto**       | Se puede cambiar mientras esté abierta               | El voto queda fijado al emitirlo                            |
| **Mostrar resultados en vivo**     | Los trabajadores ven el reparto por película durante la votación | El servidor **no les envía** ningún dato de votos |
| **Mostrar resultados al cerrar**   | Ven el reparto por película al cerrarse              | El resultado queda solo para el administrador               |
| **Permitir «no asistiré»**         | Quien no pueda ir lo indica en vez de elegir película | Solo se puede elegir película                              |

Son independientes. La combinación más habitual es: cambiar voto **ON**,
resultados en vivo **OFF**, resultados al cerrar **ON**, «no asistiré» **ON**.

El administrador siempre ve los resultados, en cualquier estado.

#### Qué ve un trabajador y qué no

«Ver resultados» y «ver el detalle de organización» son dos permisos
distintos. Ninguna de las reglas de arriba abre el segundo:

| Dato                                          | Trabajador con resultados ON | Administrador |
| --------------------------------------------- | ---------------------------- | ------------- |
| Votos y porcentaje de cada película            | Sí                           | Sí            |
| Entradas a comprar, censo, cuántos no van      | No                           | Sí            |
| Cuántos faltan por responder, % de participación | No                        | Sí            |
| Qué ha votado cada persona, con su nombre      | No                           | Sí            |

No es que se oculte en pantalla: el servidor no calcula ni envía el bloque
`overview` a quien no es administrador (`canViewAttendanceDetail`), y el
total global de votos tampoco viaja, porque restándole los votos por película
saldría cuánta gente ha dicho que no irá.

### Asistencia y entradas

«No asistiré» **no es una película más**. Se guarda como un atributo del voto
(`attending = 0`, sin película asociada), con un `CHECK` en la base que impide
estados imposibles. Eso tiene tres consecuencias prácticas:

- No aparece como una tarjeta con cartelera compitiendo con las películas.
- El porcentaje de cada película se reparte **solo entre quienes sí van**. Si no,
  una película podría «ganar» con el 30% mientras media plantilla no asiste.
- El recuento de entradas es directo.

En la pestaña **Resultados** el administrador ve, arriba del todo:

```
Entradas a comprar        24
─────────────────────────────────────────
Asisten  24   No asisten  6   Sin responder  8   Censo  38
```

Debajo, el desglose por película y la lista persona a persona: quién asiste,
quién no y quién no ha respondido. Con **Ver elecciones** se añade además qué
película eligió cada uno (queda registrado en la auditoría, ver
[privacidad](#privacidad-del-voto)).

### Privacidad del voto

Se separan dos cosas distintas:

- **Participación** (quién ha votado): información de gestión, visible para el
  administrador en cualquier momento.
- **Elección individual** (qué votó cada quien): oculta por defecto. El
  administrador debe pulsar *Ver elecciones* explícitamente, y esa consulta
  queda registrada en la auditoría con su nombre y la fecha.

Los trabajadores solo ven su propia elección, nunca la de otros.

---

## API

Todas las rutas cuelgan de `/api` y **todas exigen sesión salvo el login**.

### Autenticación

| Método | Ruta                        | Acceso     |
| ------ | --------------------------- | ---------- |
| POST   | `/api/auth/login`           | público    |
| POST   | `/api/auth/logout`          | sesión     |
| GET    | `/api/auth/me`              | sesión     |
| PATCH  | `/api/auth/me`              | sesión     |
| POST   | `/api/auth/change-password` | sesión     |

### Usuarios (solo ADMIN)

| Método | Ruta                             |
| ------ | -------------------------------- |
| GET    | `/api/users`                     |
| POST   | `/api/users`                     |
| GET    | `/api/users/:id`                 |
| PATCH  | `/api/users/:id`                 |
| DELETE | `/api/users/:id`                 |
| POST   | `/api/users/:id/reset-password`  |

### Votaciones (solo ADMIN)

| Método | Ruta                                       |
| ------ | ------------------------------------------ |
| GET    | `/api/polls`                               |
| POST   | `/api/polls`                               |
| GET    | `/api/polls/:id`                           |
| PATCH  | `/api/polls/:id`                           |
| DELETE | `/api/polls/:id`                           |
| POST   | `/api/polls/:id/publish`                   |
| POST   | `/api/polls/:id/open`                      |
| POST   | `/api/polls/:id/close`                     |
| POST   | `/api/polls/:id/archive`                   |
| POST   | `/api/polls/:id/reopen`                    |
| POST   | `/api/polls/:id/back-to-draft`             |
| POST   | `/api/polls/:id/duplicate`                 |
| POST   | `/api/polls/:id/options`                   |
| PATCH  | `/api/polls/:id/options/reorder`           |
| PATCH  | `/api/polls/:id/options/:optionId`         |
| DELETE | `/api/polls/:id/options/:optionId`         |
| GET    | `/api/polls/:id/participation`             |
| GET    | `/api/dashboard/stats`                     |
| GET    | `/api/audit-logs`                          |
| POST   | `/api/uploads/poster`                      |

### Votación (cualquier usuario con sesión)

| Método | Ruta                          | Notas                                              |
| ------ | ----------------------------- | -------------------------------------------------- |
| GET    | `/api/me/polls`               | Votaciones visibles para el usuario                |
| GET    | `/api/me/polls/:slug`         | Vista completa con permisos ya resueltos           |
| POST   | `/api/polls/:id/vote`         | Primer voto                                        |
| PATCH  | `/api/polls/:id/vote`         | Cambio de voto                                     |
| GET    | `/api/polls/:id/my-vote`      | Voto propio                                        |
| GET    | `/api/polls/:id/results`      | **403** si la configuración no permite verlos      |
| GET    | `/api/media/*`                | Carteleras (bucket privado)                        |

### Errores

Formato uniforme, con códigos estables para que la interfaz decida el mensaje:

```json
{
  "error": {
    "code": "VOTE_CHANGE_NOT_ALLOWED",
    "message": "Ya has votado y esta votacion no permite cambiar el voto",
    "details": { "password": ["La contrasena debe incluir al menos un numero"] }
  }
}
```

| Estado | Cuándo                                                      |
| ------ | ----------------------------------------------------------- |
| 401    | Sin sesión o sesión caducada                                 |
| 403    | Sin permiso (rol, resultados ocultos, origen no permitido)   |
| 404    | No existe, o no debe saberse que existe                      |
| 409    | Conflicto: ya has votado, transición no válida, usuario duplicado |
| 413/415| Fichero demasiado grande o formato no admitido               |
| 422    | Validación fallida (incluye el detalle por campo)            |
| 429    | Demasiados intentos de acceso                                |
| 500    | Error interno (nunca expone traza ni SQL)                    |

---

## Seguridad

### Autenticación y sesiones

- Contraseñas con **PBKDF2-HMAC-SHA256**, sal única de 128 bits y 100 000
  iteraciones, que es el máximo que permite WebCrypto en Workers. El número de
  iteraciones va dentro del hash, así que puede cambiarse sin invalidar las
  contraseñas existentes: se rehashean solas en el siguiente inicio de sesión.
- Comparación en **tiempo constante**; y cuando el usuario no existe se verifica
  igualmente contra un hash ficticio, para que no se pueda enumerar usuarios
  midiendo el tiempo de respuesta.
- Sesión en **cookie `HttpOnly`, `Secure`, `SameSite=Lax`**, con caducidad. En
  la base se guarda solo el **SHA-256 del token**: si la base se filtra, los
  valores almacenados no sirven para suplantar a nadie.
- **Nada de `localStorage`** para autenticación. No hay token que robar con XSS.
- Desactivar un usuario, renombrarlo, restablecer su contraseña o que la cambie
  él mismo **revoca sus sesiones al instante**.

### Autorización

Cada endpoint vuelve a comprobar sesión y rol contra la base de datos. Las
guardas del router de React son comodidad de navegación: manipularlas no
concede nada.

Las decisiones de negocio (quién puede votar, cuántas veces, si puede cambiar
el voto, si puede ver resultados, si la votación está abierta) viven en
`src/shared/policy.ts` y **las aplica el servidor**. Cuando un trabajador no
puede ver resultados, el backend responde `403` y no llega a calcularlos: no se
envían para ocultarlos después.

### Otras medidas

| Riesgo                | Medida                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| Inyección SQL         | Solo sentencias preparadas con parámetros; ninguna consulta concatena datos |
| CSRF                  | `SameSite=Lax` + verificación del header `Origin` en toda escritura         |
| XSS                   | React escapa por defecto; CSP estricta sin `unsafe-inline` en scripts       |
| Fuerza bruta          | Ventana deslizante en D1: 8 intentos por usuario y 30 por IP cada 15 min    |
| IDOR                  | Toda opción y voto se resuelve siempre dentro de su votación                |
| Doble voto            | `UNIQUE (poll_id, user_id)` en la base, no en la aplicación                 |
| Subidas maliciosas    | Tipo detectado por bytes, tamaño limitado, nombre generado por el servidor  |
| Clickjacking          | `X-Frame-Options: DENY` y `frame-ancestors 'none'`                          |
| Fuga por buscadores   | `robots.txt`, `<meta robots>` y cabecera `X-Robots-Tag` en **todas** las respuestas |
| Trazabilidad          | `audit_logs` con actor, acción, entidad, IP y metadatos                     |

### Sobre el "no indexar"

`robots.txt` y `noindex` evitan la indexación, **no son seguridad**. Quien
conozca la URL sigue sin poder entrar: toda ruta privada exige sesión en el
servidor. Si alguien abre un enlace sin haber iniciado sesión, va al login y
después vuelve automáticamente a la votación que buscaba.

No se genera sitemap.

---

## Coste y límites del plan gratuito

El sistema está pensado para caber en el plan gratuito de Cloudflare y no
depende de ningún servicio externo de pago.

| Servicio            | Límite gratuito                | Uso de esta aplicación                                    |
| ------------------- | ------------------------------ | ---------------------------------------------------------- |
| Workers             | 100 000 peticiones/día         | Una empresa de 50 personas no se acerca                    |
| D1                  | 5 GB, 5 M lecturas/día         | Miles de votaciones caben de sobra                          |
| R2                  | 10 GB y sin coste de salida    | Unas pocas carteleras por votación                          |
| Cron Triggers       | Incluidos                      | Una ejecución cada 5 minutos                                |

Decisiones tomadas para no gastar de más:

- **Sin Durable Objects ni WebSockets.** Los resultados en vivo se refrescan con
  sondeo moderado (15 s) y **solo** cuando hay resultados visibles en una
  votación abierta; en cualquier otro caso no se refresca nada.
- La sesión escribe `last_seen_at` como mucho una vez cada 5 minutos, no en cada
  petición.
- La auditoría se purga automáticamente al año, y los intentos de login a los
  7 días.

### El tope de `AUTH_PBKDF2_ITERATIONS`

**WebCrypto en Cloudflare Workers no admite más de 100 000 iteraciones de
PBKDF2.** Con un valor mayor, `crypto.subtle.deriveBits` lanza:

```
Pbkdf2 failed: iteration counts above 100000 are not supported (requested 120000)
```

y el login responde 500. Es un límite del runtime, no del plan contratado.

Dos detalles que conviene conocer:

- **El workerd local (`wrangler dev` y los tests) no aplica ese tope**, solo el
  de producción. Por eso el código recorta el valor en `src/server/env.ts` en
  lugar de confiar en que el runtime lo valide: de otro modo todo funcionaría
  en local y fallaría justo al desplegar.
- Los scripts de Node (`seed`, `create-admin`) aplican el mismo recorte. Un
  hash generado en Node con más de 100 000 iteraciones se crearía sin error,
  pero el Worker **nunca podría verificarlo** y la cuenta quedaría inservible.

Bajar el valor sí es válido (por ejemplo a `50000` si el login va lento): las
contraseñas ya existentes siguen funcionando, porque cada hash recuerda con
cuántas iteraciones se creó.

Solo afecta al login y al alta de usuarios, no al resto de la aplicación.

---

## Pruebas

```bash
npm test          # unitarias + integración
npm run test:e2e  # interfaz con Playwright
```

Las pruebas de integración corren dentro de **`workerd`**, el mismo runtime que
Cloudflare, con una base **D1 real** en memoria. No hay simulaciones: las
restricciones `UNIQUE`, los `CHECK` y las claves foráneas se comprueban de
verdad.

Cubren, entre otras cosas, los tres escenarios críticos:

1. **Voto único** — con el cambio de voto desactivado, el segundo intento falla
   y la base guarda exactamente una fila.
2. **Cambio de voto** — con el cambio activado, se actualiza la fila existente
   (`change_count` sube) y no se crea un voto nuevo.
3. **Resultados ocultos** — durante la votación el backend responde `403` y la
   respuesta no contiene ningún recuento; al cerrarse, el mismo usuario ya los
   obtiene.

Y además: login correcto e incorrecto indistinguibles, bloqueo por fuerza
bruta, caducidad y revocación de sesiones, rechazo de `Origin` ajeno,
autorización de cada ruta administrativa, ciclo de vida completo de la
votación, duplicado sin arrastrar votos, reordenamiento, y registro en
auditoría.

Para las pruebas E2E, la primera vez hay que instalar el navegador:

```bash
npx playwright install chromium
npm run db:migrate:local && npm run seed   # datos de partida
npm run test:e2e
```

Playwright arranca `npm run dev` por su cuenta y ejecuta el recorrido en
escritorio y en movil.

---

## Estructura del proyecto

```
.
├── migrations/               Esquema SQL versionado de D1
├── scripts/                  Utilidades de operación (seed, alta de admin, hash)
├── public/                   robots.txt
├── src/
│   ├── shared/               Contrato común cliente/servidor
│   │   ├── constants.ts        enums, códigos de error, acciones de auditoría
│   │   ├── types.ts            DTOs de la API
│   │   ├── schemas.ts          validación con Zod
│   │   └── policy.ts           REGLAS DE NEGOCIO puras (quién puede qué)
│   │
│   ├── server/               Worker
│   │   ├── index.ts            entrada: fetch + cron + cabeceras de seguridad
│   │   ├── app.ts              aplicación Hono y manejo de errores
│   │   ├── db/                 acceso a D1 (una consulta por función)
│   │   ├── services/           casos de uso (auth, ciclo de vida, resultados)
│   │   ├── middleware/         sesión, autorización, CSRF
│   │   ├── routes/             endpoints HTTP
│   │   └── lib/                cripto, cookies, errores, validación, rate limit
│   │
│   └── client/               Interfaz
│       ├── pages/              una por pantalla (admin/ aparte)
│       ├── components/         ui/ (primitivas), polls/, users/, layout/, common/
│       ├── hooks/              sesión y tema
│       └── lib/                cliente HTTP, claves de caché, formateo
│
└── tests/
    ├── unit/                 reglas puras y criptografía
    ├── integration/          API real contra D1 real
    └── e2e/                  interfaz con Playwright
```

Separación en cuatro capas: **interfaz** (`client`), **contrato**
(`shared`), **lógica y datos** (`server`) e **infraestructura**
(`wrangler.jsonc`, `migrations`).

La carpeta `src/shared` es lo que mantiene coherentes los dos lados: mismos
tipos, mismas validaciones y mismas reglas, sin duplicarlas.

---

## Decisiones técnicas

**Un solo Worker en vez de monorepo con dos despliegues.** La API y el frontend
comparten origen, lo que hace que las cookies `SameSite` funcionen sin
concesiones y evita CORS por completo. La separación de capas se mantiene por
carpetas, que es lo que importa para mantener el proyecto.

**Sin ORM.** D1 es SQLite y `prepare().bind()` ya da sentencias preparadas
(inmunes a inyección SQL) con cero bytes extra en el bundle. Prisma requiere un
driver adapter y engordan el arranque del Worker; para seis tablas, un
repositorio por entidad con la forma de la fila tipada es más simple y más
rápido. Si el esquema creciera mucho, Drizzle sería el siguiente paso natural.

**Estado resuelto en el servidor.** La vista del trabajador
(`GET /api/me/polls/:slug`) devuelve los permisos ya calculados. El cliente los
representa, no los decide. Así es imposible que la interfaz y el backend
discrepen sobre quién puede votar.

**Estado programado calculado al leer, no solo por cron.** Una votación
programada para las 10:00 está abierta a las 10:00:01 para quien entre, porque
el estado efectivo se recalcula (y se persiste) en cada lectura. El cron cada 5
minutos es la red de seguridad para que las fechas se apliquen aunque nadie
entre.

**Sondeo en lugar de tiempo real.** WebSockets en Cloudflare requieren Durable
Objects. Para una votación de oficina, refrescar cada 15 segundos —y solo
cuando hay algo que refrescar— es indistinguible en la práctica y sale gratis.

**Carteleras servidas por el Worker.** Es un salto más que una URL pública de
R2, pero mantiene el bucket privado y hace que las imágenes respeten la misma
regla que todo lo demás: sin sesión, no hay acceso. Las claves son únicas por
imagen, así que se cachean para siempre en el navegador.

---

## Resolución de problemas

**El login falla con `Origen de la peticion no permitido` (403).**
`APP_ORIGIN` no coincide con el dominio desde el que estás entrando. Ajústalo en
`wrangler.jsonc` y vuelve a desplegar.

**El login devuelve 500 en producción y en local funciona.**
Casi seguro `AUTH_PBKDF2_ITERATIONS` por encima de 100 000, el máximo del
runtime (ver [el tope](#el-tope-de-auth_pbkdf2_iterations)). Compruébalo con
`npx wrangler tail movie-night-votes`, que muestra el error real.

**`npm run dev` da 500 en `/api/*`.**
Falta el esquema en la base local: `npm run db:migrate:local`.

**La aplicación carga pero dice "Frontend no compilado".**
Estás accediendo al Worker (8787) sin haber compilado. Usa
<http://localhost:5173> en desarrollo, o `npm run build` antes.

**Se perdió el acceso de administrador.**
Crea otra cuenta con `npm run create-admin -- --username rescate --remote`, o
genera un hash con `npm run hash-password` y aplícalo con
`npx wrangler d1 execute DB --remote --command "UPDATE users SET ..."`.

**Quiero empezar de cero en local.**
`npm run db:reset && npm run seed`.
