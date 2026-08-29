# Epic 01: Infraestructura de push

> Al terminar este epic, cualquier usuario puede activar notificaciones push del navegador desde su
> perfil, y el servidor puede enviarle una a través de `sendPushNotification`, sin depender de ninguna
> librería de UI externa.

| | |
|---|---|
| **Epic id** | `01-push-infraestructura` |
| **Tasks** | `E1-T1` … `E1-T5` |
| **Depends on** | nada — empieza aquí, sobre Fase 1/2/3 ya cerradas (48 checkpoints previos, `step-01`..`step-48`) |
| **Unlocks** | `02-hooks-dashboard` |
| **Parallel with** | nada dentro de este bundle — las 5 tasks son una cadena lineal (`E1-T1` → `E1-T2` → `E1-T3` → `E1-T4` → `E1-T5`) |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16 (App Router, `output: "standalone"`) · TypeScript · Tailwind CSS 4 · shadcn/Radix ·
Postgres 17 · Drizzle ORM · better-auth · self-hosted VPS. Package manager: `pnpm`. Runtime pinned in
`.nvmrc` (heredado de Fase 1). Dependency versions are in `pnpm-lock.yaml` — read it, never guess one.

Nuevo en este epic: `web-push@3.6.7` (server-side Web Push/VAPID, `@types/web-push` como dev
dependency — confirmar el número exacto con `npm view @types/web-push version` antes de fijarlo,
ver `blueprint.md` §11), Service Worker escrito a mano en `public/sw.js` (sin librería).

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (one file) | `pnpm test {path}` |
| E2E | `pnpm test:e2e {path}` |
| Generar migración | `pnpm db:generate` (el nombre del archivo lo decide la herramienta, nunca a mano) |
| Migrar DB | `pnpm db:migrate` |
| Servicios locales | `pnpm services:up` / `pnpm services:down` — Postgres y Redis, ya provisionados desde Fase 1 (`workspace/docker-compose.yml` de Fase 1) |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Si alguna task de abajo verifica contra un servicio real (Postgres), levántalo primero con
`pnpm services:up` — el `docker-compose.yml` que lo define ya está en la raíz del proyecto desde
Fase 1, tú no lo escribes.

**Nota de división:** la task original que agrupaba dependencia + tabla + rutas de suscripción tocaba
8 archivos, por encima del límite de ~5 por task — se dividió en `E1-T1` (schema + migración) y
`E1-T2` (rutas). Los checkpoints permanecen continuos (`step-49`..`step-53` para este epic).

## Directory subtree

Solo las partes que este epic toca:

```
public/
  sw.js                                   # NUEVO E1-T4 — Service Worker
src/
  app/
    manifest.ts                           # NUEVO E1-T4 — PWA manifest (App Router nativo)
    (app)/
      layout.tsx                          # EDITAS E1-T4 — monta <SwRegister />
      settings/profile/page.tsx           # EDITAS E1-T5 — ya existe desde Fase 1, agregas la sección de opt-in
    api/v1/push/
      subscribe/route.ts                  # NUEVO E1-T2
      unsubscribe/route.ts                # NUEVO E1-T2
  components/push/
    push-opt-in.tsx                       # NUEVO E1-T5
    sw-register.tsx                       # NUEVO E1-T4
  lib/
    db/schema.ts                          # EDITAS E1-T1 — ruta confirmada por `find`, ver blueprint.md §0
    push/send.ts                          # NUEVO E1-T3 — único punto que importa el SDK web-push
  server/push/
    subscriptions.ts                      # NUEVO E1-T2
next.config.ts                            # EDITAS E1-T4 — headers no-cache para /sw.js
.env.example                              # EDITAS E1-T1 — 3 claves VAPID en blanco
tests/setup/env.ts                        # EDITAS E1-T1 — heredado de Fase 1, agrega fallback `??=` para las VAPID_*
drizzle/                                  # migración nueva generada por `pnpm db:generate` (E1-T1)
tests/push/
  subscribe.test.ts                       # NUEVO E1-T2
  send.test.ts                            # NUEVO E1-T3
tests/e2e/
  notifications-opt-in.spec.ts            # NUEVO en E2-T9 (epic 02) — el código que ejercita ya existe desde E1-T4/E1-T5
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `push_subscription` | tabla completa nueva — `id`, `org_id`, `user_id`, `endpoint`, `p256dh`, `auth_key`, `created_at`, `last_used_at` | `E1-T1`. Índice único en `endpoint`, índice en `user_id`. Ver `blueprint.md` §4 para el DDL Drizzle completo |
| `organization` / `user` | solo lectura, para resolver `org_id`/`user_id` de la sesión | `E1-T2`, `E1-T3` |

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| Fase 1 `requirePermission()` | resuelve `org_id`/`user_id` de la sesión, `401` si no hay sesión | `E1-T2` lo usa antes de cualquier escritura en `push_subscription` |
| Fase 1 `src/lib/env.ts` | schema zod validado en boot | `E1-T3` agrega 3 campos VAPID, no reescribe el mecanismo |
| Fase 1 `tests/setup/env.ts` | fallback `??=` de variables de test para que el boot de `src/lib/env.ts` no falle en la suite unitaria | `E1-T1` agrega el fallback de las 3 VAPID_*, mismo patrón que las 5 variables ya pobladas ahí |
| Fase 1 `src/app/(app)/settings/profile/page.tsx` | formulario de perfil + eliminación de cuenta ya construido (confirmar con `grep -l "eliminar cuenta\|account/route" src/app/(app)/settings/profile/page.tsx`) | `E1-T5` agrega una sección nueva sin tocar la existente |
| Fase 1 `src/app/(app)/layout.tsx` | shell autenticado (sidebar + topbar) | `E1-T4` monta `<SwRegister />` sin tocar el resto |
| Fase 1 `next.config.ts` `headers()` | bloque de headers ya existente | `E1-T4` agrega una entrada para `/sw.js`, no reemplaza el bloque |

**Produced** — el epic `02-hooks-dashboard` depende de exactamente esta firma:

| Export | Signature | Used by |
|---|---|---|
| `src/lib/push/send.ts` → `sendPushNotification` | `(userId: string, payload: { title: string; body: string; url?: string }) => Promise<void>` — nunca lanza | `02-hooks-dashboard`, los 5 ganchos |

## Conventions that bite in this area

- **Un solo punto de envío.** Ningún módulo fuera de `src/lib/push/send.ts` importa el SDK `web-push`
  directo — ni siquiera en un test, donde se mockea `send.ts`, no `web-push`.
- **`sendPushNotification` nunca lanza.** Cualquier fallo (incluida la limpieza de suscripciones
  expiradas con 404/410) se maneja dentro de la función — el llamador nunca necesita un try/catch.
- **`org_id`/`user_id` de `push_subscription` siempre vienen de la sesión, nunca del body de la
  request** — mismo principio ya establecido en Fase 1 para toda tabla tenant-owned.
- **Confirmar la ruta real del schema antes de editarlo** — `find . -name schema.ts -path "*/db/*"
  -not -path "*/blueprints/*"` debe devolver exactamente un archivo (`blueprint.md` §0, Decisión #1).
- **El fallback de `tests/setup/env.ts` se agrega en `E1-T1`, no en `E1-T3`** — para cuando `E1-T3`
  marque `VAPID_PRIVATE_KEY` como requerida en `src/lib/env.ts`, el fallback ya debe existir en el
  árbol, o la suite unitaria heredada de Fase 1-3 completa falla en el boot.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/push-notifications.md`. Both sit in the
project root — the builder copied them there from the bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom.

### `E1-T1` — Schema + migración push_subscription

**Depends on:** nothing · **Priority:** p0 — bloquea todo el resto del bundle

Confirma la ruta real del schema con `find . -name schema.ts -path "*/db/*" -not -path
"*/blueprints/*"` antes de editar. Instala `web-push@3.6.7` y `@types/web-push` como dependencia de
desarrollo (confirmar el número exacto con `npm view @types/web-push version` antes de fijarlo).
Agrega la tabla `pushSubscription` al schema encontrado (DDL en `blueprint.md` §4). Corre
`pnpm db:generate` y revisa que la migración emitida solo agregue `push_subscription`. Genera el par
de claves VAPID con `pnpm dlx web-push generate-vapid-keys` y agrega las 3 variables a `.env.example`
en blanco — ninguna línea de código de esta task las lee todavía, así que `src/lib/env.ts` no las
marca requeridas aún. Edita `tests/setup/env.ts` (heredado de Fase 1) agregando
`process.env.VAPID_PUBLIC_KEY ??= "..."` y `process.env.VAPID_PRIVATE_KEY ??= "..."`, mismo patrón
`??=` que las 5 variables ya pobladas ahí — esto se hace ahora, no en `E1-T3`, porque `E1-T3` es la
que marca `VAPID_PRIVATE_KEY` como requerida y el fallback debe existir antes de eso.

**Files**
- `package.json` — edit: agrega `web-push`, `@types/web-push`
- `src/lib/db/schema.ts` — edit: tabla `pushSubscription` (ruta confirmada por `find`)
- `drizzle/**` — nueva migración generada por `pnpm db:generate`
- `.env.example` — edit: 3 claves VAPID en blanco
- `tests/setup/env.ts` — edit: fallback `??=` para `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`

**Acceptance**

1. **WHEN** `pnpm db:migrate` corre sobre la base de Fase 1-3 ya migrada **THE SYSTEM SHALL** crear la tabla `push_subscription` sin tocar ninguna tabla existente.
2. **WHEN** se inspecciona `push_subscription` con `\d push_subscription` **THE SYSTEM SHALL** mostrar las columnas `id`, `org_id`, `user_id`, `endpoint`, `p256dh`, `auth_key`, `created_at`, `last_used_at`.
3. **WHEN** `pnpm test` corre sobre la suite unitaria heredada de Fase 1-3 después de esta task **THE SYSTEM SHALL** seguir en verde — `tests/setup/env.ts` puebla `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` con valores dummy para que el arranque de `src/lib/env.ts` no falle antes de que `E1-T3` las marque requeridas.
4. **WHEN** se inspecciona `.env.example` **THE SYSTEM SHALL** contener las 3 claves VAPID en blanco.

**Verify**

```bash
pnpm typecheck
pnpm db:migrate
psql "$DATABASE_URL" -c "\d push_subscription"
pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: schema + migracion push_subscription"
git tag step-49-push-schema
```

### `E1-T2` — Rutas subscribe/unsubscribe

**Depends on:** `E1-T1` · **Priority:** p0

Crea `src/server/push/subscriptions.ts` exportando `upsertSubscription(orgId, userId, sub)` y
`deleteSubscription(userId, endpoint)`. Crea las dos rutas de suscripción validando con zod y
llamando `requirePermission()` primero.

**Files**
- `src/server/push/subscriptions.ts` — new
- `src/app/api/v1/push/subscribe/route.ts` — new
- `src/app/api/v1/push/unsubscribe/route.ts` — new
- `tests/push/subscribe.test.ts` — new

**Acceptance**

1. **WHEN** un usuario autenticado envía `POST /api/v1/push/subscribe` con un `endpoint`/`keys` válidos **THE SYSTEM SHALL** crear una fila en `push_subscription` con su `user_id` y `org_id`, y responder `201`.
2. **WHEN** el mismo `endpoint` se envía dos veces **THE SYSTEM SHALL** actualizar la fila existente (upsert), no crear una segunda — `select count(*) from push_subscription where endpoint = $1` permanece en `1`.
3. **WHEN** el body no incluye `keys.p256dh` **THE SYSTEM SHALL** responder `400` sin crear ninguna fila.
4. **WHEN** un usuario envía `POST /api/v1/push/unsubscribe` con un `endpoint` que le pertenece **THE SYSTEM SHALL** borrar esa fila y responder `200` con `{ deleted: true }`.
5. **WHEN** un usuario envía `POST /api/v1/push/unsubscribe` con un `endpoint` que no existe **THE SYSTEM SHALL** responder `200` con `{ deleted: false }`, nunca `404`.

**Verify**

```bash
pnpm typecheck
pnpm test tests/push/subscribe.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: rutas subscribe/unsubscribe"
git tag step-50-push-subscriptions
```

### `E1-T3` — sendPushNotification — envío aislado de fallos

**Depends on:** `E1-T2` · **Priority:** p0

Crea `src/lib/push/send.ts` exportando `sendPushNotification(userId, payload)`. Llama
`webpush.setVapidDetails(...)` con `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (primera lectura — quedan
requeridas desde esta task en `src/lib/env.ts`), consulta `push_subscription` por `user_id`, y envía a
cada una dentro de un `try/catch` por suscripción — un fallo en una no debe impedir el envío a las
demás. Si el error tiene `statusCode` 404/410, borra esa fila. Cualquier otro error se registra con
`logger.warn` y la función nunca relanza. Actualiza `last_used_at` en cada envío exitoso.

**Files**
- `src/lib/push/send.ts` — new
- `tests/push/send.test.ts` — new

**Acceptance**

1. **WHEN** `sendPushNotification(userId, payload)` se llama y el usuario tiene 2 suscripciones válidas **THE SYSTEM SHALL** invocar `webpush.sendNotification` una vez por cada una y actualizar `last_used_at` en ambas.
2. **WHEN** una de las dos suscripciones responde con `statusCode: 410` **THE SYSTEM SHALL** borrar esa fila de `push_subscription` y enviar igual a la otra suscripción.
3. **WHEN** el envío a una suscripción falla con un error que no es 404/410 (ej. timeout de red) **THE SYSTEM SHALL** registrar el error con `logger.warn` y no borrar la fila.
4. **WHEN** `sendPushNotification` se llama para un usuario sin ninguna suscripción **THE SYSTEM SHALL** resolver sin error y sin llamar `webpush.sendNotification`.
5. **WHEN** `sendPushNotification` se llama y `webpush.sendNotification` lanza una excepción no relacionada con el protocolo (ej. JSON inválido) **THE SYSTEM SHALL** capturarla, registrarla, y la promesa retornada por `sendPushNotification` **SHALL** resolver igual — nunca rechaza.
6. **WHEN** `VAPID_PRIVATE_KEY` no está definida al arrancar la app desde esta task en adelante **THE SYSTEM SHALL** fallar el boot con un error nombrado, no servir tráfico que silenciosamente nunca envíe push.

**Verify**

```bash
pnpm typecheck
pnpm test tests/push/send.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: sendPushNotification aislado de fallos"
git tag step-51-push-send
```

### `E1-T4` — Service Worker + manifest PWA + registro en cliente

**Depends on:** `E1-T3` · **Priority:** p0

Crea `public/sw.js` (JavaScript plano, sin build step): listeners `push` (llama
`self.registration.showNotification`) y `notificationclick` (`clients.openWindow`). Crea
`src/app/manifest.ts` con `start_url: "/app"`, `display: "standalone"`. Edita `next.config.ts`
agregando, dentro del `headers()` ya existente, una entrada para `/sw.js`:
`Cache-Control: no-cache, no-store, must-revalidate`. Crea `src/components/push/sw-register.tsx`
(Client Component, `useEffect` que registra `/sw.js` si `"serviceWorker" in navigator`, sin bloquear
el render si falla) y móntalo una vez en `src/app/(app)/layout.tsx`.

**Files**
- `public/sw.js` — new
- `src/app/manifest.ts` — new
- `src/components/push/sw-register.tsx` — new
- `next.config.ts` — edit: headers para `/sw.js`
- `src/app/(app)/layout.tsx` — edit: monta `<SwRegister />`

**Acceptance**

1. **WHEN** un navegador con soporte de Service Worker visita cualquier ruta de `(app)` **THE SYSTEM SHALL** registrar `/sw.js` sin errores en consola.
2. **WHEN** se solicita `GET /sw.js` **THE SYSTEM SHALL** responder con el header `Cache-Control: no-cache, no-store, must-revalidate`.
3. **WHEN** se solicita `GET /manifest.webmanifest` **THE SYSTEM SHALL** responder `200` con `start_url` igual a `/app` y `display` igual a `standalone`.
4. **WHEN** el navegador no soporta `serviceWorker` (verificado con el guard `"serviceWorker" in navigator`) **THE SYSTEM SHALL** omitir el registro sin lanzar una excepción no controlada en el árbol de React.

**Verify**

```bash
pnpm typecheck
pnpm build
pnpm dev & sleep 3 && test "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/sw.js)" = 200 && curl -s -I localhost:3000/sw.js | grep -qi 'cache-control: no-cache, no-store, must-revalidate' && test "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/manifest.webmanifest)" = 200; kill %1 2>/dev/null || true
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: service worker + manifest PWA"
git tag step-52-sw-manifest
```

### `E1-T5` — Opt-in de notificaciones en /app/settings/profile

**Depends on:** `E1-T4` · **Priority:** p1

Edita `src/app/(app)/settings/profile/page.tsx` agregando una sección "Notificaciones" que renderiza
`<PushOptIn />`. Crea `src/components/push/push-opt-in.tsx` (Client Component): si
`Notification.permission === "default"`, llama `Notification.requestPermission()`; si `"granted"`,
obtiene `navigator.serviceWorker.ready`, llama `registration.pushManager.subscribe({ userVisibleOnly:
true, applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })` (primera lectura de esta variable) y hace
`POST /api/v1/push/subscribe` con `sub.toJSON()`. Si ya está suscrito (`getSubscription()` al montar),
el botón muestra "Desactivar" y llama `POST /api/v1/push/unsubscribe` + `subscription.unsubscribe()`.

**Files**
- `src/app/(app)/settings/profile/page.tsx` — edit
- `src/components/push/push-opt-in.tsx` — new

**Acceptance**

1. **WHEN** un usuario con `Notification.permission === "default"` hace clic en "Activar notificaciones" y concede el permiso **THE SYSTEM SHALL** crear una suscripción push y una fila en `push_subscription` para ese usuario.
2. **WHEN** el usuario deniega el permiso del navegador **THE SYSTEM SHALL** mostrar el mensaje inline de error sin crear ninguna fila.
3. **WHEN** un usuario ya suscrito visita `/app/settings/profile` **THE SYSTEM SHALL** mostrar el botón en estado "Desactivar", no "Activar".
4. **WHEN** un usuario suscrito hace clic en "Desactivar" **THE SYSTEM SHALL** borrar su fila de `push_subscription` y revertir el botón a "Activar".
5. **WHEN** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no está definida al hacer build desde esta task en adelante **THE SYSTEM SHALL** fallar el build con un error nombrado (validación de env de cliente, mismo mecanismo que Fase 1 usa para `NEXT_PUBLIC_*`).

**Verify**

```bash
pnpm typecheck
pnpm build
# La cobertura e2e completa se escribe y corre en E2-T9 (epic 02) — el archivo de test no existe
# todavía en esta task.
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: opt-in de notificaciones en perfil"
git tag step-53-push-opt-in
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** un usuario activa notificaciones desde `/app/settings/profile` **THE SYSTEM SHALL** tener
   una fila en `push_subscription` — verificado por el build y typecheck de E1-T5; la cobertura e2e
   completa del flujo activar→verificar→desactivar vive en E2-T9 (epic 02), fuera del alcance de este
   epic porque el flujo cruza a `tests/e2e/`, escrito solo cuando el dashboard de epic 02 también
   existe.
2. **WHEN** cualquier suscripción responde 404/410 **THE SYSTEM SHALL** limpiarse sola sin
   intervención manual, verificado por `tests/push/send.test.ts`.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Run from the project root. Both criteria must be decidable by these commands.

## Pitfalls

- **No mockees `web-push` directo en los tests de esta epic ni de `02-hooks-dashboard`.** Mockea
  `src/lib/push/send.ts` — es el contrato que consumen los ganchos, no el SDK.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PUBLIC_KEY` deben ser el mismo valor literal** — si
  difieren, `PushManager.subscribe` falla en el navegador con `InvalidAccessError`.
- **No asumas la ruta del schema por el nombre del `CLAUDE.md` que leíste último** — corre el `find`
  de `blueprint.md` §0 primero.
- **No olvides el fallback de `tests/setup/env.ts` en `E1-T1`.** Si se omite, toda la suite unitaria
  falla en el boot desde `E1-T3` en adelante — incluidos los reruns de los gates originales de Fase
  1-3 que este blueprint usa como red de seguridad.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l
      'step-49-*' 'step-50-*' 'step-51-*' 'step-52-*' 'step-53-*'` lists 5.
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` has the 3 VAPID keys blank.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
