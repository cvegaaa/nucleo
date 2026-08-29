# Epic 02: Canales y bandeja

> Al terminar esta epic existe: gestión de miembros e invitaciones, los 4 webhooks entrantes
> (WhatsApp, Instagram, Facebook, TikTok) verificados y encolados de forma idempotente, un worker de
> BullMQ que procesa esos eventos con reintentos y dead-letter, el CRUD de conversación/mensaje
> vinculado automáticamente a un `contact`, la bandeja unificada con filtros y paginación, y las
> actualizaciones en vivo vía Socket.IO + adaptador Redis.

| | |
|---|---|
| **Epic id** | `02-canales-y-bandeja` |
| **Tasks** | `E2-T1` … `E2-T6` |
| **Depends on** | `01-fundacion-y-datos` |
| **Unlocks** | `03-copiloto-y-hardening` |
| **Parallel with** | nothing — cada tarea depende de la anterior |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16 (App Router) · TypeScript 6.0.3 · Drizzle ORM · BullMQ 6.1.1 + ioredis 5.11.1 + Redis
8.10.0 · Socket.IO 4.8.3 + `@socket.io/redis-adapter` 8.3.0 · TanStack Query 5. Package manager:
`pnpm`. Runtime pinned in `.nvmrc`. Dependency versions are in `pnpm-lock.yaml` — read it, never
guess one.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {path}` |
| E2E (un archivo) | `pnpm test:e2e {path}` |
| Worker de background jobs | `pnpm worker` (corre `scripts/worker.ts`) |
| Servicios locales | `docker compose up -d postgres redis` / `docker compose down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Todo task de esta epic que verifica contra Postgres o Redis reales necesita
`docker compose up -d postgres redis` corriendo primero. El archivo que los define
(`docker-compose.yml`) ya está en el root del proyecto desde `workspace/` — no lo escribes aquí.
Los tests de webhook usan **fixtures grabados**, nunca llamadas reales a WhatsApp/Instagram/
Facebook/TikTok.

## Directory subtree

Solo las partes que esta epic toca:

```
src/
  app/
    api/
      members/route.ts             # NEW en E2-T1
      invitations/route.ts         # NEW en E2-T1
      webhooks/
        whatsapp/route.ts          # NEW en E2-T2
        instagram/route.ts         # NEW en E2-T2
        facebook/route.ts          # NEW en E2-T2
        tiktok/route.ts            # NEW en E2-T2
      conversations/route.ts       # NEW en E2-T4
      conversations/[id]/route.ts  # NEW en E2-T4
    (app)/
      settings/members/page.tsx    # NEW en E2-T1
      inbox/page.tsx                # NEW en E2-T5
  components/
    inbox/
      conversation-list.tsx        # NEW en E2-T5
      conversation-view.tsx        # NEW en E2-T5
      filters-bar.tsx              # NEW en E2-T5
  server/
    members.ts                     # NEW en E2-T1
    channels/
      whatsapp.ts                  # NEW en E2-T2
      instagram.ts                 # NEW en E2-T2
      facebook.ts                  # NEW en E2-T2
      tiktok.ts                    # NEW en E2-T2
    conversations.ts               # NEW en E2-T4, editado en E2-T6
    contacts.ts                    # NEW en E2-T4
  lib/
    queue/
      connection.ts                 # NEW en E2-T3
      index.ts                      # NEW en E2-T3
    realtime/
      server.ts                     # NEW en E2-T6
      client.ts                     # NEW en E2-T6
scripts/
  worker.ts                        # NEW en E2-T3, editado en E2-T4 y E2-T6
tests/
  integration/
    members.test.ts                # NEW en E2-T1
    webhooks.test.ts               # NEW en E2-T2
    queue.test.ts                  # NEW en E2-T3
    conversations.test.ts          # NEW en E2-T4
  e2e/
    inbox.spec.ts                  # NEW en E2-T5
    inbox-live.spec.ts             # NEW en E2-T6
```

Everything outside this subtree is out of scope. Si una tarea parece requerir editar un archivo no
listado aquí, detente y repórtalo.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `invitation` | todos | poblada por `E2-T1` |
| `channel_connection` | todos | poblada por `E2-T2` (creación manual — sin UI de conexión en Fase 1, ver `blueprint.md` §6) |
| `contact`, `tag`, `contact_tag` | todos | `findOrCreateContact` en `E2-T4` |
| `conversation`, `message` | todos | CRUD completo en `E2-T4`, consumidos en vivo por `E2-T5`/`E2-T6` |
| `jobs`, `job_dead_letters`, `idempotency_keys` | todos | procesamiento de webhooks en `E2-T2`/`E2-T3` |

Ninguna tabla nueva — todas ya existen desde `01-fundacion-y-datos` `E1-T3`. Esta epic las puebla.

## Contracts

**Consumed** — ya existe, no lo reconstruyas:

| From | Interface | Guarantee |
|---|---|---|
| `01-fundacion-y-datos` | `src/server/tenancy.ts` → `requirePermission(session, orgId, permissionKey)` | lanza si falla; el handler traduce a 404 |
| `01-fundacion-y-datos` | `src/lib/audit.ts` → `recordAuditEvent(tx, event)` | debe llamarse dentro de la misma transacción Drizzle que la mutación |
| `01-fundacion-y-datos` | `src/lib/db/index.ts` → `db` | cliente Drizzle exportado |
| `01-fundacion-y-datos` | `src/lib/auth.ts` → `getSession` | sesión server-side |

**Produced** — la epic 03 depende exactamente de estas firmas. Cambiar una las rompe:

| Export | Signature | Used by |
|---|---|---|
| `src/server/conversations.ts` → funciones de lectura/actualización de conversación | recibe `orgId` resuelto por sesión, nunca de query param sin verificar | `03-copiloto-y-hardening` (el copiloto lee el contexto de la conversación abierta) |
| `src/lib/realtime/server.ts` → `emitConversationUpdate` | `(orgId, conversationId, event) => void`, emite al room `org:<orgId>` | `03-copiloto-y-hardening` (el copiloto también emite actualizaciones) |

## Conventions that bite in this area

- La verificación de firma de cada webhook corre **sobre el raw body**, nunca sobre el body ya
  parseado — parsear puede reordenar bytes y romper la firma.
- El `event_id` del proveedor es la clave de idempotencia — insertado en `idempotency_keys` antes de
  encolar, nunca después.
- El worker de BullMQ requiere `maxRetriesPerRequest: null` en la conexión `ioredis` que se le pasa
  — es obligatorio en BullMQ 6.x, su ausencia produce errores silenciosos de reintento.
- **VERIFY antes de implementar `E2-T2`:** la versión exacta de la API de cada plataforma (Graph API
  de Meta para WhatsApp/Instagram/Facebook, TikTok for Business API) no se verificó en vivo al
  generar este blueprint. Confirma la versión vigente contra la documentación oficial del proveedor
  antes de escribir la verificación de firma y el parseo de payload — nunca inventes endpoints ni
  shapes de payload de memoria. Registra la versión confirmada en un comentario al inicio de cada
  archivo de canal.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/tenancy.md`,
`.claude/rules/database.md`. Both sit in the project root — the builder copied them there from the
bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom.

### `E2-T1` — Roles catalog and member management

**Depends on:** E1-T6 · **Priority:** p0

Escribe `src/server/members.ts` (invitar, aceptar invitación, cambiar rol, remover miembro — cada
uno llamando `requirePermission` primero y `recordAuditEvent` dentro de la misma transacción). Crea
`src/app/api/members/route.ts`, `src/app/api/invitations/route.ts`. Crea
`src/app/(app)/settings/members/page.tsx` con tabla de miembros, formulario de invitar, y cambio de
rol inline. Función mínima de envío de correo (SMTP configurable) para el link de invitación.

**Files**
- `src/server/members.ts` — new
- `src/app/api/members/route.ts` — new
- `src/app/api/invitations/route.ts` — new
- `src/app/(app)/settings/members/page.tsx` — new
- `tests/integration/members.test.ts` — new

**Acceptance**

1. **WHEN** un owner invita a un email con un rol válido **THE SYSTEM SHALL** crear una
   `invitation` con token único y expiración de 7 días, y enviar un correo con el link.
2. **WHEN** se visita el link de aceptación con un token válido y no expirado **THE SYSTEM SHALL**
   crear la `membership` correspondiente y marcar la invitación como usada.
3. **WHEN** se visita el link con un token expirado **THE SYSTEM SHALL** responder con un error
   claro sin crear la membership.
4. **WHEN** un miembro sin `member.manage` intenta cambiar el rol de otro miembro **THE SYSTEM
   SHALL** responder 404 (vía `requirePermission`).
5. **WHEN** un owner remueve a un miembro **THE SYSTEM SHALL** borrar la `membership` y registrar un
   `audit_event` con action `member.removed` en la misma transacción.

**Verify**

```bash
pnpm test tests/integration/members.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: roles catalog and member management"
git tag step-07-members
```

### `E2-T2` — Channel connections and inbound webhooks

**Depends on:** E2-T1 · **Priority:** p0

Escribe `src/server/channels/whatsapp.ts`, `instagram.ts`, `facebook.ts`, `tiktok.ts` — cada uno con
verificación de firma sobre raw body específica del proveedor, y una función
`normalizeInboundEvent` que traduce el payload a un shape interno común `{ externalAccountId,
externalEventId, contactExternalId, contactName, body, mediaUrls }`. Crea las 4 rutas
`src/app/api/webhooks/<canal>/route.ts` que verifican firma → chequean idempotencia → encolan un
job BullMQ con el evento normalizado → responden 200. Ver "VERIFY" en Conventions arriba antes de
empezar.

**Files**
- `src/server/channels/*.ts` — new: whatsapp.ts, instagram.ts, facebook.ts, tiktok.ts
- `src/app/api/webhooks/*/route.ts` — new: 4 rutas, una por canal
- `tests/integration/webhooks.test.ts` — new

**Acceptance**

1. **WHEN** un webhook de WhatsApp llega con firma inválida sobre el raw body **THE SYSTEM SHALL**
   responder 401 y no encolar ningún job.
2. **WHEN** un webhook llega con firma válida y un `event_id` nunca visto por esta org **THE SYSTEM
   SHALL** insertar en `idempotency_keys`, encolar exactamente un job, y responder 200 en menos de 1
   segundo.
3. **WHEN** el mismo `event_id` llega dos veces para la misma org **THE SYSTEM SHALL** responder 200
   ambas veces sin encolar un segundo job.
4. **WHEN** el `external_account_id` del payload no corresponde a ningún `channel_connection` activo
   **THE SYSTEM SHALL** responder 404 sin filtrar información sobre qué cuentas existen.
5. **WHEN** los 4 canales reciben el mismo evento estructuralmente equivalente **THE SYSTEM SHALL**
   producir el mismo shape normalizado interno antes de encolarlo.

**Verify**

```bash
pnpm test tests/integration/webhooks.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: channel connections and inbound webhooks"
git tag step-08-webhooks
```

### `E2-T3` — Background job runner with BullMQ

**Depends on:** E2-T2 · **Priority:** p0

Escribe `src/lib/queue/connection.ts` (conexión `ioredis` compartida, con
`maxRetriesPerRequest: null` — obligatorio para el `Worker` de BullMQ 6.x). Escribe
`src/lib/queue/index.ts` (colas exportadas: `inboundEventsQueue`). Escribe `scripts/worker.ts` (un
proceso `Worker` que procesa `inboundEventsQueue` con backoff exponencial con jitter y dead-letter a
`job_dead_letters` tras 5 intentos fallidos; deja un stub `emitConversationUpdate` que `E2-T6`
implementa, y stubs de creación de contact/conversation/message que `E2-T4` implementa).

**Files**
- `src/lib/queue/connection.ts` — new
- `src/lib/queue/index.ts` — new
- `scripts/worker.ts` — new
- `tests/integration/queue.test.ts` — new

**Acceptance**

1. **WHEN** se encola un job válido en `inboundEventsQueue` **THE SYSTEM SHALL** procesarlo y
   marcarlo completado en menos de 5 segundos en el entorno de test.
2. **WHEN** el handler del job lanza una excepción **THE SYSTEM SHALL** reintentar con backoff
   exponencial hasta 5 intentos.
3. **WHEN** un job agota sus 5 intentos **THE SYSTEM SHALL** insertar una fila en
   `job_dead_letters` con el error y dejar de reintentar.
4. **WHEN** dos jobs con el mismo `idempotency_key` de evento normalizado se procesan (carrera de
   reintentos) **THE SYSTEM SHALL** producir un único `message` — no duplicado.

**Verify**

```bash
pnpm test tests/integration/queue.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: background job runner with BullMQ"
git tag step-09-queue
```

### `E2-T4` — Conversation and message CRUD

**Depends on:** E2-T3 · **Priority:** p0

Escribe `src/server/conversations.ts` (crear/listar/actualizar estado y asignación, todo vía
`requirePermission`), `src/server/contacts.ts` (`findOrCreateContact`, usada tanto por el worker
como por creación manual futura). Crea `src/app/api/conversations/route.ts` y
`src/app/api/conversations/[id]/route.ts`. Conecta el worker de `E2-T3` para que use
`findOrCreateContact` y la lógica real de creación de conversación/mensaje en vez del stub.

**Files**
- `src/server/conversations.ts` — new
- `src/server/contacts.ts` — new
- `src/app/api/conversations/route.ts` — new
- `src/app/api/conversations/[id]/route.ts` — new
- `scripts/worker.ts` — edit: reemplaza el stub de creación de contact/conversation/message

**Acceptance**

1. **WHEN** llega el primer mensaje entrante de un contacto nunca visto en un canal **THE SYSTEM
   SHALL** crear un `contact` con el `external_ids` de ese canal poblado, y una `conversation` nueva
   en estado `open`.
2. **WHEN** llega un segundo mensaje entrante del mismo contacto en el mismo canal dentro de una
   conversación existente **THE SYSTEM SHALL** reutilizar el `contact` y la `conversation`
   existentes, insertando solo un nuevo `message`.
3. **WHEN** un usuario con `conversation.assign` cambia el `assignedTo` de una conversación **THE
   SYSTEM SHALL** persistir el cambio y registrar un `audit_event` con action
   `conversation.assigned`.
4. **WHEN** un usuario lista conversaciones filtrando por `status=open&channel=whatsapp` **THE
   SYSTEM SHALL** retornar solo conversaciones de su organización que cumplen ambos filtros,
   paginadas por cursor.

**Verify**

```bash
pnpm test tests/integration/conversations.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: conversation and message crud"
git tag step-10-conversations
```

### `E2-T5` — Unified inbox

**Depends on:** E2-T4 · **Priority:** p0

Construye `src/app/(app)/inbox/page.tsx` (Server Component, carga inicial),
`src/components/inbox/conversation-list.tsx`, `conversation-view.tsx`, `filters-bar.tsx` (Client
Components, TanStack Query). Filtros por canal/estado/prioridad/responsable reflejados en la URL.
Búsqueda simple (LIKE sobre `contact.name`/`message.body`, sin full-text search en Fase 1).
Paginación cursor con scroll infinito. Estados vacío/carga/error. Dentro de `conversation-list.tsx`,
`ConversationListItem` renderiza una insignia de canal (SVG inline, sin dependencia ni archivo nuevo)
superpuesta en la esquina inferior derecha del avatar del contacto — WhatsApp `#25D366`, Instagram
`#DD2A7B`, Facebook `#1877F2`, TikTok `#000000`/`#25F4EE` — con `aria-label` del nombre del canal.

**Files**
- `src/app/(app)/inbox/page.tsx` — new
- `src/components/inbox/conversation-list.tsx` — new
- `src/components/inbox/conversation-view.tsx` — new
- `src/components/inbox/filters-bar.tsx` — new
- `tests/e2e/inbox.spec.ts` — new

**Acceptance**

1. **WHEN** un usuario visita `/app/inbox` con conversaciones existentes **THE SYSTEM SHALL**
   renderizar la lista ordenada por `last_message_at` descendente en el primer response del
   servidor, sin spinner de carga inicial.
2. **WHEN** el usuario aplica el filtro `status=pending` **THE SYSTEM SHALL** actualizar la URL con
   el search param correspondiente y refetch solo las conversaciones que cumplen el filtro.
3. **WHEN** no hay conversaciones que cumplan los filtros activos **THE SYSTEM SHALL** mostrar el
   estado vacío específico "Sin resultados para estos filtros", distinto del estado vacío de "sin
   canales conectados".
4. **WHEN** el usuario hace scroll hasta el final de la lista **THE SYSTEM SHALL** cargar la
   siguiente página vía cursor sin recargar las anteriores.
5. **WHEN** se renderiza un `ConversationListItem` **THE SYSTEM SHALL** mostrar la insignia del
   canal (whatsapp/instagram/facebook/tiktok) superpuesta en el avatar, visible sin abrir la
   conversación, con `aria-label` legible por lector de pantalla.

**Verify**

```bash
pnpm test:e2e tests/e2e/inbox.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: unified inbox"
git tag step-11-inbox
```

### `E2-T6` — Realtime inbox updates

**Depends on:** E2-T5 · **Priority:** p0

Escribe `src/lib/realtime/server.ts` (servidor Socket.IO adjunto al servidor Node de Next.js
standalone, con `@socket.io/redis-adapter` conectado a la misma instancia Redis que BullMQ, rooms
por `org_id`). Escribe `src/lib/realtime/client.ts` (hook `useRealtimeConversations(orgId)` que se
suscribe al room de la org e invalida las queries de TanStack Query correspondientes). Conecta el
`emitConversationUpdate` real en `scripts/worker.ts` (reemplaza el stub de `E2-T3`) y en
`src/server/conversations.ts` (cambios de estado/asignación también emiten).

**Files**
- `src/lib/realtime/server.ts` — new
- `src/lib/realtime/client.ts` — new
- `scripts/worker.ts` — edit: reemplaza el stub de `emitConversationUpdate`
- `src/server/conversations.ts` — edit: emite en cambios de estado/asignación
- `tests/e2e/inbox-live.spec.ts` — new

**Acceptance**

1. **WHEN** llega un mensaje entrante nuevo para una conversación visible en la bandeja de un
   usuario conectado **THE SYSTEM SHALL** actualizar la lista sin que el usuario recargue la página.
2. **WHEN** un usuario de la organización A está conectado y llega un evento de la organización B
   **THE SYSTEM SHALL** no entregarlo — el room de Socket.IO aísla por `org_id`.
3. **WHEN** el servidor Node se reinicia con múltiples instancias detrás del mismo Redis **THE
   SYSTEM SHALL** seguir entregando eventos a clientes conectados a una instancia distinta de la que
   originó el evento — verificado con dos procesos de servidor apuntando al mismo Redis en el test.

**Verify**

```bash
pnpm test:e2e tests/e2e/inbox-live.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: realtime inbox updates"
git tag step-12-realtime
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** un evento de webhook entrante de cualquiera de los 4 canales llega con firma válida
   **THE SYSTEM SHALL** convertirse en un mensaje visible en la bandeja unificada de la organización
   correcta, actualizado en vivo sin recargar la página, en menos de 5 segundos desde la recepción
   del webhook.
2. **WHEN** el mismo evento de webhook se reintenta (mismo `event_id`) **THE SYSTEM SHALL** producir
   exactamente un `message`, nunca un duplicado, en cualquier punto de la cadena
   webhook→cola→worker.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/inbox.spec.ts tests/e2e/inbox-live.spec.ts
```

Run from the project root. Ambos criterios son decidibles por estos comandos.

## Pitfalls

- **Verificar la firma sobre el body ya parseado.** Reordena bytes y rompe la verificación —
  siempre sobre el raw body.
- **Encolar antes de chequear idempotencia.** Invierte el orden y un reintento del proveedor duplica
  el trabajo antes de que el ledger lo detecte.
- **Olvidar `maxRetriesPerRequest: null`** en la conexión ioredis pasada al `Worker` — BullMQ 6.x lo
  requiere explícitamente o los reintentos fallan silenciosamente.
- **Inventar la versión de API de un canal de memoria.** Ver el VERIFY en Conventions — la versión
  vigente de cada plataforma debe confirmarse contra su documentación oficial antes de escribir el
  parseo de payload.
- **Emitir eventos realtime sin aislar por `org_id`.** Un evento de la organización B llegando a un
  cliente de la organización A es una fuga de datos cruzada, exactamente lo que `01-fundacion-y-datos`
  probó que no debía pasar.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** —
      `step-07-members` through `step-12-realtime`. `git tag -l 'step-0[7-9]-*' 'step-1[0-2]-*'`
      lists them.
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` updated if this epic added a variable — `WHATSAPP_APP_SECRET`,
      `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET`, `TIKTOK_APP_SECRET`, `SMTP_URL` are already
      there from `workspace/`.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
