# Epic 01: Medios y Contenido

> Al terminar este epic, la organización puede subir medios a una biblioteca compartida, crear
> piezas de contenido con esos medios adjuntos, moverlas por un flujo de aprobación, y programarlas
> en un calendario editorial arrastrable — todo sin que nada se publique todavía (eso es el Epic 02).

| | |
|---|---|
| **Epic id** | `01-medios-y-contenido` |
| **Tasks** | `E1-T1` … `E1-T7` |
| **Depends on** | nada de este bundle — pero requiere que `blueprints/nucleo-fase-1/` esté completo (18 checkpoints `step-01`…`step-18` en git) antes de empezar |
| **Unlocks** | `02-publicacion-y-operacion` |
| **Parallel with** | nada — todas las tasks de este epic tienen una dependencia real dentro de él |

No necesitas ningún otro archivo para completar este epic. Todo lo de abajo está repetido aquí a
propósito.

---

## Stack

Next.js 16 (App Router) · TypeScript 6.0.3 · Tailwind CSS 4 · shadcn/Radix · Postgres 17 · Drizzle
ORM · MinIO (S3-compatible) vía `@aws-sdk/client-s3`/`@aws-sdk/lib-storage` · `sharp` ·
`react-day-picker` · `@dnd-kit/core`. Gestor de paquetes: `pnpm`. Runtime pineado en `.nvmrc`.
Versiones exactas en `pnpm-lock.yaml` — léelo, nunca adivines una.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {path}` |
| E2E (un archivo) | `pnpm test:e2e {path}` |
| Migrar | `pnpm db:migrate` · generar migración: `pnpm db:generate` |
| Sembrar | `pnpm db:seed` |
| Servicios locales | `docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d` / `down` |
| Crear bucket (idempotente) | `node scripts/ensure-bucket.mjs` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier task de este
epic como hecha.

Si una task de abajo verifica contra MinIO o Postgres reales, levanta los servicios primero con el
comando de arriba. El archivo que los define (`docker-compose.minio.yml`, más
`docker-compose.yml` heredado de Fase 1) ya está en la raíz del proyecto — lo trajo la copia de
`workspace/` antes de la task 1, no lo escribes tú.

## Directory subtree

Solo la parte que este epic toca:

```
package.json               # EDITADO E1-T1 — scripts services:up/services:down/services:reset
src/
  lib/
    storage/
      s3-client.ts          # NUEVO E1-T1 — único punto que instancia S3Client
      validate-mime.ts      # NUEVO E1-T3 (versión básica — E2-T5 la endurece)
    db/
      schema.ts             # EDITADO E1-T2 — 5 tablas nuevas agregadas al archivo existente
                             # EDITADO otra vez E1-T4 — agrega media_asset.original_filename
    env.ts                  # EDITADO E1-T1 — variables S3_*
  server/
    media/
      upload.ts              # NUEVO E1-T3
      thumbnails.ts           # NUEVO E1-T3
    content/
      items.ts               # NUEVO E1-T5
      approvals.ts            # NUEVO E1-T6
      schedule.ts              # NUEVO E1-T7
  app/
    api/
      health/route.ts                                 # EDITADO E1-T1 — agrega storageReachable (HeadBucketCommand)
      v1/
        media/route.ts                              # NUEVO E1-T3
        media/[id]/route.ts                         # NUEVO E1-T4 — borrado (soft-delete)
        content/route.ts                             # NUEVO E1-T5
        content/[id]/route.ts                        # NUEVO E1-T5
        content/[id]/approval/route.ts                # NUEVO E1-T6
        content/[id]/approval/[approvalId]/route.ts   # NUEVO E1-T6
        content/[id]/schedule/route.ts                 # NUEVO E1-T7
        content/calendar/route.ts                      # NUEVO E1-T7
      media/[key]/route.ts                              # NUEVO E1-T3
    (app)/content/
      page.tsx                   # NUEVO E1-T5 — lista de contenido, ruta raíz /app/content
      media/page.tsx           # NUEVO E1-T4
      new/page.tsx              # NUEVO E1-T5
      [id]/page.tsx               # NUEVO E1-T5
      calendar/page.tsx             # NUEVO E1-T7
  components/
    media/
      media-grid.tsx           # NUEVO E1-T4
      media-uploader.tsx        # NUEVO E1-T4
    content/
      content-editor.tsx        # NUEVO E1-T5
      approval-panel.tsx          # NUEVO E1-T6
    calendar/
      editorial-calendar.tsx      # NUEVO E1-T7
scripts/
  ensure-bucket.mjs             # NUEVO E1-T1
  seed.ts                        # EDITADO E1-T2
tests/
  integration/media-upload.test.ts       # E1-T3
  e2e/media-library.spec.ts               # E1-T4
  integration/content-items.test.ts        # E1-T5
  integration/content-approval.test.ts      # E1-T6
  e2e/editorial-calendar.spec.ts             # E1-T7
```

Todo lo fuera de este subárbol está fuera de alcance. Si una task parece requerir editar un archivo
que no está listado aquí, detente y repórtalo — significa que el límite del epic está mal.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `media_asset` | todos (E1-T2 crea la tabla) | ver blueprint.md §4 para el schema completo |
| `content_item` | todos | |
| `content_media` | todos | join, PK compuesta |
| `content_channel_target` | todos — pero `status`/`published_at`/`external_post_id` los escribe el Epic 02, no este | este epic solo crea filas en `pending`/`scheduled` |
| `content_approval` | todos | |
| `channel_connection` (núcleo Fase 1) | solo lectura, para poblar el selector de canal al programar | no se modifica |
| `permission`, `role_permission` (núcleo Fase 1) | E1-T2 inserta 8 filas nuevas en `permission` y sus grants | nunca se tocan las filas existentes de Fase 1 |

## Contracts

**Consumed** — ya existe, no se reconstruye:

| From | Interface | Guarantee |
|---|---|---|
| Fase 1 core | `src/server/tenancy.ts` `requirePermission(key)` | lanza si el usuario no tiene el permiso; nunca hay que re-implementar el chequeo |
| Fase 1 core | `src/lib/audit.ts` `recordAuditEvent()` | debe llamarse dentro de la misma transacción que la mutación |
| Fase 1 core | tabla `channel_connection` | fuente de los destinos de publicación disponibles para programar |

**Produced** — el Epic 02 depende exactamente de estas firmas:

| Export | Signature | Used by |
|---|---|---|
| `src/lib/storage/s3-client.ts` → `s3Client` | `S3Client` instanciado con `forcePathStyle: true` | `02-publicacion-y-operacion` (los adaptadores no lo usan directo, pero el worker de publicación reutiliza el mismo cliente para descargar medios adjuntos al publicar) |
| `src/server/content/items.ts` → `getContentItem(id)` | retorna `content_item` + medios + destinos | `02-publicacion-y-operacion` (el worker lee la pieza completa antes de publicarla) |
| tabla `content_channel_target` con filas `status='scheduled'` | — | el poller del Epic 02 consulta exactamente este estado |

## Conventions that bite in this area

- Ningún objeto de MinIO se sirve por URL pública — todo pasa por `GET /api/media/[key]`, que
  resuelve `org_id` de la sesión antes de hacer streaming.
- `storage_key` sigue el patrón `<org_id>/<uuid>.<ext>` — nunca el nombre de archivo original.
- Un `member` solo puede editar sus propias piezas de contenido — ese chequeo vive en el código de
  `src/server/content/items.ts`, no en la tabla `role_permission` (el permiso `content.edit` es el
  mismo para todos los `member`; el filtro de "propio" es lógica de aplicación).

Reglas completas del proyecto: `CLAUDE.md`. Reglas del área: `.claude/rules/media.md`. Ambos ya
están en la raíz del proyecto — el builder los copió ahí antes de la task 1.

---

## Tasks

Listadas en el mismo orden que `tasks.json`. Ese orden es el orden de build — trabaja de arriba
hacia abajo, sin reordenar por prioridad ni por lo que parezca más rápido.

### `E1-T1` — Dependencias nuevas + MinIO local

**Depends on:** nada · **Priority:** p0

Instala `@aws-sdk/client-s3@^3.1111.0`, `@aws-sdk/lib-storage@^3.1111.0`, `sharp@^0.35.3`,
`@dnd-kit/core@^6.3.1`, `react-day-picker@^10.0.1` en un solo `pnpm add` (sin `-D` — todas van a
runtime). Corre `pnpm approve-builds --all` inmediatamente después — `sharp` trae un post-install
de binario nativo y sin este paso el siguiente `pnpm install --frozen-lockfile` fallará con
`ERR_PNPM_IGNORED_BUILDS` (mismo síntoma que Fase 1 tuvo con `drizzle-kit`/`bullmq`/`ioredis`).
Escribe el cliente S3 con `forcePathStyle: true` (obligatorio para que el SDK de AWS hable con
MinIO). El script de creación de bucket usa el mismo SDK (`CreateBucketCommand`), atrapando
`BucketAlreadyOwnedByYou` para ser idempotente — no dependas de la imagen `minio/mc`, cuyo tag no
se pudo verificar en esta sesión de generación — y empieza con `import "dotenv/config"` como
primera línea (mismo patrón que `drizzle.config.ts`/`scripts/seed.ts` de Fase 1) para cargar `.env`
sin depender del shell que lo invoca. Reescribe los scripts `services:up`/`services:down`/
`services:reset` de `package.json` para que compongan también `docker-compose.minio.yml` y
levanten/bajen `minio` (ver el comando exacto en blueprint.md step 19 — de lo contrario
`pnpm services:up` seguiría siendo literalmente `docker compose up -d postgres redis` y nunca
tocaría MinIO). Tras agregar las 6 variables `S3_*` a `.env.example`, fusiónalas también dentro del
`.env` real ya existente (creado una sola vez por el Bootstrap de Fase 1 — nunca se regenera desde
`.env.example`), sin pisar ningún valor ya presente (ver el mecanismo idempotente exacto en
blueprint.md §10 Bootstrap paso 6, mismo comando). Edita `src/app/api/health/route.ts` (heredado de
Fase 1, mismo path `/api/health`, mismo shape `{ data: { ok, migrationsUpToDate } }`) agregando el
campo `storageReachable`: llama `HeadBucketCommand({ Bucket: env.S3_BUCKET })` contra el `S3Client`
de `src/lib/storage/s3-client.ts` con timeout corto (2s) — resuelve → `true`, lanza (bucket
inexistente, MinIO caído, timeout) → `false` sin que la ruta lance 500.

**Files**
- `docker-compose.minio.yml` — ya existe, emitido en `workspace/` (§19.6 del blueprint); no lo
  edites, solo úsalo
- `package.json` — edit: reescribir los scripts `services:up`/`services:down`/`services:reset`
- `src/lib/storage/s3-client.ts` — new
- `scripts/ensure-bucket.mjs` — new
- `src/lib/env.ts` — edit: agregar las 6 variables `S3_*` al schema zod
- `.env.example` — edit: agregar las 6 variables con valor local/blanco
- `src/app/api/health/route.ts` — edit: agregar `storageReachable` vía `HeadBucketCommand`

**Acceptance**

1. **WHEN** `pnpm services:up` corre (con los scripts `services:up`/`services:down`/`services:reset` de `package.json` ya reescritos por este step para incluir `docker-compose.minio.yml`) **THE SYSTEM SHALL** levantar Postgres, Redis y MinIO, con MinIO en estado `healthy` en menos de 30 segundos.
2. **WHEN** `node scripts/ensure-bucket.mjs` corre por primera vez contra un MinIO vacío **THE SYSTEM SHALL** crear el bucket `S3_BUCKET` y salir con 0.
3. **WHEN** `node scripts/ensure-bucket.mjs` corre una segunda vez contra el mismo MinIO **THE SYSTEM SHALL** salir con 0 sin lanzar un error de "bucket ya existe".
4. **WHEN** `S3_BUCKET` no está definido al boot **THE SYSTEM SHALL** fallar el arranque con un error nombrado — mismo patrón de `src/lib/env.ts` que Fase 1.
5. **WHEN** `pnpm install --frozen-lockfile` corre después de `pnpm approve-builds --all` **THE SYSTEM SHALL** salir con 0 sin error `ERR_PNPM_IGNORED_BUILDS`.
6. **WHEN** `GET /api/health` corre con MinIO alcanzable (bucket ya creado por este step) **THE SYSTEM SHALL** responder `{ data: { ok: true, ..., storageReachable: true } }`.

**Verify**

```bash
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts["services:up"] = "docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d postgres redis minio";
pkg.scripts["services:down"] = "docker compose -f docker-compose.yml -f docker-compose.minio.yml down";
pkg.scripts["services:reset"] = "docker compose -f docker-compose.yml -f docker-compose.minio.yml down -v && docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d postgres redis minio";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
grep -q "docker-compose.minio.yml" package.json

pnpm services:up
timeout 30 bash -c 'until docker compose -f docker-compose.yml -f docker-compose.minio.yml ps minio | grep -q healthy; do sleep 1; done'

touch .env
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  key="${line%%=*}"
  grep -q "^${key}=" .env || printf '%s\n' "$line" >> .env
done < .env.example

set -a && . ./.env && set +a
node scripts/ensure-bucket.mjs
node scripts/ensure-bucket.mjs
pnpm install --frozen-lockfile
pnpm typecheck

pnpm dev &
DEV_PID=$!
timeout 30 bash -c 'until curl -sf localhost:3000/api/health >/dev/null; do sleep 1; done'
curl -s localhost:3000/api/health | jq -e '.data.storageReachable == true'
kill $DEV_PID
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: dependencias de medios + MinIO local"
git tag step-19-media-deps
```

### `E1-T2` — Schema de contenido + migración + permisos

**Depends on:** `E1-T1` · **Priority:** p0

Agrega las 5 tablas nuevas a `src/lib/db/schema.ts` (el archivo existente de Fase 1 — se extiende,
nunca se reemplaza) — **sin** la columna `media_asset.original_filename`: esa columna la agrega
`E1-T4`, vía una migración separada (ver blueprint.md §4, nota en `mediaAsset`). Corre
`pnpm db:generate` (la migración resultante se referencia por lo que hace, nunca por un nombre
inventado — usa la skill `add-migration` ya instalada). Corre `pnpm db:migrate`. Extiende
`scripts/seed.ts` con los 8 permisos nuevos y sus grants owner/member (ver blueprint.md §8 para la
tabla exacta).

**Files**
- `src/lib/db/schema.ts` — edit
- `drizzle/**` — la migración que `pnpm db:generate` emite (no le pongas nombre tú)
- `scripts/seed.ts` — edit

**Acceptance**

1. **WHEN** `pnpm db:migrate` corre sobre la base de Fase 1 ya migrada **THE SYSTEM SHALL** crear las 5 tablas `media_asset`, `content_item`, `content_media`, `content_channel_target`, `content_approval` sin tocar ninguna de las 23 tablas existentes.
2. **WHEN** `pnpm db:seed` corre **THE SYSTEM SHALL** insertar los 8 permisos nuevos en la tabla `permission`, sin duplicarlos si ya existen (upsert por `key`).
3. **WHEN** el rol `owner` se consulta tras el seed **THE SYSTEM SHALL** tener los 8 permisos nuevos asignados en `role_permission`.
4. **WHEN** el rol `member` se consulta tras el seed **THE SYSTEM SHALL** tener exactamente 4 de los 8 (`content.create`, `content.edit`, `content.submit`, `media.upload`) — nunca `content.approve`, `content.schedule` ni `content.delete` ni `media.manage`.

**Verify**

```bash
pnpm db:migrate
psql "$DATABASE_URL" -c "\d media_asset"
psql "$DATABASE_URL" -c "\d content_item"
psql "$DATABASE_URL" -c "\d content_media"
psql "$DATABASE_URL" -c "\d content_channel_target"
psql "$DATABASE_URL" -c "\d content_approval"
pnpm db:seed
test "$(psql "$DATABASE_URL" -tAc "select count(*) from permission where key like 'content.%' or key like 'media.%';")" = 8
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: schema de contenido + permisos"
git tag step-20-content-schema
```

### `E1-T3` — Biblioteca de medios — backend

**Depends on:** `E1-T2` · **Priority:** p0

Escribe la validación de MIME (versión básica por `Content-Type` — E2-T5 la endurece a magic
bytes), el wrapper de `sharp` para miniaturas de 320px de ancho, y el orquestador de subida
(`upload.ts`, detrás de `requirePermission("media.upload")`). Las dos rutas: `POST/GET
/api/v1/media` y `GET /api/media/[key]` (streaming autenticado — resuelve `org_id` antes de
devolver el objeto, nunca confía en el `key` recibido sin esa resolución). Escribe
`tests/integration/media-upload.test.ts` (contra el MinIO de test real, bucket
`nucleo-media-test`): sube un fixture de imagen válido y confirma que se crea un `media_asset` con
`storage_key` y `thumbnail_key` no nulos, respondiendo 201; sube un archivo cuyo `Content-Type`
declarado no coincide con el tipo MIME real del contenido y confirma 400 sin fila creada ni objeto
subido; sube un archivo por encima del límite de 15MB y confirma 400 sin que nada llegue a MinIO.

**Files**
- `src/lib/storage/validate-mime.ts` — new
- `src/server/media/upload.ts` — new
- `src/server/media/thumbnails.ts` — new
- `src/app/api/v1/media/route.ts` — new
- `src/app/api/media/[key]/route.ts` — new
- `tests/integration/media-upload.test.ts` — new

**Acceptance**

1. **WHEN** se sube una imagen JPEG válida de 2MB **THE SYSTEM SHALL** crear un `media_asset` con `thumbnail_key` no nulo y responder 201.
2. **WHEN** se sube un archivo mayor a 15MB **THE SYSTEM SHALL** responder 400 sin subir nada a MinIO.
3. **WHEN** se sube un archivo con `Content-Type: application/x-msdownload` **THE SYSTEM SHALL** responder 400 sin subir nada a MinIO.
4. **WHEN** un usuario de la organización A pide `GET /api/media/:key` de un objeto de la organización B **THE SYSTEM SHALL** responder 404.
5. **WHEN** un usuario de la organización dueña del objeto pide `GET /api/media/:key` **THE SYSTEM SHALL** responder 200 con el `Content-Type` original y el cuerpo del objeto.

**Verify**

```bash
pnpm test tests/integration/media-upload.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: biblioteca de medios — backend"
git tag step-21-media-backend
```

### `E1-T4` — Biblioteca de medios — UI

**Depends on:** `E1-T3` · **Priority:** p1

Server Component de carga inicial + Client Components para el grid (TanStack Query) y el
uploader (input + barra de progreso). Búsqueda por `original_filename` — columna nullable ya
incluida en el schema canónico de `media_asset` (blueprint.md §4). Agrega
`originalFilename: text("original_filename")` a `mediaAsset` en `src/lib/db/schema.ts` y corre
`pnpm db:generate` (la migración resultante se referencia como "la migración que `pnpm db:generate`
emite para este step" — nunca por un nombre de archivo inventado) seguido de `pnpm db:migrate` para
aplicarla. Escribe `src/app/api/v1/media/[id]/route.ts` (DELETE, blueprint.md §5 Routes): resuelve
el `media_asset` por `id` dentro de la organización del usuario, exige
`requirePermission("media.manage")` **del lado del servidor** antes de tocar la fila — el botón
oculto en el cliente para quien no tiene el permiso es UX, nunca la barrera real (blueprint.md §8)
— y marca `deleted_at = now()` (soft-delete, nunca `DELETE FROM`). Borrado soft-delete con
confirmación en el grid, botón visible solo con `media.manage`, que llama este endpoint.

**Files**
- `src/app/(app)/content/media/page.tsx` — new
- `src/components/media/media-grid.tsx` — new
- `src/components/media/media-uploader.tsx` — new
- `src/app/api/v1/media/[id]/route.ts` — new: DELETE, soft-delete server-side tras `requirePermission("media.manage")`
- `tests/e2e/media-library.spec.ts` — new
- `src/lib/db/schema.ts` — edit: agrega `original_filename` a `mediaAsset`
- `drizzle/**` — la migración que `pnpm db:generate` emite (no le pongas nombre tú)

**Acceptance**

1. **WHEN** la biblioteca no tiene medios **THE SYSTEM SHALL** mostrar el estado vacío con el botón de subida enfocado.
2. **WHEN** se sube un archivo desde la UI **THE SYSTEM SHALL** mostrarlo en el grid sin recargar la página.
3. **WHEN** el usuario busca por texto que coincide con `original_filename` **THE SYSTEM SHALL** filtrar el grid a solo esos resultados.
4. **WHEN** el usuario con `media.manage` borra un medio **THE SYSTEM SHALL** quitarlo del grid inmediatamente y marcar `deleted_at` en la fila.
5. **WHEN** un usuario sin `media.manage` ve el grid **THE SYSTEM SHALL** no mostrar el botón de borrar.

**Verify**

```bash
pnpm db:generate
pnpm db:migrate
psql "$DATABASE_URL" -c "\d media_asset" | grep -q original_filename
pnpm test:e2e tests/e2e/media-library.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: biblioteca de medios — UI"
git tag step-22-media-ui
```

### `E1-T5` — Creación y edición de contenido

**Depends on:** `E1-T2` · **Priority:** p0

CRUD de `content_item` detrás de `requirePermission`. El editor es un textarea con contador de
caracteres y selector de medios de la biblioteca — sin WYSIWYG (non-goal). `content.edit` para un
`member` está acotado a piezas creadas por ese mismo usuario — este filtro es lógica de aplicación
en `src/server/content/items.ts`, no una diferencia de `role_permission`. Construye también
`src/app/(app)/content/page.tsx` (Server Component, lista de contenido con filtro por `status`) —
es la ruta raíz `/app/content`; ninguna otra task de esta fase la crea.

**Files**
- `src/server/content/items.ts` — new
- `src/app/api/v1/content/route.ts` — new
- `src/app/api/v1/content/[id]/route.ts` — new
- `src/components/content/content-editor.tsx` — new
- `src/app/(app)/content/page.tsx` — new (lista de contenido, ruta raíz `/app/content`)
- `tests/integration/content-items.test.ts` — new

**Acceptance**

1. **WHEN** un usuario con `content.create` crea una pieza con solo título **THE SYSTEM SHALL** insertar un `content_item` en estado `draft`.
2. **WHEN** un usuario adjunta 2 medios de la biblioteca a una pieza **THE SYSTEM SHALL** insertar 2 filas en `content_media` con `position` 0 y 1.
3. **WHEN** un `member` intenta editar una pieza creada por otro `member` **THE SYSTEM SHALL** responder 403 — `content.edit` está acotado a piezas propias para el rol `member`.
4. **WHEN** se edita el cuerpo de una pieza **THE SYSTEM SHALL** actualizar `updated_at` y registrar un `audit_event` con action `content.edited`.
5. **WHEN** se lista contenido filtrando `status=draft` **THE SYSTEM SHALL** retornar solo piezas de la organización del usuario en ese estado, paginadas por cursor.

**Verify**

```bash
pnpm test tests/integration/content-items.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: creacion y edicion de contenido"
git tag step-23-content-crud
```

### `E1-T6` — Flujo de aprobación

**Depends on:** `E1-T5` · **Priority:** p0

`requestApproval` (draft → pending_approval) y `decideApproval` (approved, o de vuelta a draft con
comentario si se rechaza). Panel con botón de solicitud para el creador y botones de
aprobar/rechazar para quien tiene `content.approve`.

**Files**
- `src/server/content/approvals.ts` — new
- `src/app/api/v1/content/[id]/approval/route.ts` — new
- `src/app/api/v1/content/[id]/approval/[approvalId]/route.ts` — new
- `src/components/content/approval-panel.tsx` — new
- `tests/integration/content-approval.test.ts` — new

**Acceptance**

1. **WHEN** el creador de una pieza en `draft` solicita aprobación **THE SYSTEM SHALL** crear una fila `content_approval` en `pending` y cambiar `content_item.status` a `pending_approval`.
2. **WHEN** un usuario con `content.approve` aprueba **THE SYSTEM SHALL** cambiar `content_approval.status` a `approved`, `content_item.status` a `approved`, y registrar `audit_event` con action `content.approved`.
3. **WHEN** un usuario con `content.approve` rechaza con comentario **THE SYSTEM SHALL** cambiar `content_approval.status` a `rejected`, `content_item.status` de vuelta a `draft`, y guardar el comentario.
4. **WHEN** un usuario sin `content.approve` intenta decidir una aprobación **THE SYSTEM SHALL** responder 403 sin modificar ninguna fila.
5. **WHEN** una pieza ya tiene una `content_approval` en `pending` **THE SYSTEM SHALL** rechazar una segunda solicitud de aprobación con 409 conflict.

**Verify**

```bash
pnpm test tests/integration/content-approval.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: flujo de aprobacion"
git tag step-24-approval
```

### `E1-T7` — Calendario editorial

**Depends on:** `E1-T3`, `E1-T5` · **Priority:** p0

`scheduleContentItem` hace upsert por `(content_item_id, channel_connection_id)`, exige
`status='approved'`. `EditorialCalendar` combina `react-day-picker` (grilla mensual) con
`@dnd-kit/core` (`DndContext` + `useDraggable`/`useDroppable`) para reprogramar arrastrando —
`onDragEnd` llama `scheduleContentItem` con la nueva fecha, preservando la hora original.

**Files**
- `src/server/content/schedule.ts` — new
- `src/app/api/v1/content/[id]/schedule/route.ts` — new
- `src/app/api/v1/content/calendar/route.ts` — new
- `src/components/calendar/editorial-calendar.tsx` — new
- `tests/e2e/editorial-calendar.spec.ts` — new

**Acceptance**

1. **WHEN** se programa una pieza `approved` para un canal con `scheduledAt` futuro **THE SYSTEM SHALL** crear un `content_channel_target` en estado `scheduled`.
2. **WHEN** se intenta programar una pieza en estado `draft` **THE SYSTEM SHALL** responder 409 conflict sin crear ningún `content_channel_target`.
3. **WHEN** se arrastra una tarjeta programada a otro día en el calendario **THE SYSTEM SHALL** actualizar `scheduled_at` a la nueva fecha preservando la hora original, sin crear una fila duplicada.
4. **WHEN** se consulta `GET /api/v1/content/calendar?from=X&to=Y` **THE SYSTEM SHALL** retornar solo `content_channel_target` cuyo `scheduled_at` cae en ese rango, de la organización del usuario.
5. **WHEN** el drag-and-drop se opera solo con teclado (Tab + flechas + Enter, comportamiento nativo de `@dnd-kit`) **THE SYSTEM SHALL** reprogramar la pieza igual que con mouse.

**Verify**

```bash
pnpm test:e2e tests/e2e/editorial-calendar.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T7: calendario editorial"
git tag step-25-calendar
```

---

## Epic acceptance

El epic está terminado cuando las 7 tasks están `done` **y**:

1. **WHEN** se recorre el flujo completo (subir medio → crear pieza → adjuntar medio → solicitar
   aprobación → aprobar → programar → ver en el calendario) **THE SYSTEM SHALL** completarlo sin
   ningún error 500 en ningún paso.
2. **WHEN** una organización B intenta leer o modificar cualquier fila de `media_asset`,
   `content_item`, `content_channel_target` o `content_approval` de la organización A **THE SYSTEM
   SHALL** responder 403 o 404 en todos los casos, nunca 200.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/media-library.spec.ts tests/e2e/editorial-calendar.spec.ts
```

## Pitfalls

- **Subir el bucket equivocado en test.** Los tests de integración de medios deben apuntar a
  `S3_BUCKET=nucleo-media-test` (ya seteado por `tests/setup/env.ts`) — nunca al bucket de
  desarrollo `nucleo-media`.
- **Olvidar `forcePathStyle: true`.** Sin esa opción el SDK de AWS intenta resolver
  `<bucket>.localhost:9000`, que MinIO no sirve — las subidas fallan con un error de DNS confuso.
- **Confundir el permiso de `member` en `content.edit`.** El permiso existe para todos los
  `member`; la restricción a "solo piezas propias" es un chequeo de aplicación, no un permiso
  distinto — no crear un `content.edit.own` en la tabla `permission`.

## Before moving on

- [ ] Las 7 tasks de este epic están `done` en `tasks.json` — ninguna en `in_progress`.
- [ ] Cada `verify` de cada task pasó completo, no solo el primer comando.
- [ ] Ningún `verify` fue editado, ni saltado porque un archivo que nombra no existía.
- [ ] **Los 7 checkpoints de este epic existen en git** — `git tag -l 'step-19-*' 'step-2[0-5]-*'` lista 7.
- [ ] Gate command pasa limpio, corrido desde la raíz del proyecto.
- [ ] Todo contrato "Produced" de arriba existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] `.env.example` actualizado con las 6 variables `S3_*`.
- [ ] Un commit por task, cada uno prefijado con su id de task, cada uno seguido de su tag de checkpoint.
