# Epic 02: Publicación y Operación

> Al terminar este epic, el contenido programado en el Epic 01 se publica automáticamente en los
> canales conectados, con reintentos y dead-letter ante fallos, el equipo ve el estado en vivo en
> un dashboard, el copiloto puede ayudar a redactar y a decidir horarios, la subida de medios queda
> endurecida contra archivos maliciosos, y MinIO queda desplegado en producción.

| | |
|---|---|
| **Epic id** | `02-publicacion-y-operacion` |
| **Tasks** | `E2-T1` … `E2-T7` |
| **Depends on** | `01-medios-y-contenido` |
| **Unlocks** | nada — es el último epic de esta fase |
| **Parallel with** | nada — todas dependen, directa o transitivamente, de `E2-T1` |

No necesitas ningún otro archivo para completar este epic. Todo lo de abajo está repetido aquí a
propósito.

---

## Stack

Next.js 16 (App Router) · TypeScript 6.0.3 · Postgres 17 · Drizzle ORM · BullMQ + ioredis (colas,
heredado de Fase 1, sin paquete nuevo) · Socket.IO + adaptador Redis (heredado) · `@anthropic-ai/sdk`
(heredado). Gestor de paquetes: `pnpm`.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {path}` |
| E2E (un archivo) | `pnpm test:e2e {path}` |
| Worker de publicación | `pnpm worker:publish` |
| Servicios locales | `docker compose -f docker-compose.yml -f docker-compose.minio.yml up -d` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier task de este
epic como hecha.

Si una task verifica contra Redis/Postgres/MinIO reales, levanta los servicios primero con el
comando de arriba — ya están definidos en `docker-compose.yml` + `docker-compose.minio.yml` en la
raíz del proyecto, no los escribes tú en este epic.

## Directory subtree

Solo la parte que este epic toca:

```
package.json                          # EDITADO E2-T1 — script worker:publish
src/
  server/
    publishing/
      publish.ts                  # NUEVO E2-T1 — orquestador; EDITADO E2-T4 (emite evento realtime)
      adapters/
        whatsapp.ts                 # NUEVO E2-T1
        instagram.ts                 # NUEVO E2-T1
        facebook.ts                   # NUEVO E2-T1
        tiktok.ts                      # NUEVO E2-T1
    copilot/
      tools.ts                     # EDITADO E2-T2 — 2 tools nuevas
  lib/
    storage/
      validate-mime.ts             # EDITADO E2-T5 — magic bytes reales
    realtime/
      server.ts                    # EDITADO E2-T4 — evento content:target-updated
      client.ts                     # EDITADO E2-T4
  app/
    api/
      v1/
        media/route.ts              # EDITADO E2-T5 — rate limit
        publications/route.ts        # NUEVO E2-T3
    (app)/content/
      publications/page.tsx          # NUEVO E2-T3
  components/
    publications/
      publications-table.tsx         # NUEVO E2-T3
scripts/
  worker-publish.ts                  # NUEVO E2-T1
tests/
  integration/publish-worker.test.ts   # E2-T1
  e2e/copilot.spec.ts                    # EDITADO E2-T2 (existe desde Fase 1)
  e2e/publications-dashboard.spec.ts       # NUEVO E2-T3
  e2e/a11y.spec.ts                          # EDITADO E2-T3 — cubre las 6 rutas nuevas de content/*
  e2e/publications-live.spec.ts             # NUEVO E2-T4
  integration/media-hardening.test.ts        # NUEVO E2-T5
docker-compose.prod.yml                       # EDITADO E2-T6 (vía script, autorado por Fase 1 step 17)
.env.example                                   # EDITADO E2-T6
scripts/smoke-test.sh                           # EDITADO E2-T6 (existe desde Fase 1)
```

Todo lo fuera de este subárbol está fuera de alcance. Si una task parece requerir editar un archivo
que no está listado aquí, detente y repórtalo — significa que el límite del epic está mal.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `content_channel_target` | escribe `status`, `published_at`, `external_post_id`, `error` | el Epic 01 solo creaba filas en `pending`/`scheduled`; este epic las mueve por el resto del ciclo de vida |
| `jobs`, `job_dead_letters`, `idempotency_keys` (núcleo Fase 1) | E2-T1 los reutiliza para el bookkeeping del scheduler — mismo patrón que el worker de webhooks entrantes | ver blueprint.md §4 nota de decisión — no se crea una tabla `content_publish_job` separada |
| `permission` (núcleo, poblado en Epic 01) | E2-T2 lee `content.create`/`content.schedule` para las dos tools nuevas del copiloto | sin cambios de schema |

## Contracts

**Consumed** — ya existe, no se reconstruye:

| From | Interface | Guarantee |
|---|---|---|
| `01-medios-y-contenido` | `src/server/content/items.ts` `getContentItem(id)` | retorna la pieza completa con medios adjuntos |
| `01-medios-y-contenido` | tabla `content_channel_target`, filas `status='scheduled'` | la query "due" del poller (`status='scheduled' and scheduled_at <= now()`) |
| Fase 1 core | `src/server/copilot/tools.ts` — patrón de registro de tool con `requiresApprovalFirstUse` | la skill `add-copilot-tool` documenta el flujo exacto |
| Fase 1 core | `src/lib/realtime/server.ts` — servidor Socket.IO con rooms por `org_id` | E2-T4 agrega un evento, no una infraestructura |

**Produced** — nada de este epic es consumido por un epic posterior de esta fase (es el último).

## Conventions that bite in this area

- El worker de publicación (`scripts/worker-publish.ts`) es un proceso BullMQ **separado** del
  worker de eventos entrantes de Fase 1 (`scripts/worker.ts`) — colas y procesos distintos, nunca
  se fusionan.
- El `jobId` de cada job de publicación se deriva determinísticamente de
  `content_channel_target.id` — esto es lo que hace el encolado idempotente ante una carrera del
  poller, no un chequeo manual de "¿ya existe este job?".
- Ningún adaptador de canal (`src/server/publishing/adapters/<canal>.ts`) llama a la API del
  proveedor sin haber confirmado, en un comentario al inicio del archivo, la versión vigente de esa
  API de publicación saliente — **es una superficie distinta de los webhooks entrantes de Fase 1**.
  No inventar endpoints ni payloads de memoria.

Reglas completas del proyecto: `CLAUDE.md`. Reglas del área: `.claude/rules/scheduler.md`,
`.claude/rules/media.md`. Ambos ya están en la raíz del proyecto.

---

## Tasks

Listadas en el mismo orden que `tasks.json`.

### `E2-T1` — Scheduler de publicación multicanal

**Depends on:** `E1-T7` · **Priority:** p0

**Antes de codear:** confirma contra la documentación oficial y vigente de cada proveedor (Graph
API de Meta para Instagram/Facebook, WhatsApp Business Platform, TikTok for Business API Content
Posting) el endpoint exacto de creación de publicación, el shape del payload, y el límite de tasa —
esta sesión de generación no pudo verificarlos en vivo. Registra la versión/fecha confirmada en un
comentario al inicio de cada archivo de adaptador. Si WhatsApp no tiene un concepto de "post"
publicable (a diferencia de los otros tres), documenta esa limitación explícitamente en
`whatsapp.ts` en vez de forzar el contrato genérico sobre una API que no lo soporta.

Escribe los 4 adaptadores con el mismo shape de entrada/salida
(`{ channelConnectionId, contentItem, media } → { externalPostId } | { error }`), el orquestador
(`publish.ts`), y el poller (`scripts/worker-publish.ts`) que encola por `content_channel_target`
due, con `jobId` determinístico. Reutiliza el backoff exponencial y `job_dead_letters` del patrón
de Fase 1 — no reinventes el mecanismo. Escribe `tests/integration/publish-worker.test.ts` (corre
`scripts/worker-publish.ts` real contra Redis+Postgres de test, con los 4 adaptadores reemplazados
por un mock que simula éxito/fallo controlado — nunca llama a un proveedor real): un
`content_channel_target` con `scheduled_at` pasado se publica y pasa a `status: published`; un
fallo simulado reintenta con backoff exponencial y termina en `job_dead_letters` tras agotar los 5
intentos; dos jobs del mismo `content_channel_target.id` encolados por una carrera del poller
producen una sola publicación real (idempotencia vía `jobId` determinístico).

Agrega el script `"worker:publish": "tsx scripts/worker-publish.ts"` a `package.json` — mismo
patrón que `"worker": "tsx scripts/worker.ts"` de Fase 1 — para que el poller corra como proceso
standing y no solo dentro del test de integración. Cubierto por `Bash(pnpm worker:*)`, ya declarado
en `settings.json` por Fase 1 — no requiere una entrada nueva de permisos.

**Files**
- `src/server/publishing/publish.ts` — new
- `src/server/publishing/adapters/whatsapp.ts` — new
- `src/server/publishing/adapters/instagram.ts` — new
- `src/server/publishing/adapters/facebook.ts` — new
- `src/server/publishing/adapters/tiktok.ts` — new
- `scripts/worker-publish.ts` — new
- `tests/integration/publish-worker.test.ts` — new
- `package.json` — edit: agrega el script `worker:publish`

**Acceptance**

1. **WHEN** un `content_channel_target` tiene `status='scheduled'` y `scheduled_at` en el pasado **THE SYSTEM SHALL** encolar exactamente un job de publicación, incluso si el poller corre dos veces antes de que el job se procese.
2. **WHEN** el adaptador del canal responde éxito **THE SYSTEM SHALL** actualizar `status='published'`, `published_at=now()`, `external_post_id` con el id devuelto.
3. **WHEN** el adaptador del canal lanza una excepción **THE SYSTEM SHALL** reintentar con backoff exponencial hasta 5 intentos, y tras agotarlos, `status='failed'` + fila en `job_dead_letters`.
4. **WHEN** dos jobs del mismo `content_channel_target.id` se encolan por una carrera del poller **THE SYSTEM SHALL** procesar la publicación una sola vez — verificado por el `jobId` determinístico de BullMQ.
5. **WHEN** el worker publica exitosamente **THE SYSTEM SHALL** registrar un `audit_event` con action `content.published`, actor_type `system`.

**Verify**

```bash
pnpm test tests/integration/publish-worker.test.ts
grep -q '"worker:publish"' package.json
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: scheduler de publicacion multicanal"
git tag step-26-scheduler
```

### `E2-T2` — Asistencia de IA para contenido

**Depends on:** `E2-T1` · **Priority:** p1

Sigue el flujo de la skill `add-copilot-tool` (ya instalada, sin cambios). Dos tools:
`draft_content_copy` (genera un borrador de copy vía el gateway existente, no crea el
`content_item` directamente) y `suggest_publish_time` (heurística sobre publicaciones exitosas
pasadas del canal; sin historial, sugiere `09:00`). Ambas con `requiresApprovalFirstUse: true`.

**Files**
- `src/server/copilot/tools.ts` — edit
- `tests/e2e/copilot.spec.ts` — edit (existe desde Fase 1)

**Acceptance**

1. **WHEN** el copiloto invoca `draft_content_copy` por primera vez en una organización **THE SYSTEM SHALL** detener el stream con `approval_required`, igual que cualquier tool nueva de Fase 1.
2. **WHEN** se aprueba esa primera invocación **THE SYSTEM SHALL** ejecutar el handler y devolver un borrador de texto no vacío.
3. **WHEN** `suggest_publish_time` se invoca para un canal sin historial de publicaciones **THE SYSTEM SHALL** devolver `09:00` como sugerencia por defecto.
4. **WHEN** `suggest_publish_time` se invoca para un canal con historial **THE SYSTEM SHALL** devolver la hora con más publicaciones exitosas pasadas para ese canal.
5. **WHEN** cualquiera de las dos tools se invoca sin el `permission_key` correspondiente **THE SYSTEM SHALL** responder con el mismo 403 tipado que cualquier otra mutación.

**Verify**

```bash
pnpm test:e2e tests/e2e/copilot.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: asistencia de IA para contenido"
git tag step-27-copilot-content
```

### `E2-T3` — Dashboard de publicaciones

**Depends on:** `E2-T1` · **Priority:** p1

Server Component de carga inicial + `PublicationsTable` (Client, TanStack Query), filtros
`status`/`channel` reflejados en la URL (mismo patrón que la bandeja de Fase 1). Con
`/app/content/publications` esta task agrega la última ruta nueva de Fase 2 — extiende
`tests/e2e/a11y.spec.ts` (heredado de Fase 1, mismo comando, mismo umbral de 0 violaciones) para
cubrir las 6 rutas nuevas de `content/*`: `/app/content`, `/app/content/new`, `/app/content/:id`,
`/app/content/media`, `/app/content/calendar` y `/app/content/publications` — todas ya existen para
cuando esta task corre (`E1-T4`, `E1-T5`, `E1-T7`, `E2-T3`).

**Files**
- `src/app/(app)/content/publications/page.tsx` — new
- `src/components/publications/publications-table.tsx` — new
- `src/app/api/v1/publications/route.ts` — new
- `tests/e2e/publications-dashboard.spec.ts` — new
- `tests/e2e/a11y.spec.ts` — edit: cubre las 6 rutas nuevas de `content/*`

**Acceptance**

1. **WHEN** un usuario visita `/app/content/publications` **THE SYSTEM SHALL** renderizar la tabla de `content_channel_target` de su organización ordenada por `scheduled_at` descendente en el primer response del servidor.
2. **WHEN** el usuario filtra por `status=failed` **THE SYSTEM SHALL** mostrar solo las filas fallidas, con el mensaje de `error` visible.
3. **WHEN** no hay publicaciones que cumplan los filtros activos **THE SYSTEM SHALL** mostrar un estado vacío específico para ese filtro.
4. **WHEN** el usuario filtra por `channel=whatsapp` **THE SYSTEM SHALL** mostrar solo destinos cuyo `channel_connection.channel` es `whatsapp`.
5. **WHEN** `pnpm test:e2e tests/e2e/a11y.spec.ts` corre contra las 6 rutas de `content/*` **THE SYSTEM SHALL** reportar 0 violations.

**Verify**

```bash
pnpm test:e2e tests/e2e/publications-dashboard.spec.ts
pnpm test:e2e tests/e2e/a11y.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: dashboard de publicaciones"
git tag step-28-publications-dashboard
```

### `E2-T4` — Realtime de estado de publicación

**Depends on:** `E2-T1`, `E2-T3` · **Priority:** p1

Agrega el evento `content:target-updated` al servidor Socket.IO existente (mismo room por
`org_id`), emitido desde `publish.ts` en cada cambio de `status`. Hook
`useRealtimePublications(orgId)` invalida la query de `PublicationsTable`. Escribe
`tests/e2e/publications-live.spec.ts`: dos sesiones (organización A y B), dispara una publicación
programada, confirma que la fila de A se actualiza a `published`/`failed` sin recargar mientras B
nunca recibe el evento de A.

**Files**
- `src/lib/realtime/server.ts` — edit
- `src/lib/realtime/client.ts` — edit
- `src/server/publishing/publish.ts` — edit
- `tests/e2e/publications-live.spec.ts` — new

**Acceptance**

1. **WHEN** el worker de publicación marca un `content_channel_target` como `published` **THE SYSTEM SHALL** actualizar la fila en el dashboard de un usuario conectado sin que recargue la página.
2. **WHEN** el worker marca un `content_channel_target` como `failed` **THE SYSTEM SHALL** actualizar el badge a `failed` con el tooltip de error, sin recarga.
3. **WHEN** un usuario de la organización A está conectado y ocurre un evento de la organización B **THE SYSTEM SHALL** no entregárselo — mismo aislamiento por room de Fase 1.

**Verify**

```bash
pnpm test:e2e tests/e2e/publications-live.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: realtime de estado de publicacion"
git tag step-29-publications-realtime
```

### `E2-T5` — Hardening: MIME real + rate limit de subida

**Depends on:** `E1-T3` · **Priority:** p0

Reemplaza la validación de MIME por sniffing de magic bytes del buffer (nunca `Content-Type` del
request ni la extensión del nombre). Agrega rate limiting a `POST /api/v1/media` (30/min por
usuario, mismo backend Redis y mecanismo que Fase 1 usa en `/api/webhooks/*` y `/api/auth/*`).

**Files**
- `src/lib/storage/validate-mime.ts` — edit
- `src/app/api/v1/media/route.ts` — edit
- `tests/integration/media-hardening.test.ts` — new

**Acceptance**

1. **WHEN** se sube un archivo cuyo `Content-Type` dice `image/jpeg` pero cuyos bytes no son una firma JPEG válida **THE SYSTEM SHALL** responder 400 y no subir nada a MinIO.
2. **WHEN** se sube un archivo `.jpg` que en realidad son los bytes de un ejecutable **THE SYSTEM SHALL** responder 400 — la extensión del nombre nunca decide el tipo.
3. **WHEN** un usuario hace 31 subidas en un minuto **THE SYSTEM SHALL** responder 429 en la subida 31.
4. **WHEN** un usuario hace 30 subidas válidas en un minuto **THE SYSTEM SHALL** aceptar las 30.

**Verify**

```bash
pnpm test tests/integration/media-hardening.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: hardening de subida de medios"
git tag step-30-media-hardening
```

### `E2-T6` — Deploy: MinIO en producción

**Depends on:** `E1-T1`, `E2-T5` · **Priority:** p0

Corre el script idempotente (emitido en `workspace/scripts/`, llega a `./scripts/` vía el rsync de
Bootstrap — ver blueprint.md §19.6) que inserta el servicio `minio` en `docker-compose.prod.yml`
(autorado por Fase 1 step 17). Agrega las 6 variables `S3_*` de producción a `.env.example`.
Extiende `scripts/smoke-test.sh` para verificar también que el bucket existe tras el deploy.

**Files**
- `docker-compose.prod.yml` — edit (vía `node scripts/ensure-minio-in-prod-compose.mjs`)
- `.env.example` — edit
- `scripts/smoke-test.sh` — edit

**Acceptance**

1. **WHEN** `docker compose -f docker-compose.prod.yml up -d` corre **THE SYSTEM SHALL** levantar también el servicio `minio`, healthy en menos de 60 segundos junto a los 5 servicios de Fase 1.
2. **WHEN** el script de inserción corre una segunda vez sobre un `docker-compose.prod.yml` que ya tiene `minio` **THE SYSTEM SHALL** salir con 0 sin duplicar el servicio.
3. **WHEN** `scripts/smoke-test.sh` corre tras un deploy exitoso **THE SYSTEM SHALL** verificar adicionalmente que el bucket de medios existe, y seguir saliendo con 0.

**Verify**

```bash
node scripts/ensure-minio-in-prod-compose.mjs
node scripts/ensure-minio-in-prod-compose.mjs
grep -q "minio:" docker-compose.prod.yml
bash scripts/smoke-test.sh
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: minio en produccion"
git tag step-31-deploy-minio
```

### `E2-T7` — Verificación local end-to-end

**Depends on:** `E1-T4`, `E1-T6`, `E2-T2`, `E2-T4`, `E2-T6` · **Priority:** p0

No crea funcionalidad nueva — corre el gate completo de Fase 1 + Fase 2 junto, en el estado final
del árbol, y confirma que los 13 checkpoints previos de esta fase existen.

**Files**
- ninguno propio

**Acceptance**

1. **WHEN** el gate completo corre sobre el árbol actual **THE SYSTEM SHALL** reportar 0 fallos en lint, typecheck, tests unitarios, tests de integración, y todos los suites E2E (Fase 1 + Fase 2).
2. **WHEN** se re-ejecuta el Bootstrap sobre un árbol ya bootstrapeado **THE SYSTEM SHALL** salir con 0 sin revertir `package.json`, `.claude/settings.json`, ni `docker-compose.prod.yml`.

**Verify**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
test "$(git tag -l 'step-19-*' 'step-20-*' 'step-21-*' 'step-22-*' 'step-23-*' 'step-24-*' 'step-25-*' 'step-26-*' 'step-27-*' 'step-28-*' 'step-29-*' 'step-30-*' 'step-31-*' | wc -l)" = 13
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T7: verificacion local end-to-end — fase 2 cerrada"
git tag step-32-verification
```

---

## Epic acceptance

El epic está terminado cuando las 7 tasks están `done` **y**:

1. **WHEN** una pieza programada llega a su `scheduled_at` **THE SYSTEM SHALL** publicarla sin
   intervención manual y reflejar el resultado en el dashboard en vivo, de punta a punta.
2. **WHEN** un adaptador de canal falla repetidamente **THE SYSTEM SHALL** degradar a
   `content_channel_target.status='failed'` con un mensaje de error visible, nunca dejar el
   registro indefinidamente en `publishing`.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/publications-dashboard.spec.ts tests/e2e/publications-live.spec.ts
```

## Pitfalls

- **Fusionar el worker de publicación con el de webhooks entrantes de Fase 1.** Son procesos y
  colas distintos a propósito — mezclarlos acopla el fan-out de eventos entrantes con el poller de
  salida, que tienen perfiles de carga y de fallo completamente diferentes.
- **Inventar el endpoint de publicación de un proveedor de memoria.** Ver la nota VERIFY de
  `E2-T1` — es la superficie de mayor riesgo de esta fase (§20.2 del blueprint).
- **Rate-limitear por organización en vez de por usuario en `/api/v1/media`.** El límite de esta
  fase es por usuario — limitar por organización penalizaría a todo un equipo por la actividad de
  una sola persona.

## Before moving on

- [ ] Las 7 tasks de este epic están `done` en `tasks.json` — ninguna en `in_progress`.
- [ ] Cada `verify` de cada task pasó completo, no solo el primer comando.
- [ ] Ningún `verify` fue editado, ni saltado porque un archivo que nombra no existía.
- [ ] **Los 7 checkpoints de este epic existen en git** — `git tag -l 'step-2[6-9]-*' 'step-3[0-2]-*'` lista 7.
- [ ] Gate command pasa limpio, corrido desde la raíz del proyecto.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] `.env.example` actualizado con las variables de producción de MinIO.
- [ ] Un commit por task, cada uno prefijado con su id de task, cada uno seguido de su tag de checkpoint.
