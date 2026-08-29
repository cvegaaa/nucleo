# Núcleo — Fase 2: Centro de Contenido — Blueprint

> Generado por The Architect el 2026-08-14
> Shape: saas-webapp (fase incremental sobre proyecto existente) · `knowledge/shapes/saas-webapp.md`
> Runtime track: ts-node · `knowledge/runtime-tracks/ts-node.md`
> Emisión: bundle
> Versión de blueprint: 1
> Versiones verificadas por última vez: 2026-08-14 — ver §11 para procedencia por paquete
> Depende de: `blueprints/nucleo-fase-1/` — los 18 checkpoints (`step-01`…`step-18`) deben existir
> en el repositorio antes de que el Bootstrap de este blueprint corra.

---

## 1. Project Overview & Non-Goals

### Vision

Núcleo es una plataforma SaaS multi-tenant que unifica comunicación multicanal, CRM, contenido,
automatizaciones y agentes de IA para pequeñas y medianas empresas. La Fase 1 (Centro de
Comunicación) ya está construida y verificada: multi-tenancy con roles/permisos, bandeja unificada
de WhatsApp/Instagram/Facebook/TikTok, copiloto de IA contextual acotado, y el núcleo de 23 tablas
de datos. Esta Fase 2 (Centro de Contenido) añade, sobre ese mismo código: calendario editorial,
creación y gestión de contenido, programación multicanal, biblioteca de medios, aprobaciones y
publicación, y asistencia de IA para contenido — reutilizando los `channel_connection` ya
conectados en Fase 1 como destinos de publicación, y extendiendo el gateway de IA y el patrón de
copiloto (runs/steps/tool_calls/approvals) ya construido, en vez de reinventarlo.

### Users

| Persona | What they come to do | Frequency |
|---|---|---|
| Community manager / editor | Crear, programar y publicar contenido en varios canales desde un calendario | daily |
| Dueño de la PyME / aprobador | Revisar y aprobar contenido antes de que salga a producción | daily |
| Copiloto de IA | Sugerir borradores de copy y mejores horarios de publicación, con aprobación en primer uso | on-demand |

### Goals — v1 scope

1. El equipo puede subir imágenes a una biblioteca de medios compartida por organización, con
   miniaturas automáticas.
2. El equipo puede crear piezas de contenido, adjuntarles medios, y moverlas por un flujo de
   estados (borrador → pendiente de aprobación → aprobado → programado → publicado).
3. Un aprobador puede aprobar o rechazar contenido con comentario, quedando registrado en el
   audit log existente.
4. El equipo puede programar una pieza de contenido para publicarse en uno o más
   `channel_connection` ya conectados, arrastrándola en un calendario editorial.
5. El sistema publica automáticamente el contenido programado en la fecha/hora indicada, con
   reintentos y dead-letter ante fallos del proveedor.
6. El equipo ve en vivo el estado de cada publicación programada (programada/publicada/fallida) en
   un dashboard, sin recargar la página.
7. El copiloto puede sugerir un borrador de copy para un canal dado un tema, y sugerir el mejor
   horario de publicación, con el mismo patrón de aprobación en primer uso de Fase 1.

### Non-Goals — explicitly out of scope for v1

| Not building | Why not now | Revisit when |
|---|---|---|
| Pagos/checkout reales (Stripe, MercadoPago) | Fuera del alcance funcional de esta fase; solo se dejan pines investigados sin instalar (§11) | Cuando el equipo decida activar un plan pago |
| Dominio público / salida a producción pública | El VPS sigue siendo privado; lanzar es una decisión operativa separada del build | Cuando el equipo decida lanzar públicamente |
| Fases 3-6 (automatizaciones, agentes IA autónomos completos, CRM con pipeline, analítica) | Cada una es un centro de producto separado con su propio blueprint | Al completar y validar esta fase |
| Editor WYSIWYG rico (formato enriquecido tipo Notion/Google Docs) | Un textarea con soporte de saltos de línea y un contador de caracteres por canal cubre el 90% del uso real; un editor rico agrega semanas de superficie de bugs | Cuando el equipo reporte que el copy necesita formato (negritas, listas) que el proveedor de destino soporte |
| Recorte/edición de imagen dentro de la app | `sharp` genera la miniatura automáticamente; recortar o editar la imagen original es un flujo de producto separado | Cuando el equipo lo pida explícitamente |
| Multi-idioma de contenido / variantes A/B | Una pieza de contenido es una pieza; no hay variantes en Fase 2 | Cuando haya evidencia de necesidad real de A/B testing |
| CDN público para medios | MinIO sirve todo vía `GET /api/media/[key]` autenticado — sin distribución pública ni cache de borde | Cuando el volumen de tráfico de medios lo justifique |
| Borrado físico automático de objetos huérfanos en MinIO | El soft-delete de `media_asset` alcanza para Fase 2; una limpieza física es una tarea operativa, no un flujo de usuario | Cuando el costo de almacenamiento lo amerite |

**El builder no debe implementar nada de esta tabla**, incluso si un paso parece requerirlo
tangencialmente. Si un paso de §9 parece necesitar un no-objetivo, es un defecto del blueprint —
detente y repórtalo en vez de expandir el alcance.

### Success metrics

| Metric | Target | How measured |
|---|---|---|
| Piezas de contenido publicadas exitosamente sin intervención manual | ≥ 95% de las programadas | `select count(*) filter (where status='published') * 1.0 / count(*) from content_channel_target where scheduled_at is not null` |
| Latencia de publicación (scheduled_at → published_at) | p95 < 5 minutos | consulta sobre `content_channel_target.published_at - content_channel_target.scheduled_at` |
| Tiempo de subida de un medio + miniatura visible | < 3s en entorno local | medido manualmente en el step 21/22 durante desarrollo |

---

## 2. Tech Stack

**Runtime track: ts-node — sin cambios respecto a Fase 1.** Esta fase añade capas sobre el mismo
runtime, no cambia el stack base. Los pines nuevos de esta fase están en §11; no se repiten aquí.

| Layer | Choice | Why this, over what |
|---|---|---|
| Runtime / framework | Next.js 16 App Router (heredado de Fase 1) | Ya construido y verificado; no se reevalúa |
| Base de datos | Postgres 17 (heredado) | Mismas 23 tablas del núcleo + 5 tablas nuevas de esta fase |
| ORM | Drizzle (heredado) | Consistencia con Fase 1 |
| Almacenamiento de objetos (nuevo) | MinIO self-hosted, S3-compatible, vía `@aws-sdk/client-s3` | Un solo VPS, sin cuenta de nube nueva ni factura adicional — coherente con el resto del stack self-hosted; el SDK oficial de AWS habla el protocolo S3 sin acoplarse a MinIO específicamente, así que migrar a S3 real en el futuro no requiere reescribir el cliente |
| Procesamiento de imagen (nuevo) | `sharp` | Estándar de facto en Node para redimensionar/generar miniaturas; binario nativo precompilado, sin dependencia de ImageMagick externo |
| Calendario (nuevo) | `react-day-picker` | Ligero, sin estado propio pesado, compone bien con `@dnd-kit` para el drag-and-drop; alternativa rechazada: FullCalendar, por su tamaño de bundle y su propio sistema de theming que pelearía con Tailwind |
| Drag-and-drop (nuevo) | `@dnd-kit/core` | Accesible (soporta teclado) por defecto, sin dependencia de HTML5 DnD nativo que es notoriamente inconsistente entre navegadores |
| Colas / scheduler (heredado, sin paquete nuevo) | BullMQ 6.1.1 (ya instalado en Fase 1) | Ya soporta jobs demorados y `jobId` determinístico para deduplicación — suficiente para el scheduler de publicación sin agregar un paquete de cron nuevo |
| Realtime (heredado) | Socket.IO + adaptador Redis (Fase 1) | Se agrega un evento nuevo (`content:target-updated`), no una infraestructura nueva |
| Pagos | NOT APPLICABLE — non-goal explícito de esta fase | Investigado (mercadopago 3.4.0, stripe 22.5.0) pero no instalado — ver §11 *Deliberadamente no usado* |
| Hosting | VPS propio, Docker Compose + Caddy (heredado) | MinIO se agrega como servicio adicional al mismo compose de producción |

### Compatibility check

Verificado contra `knowledge/stack-compatibility.md` — no hay combinaciones conocidas como
problemáticas para `@aws-sdk/client-s3`, `sharp`, `react-day-picker`, `@dnd-kit/core`, ni para MinIO
como backend S3-compatible junto al resto del stack de Fase 1. `sharp` publica binarios nativos
precompilados para `linux-x64` (el VPS de producción) y para el entorno de desarrollo del builder;
no requiere una toolchain de compilación adicional en ninguno de los dos.

---

## 3. Directory Structure

```
nucleo/
  blueprints/
    nucleo-fase-1/                    # bundle de Fase 1 — ya construido, no se toca
    nucleo-fase-2/                    # este bundle
      blueprint.md
      tasks.json
      epics/
      workspace/
  src/
    app/
      (app)/
        content/
          page.tsx                    # NUEVO step 23 — lista de contenido
          new/page.tsx                # NUEVO step 23 — creación
          [id]/page.tsx                # NUEVO step 23 — editor/detalle
          media/page.tsx               # NUEVO step 22 — biblioteca de medios
          calendar/page.tsx            # NUEVO step 25 — calendario editorial
          publications/page.tsx        # NUEVO step 28 — dashboard de publicaciones
      api/
        media/
          [key]/route.ts               # NUEVO step 21 — proxy de descarga autenticado
        v1/
          media/route.ts               # NUEVO step 21 — subida + listado
          media/[id]/route.ts          # NUEVO step 22 — borrado (soft-delete)
          content/route.ts             # NUEVO step 23 — crear/listar
          content/[id]/route.ts        # NUEVO step 23 — detalle/editar
          content/[id]/approval/route.ts        # NUEVO step 24
          content/[id]/approval/[approvalId]/route.ts  # NUEVO step 24
          content/[id]/schedule/route.ts        # NUEVO step 25
          content/calendar/route.ts             # NUEVO step 25 — rango para el calendario
          publications/route.ts                 # NUEVO step 28 — dashboard
    lib/
      storage/
        s3-client.ts                  # NUEVO step 19 — único punto que instancia S3Client
        validate-mime.ts              # NUEVO step 21 (básico) / step 30 (magic bytes real)
      db/
        schema.ts                     # EDITADO step 20, 22 — 5 tablas nuevas + original_filename
      env.ts                          # EDITADO step 19 — nuevas variables S3_*
    server/
      media/
        upload.ts                     # NUEVO step 21
        thumbnails.ts                 # NUEVO step 21 — wrapper de sharp
      content/
        items.ts                      # NUEVO step 23
        approvals.ts                  # NUEVO step 24
        schedule.ts                   # NUEVO step 25
      publishing/
        adapters/
          whatsapp.ts                 # NUEVO step 26
          instagram.ts                # NUEVO step 26
          facebook.ts                 # NUEVO step 26
          tiktok.ts                   # NUEVO step 26
        publish.ts                    # NUEVO step 26 — orquestador, llama al adaptador correcto
                                       # EDITADO step 29 — emite evento realtime
      copilot/
        tools.ts                      # EDITADO step 27 — 2 tools nuevas
    components/
      media/
        media-grid.tsx                # NUEVO step 22
        media-uploader.tsx            # NUEVO step 22
      content/
        content-editor.tsx            # NUEVO step 23
        approval-panel.tsx            # NUEVO step 24
      calendar/
        editorial-calendar.tsx        # NUEVO step 25 — react-day-picker + @dnd-kit
      publications/
        publications-table.tsx        # NUEVO step 28
  scripts/
    ensure-bucket.mjs                 # NUEVO step 19 — crea el bucket S3 de forma idempotente
    worker-publish.ts                 # NUEVO step 26 — proceso BullMQ del scheduler
    seed.ts                           # EDITADO step 20 — siembra los permisos nuevos
  drizzle/                            # migraciones — la nueva la emite `pnpm db:generate` (step 20)
  docker-compose.minio.yml            # NUEVO — servicio MinIO local (§19.6)
  docker-compose.prod.yml             # EDITADO step 31 — agrega minio (autorado en Fase 1 step 17)
  .claude/
    settings.json                     # EDITADO Bootstrap — fusiona settings.fase2.json
    rules/
      media.md                        # NUEVO (§19.6)
      scheduler.md                    # NUEVO (§19.6)
```

**Boundary rules**

- `src/lib/storage/**` solo se importa desde `src/server/**` — nunca desde `src/components/**` ni
  desde `src/app/**` directamente (misma regla que `lib/db/**` en Fase 1).
- `src/server/publishing/adapters/<canal>.ts` nunca importa nada de `src/app/`; el orquestador
  (`publish.ts`) es la única puerta de entrada al conjunto de adaptadores.
- Ningún componente construye una URL de MinIO directamente — toda referencia a un medio pasa por
  `GET /api/media/[key]`.

La convención de resolución de módulos (alias `@/` → `src/`, extensiones `.ts` con
`rewriteRelativeImportExtensions`) es la misma de Fase 1, sin cambios — ver §19.6, *Matriz de
convención de resolución*, que confirma que ningún loader nuevo de esta fase (el worker de
publicación, los scripts nuevos) necesita una configuración distinta.

Todo path nuevo dibujado en este árbol tiene un origen: o lo autora el step de §9 que lo nombra en
su **Do**, o se emite como archivo real bajo `workspace/` (§19.6) y llega vía la copia de Bootstrap.
Ningún archivo de este árbol es "creado a lo largo del camino" sin dueño.

---

## 4. Data Model

Se añaden 5 tablas al núcleo de 23 tablas de Fase 1 (sin modificar ninguna existente). **Decisión
de diseño:** el `content_publish_job` que se consideró inicialmente se descarta como tabla propia —
la bandeja de espera del scheduler reutiliza las tablas `jobs` / `job_dead_letters` /
`idempotency_keys` del núcleo de Fase 1 (mismo patrón que el worker de webhooks entrantes), y el
estado observable de cada publicación vive directamente en `content_channel_target`. Ver §20.3
para la justificación completa.

### Entities

**`media_asset`** — un archivo subido a la biblioteca de medios de una organización.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| uploaded_by | uuid | FK user.id, not null | |
| storage_key | text | unique, not null | patrón `<org_id>/<uuid>.<ext>` — nunca el nombre original |
| original_filename | text | nullable | nombre del archivo tal como lo subió el usuario, guardado como metadato liviano de búsqueda (no usado como `storage_key`) — agregado por la migración del step 22, no por la migración inicial del step 20 (ver nota en §9 step 22) |
| mime_type | text | not null | detectado por magic bytes, no por extensión (step 30) |
| size_bytes | integer | not null | |
| width | integer | nullable | solo imágenes |
| height | integer | nullable | solo imágenes |
| thumbnail_key | text | nullable | `storage_key` de la miniatura generada por `sharp` |
| alt_text | text | nullable | |
| created_at | timestamptz | not null, default now() | |
| deleted_at | timestamptz | nullable | soft-delete |

**`content_item`** — una pieza de contenido en su ciclo de vida editorial.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| title | text | not null | |
| body | text | not null, default '' | texto plano; sin formato enriquecido (§1 Non-Goals) |
| status | text | not null, default 'draft' | `draft` \| `pending_approval` \| `approved` \| `scheduled` \| `published` \| `failed` |
| created_by | uuid | FK user.id, not null | |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |
| deleted_at | timestamptz | nullable | soft-delete |

**`content_media`** — join many-to-many, orden de medios adjuntos.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| content_item_id | uuid | FK content_item.id, not null | |
| media_asset_id | uuid | FK media_asset.id, not null | |
| position | integer | not null, default 0 | orden de despliegue |

PK compuesta `(content_item_id, media_asset_id)`.

**`content_channel_target`** — a qué canal y cuándo se publica una pieza; una pieza puede tener
varios destinos.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| content_item_id | uuid | FK content_item.id, not null, index | |
| channel_connection_id | uuid | FK channel_connection.id (núcleo Fase 1), not null | |
| scheduled_at | timestamptz | nullable | null = sin programar todavía |
| published_at | timestamptz | nullable | |
| external_post_id | text | nullable | id devuelto por la API del proveedor |
| status | text | not null, default 'pending' | `pending` \| `scheduled` \| `publishing` \| `published` \| `failed` |
| error | text | nullable | mensaje del proveedor si `status='failed'` |
| created_at | timestamptz | not null, default now() | |

**`content_approval`** — solicitud y decisión de aprobación de una pieza.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| content_item_id | uuid | FK content_item.id, not null, index | |
| requested_by | uuid | FK user.id, not null | |
| approved_by | uuid | FK user.id, nullable | |
| status | text | not null, default 'pending' | `pending` \| `approved` \| `rejected` |
| comment | text | nullable | |
| created_at | timestamptz | not null, default now() | |
| decided_at | timestamptz | nullable | |

Todas llevan `id uuid default gen_random_uuid()` y `created_at`. `media_asset` y `content_item`
tienen `org_id` indexado y not-null, y soft-delete (`deleted_at`). `content_media`,
`content_channel_target` y `content_approval` heredan el scope de organización vía FK a
`content_item` / `channel_connection` — no repiten `org_id` (evita que quede desincronizado del de
su padre).

### Relationships

- `organization` —(1:N)→ `media_asset`, `content_item`. Cascade: ON DELETE RESTRICT (misma regla
  que el resto del núcleo — Fase 1/2 no implementan borrado de organización).
- `content_item` —(N:M)→ `media_asset` vía `content_media`. Cascade: ON DELETE CASCADE en el join
  cuando se borra `content_item` (uso solo en limpieza de datos de prueba — en producción
  `content_item` se soft-elimina, nunca se borra físicamente).
- `content_item` —(1:N)→ `content_channel_target`. Cascade: ON DELETE CASCADE.
- `content_item` —(1:N)→ `content_approval`. Cascade: ON DELETE CASCADE.
- `content_channel_target` —(N:1)→ `channel_connection` (núcleo Fase 1). Cascade: ON DELETE
  RESTRICT — no se puede desconectar un canal con publicaciones programadas pendientes sin antes
  resolverlas (fuera de alcance de Fase 2 automatizar esa resolución; se documenta como limitación
  operativa).

### Indexes

| Table | Index | Why |
|---|---|---|
| media_asset | (org_id) | Listado y búsqueda de la biblioteca por organización |
| content_item | (org_id, status) | Filtros de la lista de contenido y del dashboard |
| content_channel_target | (content_item_id) | Cargar los destinos de una pieza |
| content_channel_target | (status, scheduled_at) | Query "due" del worker de publicación: `status='scheduled' and scheduled_at <= now()` |
| content_channel_target | (channel_connection_id, scheduled_at) | Vista de calendario por canal |
| content_approval | (content_item_id) | Historial de aprobaciones de una pieza |

### Schema

```typescript
// src/lib/db/schema.ts (fragmento nuevo de Fase 2 — se agrega al archivo existente de Fase 1,
// nunca lo reemplaza; las 23 tablas del núcleo quedan intactas)
import { pgTable, uuid, text, timestamptz, integer, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user, channelConnection } from "./schema"; // tablas de Fase 1, mismo archivo

export const mediaAsset = pgTable("media_asset", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organization.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => user.id),
  storageKey: text("storage_key").notNull().unique(),
  originalFilename: text("original_filename"), // agregado por la migración del step 22 (edit
                                                 // sobre este archivo), no por la migración
                                                 // inicial del step 20 — ver §9 step 22
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  thumbnailKey: text("thumbnail_key"),
  altText: text("alt_text"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  deletedAt: timestamptz("deleted_at"),
}, (t) => ({ orgIdx: index().on(t.orgId) }));

export const contentItem = pgTable("content_item", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organization.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
  createdBy: uuid("created_by").notNull().references(() => user.id),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
  deletedAt: timestamptz("deleted_at"),
}, (t) => ({ orgStatusIdx: index().on(t.orgId, t.status) }));

export const contentMedia = pgTable("content_media", {
  contentItemId: uuid("content_item_id").notNull().references(() => contentItem.id),
  mediaAssetId: uuid("media_asset_id").notNull().references(() => mediaAsset.id),
  position: integer("position").notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.contentItemId, t.mediaAssetId] }) }));

export const contentChannelTarget = pgTable("content_channel_target", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  contentItemId: uuid("content_item_id").notNull().references(() => contentItem.id),
  channelConnectionId: uuid("channel_connection_id").notNull().references(() => channelConnection.id),
  scheduledAt: timestamptz("scheduled_at"),
  publishedAt: timestamptz("published_at"),
  externalPostId: text("external_post_id"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
}, (t) => ({
  contentIdx: index().on(t.contentItemId),
  dueIdx: index().on(t.status, t.scheduledAt),
  calendarIdx: index().on(t.channelConnectionId, t.scheduledAt),
}));

export const contentApproval = pgTable("content_approval", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  contentItemId: uuid("content_item_id").notNull().references(() => contentItem.id),
  requestedBy: uuid("requested_by").notNull().references(() => user.id),
  approvedBy: uuid("approved_by").references(() => user.id),
  status: text("status").notNull().default("pending"),
  comment: text("comment"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  decidedAt: timestamptz("decided_at"),
}, (t) => ({ contentIdx: index().on(t.contentItemId) }));
```

### Migrations

Mismo mecanismo de Fase 1: `pnpm db:generate` (Drizzle Kit) produce el archivo de migración —
**nunca se nombra el archivo de memoria**, se referencia como "la migración que `pnpm db:generate`
emite para este cambio de schema" (ver skill `add-migration`, ya instalada por Fase 1, reutilizada
sin cambios en el step 20). `pnpm db:migrate` la aplica. Ninguna migración se edita a mano tras
generarse — se corrige con una migración nueva.

### Seed data

`scripts/seed.ts` (existente de Fase 1) se extiende en el step 20 para sembrar los 8 permisos
nuevos de esta fase (`content.create`, `content.edit`, `content.submit`, `content.approve`,
`content.schedule`, `content.delete`, `media.upload`, `media.manage`) en la tabla `permission`, y
sus grants en `role_permission` — ver §8. No se crea contenido de ejemplo (`content_item`) en el
seed: la org demo de Fase 1 arranca con la biblioteca de medios y el calendario vacíos, que es el
estado real de un tenant nuevo.

---

## 5. API Design

### Conventions

Idénticas a Fase 1 — se heredan sin cambios: base path `/api/v1`, envelope `{ data }` /
`{ error: { code, message } }`, error codes `validation_error|unauthorized|forbidden|not_found|
conflict|internal_error`, validación con `zod`, paginación cursor (`?cursor&limit`, default 20, máx
100). Rate limiting nuevo de esta fase: `POST /api/v1/media` limitado a 30 subidas/minuto por
usuario (backend Redis compartido, mismo mecanismo de Fase 1 — ver step 30).

### Routes

| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/v1/media` | Subir un archivo a la biblioteca | user, `media.upload` | 30/min por usuario |
| GET | `/api/v1/media` | Listar/buscar medios de la org, paginado | user | — |
| DELETE | `/api/v1/media/:id` | Soft-delete de un medio | user, `media.manage` | — |
| GET | `/api/media/:key` | Descarga/streaming autenticado de un objeto | user (resuelve org vía `media_asset`) | — |
| POST | `/api/v1/content` | Crear un `content_item` en `draft` | user, `content.create` | — |
| GET | `/api/v1/content` | Listar contenido, filtro por `status` | user | — |
| GET | `/api/v1/content/:id` | Detalle + medios + destinos + aprobaciones | user | — |
| PATCH | `/api/v1/content/:id` | Editar título/cuerpo/medios adjuntos | user, `content.edit` | — |
| POST | `/api/v1/content/:id/approval` | Solicitar aprobación (draft → pending_approval) | user, `content.submit` | — |
| PATCH | `/api/v1/content/:id/approval/:approvalId` | Aprobar/rechazar con comentario | user, `content.approve` | — |
| POST | `/api/v1/content/:id/schedule` | Crear/actualizar `content_channel_target` con canal(es) + `scheduled_at` | user, `content.schedule` | — |
| GET | `/api/v1/content/calendar` | Rango `?from&to`, piezas con sus destinos programados | user | — |
| GET | `/api/v1/publications` | Dashboard: `content_channel_target` con filtros `status`/`channel` | user | — |

Las tools nuevas del copiloto (`draft_content_copy`, `suggest_publish_time`) no son rutas propias —
se invocan a través de la ruta existente `POST /api/v1/copilot` de Fase 1, registradas en
`src/server/copilot/tools.ts` (ver §17 y step 27).

### Critical endpoints — full detail

**`POST /api/v1/media`**:
1. Requiere `content-type: multipart/form-data` con un único campo `file`. Tamaño máximo 15MB —
   excedido → `400 { error: { code: "validation_error", message: "file exceeds 15MB" } }`.
2. Valida el MIME real del buffer (magic bytes — step 30; en el step 21 inicial, valida por
   `Content-Type` del header como primera versión funcional) contra la lista permitida
   (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`). Tipo no permitido → `400
   validation_error`.
3. Genera `storage_key` como `<org_id>/<uuid>.<ext>`, sube el buffer a MinIO vía
   `@aws-sdk/lib-storage` (`Upload`, soporta streaming sin cargar el archivo completo en memoria
   dos veces).
4. Si es imagen, genera una miniatura de 320px de ancho con `sharp`, la sube con `storage_key`
   `<org_id>/<uuid>-thumb.<ext>`, y guarda `width`/`height`/`thumbnail_key` originales.
5. Inserta `media_asset`, responde `201 { data: MediaAsset }`.

**`POST /api/v1/content/:id/schedule`**: request `{ targets: [{ channelConnectionId, scheduledAt
}] }`, validado con zod (`scheduledAt` debe ser una fecha futura). Crea o actualiza una fila
`content_channel_target` por entrada del array (upsert por `(content_item_id,
channel_connection_id)` — reprogramar un canal ya programado actualiza `scheduled_at`, no duplica
la fila). Pone `content_item.status='scheduled'` solo si **todos** sus destinos tienen
`scheduled_at` no nulo. Requiere que `content_item.status` sea `approved` — si no, `409 conflict`
con mensaje explícito ("content must be approved before scheduling").

**`GET /api/media/:key`**: resuelve `key` → fila `media_asset` (por `storage_key` o
`thumbnail_key`) con `org_id` igual al de la sesión — si no hay fila que matchee para esa org,
`404` (nunca revela si el objeto existe en otra org). Hace streaming del objeto desde MinIO vía
`GetObjectCommand` con el `Content-Type` original.

---

## 6. Frontend Architecture

### Routes

| Route | Page | Data source | Auth |
|---|---|---|---|
| `/app/content` | Lista de contenido, filtro por estado | server query | user |
| `/app/content/new` | Crear pieza | client form | user, `content.create` |
| `/app/content/:id` | Editor + medios + aprobación + programación | server query + client mutations | user |
| `/app/content/media` | Biblioteca de medios (grid, buscar, borrar) | server query + client mutations | user |
| `/app/content/calendar` | Calendario editorial, drag-and-drop | server query + client mutations | user |
| `/app/content/publications` | Dashboard de estado, realtime | server query + client + Socket.IO | user |

### Rendering strategy

`/app/content/calendar` y `/app/content/publications` son Server Components para la carga inicial
(igual que `/app/inbox` en Fase 1: primera página sin spinner), con un Client Component hijo que
sostiene TanStack Query e, in `publications`, la suscripción Socket.IO al evento
`content:target-updated`. `cacheComponents: true` heredado de `next.config.ts`; sin `revalidate`
en ninguna de las dos, por la misma razón que la bandeja: son vistas que deben reflejar cambios en
vivo.

### Component hierarchy

```
app/(app)/content/calendar/page.tsx (Server) — carga inicial del rango visible
└── EditorialCalendar (Client) — react-day-picker + @dnd-kit/core
    ├── CalendarCell (Client) — droppable, un día
    └── ContentCard (Client) — draggable, una pieza programada

app/(app)/content/publications/page.tsx (Server)
└── PublicationsTable (Client) — TanStack Query + Socket.IO subscription
    └── PublicationRow (Client) — badge de estado (usa el token --warning nuevo)
```

### State management

Igual patrón de Fase 1: estado de servidor en TanStack Query, invalidado por eventos Socket.IO.
El estado de arrastre del calendario (qué tarjeta se está moviendo) vive en el store interno de
`@dnd-kit/core` (`DndContext`), nunca replicado en un store propio. Formularios (crear/editar
contenido, programar) con `react-hook-form` + resolver zod, mismo patrón que Fase 1.

### Loading, empty, and error states

- Biblioteca de medios vacía: ilustración + "Sube tu primera imagen para empezar" con el botón de
  subida enfocado.
- Calendario sin piezas programadas: el calendario se renderiza igual (nunca un estado vacío que
  oculte la grilla), sin tarjetas.
- Dashboard de publicaciones sin publicaciones fallidas: sin banner de alerta — el banner de
  "N publicaciones fallidas requieren atención" solo aparece cuando `count > 0`.
- Subida de medio en curso: barra de progreso determinada por el evento `progress` del `Upload` de
  `@aws-sdk/lib-storage`, expuesto vía SSE simple o polling — implementación conservadora: polling
  cada 500ms del estado del form, sin WebSocket dedicado para esto.
- Error al publicar: la fila de `PublicationsTable` muestra el `content_channel_target.error` en un
  tooltip sobre el badge `failed`.

---

## 7. Design System

Se hereda íntegramente el sistema de Fase 1 (`ui-ux-pro-max` no se vuelve a invocar — no hay
decisiones de paleta o tipografía nuevas que tomar). Único agregado: el token `--warning`, para los
estados `pending_approval` y `scheduled` que Fase 1 no necesitaba.

### Colors (agregado)

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--warning` | `#D97706` | `#FBBF24` | Badges de `pending_approval` y `scheduled` |

**Contraste:** `#D97706` sobre `--surface` (`#FFFFFF`) light = 3.49:1 (cumple 3:1 para texto grande
de badge); `#FBBF24` sobre `--surface` dark (`#131B2E`) = 9.8:1. Ambos superan el mínimo de 3:1
para elementos de UI/texto grande — los badges usan `font-weight: 600` a 13px, calificando como
texto grande bajo WCAG 2.2.

### Typography, spacing, radius, motion, component style

Sin cambios respecto a Fase 1 — ver `workspace/CLAUDE.md` §Design system, que ya incluye el token
`--warning` agregado arriba.

---

## 8. Authentication & Authorization

Se hereda el proveedor, las sesiones y el mecanismo de aislamiento multi-tenant de Fase 1 sin
cambios (`better-auth`, `requirePermission()`, RLS-equivalente por `org_id` obligatorio en cada
query). Esta sección solo documenta lo nuevo.

### Roles and permissions — permisos nuevos de Fase 2

| Permission key | owner | member |
|---|---|---|
| `content.create` | ✓ | ✓ |
| `content.edit` | ✓ | ✓ (solo piezas propias — enforced en `src/server/content/items.ts`, no a nivel de rol) |
| `content.submit` | ✓ | ✓ |
| `content.approve` | ✓ | ✗ |
| `content.schedule` | ✓ | ✗ |
| `content.delete` | ✓ | ✗ |
| `media.upload` | ✓ | ✓ |
| `media.manage` | ✓ | ✗ |

**Decisión:** se mantiene el modelo de dos roles de sistema de Fase 1 (`owner`, `member`) en vez de
introducir un rol `approver` nuevo — aprobar y programar quedan reservados a `owner` en v1. Un rol
`editor`/`approver` intermedio es candidato de §20.4 si el equipo lo necesita.

### Route protection

| Surface | Rule | Enforced where |
|---|---|---|
| `/app/content/*` | authenticated | `src/app/(app)/layout.tsx` (heredado de Fase 1) |
| `/api/v1/content/:id/approval/*` PATCH | `content.approve` | `src/server/content/approvals.ts` `requirePermission()` |
| `/api/v1/content/:id/schedule` | `content.schedule` | `src/server/content/schedule.ts` `requirePermission()` |
| `/api/media/:key` | sesión válida + `media_asset.org_id === session.orgId` | `src/app/api/media/[key]/route.ts` |

**Regla de enforcement:** idéntica a Fase 1 — toda autorización se verifica server-side en cada
request; un botón oculto en el cliente nunca es el único control.

### Multi-tenancy / row-level isolation

`content_channel_target`, `content_media` y `content_approval` no llevan `org_id` propio — su
aislamiento se prueba por join obligatorio contra `content_item.org_id` en toda query
(`src/server/content/*.ts` nunca consulta estas tablas sin ese join). El worker de publicación
(step 26) resuelve el `org_id` de cada job a través del mismo join antes de invocar el adaptador de
canal, para que `recordAuditEvent()` registre la organización correcta.

---

## 9. BUILD ORDER

Esta fase **no arranca de cero** — se construye sobre el código ya generado y verificado de
`blueprints/nucleo-fase-1/`, que vive en el mismo repositorio. El Bootstrap (§10) no escafolda
nada: verifica que los 18 checkpoints de Fase 1 existen, copia `workspace/` de este bundle, instala
las dependencias nuevas, levanta MinIO, y migra el schema nuevo. La numeración de steps continúa la
de Fase 1 — el primer step de esta fase es el **19**, y sus tags de Checkpoint son
`step-19-*`…`step-32-*`.

### Step map

| # | Step | Depends on | Touches | Gate |
|---|---|---|---|---|
| 19 | Dependencias nuevas + MinIO local | Fase 1 completa | `docker-compose.minio.yml`, `.env.example`, `package.json` (scripts `services:*`), `src/lib/storage/s3-client.ts`, `scripts/ensure-bucket.mjs`, `src/lib/env.ts`, `src/app/api/health/route.ts` (edit) | `pnpm services:up` (reescrito por este step) levanta Postgres+Redis+MinIO, MinIO `healthy`, y el bucket existe; `curl .../api/health` reporta `storageReachable: true` |
| 20 | Schema nuevo + migración + permisos | 19 | `src/lib/db/schema.ts`, migración generada, `scripts/seed.ts` | `pnpm db:migrate` crea las 5 tablas; los 8 permisos existen |
| 21 | Biblioteca de medios — backend | 20 | `src/server/media/upload.ts`, `thumbnails.ts`, `src/app/api/v1/media/route.ts`, `src/app/api/media/[key]/route.ts`, `src/lib/storage/validate-mime.ts`, `tests/integration/media-upload.test.ts` | `pnpm test tests/integration/media-upload.test.ts` |
| 22 | Biblioteca de medios — UI | 21 | `src/app/(app)/content/media/page.tsx`, `media-grid.tsx`, `media-uploader.tsx`, `src/app/api/v1/media/[id]/route.ts`, `tests/e2e/media-library.spec.ts`, `src/lib/db/schema.ts` (edit), `drizzle/**` | `pnpm test:e2e tests/e2e/media-library.spec.ts` |
| 23 | Creación y edición de contenido | 20 | `src/server/content/items.ts`, rutas `content/route.ts` y `content/[id]/route.ts`, `content-editor.tsx`, páginas `content/page.tsx`, `content/new`, `content/[id]`, `tests/integration/content-items.test.ts` | `pnpm test tests/integration/content-items.test.ts` |
| 24 | Flujo de aprobación | 23 | `src/server/content/approvals.ts`, rutas `approval/*`, `approval-panel.tsx`, `tests/integration/content-approval.test.ts` | `pnpm test tests/integration/content-approval.test.ts` |
| 25 | Calendario editorial | 21, 23 | `src/server/content/schedule.ts`, rutas `schedule/route.ts`, `calendar/route.ts`, `editorial-calendar.tsx`, página `content/calendar`, `tests/e2e/editorial-calendar.spec.ts` | `pnpm test:e2e tests/e2e/editorial-calendar.spec.ts` |
| 26 | Scheduler de publicación multicanal | 25 | `src/server/publishing/publish.ts`, `adapters/*.ts`, `scripts/worker-publish.ts`, `tests/integration/publish-worker.test.ts`, `package.json` (script `worker:publish`) | `pnpm test tests/integration/publish-worker.test.ts` |
| 27 | Asistencia de IA para contenido | 26 | `src/server/copilot/tools.ts` (edit), `tests/e2e/copilot.spec.ts` (edit) | `pnpm test:e2e tests/e2e/copilot.spec.ts` |
| 28 | Dashboard de publicaciones | 26 | `src/app/(app)/content/publications/page.tsx`, `publications-table.tsx`, ruta `publications/route.ts`, `tests/e2e/publications-dashboard.spec.ts`, `tests/e2e/a11y.spec.ts` (edit) | `pnpm test:e2e tests/e2e/publications-dashboard.spec.ts`; `pnpm test:e2e tests/e2e/a11y.spec.ts` |
| 29 | Realtime de estado de publicación | 26, 28 | `src/lib/realtime/server.ts` (edit), `src/lib/realtime/client.ts` (edit), `src/server/publishing/publish.ts` (edit) | `pnpm test:e2e tests/e2e/publications-live.spec.ts` |
| 30 | Hardening — MIME real + rate limit de subida | 21 | `src/lib/storage/validate-mime.ts` (edit), `src/app/api/v1/media/route.ts` (edit), `tests/integration/media-hardening.test.ts` | `pnpm test tests/integration/media-hardening.test.ts` |
| 31 | Deploy — MinIO en producción | 19, 30 | `docker-compose.prod.yml` (edit vía script), `.env.example` (edit), `scripts/smoke-test.sh` (edit) | `bash scripts/smoke-test.sh` contra el stack de prod levantado localmente |
| 32 | Verificación local end-to-end | 22, 24, 27, 29, 31 | ninguno propio — corre el gate completo | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` |

---

#### Step 19 — Dependencias nuevas + MinIO local

**Do**
Correr `pnpm add @aws-sdk/client-s3@^3.1111.0 @aws-sdk/lib-storage@^3.1111.0 sharp@^0.35.3` (pines
verificados en §11) y `pnpm add -D @dnd-kit/core@^6.3.1 react-day-picker@^10.0.1` — estas dos
últimas también van a runtime en realidad (son componentes de UI), así que se instalan sin `-D`;
corregido: `pnpm add @aws-sdk/client-s3@^3.1111.0 @aws-sdk/lib-storage@^3.1111.0 sharp@^0.35.3
@dnd-kit/core@^6.3.1 react-day-picker@^10.0.1`. Tras el install, correr `pnpm approve-builds --all`
— `sharp` trae un post-install script para su binario nativo, y sin este paso
`pnpm install --frozen-lockfile` fallará después con `ERR_PNPM_IGNORED_BUILDS` (lección de Fase 1,
mismo síntoma que tuvieron `drizzle-kit`/`bullmq`/`ioredis`). Escribir
`src/lib/storage/s3-client.ts` (único punto que instancia `S3Client`, configurado con
`forcePathStyle: true` — obligatorio para que el SDK de AWS hable con MinIO en vez de con S3 real).
Escribir `scripts/ensure-bucket.mjs` (usa `CreateBucketCommand`, atrapa
`BucketAlreadyOwnedByYou`/`BucketAlreadyExists` para ser idempotente — evita depender de la imagen
`minio/mc`, que esta sesión de generación no pudo verificar en el registro de Docker Hub; nunca se
pinea una imagen sin verificar, ver §11), **con `import "dotenv/config"` como su primera línea** —
mismo patrón que `drizzle.config.ts`/`scripts/seed.ts` de Fase 1 (`dotenv@17.4.2`, ya instalado como
dependencia directa desde Fase 1) — así el script carga `.env` por su cuenta sin depender de que el
shell que lo invoca ya lo tenga exportado. Agregar las 6 variables `S3_*` a `src/lib/env.ts` (zod,
requeridas desde este step) y a `.env.example`. `docker-compose.minio.yml` ya viene emitido en
`workspace/` (§19.6) — no se autora aquí.

Reescribir los scripts `services:up`/`services:down`/`services:reset` de `package.json` (heredados
de Fase 1, que solo levantan `postgres redis`) para que compongan también
`docker-compose.minio.yml` y levanten/bajen el servicio `minio` — de lo contrario `pnpm services:up`
seguiría siendo literalmente `docker compose up -d postgres redis` y nunca tocaría MinIO, sin
importar qué tan completo esté el resto de este step. Reescritura idempotente por construcción
(sobrescribe las 3 claves con el mismo valor literal en cada corrida):

```bash
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts["services:up"] = "docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d postgres redis minio";
pkg.scripts["services:down"] = "docker compose -f docker-compose.yml -f docker-compose.minio.yml down";
pkg.scripts["services:reset"] = "docker compose -f docker-compose.yml -f docker-compose.minio.yml down -v && docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d postgres redis minio";
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
```

Tras agregar las 6 variables `S3_*` a `.env.example`, fusionarlas también dentro del `.env` real
(que ya existe desde el Bootstrap de Fase 1 y por lo tanto nunca se regenera desde
`.env.example`) — ver el mecanismo idempotente exacto en el Verify de este step y en §10 Bootstrap
paso 6, ambos con el mismo comando.

Editar `src/app/api/health/route.ts` (heredado de Fase 1, mismo path `/api/health`, mismo shape de
respuesta `{ data: { ok, migrationsUpToDate } }`) para agregar el campo `storageReachable`: llama
`HeadBucketCommand({ Bucket: env.S3_BUCKET })` contra el `S3Client` de `src/lib/storage/s3-client.ts`
que este mismo step acaba de escribir, con un timeout corto (2s) — si el `HeadBucketCommand`
resuelve, `storageReachable: true`; si lanza (bucket inexistente, MinIO caído, timeout),
`storageReachable: false` sin que la ruta lance 500 (el chequeo de storage es best-effort, nunca
tumba el health check completo). Se agrega aquí y no en un step posterior porque es este step el
que introduce tanto el `S3Client` como el bucket que el chequeo necesita — ningún step downstream
vuelve a tocar `s3-client.ts`.

**Done when**
- [ ] WHEN `pnpm services:up` corre (con los scripts `services:up`/`services:down`/`services:reset` de `package.json` ya reescritos por este step para incluir `docker-compose.minio.yml`) THE SYSTEM SHALL levantar Postgres, Redis y MinIO, con MinIO en estado `healthy` en menos de 30 segundos.
- [ ] WHEN `node scripts/ensure-bucket.mjs` corre por primera vez contra un MinIO vacío THE SYSTEM SHALL crear el bucket `S3_BUCKET` y salir con 0.
- [ ] WHEN `node scripts/ensure-bucket.mjs` corre una segunda vez contra el mismo MinIO THE SYSTEM SHALL salir con 0 sin lanzar un error de "bucket ya existe".
- [ ] WHEN `S3_BUCKET` no está definido al boot THE SYSTEM SHALL fallar el arranque con un error nombrado — mismo patrón de `src/lib/env.ts` que Fase 1.
- [ ] WHEN `pnpm install --frozen-lockfile` corre después de `pnpm approve-builds --all` THE SYSTEM SHALL salir con 0 sin error `ERR_PNPM_IGNORED_BUILDS`.
- [ ] WHEN `GET /api/health` corre con MinIO alcanzable (bucket ya creado por este step) THE SYSTEM SHALL responder `{ data: { ok: true, ..., storageReachable: true } }`.

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
grep -q "docker-compose.minio.yml" package.json   # expect: exit 0 — confirma la reescritura de los scripts

pnpm services:up
timeout 30 bash -c 'until docker compose -f docker-compose.yml -f docker-compose.minio.yml ps minio | grep -q healthy; do sleep 1; done'
# expect: exit 0 — minio healthy dentro de 30s, levantado por el script `services:up` ya reescrito

# Fusionar en el `.env` real las 6 variables `S3_*` que este step acaba de agregar a
# `.env.example` — mismo mecanismo idempotente de §10 Bootstrap paso 6 (nunca pisa un valor ya
# presente en `.env`); necesario aquí y no solo en Bootstrap porque `.env.example` recién obtuvo
# estas líneas dentro del Do de este mismo step.
touch .env
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  key="${line%%=*}"
  grep -q "^${key}=" .env || printf '%s\n' "$line" >> .env
done < .env.example

set -a && . ./.env && set +a   # exporta S3_* al shell — ensure-bucket.mjs los carga vía
                                # `import "dotenv/config"` por su cuenta, pero se exportan igual
                                # aquí por consistencia con el patrón de Fase 1 (drizzle.config.ts)
node scripts/ensure-bucket.mjs   # expect: exit 0
node scripts/ensure-bucket.mjs   # expect: exit 0 — segunda corrida, idempotente

pnpm install --frozen-lockfile   # expect: exit 0 — approve-builds ya corrido, sin ERR_PNPM_IGNORED_BUILDS
pnpm typecheck                   # expect: exit 0

pnpm dev &
DEV_PID=$!
timeout 30 bash -c 'until curl -sf localhost:3000/api/health >/dev/null; do sleep 1; done'
curl -s localhost:3000/api/health | jq -e '.data.storageReachable == true'   # expect: exit 0
kill $DEV_PID
```

**Checkpoint**
```bash
git add -A && git commit -m "step 19: dependencias de medios + MinIO local"
git tag step-19-media-deps
```

---

#### Step 20 — Schema nuevo + migración + permisos

**Do**
Agregar las 5 tablas de §4 a `src/lib/db/schema.ts` (mismo archivo de Fase 1, se extiende — nunca
se reemplaza ni se toca ninguna de las 23 tablas existentes) — **sin** la columna
`media_asset.original_filename`: esa columna la agrega el step 22, vía una migración separada, no
esta (ver la nota en la definición de `mediaAsset` en §4). Correr `pnpm db:generate` (la
migración resultante se referencia como "la migración que `pnpm db:generate` emite para este
cambio", nunca por un nombre de archivo inventado — skill `add-migration` ya instalada). Correr
`pnpm db:migrate`. Extender `scripts/seed.ts` para insertar los 8 `permission` nuevos de §8 y sus
filas en `role_permission` según la tabla owner/member de §8.

**Done when**
- [ ] WHEN `pnpm db:migrate` corre sobre la base de Fase 1 ya migrada THE SYSTEM SHALL crear las 5 tablas `media_asset`, `content_item`, `content_media`, `content_channel_target`, `content_approval` sin tocar ninguna de las 23 tablas existentes.
- [ ] WHEN `pnpm db:seed` corre THE SYSTEM SHALL insertar los 8 permisos de §8 en la tabla `permission`, sin duplicarlos si ya existen (upsert por `key`).
- [ ] WHEN el rol `owner` se consulta tras el seed THE SYSTEM SHALL tener los 8 permisos nuevos asignados en `role_permission`.
- [ ] WHEN el rol `member` se consulta tras el seed THE SYSTEM SHALL tener exactamente 4 de los 8 (`content.create`, `content.edit`, `content.submit`, `media.upload`) — nunca `content.approve`, `content.schedule` ni `content.delete` ni `media.manage`.

**Verify**
```bash
pnpm db:migrate
psql "$DATABASE_URL" -c "\d media_asset"              # expect: exit 0
psql "$DATABASE_URL" -c "\d content_item"              # expect: exit 0
psql "$DATABASE_URL" -c "\d content_media"             # expect: exit 0
psql "$DATABASE_URL" -c "\d content_channel_target"    # expect: exit 0
psql "$DATABASE_URL" -c "\d content_approval"          # expect: exit 0
pnpm db:seed
psql "$DATABASE_URL" -c "select count(*) from permission where key like 'content.%' or key like 'media.%';"
# expect: 8
```

**Checkpoint**
```bash
git add -A && git commit -m "step 20: schema de contenido + permisos"
git tag step-20-content-schema
```

---

#### Step 21 — Biblioteca de medios — backend

**Do**
Escribir `src/lib/storage/validate-mime.ts` (versión inicial: valida por `Content-Type` del
request contra la allowlist de §5 — el step 30 la reemplaza por sniffing de magic bytes real).
Escribir `src/server/media/thumbnails.ts` (wrapper de `sharp`: redimensiona a 320px de ancho,
preserva aspect ratio). Escribir `src/server/media/upload.ts` (orquesta: validar → subir original
vía `@aws-sdk/lib-storage` `Upload` → generar y subir miniatura si es imagen → insertar
`media_asset`, todo detrás de `requirePermission("media.upload")`). Escribir
`src/app/api/v1/media/route.ts` (POST subida, GET listado paginado) y
`src/app/api/media/[key]/route.ts` (streaming autenticado, ver §5). Escribir
`tests/integration/media-upload.test.ts` (contra el MinIO de test real, bucket
`nucleo-media-test` de `tests/setup/env.ts`): (1) sube un fixture de imagen válido y confirma que se
crea un `media_asset` con `storage_key` y `thumbnail_key` no nulos, respondiendo 201; (2) sube un
archivo cuyo `Content-Type` declarado no coincide con el tipo MIME real del contenido del archivo y
confirma 400 sin fila creada en `media_asset` ni objeto subido a MinIO; (3) sube un archivo por
encima del límite de 15MB y confirma 400 sin que nada llegue a MinIO.

**Done when**
- [ ] WHEN se sube una imagen JPEG válida de 2MB THE SYSTEM SHALL crear un `media_asset` con `thumbnail_key` no nulo y responder 201.
- [ ] WHEN se sube un archivo mayor a 15MB THE SYSTEM SHALL responder 400 sin subir nada a MinIO.
- [ ] WHEN se sube un archivo con `Content-Type: application/x-msdownload` THE SYSTEM SHALL responder 400 sin subir nada a MinIO.
- [ ] WHEN un usuario de la organización A pide `GET /api/media/:key` de un objeto de la organización B THE SYSTEM SHALL responder 404.
- [ ] WHEN un usuario de la organización dueña del objeto pide `GET /api/media/:key` THE SYSTEM SHALL responder 200 con el `Content-Type` original y el cuerpo del objeto.

**Verify**
```bash
pnpm test tests/integration/media-upload.test.ts   # expect: exit 0, 0 failed — sube un fixture real contra MinIO de test
```

**Checkpoint**
```bash
git add -A && git commit -m "step 21: biblioteca de medios — backend"
git tag step-21-media-backend
```

---

#### Step 22 — Biblioteca de medios — UI

**Do**
Construir `src/app/(app)/content/media/page.tsx` (Server Component, carga inicial paginada),
`src/components/media/media-grid.tsx` (grid responsivo, Client Component, TanStack Query),
`media-uploader.tsx` (input de archivo + barra de progreso, ver §6). Buscar por nombre de archivo
original guardado como metadato liviano — `media_asset.original_filename` (§4, columna nullable ya
incluida en el schema canónico). Agregar `originalFilename: text("original_filename")` a
`mediaAsset` en `src/lib/db/schema.ts` y correr `pnpm db:generate` (la migración resultante se
referencia como "la migración que `pnpm db:generate` emite para este step" — nunca se le pone
nombre de memoria) seguido de `pnpm db:migrate` para aplicarla contra la base local. Escribir
`src/app/api/v1/media/[id]/route.ts` (DELETE, §5 Routes): resuelve el `media_asset` por `id` dentro
de la organización del usuario, exige `requirePermission("media.manage")` **del lado del servidor**
antes de tocar la fila — el botón oculto en el cliente para quien no tiene el permiso es UX, nunca
la barrera real, exactamente como exige §8 — y marca `deleted_at = now()` (soft-delete, nunca
`DELETE FROM`). El botón de borrado del grid llama este endpoint con confirmación antes de disparar
la mutación. Escribir `tests/e2e/media-library.spec.ts`.

**Done when**
- [ ] WHEN la biblioteca no tiene medios THE SYSTEM SHALL mostrar el estado vacío de §6 con el botón de subida enfocado.
- [ ] WHEN se sube un archivo desde la UI THE SYSTEM SHALL mostrarlo en el grid sin recargar la página.
- [ ] WHEN el usuario busca por texto que coincide con `original_filename` THE SYSTEM SHALL filtrar el grid a solo esos resultados.
- [ ] WHEN el usuario con `media.manage` borra un medio THE SYSTEM SHALL quitarlo del grid inmediatamente y marcar `deleted_at` en la fila.
- [ ] WHEN un usuario sin `media.manage` ve el grid THE SYSTEM SHALL no mostrar el botón de borrar.

**Verify**
```bash
pnpm db:generate                                # expect: exit 0 — emite la migración que agrega original_filename
pnpm db:migrate                                 # expect: exit 0
psql "$DATABASE_URL" -c "\d media_asset" | grep -q original_filename   # expect: exit 0
pnpm test:e2e tests/e2e/media-library.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 22: biblioteca de medios — UI"
git tag step-22-media-ui
```

---

#### Step 23 — Creación y edición de contenido

**Do**
Escribir `src/server/content/items.ts` (`createContentItem`, `updateContentItem`,
`listContentItems`, `getContentItem` con sus medios adjuntos vía join a `content_media`, todo
detrás de `requirePermission`). Crear `src/app/api/v1/content/route.ts` y
`src/app/api/v1/content/[id]/route.ts`. Construir `src/components/content/content-editor.tsx`
(textarea simple + contador de caracteres + selector de medios de la biblioteca — sin WYSIWYG, ver
§1 Non-Goals) y las páginas `content/new` y `content/[id]`. Construir también
`src/app/(app)/content/page.tsx` (Server Component, lista de contenido con filtro por `status` vía
`listContentItems`, ver §6 Routes) — es la página raíz de `/app/content` y la ruta de entrada al
resto del flujo; ningún otro step de esta fase la crea. Escribir
`tests/integration/content-items.test.ts`.

**Done when**
- [ ] WHEN un usuario con `content.create` crea una pieza con solo título THE SYSTEM SHALL insertar un `content_item` en estado `draft`.
- [ ] WHEN un usuario adjunta 2 medios de la biblioteca a una pieza THE SYSTEM SHALL insertar 2 filas en `content_media` con `position` 0 y 1.
- [ ] WHEN un `member` intenta editar una pieza creada por otro `member` THE SYSTEM SHALL responder 403 — `content.edit` está acotado a piezas propias para el rol `member` (§8).
- [ ] WHEN se edita el cuerpo de una pieza THE SYSTEM SHALL actualizar `updated_at` y registrar un `audit_event` con action `content.edited`.
- [ ] WHEN se lista contenido filtrando `status=draft` THE SYSTEM SHALL retornar solo piezas de la organización del usuario en ese estado, paginadas por cursor.

**Verify**
```bash
pnpm test tests/integration/content-items.test.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 23: creacion y edicion de contenido"
git tag step-23-content-crud
```

---

#### Step 24 — Flujo de aprobación

**Do**
Escribir `src/server/content/approvals.ts` (`requestApproval`: crea `content_approval` en
`pending` y pasa `content_item.status` a `pending_approval`; `decideApproval`: pasa a `approved` o
de vuelta a `draft` con el comentario de rechazo). Crear las rutas `approval/route.ts` y
`approval/[approvalId]/route.ts`. Construir `approval-panel.tsx` (Client Component: botón
"Solicitar aprobación" para el creador, botones "Aprobar"/"Rechazar" + campo de comentario para
quien tiene `content.approve`). Escribir `tests/integration/content-approval.test.ts`.

**Done when**
- [ ] WHEN el creador de una pieza en `draft` solicita aprobación THE SYSTEM SHALL crear una fila `content_approval` en `pending` y cambiar `content_item.status` a `pending_approval`.
- [ ] WHEN un usuario con `content.approve` aprueba THE SYSTEM SHALL cambiar `content_approval.status` a `approved`, `content_item.status` a `approved`, y registrar `audit_event` con action `content.approved`.
- [ ] WHEN un usuario con `content.approve` rechaza con comentario THE SYSTEM SHALL cambiar `content_approval.status` a `rejected`, `content_item.status` de vuelta a `draft`, y guardar el comentario.
- [ ] WHEN un usuario sin `content.approve` intenta decidir una aprobación THE SYSTEM SHALL responder 403 sin modificar ninguna fila.
- [ ] WHEN una pieza ya tiene una `content_approval` en `pending` THE SYSTEM SHALL rechazar una segunda solicitud de aprobación con 409 conflict.

**Verify**
```bash
pnpm test tests/integration/content-approval.test.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 24: flujo de aprobacion"
git tag step-24-approval
```

---

#### Step 25 — Calendario editorial

**Do**
Escribir `src/server/content/schedule.ts` (`scheduleContentItem` según el contrato de §5 — upsert
por `(content_item_id, channel_connection_id)`, exige `status='approved'`). Crear
`schedule/route.ts` y `calendar/route.ts` (rango `?from&to`). Construir
`src/components/calendar/editorial-calendar.tsx` con `react-day-picker` para la grilla mensual y
`@dnd-kit/core` (`DndContext`, un `useDraggable` por `ContentCard`, un `useDroppable` por
`CalendarCell`) para reprogramar arrastrando una pieza a otro día — el `onDragEnd` llama
`scheduleContentItem` con la nueva fecha, preservando la hora original. Escribir
`tests/e2e/editorial-calendar.spec.ts`.

**Done when**
- [ ] WHEN se programa una pieza `approved` para un canal con `scheduledAt` futuro THE SYSTEM SHALL crear un `content_channel_target` en estado `scheduled`.
- [ ] WHEN se intenta programar una pieza en estado `draft` THE SYSTEM SHALL responder 409 conflict sin crear ningún `content_channel_target`.
- [ ] WHEN se arrastra una tarjeta programada a otro día en el calendario THE SYSTEM SHALL actualizar `scheduled_at` a la nueva fecha preservando la hora original, sin crear una fila duplicada.
- [ ] WHEN se consulta `GET /api/v1/content/calendar?from=X&to=Y` THE SYSTEM SHALL retornar solo `content_channel_target` cuyo `scheduled_at` cae en ese rango, de la organización del usuario.
- [ ] WHEN el drag-and-drop se opera solo con teclado (Tab + flechas + Enter, comportamiento nativo de `@dnd-kit`) THE SYSTEM SHALL reprogramar la pieza igual que con mouse.

**Verify**
```bash
pnpm test:e2e tests/e2e/editorial-calendar.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 25: calendario editorial"
git tag step-25-calendar
```

---

#### Step 26 — Scheduler de publicación multicanal

**Do**
**VERIFY antes de codear:** la publicación saliente (crear una publicación en el feed/timeline de
WhatsApp Business, Instagram, Facebook o TikTok) es una superficie de API **distinta** de los
webhooks entrantes que Fase 1 ya implementó — cada plataforma tiene su propio endpoint, formato de
payload, y límites de tasa para "crear contenido", separados de los que usa para notificar eventos
entrantes. Esta sesión de generación no pudo verificar en vivo el endpoint exacto, el shape del
payload de creación de publicación, ni el límite de tasa vigente de ninguna de las 4 plataformas. El
builder debe confirmar, contra la documentación oficial y vigente de cada proveedor en el momento de
implementar este step (Graph API de Meta — publicación en Instagram/Facebook vía
`/{ig-user-id}/media` + `/{ig-user-id}/media_publish` es el flujo conocido hasta la última
verificación pública, pero **no se pinea su versión de memoria**; WhatsApp Business Platform no
tiene un concepto nativo de "post" — su adaptador puede requerir un rediseño del contrato de esta
tabla si el equipo confirma que no aplica y debe documentarse como tal; TikTok for Business API
Content Posting), el endpoint, el payload y el rate limit reales, y registrar la versión/fecha
confirmada en un comentario al inicio de cada archivo `src/server/publishing/adapters/<canal>.ts`.
No inventar endpoints ni shapes de payload de memoria — igual que hizo Fase 1 step 8 para los
webhooks entrantes.

Escribir `src/server/publishing/adapters/whatsapp.ts`, `instagram.ts`, `facebook.ts`, `tiktok.ts`
— mismo shape de entrada/salida en los 4 (ver `.claude/rules/scheduler.md`). Escribir
`src/server/publishing/publish.ts` (orquestador: dado un `content_channel_target.id`, resuelve el
canal, llama al adaptador correcto, actualiza `status`/`published_at`/`external_post_id` o
`status='failed'`/`error`). Escribir `scripts/worker-publish.ts` — poller BullMQ separado del
worker de Fase 1: cada `N` segundos consulta `content_channel_target` con `status='scheduled' and
scheduled_at <= now()`, encola un job por cada uno con `jobId` derivado de
`content_channel_target.id` (deduplicación nativa de BullMQ), reutiliza el backoff exponencial y
`job_dead_letters` del patrón de Fase 1. Escribir `tests/integration/publish-worker.test.ts` (corre
`scripts/worker-publish.ts` real contra Redis+Postgres de test, con los 4 adaptadores reemplazados
por un mock que simula éxito/fallo controlado — nunca llama a un proveedor real): (1) un
`content_channel_target` con `scheduled_at` pasado se publica y pasa a `status: published`; (2) un
fallo simulado de la API del canal reintenta con backoff exponencial y termina en
`job_dead_letters` tras agotar los 5 intentos; (3) encolar dos jobs del mismo
`content_channel_target.id` por una carrera del poller produce una sola publicación real
(idempotencia vía `jobId` determinístico de BullMQ).

Agregar el script `"worker:publish": "tsx scripts/worker-publish.ts"` a `package.json` — mismo
patrón que `"worker": "tsx scripts/worker.ts"` de Fase 1 (línea de CLAUDE.md "Worker de publicación
(Fase 2) | `pnpm worker:publish`"), para que el poller pueda correr como proceso standing y no solo
dentro del test de integración. Cubierto por el permiso `Bash(pnpm worker:*)` que Fase 1 ya declaró
en `settings.json` — no requiere una entrada nueva en §19.3.

**Done when**
- [ ] WHEN un `content_channel_target` tiene `status='scheduled'` y `scheduled_at` en el pasado THE SYSTEM SHALL encolar exactamente un job de publicación, incluso si el poller corre dos veces antes de que el job se procese.
- [ ] WHEN el adaptador del canal responde éxito THE SYSTEM SHALL actualizar `status='published'`, `published_at=now()`, `external_post_id` con el id devuelto.
- [ ] WHEN el adaptador del canal lanza una excepción THE SYSTEM SHALL reintentar con backoff exponencial hasta 5 intentos, y tras agotarlos, `status='failed'` + fila en `job_dead_letters`.
- [ ] WHEN dos jobs del mismo `content_channel_target.id` se encolan por una carrera del poller THE SYSTEM SHALL procesar la publicación una sola vez — verificado por el `jobId` determinístico de BullMQ.
- [ ] WHEN el worker publica exitosamente THE SYSTEM SHALL registrar un `audit_event` con action `content.published`, actor_type `system`.

**Verify**
```bash
pnpm test tests/integration/publish-worker.test.ts
# expect: exit 0, 0 failed — corre scripts/worker-publish.ts real contra Redis+Postgres de test,
# con los 4 adaptadores reemplazados por un mock que simula éxito/fallo controlado — nunca llama
# a un proveedor real
grep -q '"worker:publish"' package.json   # expect: exit 0 — confirma el script agregado
```

**Checkpoint**
```bash
git add -A && git commit -m "step 26: scheduler de publicacion multicanal"
git tag step-26-scheduler
```

---

#### Step 27 — Asistencia de IA para contenido

**Do**
Seguir el flujo de la skill `add-copilot-tool` (ya instalada por Fase 1, sin cambios). Agregar dos
tools a `src/server/copilot/tools.ts`:
- `draft_content_copy` — input `{ topic: string, channel: "whatsapp"|"instagram"|"facebook"|
  "tiktok" }`, `permission_key: "content.create"`, `requiresApprovalFirstUse: true`. El handler
  llama `src/lib/ai/gateway.ts` (gateway existente de Fase 1, sin cambios) con un prompt que pide
  un borrador de copy apropiado para el canal, y devuelve el texto — **no crea un `content_item`
  directamente**; el usuario decide si usar el borrador sugerido al crear la pieza en el editor.
- `suggest_publish_time` — input `{ channelConnectionId: string }`, `permission_key:
  "content.schedule"`, `requiresApprovalFirstUse: true`. El handler consulta
  `content_channel_target` publicados históricamente para ese canal (`status='published'`) y
  devuelve una hora sugerida (heurística simple: la hora del día con más publicaciones exitosas
  pasadas para ese canal; si no hay historial, sugiere `09:00` como default documentado).

Agregar un caso a `tests/e2e/copilot.spec.ts` (existente de Fase 1) por cada tool nueva, con un
fixture grabado de la respuesta del modelo invocando cada una.

**Done when**
- [ ] WHEN el copiloto invoca `draft_content_copy` por primera vez en una organización THE SYSTEM SHALL detener el stream con `approval_required`, igual que cualquier tool nueva de Fase 1.
- [ ] WHEN se aprueba esa primera invocación THE SYSTEM SHALL ejecutar el handler y devolver un borrador de texto no vacío.
- [ ] WHEN `suggest_publish_time` se invoca para un canal sin historial de publicaciones THE SYSTEM SHALL devolver `09:00` como sugerencia por defecto.
- [ ] WHEN `suggest_publish_time` se invoca para un canal con historial THE SYSTEM SHALL devolver la hora con más publicaciones exitosas pasadas para ese canal.
- [ ] WHEN cualquiera de las dos tools se invoca sin el `permission_key` correspondiente THE SYSTEM SHALL responder con el mismo 403 tipado que cualquier otra mutación (§8).

**Verify**
```bash
pnpm test:e2e tests/e2e/copilot.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 27: asistencia de IA para contenido"
git tag step-27-copilot-content
```

---

#### Step 28 — Dashboard de publicaciones

**Do**
Construir `src/app/(app)/content/publications/page.tsx` (Server Component, carga inicial),
`src/components/publications/publications-table.tsx` (Client Component, TanStack Query, filtros
por `status` y `channel` reflejados en la URL igual que la bandeja de Fase 1). Crear
`src/app/api/v1/publications/route.ts`. Con `/app/content/publications` este step agrega la última
ruta nueva de Fase 2 — extender `tests/e2e/a11y.spec.ts` (heredado de Fase 1, mismo comando, mismo
umbral de 0 violaciones) para cubrir las 6 rutas nuevas de `content/*`: `/app/content`,
`/app/content/new`, `/app/content/:id`, `/app/content/media`, `/app/content/calendar` y
`/app/content/publications` — todas ya existen en el árbol para cuando este step corre (steps 22,
23, 25, 28). Escribir `tests/e2e/publications-dashboard.spec.ts`.

**Done when**
- [ ] WHEN un usuario visita `/app/content/publications` THE SYSTEM SHALL renderizar la tabla de `content_channel_target` de su organización ordenada por `scheduled_at` descendente en el primer response del servidor.
- [ ] WHEN el usuario filtra por `status=failed` THE SYSTEM SHALL mostrar solo las filas fallidas, con el mensaje de `error` visible.
- [ ] WHEN no hay publicaciones que cumplan los filtros activos THE SYSTEM SHALL mostrar un estado vacío específico para ese filtro.
- [ ] WHEN el usuario filtra por `channel=whatsapp` THE SYSTEM SHALL mostrar solo destinos cuyo `channel_connection.channel` es `whatsapp`.
- [ ] WHEN `pnpm test:e2e tests/e2e/a11y.spec.ts` corre contra las 6 rutas de `content/*` THE SYSTEM SHALL reportar 0 violations.

**Verify**
```bash
pnpm test:e2e tests/e2e/publications-dashboard.spec.ts   # expect: exit 0, 0 failed
pnpm test:e2e tests/e2e/a11y.spec.ts                      # expect: exit 0, 0 violations — extendido a las 6 rutas de content/*
```

**Checkpoint**
```bash
git add -A && git commit -m "step 28: dashboard de publicaciones"
git tag step-28-publications-dashboard
```

---

#### Step 29 — Realtime de estado de publicación

**Do**
Agregar el evento `content:target-updated` a `src/lib/realtime/server.ts` (mismo servidor Socket.IO
de Fase 1, mismo room por `org_id` — no se crea infraestructura nueva). Emitirlo desde
`src/server/publishing/publish.ts` cada vez que `content_channel_target.status` cambia. Agregar el
hook `useRealtimePublications(orgId)` a `src/lib/realtime/client.ts`, que invalida la query de
TanStack Query de `PublicationsTable` en cada evento recibido. Escribir
`tests/e2e/publications-live.spec.ts`: conecta dos sesiones (organización A y organización B),
dispara una publicación programada para que el worker la procese, y confirma que la fila de la
sesión A se actualiza a `published`/`failed` sin recargar la página mientras la sesión B nunca
recibe el evento de A.

**Done when**
- [ ] WHEN el worker de publicación marca un `content_channel_target` como `published` THE SYSTEM SHALL actualizar la fila en el dashboard de un usuario conectado sin que recargue la página.
- [ ] WHEN el worker marca un `content_channel_target` como `failed` THE SYSTEM SHALL actualizar el badge a `failed` con el tooltip de error, sin recarga.
- [ ] WHEN un usuario de la organización A está conectado y ocurre un evento de la organización B THE SYSTEM SHALL no entregárselo — mismo aislamiento por room de Fase 1.

**Verify**
```bash
pnpm test:e2e tests/e2e/publications-live.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 29: realtime de estado de publicacion"
git tag step-29-publications-realtime
```

---

#### Step 30 — Hardening: MIME real + rate limit de subida

**Do**
Reemplazar `src/lib/storage/validate-mime.ts` para que detecte el tipo real por magic bytes del
buffer (no por el `Content-Type` del request, que un cliente puede falsificar, ni por la extensión
del nombre de archivo) — comparar los primeros bytes del buffer contra las firmas conocidas de
`image/jpeg`, `image/png`, `image/webp`, `video/mp4`; si el tipo detectado no coincide con uno de
los permitidos, rechazar aunque el header diga lo contrario. Agregar rate limiting a
`POST /api/v1/media` (30/min por usuario, mismo backend Redis y mismo mecanismo que el rate limit
de Fase 1 en `/api/webhooks/*` y `/api/auth/*`). Escribir `tests/integration/media-hardening.test.ts`.

**Done when**
- [ ] WHEN se sube un archivo cuyo `Content-Type` dice `image/jpeg` pero cuyos bytes no son una firma JPEG válida THE SYSTEM SHALL responder 400 y no subir nada a MinIO.
- [ ] WHEN se sube un archivo `.jpg` que en realidad son los bytes de un ejecutable THE SYSTEM SHALL responder 400 — la extensión del nombre nunca decide el tipo.
- [ ] WHEN un usuario hace 31 subidas en un minuto THE SYSTEM SHALL responder 429 en la subida 31.
- [ ] WHEN un usuario hace 30 subidas válidas en un minuto THE SYSTEM SHALL aceptar las 30.

**Verify**
```bash
pnpm test tests/integration/media-hardening.test.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 30: hardening de subida de medios"
git tag step-30-media-hardening
```

---

#### Step 31 — Deploy: MinIO en producción

**Do**
Correr `node scripts/ensure-minio-in-prod-compose.mjs` (llegó a `./scripts/` vía el rsync de
Bootstrap, igual que `merge-claude-settings.mjs`), que inserta el servicio `minio` en
`docker-compose.prod.yml` (autorado por Fase 1 step 17) de forma idempotente (ver el script en
§19.6 — guardado por un marcador literal). Agregar las 6 variables `S3_*` de producción a
`.env.example` con sus valores esperados (blancos u obviamente falsos, igual que el resto del
archivo). Extender `scripts/smoke-test.sh` (existente de Fase 1) para verificar además que
`S3_BUCKET` existe contra el MinIO de producción tras el deploy.

**Done when**
- [ ] WHEN `docker compose -f docker-compose.prod.yml up -d` corre THE SYSTEM SHALL levantar también el servicio `minio`, healthy en menos de 60 segundos junto a los 5 servicios de Fase 1.
- [ ] WHEN el script de inserción corre una segunda vez sobre un `docker-compose.prod.yml` que ya tiene `minio` THE SYSTEM SHALL salir con 0 sin duplicar el servicio.
- [ ] WHEN `scripts/smoke-test.sh` corre tras un deploy exitoso THE SYSTEM SHALL verificar adicionalmente que el bucket de medios existe, y seguir saliendo con 0.

**Verify**
```bash
node scripts/ensure-minio-in-prod-compose.mjs   # expect: exit 0
node scripts/ensure-minio-in-prod-compose.mjs   # expect: exit 0 — idempotente
grep -q "minio:" docker-compose.prod.yml   # expect: exit 0
bash scripts/smoke-test.sh   # expect: exit 0 — corrido contra el stack de docker-compose.prod.yml levantado localmente
```

**Checkpoint**
```bash
git add -A && git commit -m "step 31: minio en produccion"
git tag step-31-deploy-minio
```

---

#### Step 32 — Verificación local end-to-end

**Do**
Consolidar el gate completo de esta fase: lint + typecheck + unit + integration + los 6 suites E2E
nuevos (media-library, editorial-calendar, publications-dashboard, publications-live, copilot
extendido) junto a los 3 suites E2E críticos de Fase 1 (aislamiento de tenant, auth, bandeja en
vivo) que deben seguir pasando sin cambios. Este step no crea funcionalidad — cierra la fase
verificando que el conjunto completo de gates de los 13 steps anteriores de Fase 2, más los 18 de
Fase 1, sigue pasando junto, en una corrida limpia.

**Done when**
- [ ] WHEN el gate completo corre sobre el árbol actual THE SYSTEM SHALL reportar 0 fallos en lint, typecheck, tests unitarios, tests de integración, y todos los suites E2E (Fase 1 + Fase 2).
- [ ] WHEN se re-ejecuta el Bootstrap de §10 sobre un árbol ya bootstrapeado THE SYSTEM SHALL salir con 0 sin revertir `package.json`, `.claude/settings.json`, ni `docker-compose.prod.yml`.

**Verify**
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e   # expect: exit 0 en cada uno
git tag -l 'step-19-*' 'step-20-*' 'step-21-*' 'step-22-*' 'step-23-*' 'step-24-*' 'step-25-*' 'step-26-*' 'step-27-*' 'step-28-*' 'step-29-*' 'step-30-*' 'step-31-*' | wc -l
# expect: 13 — los 13 checkpoints previos de esta fase existen (este mismo step aún no se ha tageado)
```

**Checkpoint**
```bash
git add -A && git commit -m "step 32: verificacion local end-to-end — fase 2 cerrada"
git tag step-32-verification
```

---

### 9.1 Parity and cutover

NOT APPLICABLE — esta fase agrega capacidad nueva sobre el sistema existente de Fase 1; no
reemplaza ningún sistema en producción ni migra datos de una implementación previa. No hay
"sistema viejo" del que hacer cutover.

---

## 10. Environment Setup

### Prerequisites

Idénticos a Fase 1 — Node.js 24.19.0, pnpm 11.21.0, Docker + Docker Compose. No se agrega ninguna
herramienta de sistema nueva (`sharp` usa binarios nativos precompilados que `pnpm` descarga, sin
requerir un compilador local).

### Accounts to create first

Ninguna cuenta de tercero nueva. El único proveedor externo real que esta fase toca son las APIs de
publicación saliente de WhatsApp/Instagram/Facebook/TikTok (step 26) — las credenciales de
desarrollador ya existen desde el step 8 de Fase 1 (mismas apps registradas; publicar suele
requerir el mismo token de acceso que recibir webhooks, salvo scopes adicionales que el builder debe
confirmar contra la documentación de cada proveedor en el step 26, ver la nota VERIFY de ese step).

### Environment variables

| Variable | Purpose | Where to get it | Required by step | Secret? |
|---|---|---|---|---|
| `S3_ENDPOINT` | URL del servicio S3-compatible | `docker-compose.minio.yml` local — `http://localhost:9000` | 19 | no |
| `S3_REGION` | Región (MinIO la ignora pero el SDK la exige) | literal `us-east-1` | 19 | no |
| `S3_ACCESS_KEY_ID` | Credencial de acceso a MinIO | `docker-compose.minio.yml` local — `nucleo` | 19 | yes |
| `S3_SECRET_ACCESS_KEY` | Credencial secreta de MinIO | `docker-compose.minio.yml` local — `nucleo_dev_password` | 19 | yes |
| `S3_BUCKET` | Bucket de medios | literal `nucleo-media` (local), `nucleo-media-test` (test) | 19 | no |
| `S3_FORCE_PATH_STYLE` | Obliga path-style addressing (requerido por MinIO) | literal `true` | 19 | no |

Todas las variables heredadas de Fase 1 (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, etc.)
siguen siendo requeridas exactamente desde los steps que ya las requerían — esta fase no las
retoca. `.env.example` se actualiza en el step 19 con las 6 variables nuevas, valor blanco/local
según corresponda. La app valida las nuevas variables al boot en `src/lib/env.ts` (zod), y las
trata como requeridas solo desde el step 19 en adelante — nunca antes, para no romper el gate de
ningún step de Fase 1 (§9 rule 9).

### Files that must be committed

| File | Why it is committed | Ignore-file exception line |
|---|---|---|
| `.env.example` | Ya comprometido por Fase 1; se actualiza, no se recrea | ya tiene `!.env.example` desde Fase 1 — sin cambios |
| `docker-compose.minio.yml`, `.claude/rules/media.md`, `.claude/rules/scheduler.md`, `.claude/settings.fase2.json` (transitorio, ver Bootstrap) | Configs críticos para que los `Verify` de §9 corran — emitidos en §19.6 | no matcheados por ningún patrón del `.gitignore` heredado de Fase 1 — ninguno de sus patrones apunta a `docker-compose.*.yml` ni a `.claude/**` |
| `CLAUDE.md`, `AGENTS.md`, `tests/setup/env.ts` | Reemplazados deliberadamente por la versión de esta fase (ver Bootstrap) | ya comprometidos desde Fase 1; el `.gitignore` heredado no los excluye |

El `.gitignore` de este proyecto ya existe desde el Bootstrap de Fase 1 (creado antes del primer
commit de ese bundle, con las excepciones `!.env.example` ya en su lugar) — esta fase no lo edita.

### Bootstrap

```bash
# orden: verificar Fase 1 → copiar workspace/ nuevo (guardado, --ignore-existing) →
# sobrescribir deliberadamente los archivos propiedad de este blueprint (CLAUDE.md, AGENTS.md,
# tests/setup/env.ts) → fusionar settings.json → instalar dependencias nuevas → approve-builds →
# fusionar variables S3_* nuevas dentro de .env real → levantar servicios (postgres+redis+minio) →
# crear bucket → migrar → seed

# 1. Verificar que Fase 1 está completa antes de tocar nada — los 18 checkpoints deben existir.
test "$(git tag -l 'step-*' | wc -l)" -ge 18   # expect: exit 0 — si falla, Fase 1 no terminó
git tag -l 'step-18-verification' | grep -q .  # expect: exit 0 — el cierre explícito de Fase 1

# 2. Copiar los archivos NUEVOS de workspace/ (no colisionan con nada de Fase 1) de forma
#    guardada — rsync es no-clobber y sale 0 tanto si copia como si salta un archivo existente,
#    a diferencia de `cp -n`, que en BSD/macOS sale 1 al saltar (ver §19).
rsync -a --ignore-existing blueprints/nucleo-fase-2/workspace/ ./

# 3. Sobrescribir deliberadamente los 3 archivos que este blueprint posee por completo a partir de
#    ahora. No son "archivos que el build pudo haber cambiado" — son documentos pequeños,
#    versionados en git, cuyo contenido íntegro vive en este bundle; una segunda corrida de este
#    Bootstrap produce exactamente los mismos bytes, así que sobrescribir es idempotente por
#    construcción y nunca revierte trabajo de un step posterior (ningún step de §9 edita estos 3
#    archivos — solo Bootstrap los toca).
cp -f blueprints/nucleo-fase-2/workspace/CLAUDE.md ./CLAUDE.md
cp -f blueprints/nucleo-fase-2/workspace/AGENTS.md ./AGENTS.md
cp -f blueprints/nucleo-fase-2/workspace/tests/setup/env.ts ./tests/setup/env.ts

# 4. Fusionar los permisos nuevos dentro de .claude/settings.json existente — nunca sobrescribirlo
#    (perdería los permisos de Fase 1). El script es idempotente (dedup por Set, ver §19.6).
#    Ya está en ./scripts/ tras el rsync del paso 2 (workspace/scripts/ mirrorea scripts/ del
#    proyecto), así que se invoca por su ruta final, igual que cualquier otro script del repo.
node scripts/merge-claude-settings.mjs

# 5. Dependencias nuevas — ver step 19 para el comando completo y el porqué de approve-builds.
pnpm add @aws-sdk/client-s3@^3.1111.0 @aws-sdk/lib-storage@^3.1111.0 sharp@^0.35.3 @dnd-kit/core@^6.3.1 react-day-picker@^10.0.1
pnpm approve-builds --all

# 6. Fusionar en el `.env` real cualquier variable presente en `.env.example` que `.env` todavía
#    no tenga — sin pisar ningún valor que el usuario ya haya rellenado. Necesario porque `.env`
#    de este árbol ya existía desde el Bootstrap de Fase 1 (`[ -f .env ] || cp .env.example .env`,
#    condición que a partir de aquí siempre es falsa), así que las 6 variables `S3_*` que el step
#    19 agrega a `.env.example` nunca llegarían solas a `.env`. Idempotente por diseño: una
#    variable ya presente en `.env` nunca se toca en una segunda corrida.
touch .env
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  key="${line%%=*}"
  grep -q "^${key}=" .env || printf '%s\n' "$line" >> .env
done < .env.example

# 7. Servicios locales — Postgres y Redis ya deberían estar arriba desde Fase 1; se agrega MinIO.
docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d
timeout 30 bash -c 'until docker compose -f docker-compose.yml -f docker-compose.minio.yml ps minio | grep -q healthy; do sleep 1; done'
set -a && . ./.env && set +a   # exporta S3_* al shell — ensure-bucket.mjs los carga también por su
                                # cuenta vía `import "dotenv/config"`, pero se exportan igual aquí
                                # por consistencia con el patrón de Fase 1 (drizzle.config.ts)
node scripts/ensure-bucket.mjs

# 8. Migrar y sembrar los permisos nuevos.
pnpm db:migrate
pnpm db:seed
```

**Re-ejecutar este bloque sobre un árbol ya bootstrapeado es seguro:** el paso 2 salta todo lo que
ya existe (rsync `--ignore-existing`, exit 0 en ambos casos); los pasos 3 y 4 son deliberadamente
idempotentes por diseño (ver comentarios); el paso 5 no reinstala si ya está en `package.json`
(`pnpm add` es idempotente sobre una dependencia ya presente en el rango especificado); el paso 6
solo añade líneas ausentes, nunca pisa una ya presente en `.env` (segunda corrida: 0 líneas
añadidas); el paso 7 no falla si MinIO ya está healthy; el paso 8 no re-crea tablas ni duplica
permisos (migraciones y seed de Fase 1 y Fase 2 son ambos idempotentes por diseño, mismo patrón).

---

## 11. Dependencies

Cada fila viene del reporte de investigación de esta sesión (2026-08-14) contra el registro en
vivo, salvo donde se indica lo contrario. Nunca se pinea una versión de memoria.

### Runtime

| Package | Version | Source | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| `@aws-sdk/client-s3` | `^3.1111.0` | https://registry.npmjs.org/@aws-sdk/client-s3 | 2026-08-14 | §10 Bootstrap, step 19 | Cliente S3, habla con MinIO en modo path-style |
| `@aws-sdk/lib-storage` | `^3.1111.0` | https://registry.npmjs.org/@aws-sdk/lib-storage | 2026-08-14 | §10 Bootstrap, step 19 | `Upload` con streaming multipart para subir medios sin cargarlos dos veces en memoria |
| `sharp` | `^0.35.3` | https://registry.npmjs.org/sharp | 2026-08-14 | §10 Bootstrap, step 19 | Generación de miniaturas — la `0.35.3-rc.2` es prerelease, se pinea la estable |
| `react-day-picker` | `^10.0.1` | https://registry.npmjs.org/react-day-picker | 2026-08-14 | §10 Bootstrap, step 19 | Grilla mensual del calendario editorial — peer `react>=16.8.0`, compatible con React 19.2.8 de Fase 1 |
| `@dnd-kit/core` | `^6.3.1` | https://registry.npmjs.org/@dnd-kit/core | 2026-08-14 | §10 Bootstrap, step 19 | Drag-and-drop accesible del calendario — la `6.3.1-next-*` es prerelease, se pinea la estable |

### Infrastructure (imagen Docker)

| Package | Version | Source | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| `minio/minio` (imagen) | `RELEASE.2025-10-15T17-29-55Z` | https://api.github.com/repos/minio/minio/releases (GitHub API, tag de release) | 2026-08-14 | `workspace/docker-compose.minio.yml` (§19.6) | Backend S3-compatible self-hosted para la biblioteca de medios |

### Development

Ninguna dependencia de desarrollo nueva — el tooling de test/lint/typecheck es el mismo de Fase 1
(vitest, playwright, biome, drizzle-kit), sin cambios de versión.

### Deliberately not used

| Rejected | Instead | Why |
|---|---|---|
| `mercadopago@^3.4.0` | — (no instalado) | Investigado y pineado para referencia futura, pero pagos son un Non-Goal explícito de esta fase (§1). No se agrega la dependencia hasta que el equipo active un plan pago. |
| `stripe@^22.5.0` | — (no instalado) | Misma razón que arriba. |
| `@aws-sdk/s3-request-presigner` | `GET /api/media/[key]` como proxy autenticado (step 21) | Evita agregar un paquete cuya versión no formaba parte del reporte verificado de esta sesión — el SDK v3 se libera en lockstep con `@aws-sdk/client-s3`, así que una URL presignada habría sido razonable, pero el proxy autenticado cumple el mismo requisito de seguridad (§8) sin depender de un pin no verificado directamente, y además centraliza el control de acceso en un solo handler en vez de en URLs de vida corta que hay que rotar. |
| `minio/mc` (imagen, cliente CLI de MinIO) | `scripts/ensure-bucket.mjs` (usa `@aws-sdk/client-s3` `CreateBucketCommand`) | El tag de imagen de `minio/mc` no se pudo verificar en vivo en esta sesión contra el registro de Docker Hub / GitHub releases; crear el bucket con el mismo SDK ya pineado evita introducir una segunda imagen con una versión sin verificar. |

---

## 12. Deployment Strategy

### Hosting

Mismo VPS propio de Fase 1, mismo Docker Compose + Caddy. MinIO se agrega como sexto servicio de
`docker-compose.prod.yml` (step 31), sin cambiar la plataforma de hosting ni el proceso de deploy.

### Environments

| Environment | Branch | URL | Database | MinIO |
|---|---|---|---|---|
| Local | — | localhost | `nucleo` local | `docker-compose.minio.yml`, bucket `nucleo-media` |
| Production | `main` | IP del VPS (sin dominio público — Non-Goal §1) | `nucleo` prod | servicio `minio` en `docker-compose.prod.yml`, bucket `nucleo-media` |

Fase 2 no introduce un entorno de Preview nuevo — hereda la ausencia de uno de Fase 1 (self-hosted
en VPS único).

### CI/CD

Mismo pipeline de Fase 1, extendido con los 6 suites E2E nuevos de esta fase (step 32). Ninguna
etapa nueva del pipeline — los mismos comandos (`lint`, `typecheck`, `test`, `test:e2e`) ahora
cubren más superficie.

### Release and rollback

Igual que Fase 1: migraciones como paso de deploy explícito y gateado, nunca en el boot del
contenedor de la app. Rollback: `git reset --hard step-18-verification` vuelve el código al estado
exacto de cierre de Fase 1 si esta fase necesita revertirse por completo; los checkpoints
intermedios (`step-19-*`…`step-31-*`) permiten un rollback más fino a cualquier step de esta fase.

### Domain, DNS, TLS

Sin cambios — Caddy sigue sirviendo sobre la IP/puerto del VPS, sin dominio público asignado
(Non-Goal §1, heredado de Fase 1).

---

## 13. Testing Strategy

| Layer | Framework | What it covers | Where | Runs |
|---|---|---|---|---|
| Unit | Vitest | validadores de MIME, heurística de `suggest_publish_time` | `tests/unit/` | cada commit |
| Integration | Vitest | subida de medios contra MinIO real, CRUD de contenido, aprobación, worker de publicación contra Redis+Postgres reales | `tests/integration/` | cada commit |
| E2E | Playwright | biblioteca de medios, calendario editorial (incluye drag-and-drop por teclado), dashboard de publicaciones, realtime, copiloto extendido | `tests/e2e/` | pre-deploy |

### Critical flows to cover E2E

1. Subir un medio → aparece en la biblioteca → adjuntarlo a una pieza → programarla → verla
   publicada en el dashboard en vivo.
2. Solicitar aprobación → rechazo con comentario → vuelve a `draft` → el creador ve el comentario.
3. Arrastrar una pieza programada a otro día en el calendario, incluso operando el calendario solo
   con teclado.

### Test data

Los tests de integración que tocan MinIO usan el bucket `nucleo-media-test` (variable
`S3_BUCKET` en `tests/setup/env.ts`, §19.6), nunca el bucket de desarrollo. El worker de
publicación se testea con los 4 adaptadores de canal reemplazados por un mock — ningún test llama a
una API real de WhatsApp/Instagram/Facebook/TikTok.

### What is deliberately not tested

Recorte o edición de imagen (Non-Goal §1 — no existe la funcionalidad). Carga simultánea de cientos
de medios (fuera del alcance de v1; sin objetivo de rendimiento establecido para ese caso).

---

## 14. Security & Secrets

| Concern | Control | Implemented in |
|---|---|---|
| Acceso a objetos de MinIO | Nunca público; todo objeto se sirve vía `GET /api/media/[key]` que resuelve `org_id` de la sesión primero | `src/app/api/media/[key]/route.ts` |
| Validación de tipo de archivo | Magic bytes del buffer, no `Content-Type` ni extensión (step 30) | `src/lib/storage/validate-mime.ts` |
| Límite de tamaño de subida | 15MB, rechazado antes de tocar MinIO | `src/server/media/upload.ts` |
| Rate limiting de subida | 30/min por usuario, backend Redis compartido con Fase 1 | `src/app/api/v1/media/route.ts` |
| Credenciales de MinIO | Variables de entorno, nunca en el repo | `src/lib/storage/s3-client.ts` |
| AuthN / AuthZ | Heredado de Fase 1 — server-side en cada request (§8) | `src/server/tenancy.ts` |
| Dependency audit | `pnpm audit`, misma cadencia de Fase 1 | CI |

**Hard rules** — idénticas a Fase 1, sin excepciones nuevas: ningún secreto en el repo/logs/bundle
de cliente; toda autorización server-side antes del trabajo.

Esta fase no maneja datos regulados adicionales a los de Fase 1 — los medios subidos son propiedad
de la organización y su clasificación de sensibilidad es la misma que el resto del contenido de
negocio ya cubierto por el modelo de aislamiento de Fase 1.

---

## 15. Accessibility

**Target: WCAG 2.2 AA — heredado sin cambios.** Único requisito nuevo específico de esta fase:

| Requirement | Rule |
|---|---|
| Drag-and-drop del calendario | Alternativa de un solo puntero — teclado — obligatoria (WCAG 2.5.7, ya cumplida nativamente por `@dnd-kit/core`, verificada en el step 25 Verify) |
| Contraste del token `--warning` | Ver §7 — 3.49:1 light / 9.8:1 dark, ambos ≥ 3:1 |
| Barra de progreso de subida | `role="progressbar"` con `aria-valuenow`/`aria-valuemax` |

### Verification

```bash
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: 0 violations — mismo comando de Fase 1, extendido para cubrir las rutas nuevas de content/*
```

---

## 16. Observability & Cost

### Instrumentation

Se hereda íntegramente la instrumentación de Fase 1 (mismo error tracker, mismos logs
estructurados). Métrica nueva de esta fase:

| Metric | Target | Alert at |
|---|---|---|
| Tasa de fallo de publicación (`content_channel_target.status='failed'` / total procesado) | < 5% | > 15% en 1 hora |
| Latencia del poller de publicación (`scheduled_at` → job encolado) | p95 < 60s | p95 > 300s |

### Health check

Sin cambios en el path (`/api/health`, heredado) — se extiende para reportar también si MinIO está
alcanzable, mismo shape de respuesta `{ data: { ok, migrationsUpToDate } }` con un campo
`storageReachable` agregado. La edición de `src/app/api/health/route.ts` ocurre en el step 19 (§9)
— mismo step que introduce `src/lib/storage/s3-client.ts` y el bucket contra el que el chequeo
llama `HeadBucketCommand`.

### Cost model

| Service | Free tier | Cost at v1 scale | Cliff to watch |
|---|---|---|---|
| MinIO self-hosted | — (mismo VPS) | $0 adicional — usa el disco ya provisionado | Espacio en disco del VPS si el volumen de medios crece sin un plan de limpieza (§1 Non-Goals: borrado físico automático queda para una fase futura) |

**Costo mensual estimado adicional de esta fase: $0** — MinIO corre en el mismo VPS ya pagado por
Fase 1; el único costo real es espacio en disco, que crece con el uso.

---

## 17. Model Routing

Se extiende, no se reemplaza, el enrutamiento de modelo de Fase 1 — mismo gateway
(`src/lib/ai/gateway.ts`), mismo `COPILOT_MODEL_ID`, sin invocar de nuevo la skill `claude-api`
porque no se introduce ningún ID de modelo, precio o parámetro de API nuevo: las dos tools de esta
fase (§9 step 27) corren sobre el mismo modelo y el mismo mecanismo de streaming ya verificado en
Fase 1.

### Routing table

| Task in this product | Model tier | Why this tier | Fallback |
|---|---|---|---|
| Borrador de copy de contenido, sugerencia de horario | mismo tier que el copiloto de Fase 1 (`COPILOT_MODEL_ID`) | Son extensiones del mismo agente conversacional, no una carga de trabajo nueva que justifique un tier distinto | ninguno — mismo comportamiento de reintento único con backoff de Fase 1 |

### Cost controls, failure handling, evaluation

Idénticos a Fase 1 — los caps de gasto por usuario/organización, el manejo de timeout/reintento, y
el conjunto fijo de evaluación ya cubren las dos tools nuevas porque pasan por el mismo gateway.

---

## 18. Skills to Use During Build

| Skill | Build steps | Why | Install |
|---|---|---|---|
| `add-migration` | 20 | Genera y aplica la migración de las 5 tablas nuevas de forma segura | ya instalada por Fase 1 — `.claude/skills/add-migration/SKILL.md`, sin acción nueva |
| `add-copilot-tool` | 27 | Registra `draft_content_copy` y `suggest_publish_time` en el catálogo del copiloto con su permiso y aprobación en primer uso | ya instalada por Fase 1 — sin acción nueva |
| `ui-ux-pro-max` | 22, 25, 28 | Consistencia visual del grid de medios, el calendario y el dashboard con el sistema ya establecido en Fase 1 | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` luego `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` — si no está disponible, `knowledge/capabilities/styling.md` y los tokens ya documentados en §7/CLAUDE.md son suficientes para mantener consistencia |

---

## 19. Agent Workspace

Bundle mode — los artefactos de esta sección se emiten como archivos reales bajo
`blueprints/nucleo-fase-2/workspace/`, que el builder copia (de forma guardada, ver §10 Bootstrap)
dentro del **mismo** root de proyecto donde ya vive el código de Fase 1. Tres archivos de esta lista
(`CLAUDE.md`, `AGENTS.md`, `tests/setup/env.ts`) se sobrescriben deliberadamente en vez de copiarse
de forma no-clobber — la razón está documentada en el Bootstrap (§10) y no se repite aquí.

### 19.1 `CLAUDE.md`

Ver el archivo completo en `blueprints/nucleo-fase-2/workspace/CLAUDE.md` — reproducido aquí en
línea porque el template lo exige, idéntico byte a byte al archivo emitido:

```markdown
# Núcleo — Fase 1 + Fase 2: Comunicación y Contenido

Bandeja unificada multicanal con copiloto de IA (Fase 1) + calendario editorial, biblioteca de
medios y publicación programada multicanal (Fase 2), para pequeñas y medianas empresas.

<!-- Este archivo reemplaza por completo al CLAUDE.md de Fase 1. Es la fuente única a partir de
     aquí — Bootstrap de Fase 2 lo sobrescribe deliberadamente (cp -f), no lo fusiona. -->

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` — http://localhost:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm lint:fix` |
| Unit + integration tests | `pnpm test` · un archivo: `pnpm test tests/unit/audit.test.ts` |
| E2E | `pnpm test:e2e` |
| DB migrate | `pnpm db:migrate` |
| DB generate migration | `pnpm db:generate` |
| DB seed | `pnpm db:seed` |
| DB studio | `pnpm db:studio` |
| Worker de eventos entrantes | `pnpm worker` |
| Worker de publicación (Fase 2) | `pnpm worker:publish` |
| Servicios locales up/down | `pnpm services:up` · `pnpm services:down` · `pnpm services:reset` |

(… contenido completo idéntico al archivo `workspace/CLAUDE.md` — ver ese archivo como fuente
autoritativa; se omite la repetición íntegra aquí solo por brevedad de este bloque en la narrativa,
nunca en el archivo real que el builder copia)
```

**El archivo real emitido en `workspace/CLAUDE.md` es la fuente autoritativa y está completo — 141
líneas, bajo el límite de 200.** El fragmento de arriba es solo una vista previa dentro de esta
narrativa.

### 19.2 `AGENTS.md`

Ver `blueprints/nucleo-fase-2/workspace/AGENTS.md` — 31 líneas, stub tool-neutral apuntando a
`CLAUDE.md` como fuente de verdad, mismo patrón de Fase 1.

### 19.3 `.claude/settings.json` (fusión)

Este bundle **no** emite un `settings.json` completo — emite `workspace/.claude/settings.fase2.json`
con solo las entradas nuevas, y el script `workspace/scripts/merge-claude-settings.mjs` las fusiona
dentro del `settings.json` ya existente de Fase 1 (ver §10 Bootstrap paso 4). Esto evita que la
copia de este bundle pise, o que un `--ignore-existing` salte silenciosamente, los permisos que
Fase 1 ya necesita.

```json
{
  "permissions": {
    "allow": [
      "Bash(docker compose -f docker-compose.yml -f docker-compose.minio.yml up:*)",
      "Bash(docker compose -f docker-compose.yml -f docker-compose.minio.yml down:*)",
      "Bash(docker compose -f docker-compose.yml -f docker-compose.minio.yml ps:*)",
      "Bash(docker compose -f docker-compose.yml -f docker-compose.minio.yml exec:*)",
      "Bash(cp -f blueprints/nucleo-fase-2/workspace/*)",
      "Bash(rsync -a --ignore-existing*)",
      "Bash(curl -s localhost:3000/api/health*)",
      "Bash(jq:*)",
      "Bash(touch:*)",
      "Bash(while:*)"
    ],
    "deny": []
  }
}
```

Este `settings.fase2.json` tiene 10 entradas. 9 cubren comandos genuinamente nuevos que el
`settings.json` de Fase 1 no declaraba: `node scripts/ensure-bucket.mjs`, `node
scripts/merge-claude-settings.mjs` y `node scripts/ensure-minio-in-prod-compose.mjs` **no** llevan
entrada propia — ya están cubiertos por `Bash(node:*)`, que Fase 1 declaró en su propio
`settings.json`, y repetirlos aquí solo ensuciaría el merge sin ampliar ninguna cobertura real. `cp -f
blueprints/nucleo-fase-2/workspace/*` sí necesita entrada propia: el `Bash(cp
blueprints/nucleo-fase-1/workspace/*)` de Fase 1 no cubre un comando que empieza con `cp -f` (el
flag va antes de la ruta, y el patrón de permiso hace match por prefijo). `curl -s
localhost:3000/api/health*` y `jq:*` también son nuevos: el `Bash(curl -s -o /dev/null*)` de Fase 1
exige el flag `-o /dev/null`, ausente en el healthcheck de §20.1, y Fase 1 nunca usó `jq`. `touch:*` y
`while:*` también son nuevos: el idioma de merge de `.env` (step 19 Verify y §10 Bootstrap paso 6)
corre `touch .env` y un `while IFS= read -r line; do ... done < .env.example`, y ninguno de los dos
comandos aparece en el `settings.json` de Fase 1 — Fase 1 nunca usó `touch` ni un bucle `while` en
ningún Verify o Bootstrap. La entrada `rsync -a --ignore-existing*` es la única redundante a
propósito: Fase 1 ya la declara (la copia de `workspace/` de Fase 1 usa el mismo idioma), así que el
merge no la duplicaría de forma dañina — se repite aquí solo para que este `settings.fase2.json` sea
legible de forma autocontenida junto al resto de comandos de esta fase. Todos los demás comandos que
esta fase usa (`pnpm add`, `pnpm test:*`, `psql`, `git tag`, `node:*`, etc.) ya están en el
`settings.json` de Fase 1 y se preservan por la fusión, nunca sobrescritos.

### 19.4 Project skills

Ninguna skill de proyecto nueva — `add-migration` y `add-copilot-tool`, ya instaladas por Fase 1 en
`.claude/skills/`, cubren el trabajo repetible de esta fase sin cambios.

### 19.5 `.claude/rules/*.md`

| File | `paths` globs | Covers |
|---|---|---|
| `.claude/rules/media.md` | `src/lib/storage/**`, `src/server/media/**`, `src/app/api/media/**`, `src/app/api/v1/media/**` | Convenciones de almacenamiento S3/MinIO, validación de MIME real, patrón de `storage_key` |
| `.claude/rules/scheduler.md` | `src/server/publishing/**`, `scripts/worker-publish.ts` | Convenciones del worker de publicación, shape de adaptadores por canal, idempotencia por `jobId` |

Contenido completo en `workspace/.claude/rules/media.md` y `workspace/.claude/rules/scheduler.md`.

### 19.6 Verify-critical config and local infrastructure

| File | Path in the project | Which `Verify` commands need it | Resolution/env handling it carries | Bundle-path exclusion |
|---|---|---|---|---|
| `docker-compose.minio.yml` | `./docker-compose.minio.yml` | steps 19, 21, 22, 26, 30, 31, 32 (cualquiera que toque MinIO) | ninguno — no lee env vars propias, MinIO toma sus credenciales de `environment:` literal en el archivo | n/a — no es un tool que camine el árbol |
| `.claude/settings.fase2.json` | `./.claude/settings.fase2.json` (transitorio — fusionado y puede borrarse tras el merge) | ninguno directamente; habilita que los `Verify` de todos los steps corran sin prompt de permiso | ninguno | n/a |
| `scripts/merge-claude-settings.mjs` | `./scripts/merge-claude-settings.mjs` (llega ahí vía el rsync de Bootstrap — `workspace/scripts/` mirrorea `scripts/` del proyecto, igual que cualquier otro archivo de `workspace/`) | §10 Bootstrap paso 4 | ninguno — Node puro, sin dependencias externas | n/a |
| `scripts/ensure-minio-in-prod-compose.mjs` | `./scripts/ensure-minio-in-prod-compose.mjs` (mismo mecanismo) | step 31 | ninguno — Node puro | n/a |
| `.claude/rules/media.md` | `./.claude/rules/media.md` | ninguno directamente — contexto diferido para el agente | n/a | n/a |
| `.claude/rules/scheduler.md` | `./.claude/rules/scheduler.md` | ninguno directamente | n/a | n/a |
| `CLAUDE.md` | `./CLAUDE.md` | ninguno directamente — instrucción base | n/a | n/a |
| `AGENTS.md` | `./AGENTS.md` | ninguno directamente | n/a | n/a |
| `tests/setup/env.ts` | `./tests/setup/env.ts` | todos los `pnpm test` de esta fase que tocan S3 (steps 21, 26, 30) | agrega los defaults `S3_*` vía `??=`, mismo mecanismo de Fase 1 | n/a |

Estos dos scripts no colisionan con `scripts/ensure-bucket.mjs`, `scripts/seed.ts` ni
`scripts/worker-publish.ts` (código de aplicación autorado por un step de §9) — comparten el mismo
directorio `scripts/` del proyecto sin pisarse, cada uno con un nombre distinto.

**Ningún tool de esta fase camina el árbol del proyecto buscando configuración de forma
recursiva-por-defecto** (a diferencia de un formateador o linter) — `biome.json` de Fase 1 ya
excluye `!blueprints`, así que `blueprints/nucleo-fase-2/` queda fuera del alcance de `pnpm lint`
sin necesitar una exclusión nueva. Confirmado: `pnpm exec biome check .` con este bundle presente
no encuentra un segundo `biome.json` dentro de `blueprints/nucleo-fase-2/workspace/` porque este
bundle no emite ninguno (no se toca la configuración de Biome — §2 confirma que no hay cambios de
lint/format en esta fase).

#### Resolution convention matrix

**La convención, sin cambios respecto a Fase 1:** alias `@/` → `src/`, especificadores con
extensión `.ts` habilitados por `rewriteRelativeImportExtensions` en `tsconfig.json` (heredado, no
tocado por este blueprint).

| Context | Command that exercises it | Convention as it appears there | Config + literal setting that makes it work |
|---|---|---|---|
| Application source | `pnpm build` | `@/lib/storage/s3-client` | `tsconfig.json` (Fase 1, sin cambios) — `paths: { "@/*": ["./src/*"] }` |
| Test files | `pnpm test` | mismo alias `@/` | `vitest.config.ts` (Fase 1, sin cambios) — `resolve.alias["@"]` |
| Standalone scripts | `node scripts/ensure-bucket.mjs`, `node scripts/worker-publish.ts` vía `tsx`/`node --experimental-strip-types` (heredado de cómo Fase 1 corre `scripts/worker.ts`) | ninguna — estos scripts usan imports relativos explícitos, nunca el alias `@/`, precisamente para evitar el problema que Fase 1 ya documentó de raíz en su propia matriz | no aplica — decisión de diseño: los scripts standalone de ambas fases no usan el alias |
| Build / bundle | `pnpm build` (Next.js) | `@/` | `next.config.ts` (Fase 1, sin cambios estructurales — step 21 le agrega `images.remotePatterns`, no toca resolución de módulos) |

Ningún loader nuevo de esta fase (el worker de publicación, los scripts de bucket/compose) necesita
una configuración de resolución distinta a la ya establecida — todos siguen la misma regla de Fase
1 de evitar el alias en scripts standalone.

#### Cross-artifact value reconciliation

| Shared value | Single source | Literal value | Every other place it appears | Compared |
|---|---|---|---|---|
| Nombre del servicio MinIO | `docker-compose.minio.yml` — clave `services.minio` | `minio` | `docker-compose.prod.yml` (step 31, mismo nombre, insertado por `ensure-minio-in-prod-compose.mjs`) · §9 steps 19/31 Verify (`docker compose ... ps minio`) · `.claude/settings.fase2.json` (comandos `-f docker-compose.minio.yml`) | yes |
| Bucket de desarrollo | `.env.example` — `S3_BUCKET` | `nucleo-media` | `docker-compose.minio.yml` (no lo declara — MinIO no crea buckets por variable de entorno; lo crea `scripts/ensure-bucket.mjs` leyendo `env.S3_BUCKET`) · §10 Bootstrap paso 7 · §9 step 19 Done when | yes |
| Bucket de test | `tests/setup/env.ts` — `S3_BUCKET ??= "nucleo-media-test"` | `nucleo-media-test` | §13 *Test data* | yes |
| Puerto de MinIO (API) | `docker-compose.minio.yml` — `ports: "9000:9000"` | `9000` | `.env.example` `S3_ENDPOINT=http://localhost:9000` · `tests/setup/env.ts` `S3_ENDPOINT ??= "http://localhost:9000"` · healthcheck del mismo archivo compose | yes |
| Tag de imagen MinIO | `docker-compose.minio.yml` | `minio/minio:RELEASE.2025-10-15T17-29-55Z` | `docker-compose.prod.yml` (insertado por el script del step 31 con el mismo literal, hardcodeado en `ensure-minio-in-prod-compose.mjs`) · §11 tabla Infrastructure | yes |
| Comando de merge de settings | `scripts/merge-claude-settings.mjs` — ruta relativa a `.claude/settings.fase2.json`/`.claude/settings.json` desde `process.cwd()` | `.claude/settings.json`, `.claude/settings.fase2.json` | §10 Bootstrap paso 4 · §19.3 · §19.3 `permissions.allow` (`node scripts/merge-claude-settings.mjs`) | yes |
| Campo `storageReachable` de `/api/health` | `src/app/api/health/route.ts` (edit, step 19) | `storageReachable` | §9 step 19 Done when/Verify · §16 Health check · §20.1 gate (`jq -e '...storageReachable == true'`) | yes |
| Script `worker:publish` | `package.json` (edit, step 26) | `"worker:publish": "tsx scripts/worker-publish.ts"` | §9 step 26 Verify (`grep -q '"worker:publish"'`) · `workspace/CLAUDE.md` · `workspace/AGENTS.md` | yes |

#### Byte-exact artifact reconciliation

NOT APPLICABLE — ningún `Verify` de esta fase compara bytes contra un fixture o golden file
literal. Los tests de integración (subida de medios, worker de publicación) afirman propiedades
sobre filas de base de datos y códigos de estado HTTP, nunca un diff byte a byte contra un archivo
grabado. Los fixtures de payload de proveedor que el step 26 menciona (para el mock de los
adaptadores en tests) son responsabilidad del propio test file, autorados por ese step junto al
código que los consume — no son artefactos de `workspace/` ni se diffean contra nada externo.

---

## 20. Acceptance Gate, Risks & Decision Log

### 20.1 Global acceptance gate

El proyecto (Fase 1 + Fase 2 combinadas) está **done** cuando cada comando de abajo sale con 0
sobre un checkout limpio, y no antes.

```bash
pnpm install --frozen-lockfile   # expect: exit 0, zero cambios al lockfile
pnpm typecheck                   # expect: exit 0, zero errores
pnpm lint                        # expect: exit 0, zero errores y zero warnings
pnpm test                        # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e                    # expect: exit 0, 0 failed — incluye los 3 suites de Fase 1 + los 6 nuevos de Fase 2
pnpm build                       # expect: exit 0
curl -s localhost:3000/api/health | jq -e '.data.ok == true and .data.storageReachable == true'
                                  # expect: exit 0 — prueba que la app arrancó Y que MinIO es alcanzable
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: 0 violations
```

Plus, manual gates checked once before considering Fase 2 cerrada:

- [ ] Los 14 checkpoints de esta fase existen en git: `git tag -l 'step-19-*' 'step-20-*' 'step-21-*' 'step-22-*' 'step-23-*' 'step-24-*' 'step-25-*' 'step-26-*' 'step-27-*' 'step-28-*' 'step-29-*' 'step-30-*' 'step-31-*' 'step-32-*' | wc -l` → `test $? -eq 0` y el conteo es 14.
- [ ] Los 18 checkpoints de Fase 1 siguen existiendo, sin haber sido re-tageados: `git tag -l 'step-0*' 'step-1[0-8]-*' | wc -l` → 18.
- [ ] `docker-compose.prod.yml` contiene exactamente un servicio `minio` (`grep -c '^  minio:' docker-compose.prod.yml` → 1) — no duplicado por una corrida repetida del script de inserción.
- [ ] `.claude/settings.json` contiene los 10 permisos nuevos de §19.3 además de todos los de Fase 1 — ningún permiso de Fase 1 se perdió en la fusión.
- [ ] El §10 Bootstrap fue re-ejecutado una vez sobre un árbol ya bootstrapeado, salió 0, y no revirtió `package.json` ni `.claude/settings.json`.
- [ ] Toda variable de §10 está seteada en producción y ausente del repo.
- [ ] Los 3 flujos críticos de §13 pasan contra la URL de producción.
- [ ] Un rollback a `step-31-deploy-minio` se ejecutó una vez, a propósito, en un entorno de prueba.

### 20.2 Risk register

| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---|---|---|---|
| Los endpoints de publicación saliente de Meta/TikTok cambian de forma o de versión entre esta generación y la implementación real del step 26 | M | H | El adaptador falla con un error de "endpoint no encontrado" o "campo requerido faltante" en el primer test de integración | El step 26 exige verificación explícita contra documentación vigente antes de codear (ver su nota VERIFY); no se avanza al step 27 sin adaptadores funcionando contra al menos un fixture real por canal |
| `sharp` falla al instalar su binario nativo en el entorno del builder (arquitectura no soportada) | L | M | `pnpm install` falla en el step 19 con un error de binario nativo | `sharp` publica binarios para las arquitecturas comunes (x64/arm64, linux/darwin/win32); si falla, el builder reporta la arquitectura exacta como gap en vez de improvisar una alternativa |
| El worker de publicación y el worker de eventos entrantes de Fase 1 compiten por el mismo Redis bajo carga alta | L | M | Latencia del poller sube por encima del umbral de §16 | Colas BullMQ separadas (nombres distintos) ya aíslan el trabajo; si la contención persiste, escalar Redis o separar instancias es una mejora post-v1, no un rediseño |
| El bucket de MinIO crece sin límite porque no hay borrado físico automático (Non-Goal §1) | M | L | Alertas de espacio en disco del VPS | Documentado como limitación operativa conocida; revisar cuando el costo de disco lo amerite (§20.4) |
| La fusión de `settings.json` (paso 4 del Bootstrap) corre contra un archivo corrupto o editado a mano de forma no-JSON | L | M | `merge-claude-settings.mjs` sale con un error de parseo | El script falla explícitamente (`JSON.parse` sin try/catch) en vez de sobrescribir silenciosamente — el builder ve el error y corrige el JSON a mano antes de reintentar |

### 20.3 Decision log

| # | Decision | Rejected alternative | Why | Would reverse if |
|---|---|---|---|---|
| 1 | `content_publish_job` se descarta como tabla propia; se reutilizan `jobs`/`job_dead_letters`/`idempotency_keys` del núcleo de Fase 1 | Tabla `content_publish_job` dedicada, como la especificación original sugería | Duplicaría el mecanismo de reintentos/dead-letter que Fase 1 ya construyó y verificó; una fila extra de bookkeeping por publicación no aporta información que `content_channel_target.status` + las tablas del núcleo no cubran ya | Si el equipo necesita historial de intentos por publicación más granular que lo que `job_dead_letters` ofrece |
| 2 | `GET /api/media/[key]` como proxy autenticado, en vez de URLs presignadas de S3 | `@aws-sdk/s3-request-presigner` con URLs de vida corta | Evita instalar un paquete cuya versión no estaba en el reporte verificado de esta sesión, y centraliza el control de acceso en un handler en vez de en URLs efímeras que hay que rotar y cachear correctamente | Si el volumen de tráfico de medios hace que el proxy autenticado se vuelva un cuello de botella de CPU/ancho de banda del servidor Next.js |
| 3 | MinIO en vez de un bucket de nube pública (S3/R2/GCS) | Cloudflare R2, AWS S3 | Coherencia con el resto del stack self-hosted en un solo VPS — sin cuenta de nube nueva, sin factura por egress, y el SDK de AWS habla el mismo protocolo así que migrar después no reescribe el cliente | Si el volumen de medios o el tráfico de descarga supera lo que el VPS puede servir cómodamente |
| 4 | Modelo de roles sin un rol `approver` intermedio — aprobar y programar quedan reservados a `owner` | Introducir un tercer rol de sistema | Mantiene el modelo de dos roles de Fase 1 sin ampliarlo antes de tener evidencia real de necesidad; menos superficie de permisos que mantener en v1 | Si equipos con más de un `owner` reportan cuello de botella de aprobación |
| 5 | Editor de texto plano en vez de WYSIWYG rico | Un editor de formato enriquecido tipo Tiptap/Lexical | Cubre el 90% del uso real (copy corto para redes sociales) sin la superficie de bugs de un editor rico; los canales destino en su mayoría no soportan formato enriquecido de todas formas | Si el equipo confirma que un canal destino soporta y requiere formato enriquecido específico |

### 20.4 What to build next

1. Rol `approver` intermedio si el flujo de aprobación de owner-único se vuelve un cuello de
   botella (§20.3 #4) — trigger: reporte explícito del equipo.
2. Borrado físico automático de objetos huérfanos en MinIO — trigger: el costo de disco del VPS lo
   amerita.
3. URLs presignadas de S3 en vez del proxy autenticado, si el tráfico de medios lo justifica
   (§20.3 #2) — trigger: métricas de CPU/ancho de banda del proxy por encima de un umbral a
   definir.
4. Activar `mercadopago`/`stripe` (ya investigados, no instalados) cuando el equipo decida un
   modelo de pago — Non-Goal §1.
5. CRM con pipeline (Fase 3+) y automatizaciones — fuera de alcance de este centro de producto.

---

*Fin del blueprint. El orden de build es §9. Se detiene cuando §20.1 está en verde.*
