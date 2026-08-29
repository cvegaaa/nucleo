# Epic 02: Ganchos entre fases, dashboard de inicio y cierre

> Al terminar este epic, los 5 eventos que importan (mensaje entrante, aprobación de copiloto, canal
> desconectado, aprobación de contenido, automatización fallida) disparan push, y `/app` reemplaza a
> `/app/inbox` como destino post-login con un resumen real de qué necesita atención.

| | |
|---|---|
| **Epic id** | `02-hooks-dashboard` |
| **Tasks** | `E2-T1` … `E2-T10` |
| **Depends on** | `01-push-infraestructura` (necesita `sendPushNotification` de `E1-T3`, y la app opt-in de `E1-T5` antes de `E2-T9`) |
| **Unlocks** | nada — es el último epic del bundle |
| **Parallel with** | `E2-T1`, `E2-T2`, `E2-T3`, `E2-T5`, `E2-T6` no comparten archivos entre sí y todas dependen solo de `E1-T3` (epic `01`) — pueden correr en paralelo entre ellas. `E2-T4` depende de `E2-T3` y no es paralelizable con ella. |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16 (App Router, standalone) · TypeScript · Tailwind CSS 4 · shadcn/Radix · Postgres 17 ·
Drizzle ORM · better-auth · BullMQ + ioredis · Socket.IO · `web-push@3.6.7` (de `01`). Package
manager: `pnpm`. Runtime pinned in `.nvmrc`. Dependency versions are in `pnpm-lock.yaml` — read it,
never guess one.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (one file) | `pnpm test {path}` |
| E2E | `pnpm test:e2e {path}` |
| Build | `pnpm build` |
| Servicios locales | `pnpm services:up` / `pnpm services:down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

`sendPushNotification` (de `01`, `E1-T3`) ya está en el árbol antes de la primera tarea de este
epic — no la reimplementes, impórtala desde `src/lib/push/send.ts`.

**Nota de división:** la task original que agrupaba detección de desconexión + banner de UI tocaba 8
archivos, por encima del límite de ~5 por task — se dividió en `E2-T3` (detección en los 4 webhooks)
y `E2-T4` (banner de UI). Los checkpoints permanecen continuos (`step-54`..`step-63` para este epic).

## Directory subtree

Solo las partes que este epic toca:

```
src/
  app/
    (app)/
      layout.tsx                          # EDITAS E2-T4 — agrega <DisconnectedBanner />
      page.tsx                            # NUEVO E2-T8 — dashboard, reemplaza el redirect a /app/inbox
  components/
    channels/disconnected-banner.tsx      # NUEVO E2-T4
    dashboard/attention-list.tsx          # NUEVO E2-T8
  server/
    channels/connection-health.ts         # NUEVO E2-T3 — markChannelDisconnected(), listDisconnectedChannels()
    copilot/runs.ts                       # EDITAS E2-T2 — existe desde Fase 1
    content/approvals.ts                  # EDITAS E2-T5 — existe desde Fase 2
    automations/action-runner.ts          # EDITAS E2-T6 — existe desde Fase 3
    dashboard/queries.ts                  # NUEVO E2-T7 — getAttentionSummary
  app/api/webhooks/
    whatsapp/route.ts, instagram/route.ts, facebook/route.ts, tiktok/route.ts   # EDITAS E2-T3
  proxy.ts                                # EDITAS E2-T8 — destino post-login
  lib/auth.ts                             # EDITAS E2-T8 — destino post-signup
scripts/
  worker.ts                               # EDITAS E2-T1 — existe desde Fase 1
tests/
  hooks/{message-push,copilot-approval-push,channel-disconnect-push,content-approval-push,automation-failed-push}.test.ts
  channels/disconnected-banner.test.tsx   # NUEVO E2-T4
  dashboard/queries.test.ts
  e2e/{notifications-opt-in,dashboard,a11y}.spec.ts   # notifications-opt-in ya existe de 01, se edita en E2-T9
```

Everything outside this subtree is out of scope. If a task seems to require editing a file not
listed here, stop and report — it means the epic boundary is wrong.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `conversation` / `message` | lee `assigned_to`, `direction` (`E2-T1`) | no agrega columnas |
| `tool_calls` / `runs` / `approvals` | lee, crea fila en `approvals` ya existente (`E2-T2`) | no agrega columnas |
| `channel_connection` | escribe `status = 'disconnected'` (`E2-T3`) — mismo campo `text` ya existente, sin migración de tipo | no agrega columnas nuevas — decisión documentada en `blueprint.md` §0/§20.3 Decisión #3 |
| `content_approval` | lee el evento de creación en `pending` (`E2-T5`) | no agrega columnas |
| `automation_run` / `automation` | lee `status`, `created_by` (`E2-T6`, `E2-T7`) | no agrega columnas |
| `push_subscription` | solo lectura, vía `sendPushNotification` del epic `01` | todas las tasks de ganchos |

Ningún gancho de este epic agrega una columna nueva — solo lee/actualiza tablas ya existentes de
Fase 1/2/3 y llama al contrato producido por el epic `01`.

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `01-push-infraestructura` `src/lib/push/send.ts` | `sendPushNotification(userId, payload) => Promise<void>` | nunca lanza — cada gancho lo llama sin try/catch adicional |
| Fase 1 `scripts/worker.ts` | llama `emitConversationUpdate` tras crear el `message` inbound (confirmar con `grep -n "emitConversationUpdate" scripts/worker.ts`) | `E2-T1` agrega la llamada inmediatamente después, sin cambiar el contrato de la cola |
| Fase 1 `src/server/copilot/runs.ts` | rama `requiresApprovalFirstUse` que crea fila en `approvals` (confirmar con `grep -n "requiresApprovalFirstUse" src/server/copilot/runs.ts`) | `E2-T2` agrega la llamada, sin cambiar el flujo de aprobación |
| Fase 1 4 route handlers de webhook | rama 404 cuando `external_account_id` no resuelve a `channel_connection` activo (confirmar con `grep -rl "external_account_id" src/app/api/webhooks/*/route.ts`, debe dar 4) | `E2-T3` agrega el efecto secundario en esa rama, sin cambiar el código/body de la respuesta 404 |
| `02-hooks-dashboard` `src/server/channels/connection-health.ts` (`E2-T3`) | `listDisconnectedChannels(orgId)` | `E2-T4` la consume para decidir si renderiza el banner |
| Fase 2 `src/server/content/approvals.ts` `requestApproval` | crea `content_approval` en `pending` (confirmar con `grep -n "requestApproval" src/server/content/approvals.ts`) | `E2-T5` agrega la llamada, sin cambiar el contrato |
| Fase 3 `src/server/automations/action-runner.ts` | marca `automation_run.status` en `failed`/`partial`/`completed` (confirmar con `grep -n "'failed'" src/server/automations/action-runner.ts`) | `E2-T6` agrega la llamada solo en la rama `'failed'`, sin tocar la lógica de reintentos |
| Fase 1 `src/proxy.ts` / `src/lib/auth.ts` | destino post-login/signup actual — **la ubicación exacta del literal `/app/inbox` debe confirmarse por inspección real del código, no por el grep de respaldo por sí solo** (ver la task `E2-T8`) | `E2-T8` cambia el/los literal(es) real(es) a `/app`, nada más |

**Produced** — nada de este epic es consumido por trabajo posterior dentro de este blueprint (es el
último epic).

## Conventions that bite in this area

- **Cada gancho es una llamada al final de una función ya existente, nunca una reescritura.** Si al
  editar sientes que necesitas restructurar el flujo original, detente — el edit correcto es
  aditivo.
- **El test de la fase original SIEMPRE corre junto al test nuevo del gancho.** Cada task de este
  epic que edita un archivo de Fase 1/2/3 lo dice explícitamente en su `Verify` — no lo omitas
  aunque el test nuevo ya pase.
- **`automation_run.status = 'partial'` no dispara push, solo `'failed'`** — decisión documentada en
  `blueprint.md` §20.3 Decisión #5. La trampa más fácil de este epic es agregar la llamada en la rama
  equivocada, o en ambas.
- **`getAttentionSummary` filtra `org_id` explícito en cada una de sus 4 consultas**, sin excepción —
  regla no-negociable heredada de Fase 1-3.
- **`getAttentionSummary` no fusiona `approvals`/`content_approval`/`automation_action_approval` en un
  esquema común** — son tres dominios distintos, van en tres campos separados del resultado.
- `/app` es Server Component puro — no le agregues TanStack Query ni polling.
- **No asumas dónde vive el redirect post-login/signup solo porque el grep de respaldo dio matches en
  `src/proxy.ts` y `src/lib/auth.ts`.** El grep confirma que el string `/app/inbox` aparece en alguno
  de los dos archivos, no confirma qué hace cada uno con él — `src/proxy.ts` solo protege rutas sin
  sesión (ver `blueprint.md` §0 y la task `E2-T8`). Inspecciona el código real antes de editar.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/push-notifications.md`. Both sit in the
project root — the builder copied them there from the bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom.

### `E2-T1` — Hook: mensaje entrante → push

**Depends on:** `E1-T3` (epic `01`) · **Priority:** p0

**Edita código de Fase 1 ya cerrado.** Confirma primero: `grep -n "emitConversationUpdate"
scripts/worker.ts` debe dar ≥1 match. Inmediatamente después de esa llamada, agrega: si
`conversation.assignedTo` no es null, llama `sendPushNotification(conversation.assignedTo, {...})`;
si es null, resuelve los `user_id` de la org con permiso `conversation.reply` y llama
`sendPushNotification` para cada uno. Nunca dejes que un fallo de `sendPushNotification` propague
hacia el resto del worker. Tras editar, corre `pnpm test tests/integration/queue.test.ts` (gate
original de Fase 1, paso 9) y confirma que sigue en verde.

**Files**
- `scripts/worker.ts` — edit
- `tests/hooks/message-push.test.ts` — new

**Acceptance**

1. **WHEN** el worker procesa un mensaje entrante para una conversación con `assignedTo` no nulo **THE SYSTEM SHALL** llamar `sendPushNotification` exactamente una vez, con ese `user_id`.
2. **WHEN** el worker procesa un mensaje entrante para una conversación sin asignar **THE SYSTEM SHALL** llamar `sendPushNotification` una vez por cada usuario de la organización con permiso `conversation.reply`.
3. **WHEN** `sendPushNotification` es mockeado para rechazar (simulando un fallo interno no capturado) **THE SYSTEM SHALL** completar el procesamiento del job igual — el job de BullMQ se marca completado, no se reintenta por esta causa.
4. **WHEN** `pnpm test tests/integration/queue.test.ts` corre (el test de Fase 1, sin modificar) **THE SYSTEM SHALL** seguir reportando exit 0, 0 failed — esta edición no rompe el gate original.

**Verify**

```bash
pnpm typecheck
pnpm test tests/hooks/message-push.test.ts
pnpm test tests/integration/queue.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: hook mensaje entrante -> push"
git tag step-54-hook-message
```

### `E2-T2` — Hook: aprobación de copiloto pendiente → push

**Depends on:** `E1-T3` (epic `01`) · **Priority:** p0

**Edita código de Fase 1 ya cerrado.** Confirma primero: `grep -n "requiresApprovalFirstUse"
src/server/copilot/runs.ts` debe dar ≥1 match. Inmediatamente después de que esa rama crea la fila en
`approvals` y detiene el run en `pending`, resuelve los `user_id` con el `permission_key` del
`tool_name` en cuestión y llama `sendPushNotification` para cada uno. Tras editar, corre el test
original de Fase 1 que cubre este flujo (confirma el nombre con `grep -rl
"requiresApprovalFirstUse" tests/`) y confirma que sigue en verde.

**Files**
- `src/server/copilot/runs.ts` — edit
- `tests/hooks/copilot-approval-push.test.ts` — new

**Acceptance**

1. **WHEN** el copiloto invoca por primera vez en una organización una tool call marcada `requiresApprovalFirstUse` **THE SYSTEM SHALL** llamar `sendPushNotification` una vez por cada usuario con el `permission_key` de esa tool.
2. **WHEN** la misma organización invoca la misma tool una segunda vez (ya aprobada, ejecución directa sin nueva fila en `approvals`) **THE SYSTEM SHALL NOT** llamar `sendPushNotification` para ese evento.
3. **WHEN** una organización no tiene ningún usuario con el `permission_key` requerido (caso borde) **THE SYSTEM SHALL** no llamar `sendPushNotification` y no lanzar ninguna excepción.
4. **WHEN** el test original de Fase 1 para el flujo de aprobación del copiloto corre **THE SYSTEM SHALL** seguir reportando exit 0 — esta edición no rompe el gate original.

**Verify**

```bash
pnpm typecheck
pnpm test tests/hooks/copilot-approval-push.test.ts
FILES=$(grep -rl "requiresApprovalFirstUse" tests/); [ -n "$FILES" ] || exit 1; echo "$FILES" | xargs pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: hook aprobacion de copiloto -> push"
git tag step-55-hook-copilot-approval
```

### `E2-T3` — Hook: canal desconectado — detección en los 4 webhooks

**Depends on:** `E1-T3` (epic `01`) · **Priority:** p0

**Edita código de Fase 1 ya cerrado, en 4 archivos.** Confirma primero: `grep -rl
"external_account_id" src/app/api/webhooks/*/route.ts` debe dar **4** matches. Crea
`src/server/channels/connection-health.ts` exportando `markChannelDisconnected(channelConnectionId,
reason)` — actualiza `channel_connection.status = 'disconnected'` y llama `sendPushNotification` para
cada `user_id` con rol `owner` de la org — y `listDisconnectedChannels(orgId)` (esta última la
consume `E2-T4`, se implementa aquí porque vive en el mismo archivo). En los 4 route handlers, en la
rama que hoy responde 404, agrega la llamada a `markChannelDisconnected` **antes** de responder 404 —
la respuesta HTTP no cambia. Tras editar los 4 handlers, corre `pnpm test:e2e
tests/e2e/tenant-isolation.spec.ts` y confirma que sigue en verde.

**Files**
- `src/server/channels/connection-health.ts` — new
- `src/app/api/webhooks/whatsapp/route.ts` — edit
- `src/app/api/webhooks/instagram/route.ts` — edit
- `src/app/api/webhooks/facebook/route.ts` — edit
- `src/app/api/webhooks/tiktok/route.ts` — edit
- `tests/hooks/channel-disconnect-push.test.ts` — new

**Acceptance**

1. **WHEN** llega un webhook con `external_account_id` que no corresponde a ningún `channel_connection` activo **THE SYSTEM SHALL** responder `404` (comportamiento idéntico al de Fase 1) Y llamar `markChannelDisconnected` para ese `channel_connection`.
2. **WHEN** `markChannelDisconnected` se ejecuta **THE SYSTEM SHALL** actualizar `channel_connection.status` a `'disconnected'` y llamar `sendPushNotification` una vez por cada `owner` de la organización.
3. **WHEN** el test de integración de webhooks original de Fase 1 corre **THE SYSTEM SHALL** seguir reportando exit 0 — el código y body de la respuesta 404 no cambiaron.

**Verify**

```bash
pnpm typecheck
pnpm test tests/hooks/channel-disconnect-push.test.ts
pnpm test tests/integration/webhooks.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: hook canal desconectado -- deteccion en los 4 webhooks"
git tag step-56-hook-disconnect-webhooks
```

### `E2-T4` — Hook: canal desconectado — banner persistente en (app)

**Depends on:** `E2-T3` · **Priority:** p0

Crea `src/components/channels/disconnected-banner.tsx` (Server Component) que renderiza la barra de
`blueprint.md` §7 si `listDisconnectedChannels` (de `E2-T3`) devuelve ≥1 fila. Móntalo en
`src/app/(app)/layout.tsx`.

**Files**
- `src/components/channels/disconnected-banner.tsx` — new
- `src/app/(app)/layout.tsx` — edit: monta `<DisconnectedBanner />`
- `tests/channels/disconnected-banner.test.tsx` — new

**Acceptance**

1. **WHEN** un usuario visita cualquier ruta de `(app)` y su organización tiene ≥1 `channel_connection` con `status = 'disconnected'` **THE SYSTEM SHALL** renderizar el banner persistente.
2. **WHEN** ninguna `channel_connection` de la organización está desconectada **THE SYSTEM SHALL NOT** renderizar el banner.

**Verify**

```bash
pnpm typecheck
pnpm test tests/channels/disconnected-banner.test.tsx
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: hook canal desconectado -- banner persistente"
git tag step-57-hook-disconnect-banner
```

### `E2-T5` — Hook: aprobación de contenido pendiente → push

**Depends on:** `E1-T3` (epic `01`) · **Priority:** p0

**Edita código de Fase 2 ya cerrado.** Confirma primero: `grep -n "requestApproval"
src/server/content/approvals.ts` debe dar ≥1 match. Inmediatamente después de que `requestApproval`
crea la fila `content_approval` en `pending`, resuelve los `user_id` con permiso `content.approve` y
llama `sendPushNotification` para cada uno. Tras editar, corre el test de Fase 2 que cubre
`requestApproval` (confirma el nombre con `grep -rl "requestApproval\|content_approval" tests/`) y
confirma que sigue en verde.

**Files**
- `src/server/content/approvals.ts` — edit
- `tests/hooks/content-approval-push.test.ts` — new

**Acceptance**

1. **WHEN** el creador de una pieza en `draft` solicita aprobación **THE SYSTEM SHALL** llamar `sendPushNotification` una vez por cada usuario con permiso `content.approve` en la organización.
2. **WHEN** una organización no tiene ningún usuario con `content.approve` (caso borde) **THE SYSTEM SHALL** no llamar `sendPushNotification` y no lanzar ninguna excepción.
3. **WHEN** el test original de Fase 2 para `requestApproval` corre **THE SYSTEM SHALL** seguir reportando exit 0.

**Verify**

```bash
pnpm typecheck
pnpm test tests/hooks/content-approval-push.test.ts
FILES=$(grep -rl "requestApproval" tests/); [ -n "$FILES" ] || exit 1; echo "$FILES" | xargs pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: hook aprobacion de contenido -> push"
git tag step-58-hook-content-approval
```

### `E2-T6` — Hook: automatización fallida → push

**Depends on:** `E1-T3` (epic `01`) · **Priority:** p0

**Edita código de Fase 3 ya cerrado.** Confirma primero: `grep -n "'failed'"
src/server/automations/action-runner.ts` debe dar ≥1 match en la rama que marca
`automation_run.status`. Inmediatamente después, resuelve `automation.created_by` (join
`automation_run` → `automation`) y llama `sendPushNotification(createdBy, {...})`. **No** llames
`sendPushNotification` en la rama `'partial'` — solo en `'failed'` completo (Decisión #5,
`blueprint.md` §20.3). Tras editar, corre `pnpm test tests/automations/retries-dead-letter.test.ts`
(gate original de Fase 3, paso 12) y confirma que sigue en verde.

**Files**
- `src/server/automations/action-runner.ts` — edit
- `tests/hooks/automation-failed-push.test.ts` — new

**Acceptance**

1. **WHEN** `action-runner.ts` marca un `automation_run.status = 'failed'` **THE SYSTEM SHALL** llamar `sendPushNotification` exactamente una vez, con el `created_by` de esa automatización.
2. **WHEN** `action-runner.ts` marca un `automation_run.status = 'partial'` **THE SYSTEM SHALL NOT** llamar `sendPushNotification`.
3. **WHEN** `action-runner.ts` marca un `automation_run.status = 'completed'` **THE SYSTEM SHALL NOT** llamar `sendPushNotification`.
4. **WHEN** `pnpm test tests/automations/retries-dead-letter.test.ts` corre (test original de Fase 3) **THE SYSTEM SHALL** seguir reportando exit 0.

**Verify**

```bash
pnpm typecheck
pnpm test tests/hooks/automation-failed-push.test.ts
pnpm test tests/automations/retries-dead-letter.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: hook automatizacion fallida -> push"
git tag step-59-hook-automation-failed
```

### `E2-T7` — Capa de datos del dashboard

**Depends on:** `E1-T2` (epic `01`) · **Priority:** p0

Crea `src/server/dashboard/queries.ts` exportando `getAttentionSummary(orgId, userId)` que agrega, en
paralelo (`Promise.all`), 4 consultas de solo lectura: conversaciones sin responder hace >2h o
asignadas al usuario; aprobaciones pendientes (copiloto/contenido/automatizaciones, tres campos
tipados separados, no fusionados); contenido programado hoy/mañana; automatizaciones fallidas en 24h.
Cada consulta filtra `org_id` explícito.

**Files**
- `src/server/dashboard/queries.ts` — new
- `tests/dashboard/queries.test.ts` — new

**Acceptance**

1. **WHEN** `getAttentionSummary` se llama para una organización con 1 conversación sin responder hace 3 horas **THE SYSTEM SHALL** incluirla en el campo `conversations`.
2. **WHEN** `getAttentionSummary` se llama para una organización sin ninguna aprobación pendiente en ningún dominio **THE SYSTEM SHALL** devolver los tres campos de aprobaciones como arrays vacíos, no `null` ni `undefined`.
3. **WHEN** `getAttentionSummary` se llama para dos organizaciones distintas con datos similares **THE SYSTEM SHALL** devolver resultados aislados por `org_id` — ninguna fila de la organización B aparece en el resultado de la organización A.
4. **WHEN** `getAttentionSummary` se llama y no hay automatizaciones fallidas en 24h **THE SYSTEM SHALL** devolver el campo `failedAutomations` como array vacío.

**Verify**

```bash
pnpm typecheck
pnpm test tests/dashboard/queries.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T7: capa de datos del dashboard"
git tag step-60-dashboard-queries
```

### `E2-T8` — UI del dashboard /app + cambio del destino post-login

**Depends on:** `E2-T7`, `E2-T4` · **Priority:** p0

Crea `src/app/(app)/page.tsx` (Server Component) llamando `getAttentionSummary`. Crea
`AttentionList`. **Edita el destino post-login de Fase 1 — la ubicación exacta debe confirmarse por
inspección, no asumirse.** `grep -rn "/app/inbox" src/proxy.ts src/lib/auth.ts` (grep de respaldo)
solo confirma que el string aparece en alguno de los dos archivos, no confirma qué hace cada uno con
él — `src/proxy.ts` solo redirige a `/login` las sesiones **sin autenticar** en `/app/*`, no
documenta ningún destino por defecto para una sesión ya autenticada. Inspecciona el código real de
ambos archivos para determinar dónde vive la lógica "sesión autenticada tras login/signup → redirect
a `/app/inbox`" — lo más probable es que viva en `src/lib/auth.ts` o en el componente cliente de
login/signup que llama al cliente de better-auth, no en `src/proxy.ts`. Cambia **ese(esos)**
literal(es) real(es) de `/app/inbox` a `/app`. `/app/inbox` sigue existiendo como ruta. Si `pnpm test
tests/integration/auth.test.ts` falla por asertar el string anterior, actualízalo **en esta misma
task** — nunca lo dejes en rojo ni lo pases a otra task.

**Files**
- `src/app/(app)/page.tsx` — new
- `src/components/dashboard/attention-list.tsx` — new
- `src/proxy.ts` — edit: destino post-login (si es aquí donde vive, tras inspección)
- `src/lib/auth.ts` — edit: destino post-signup (si es aquí donde vive, tras inspección)

**Acceptance**

1. **WHEN** un usuario visita `/app` con sesión válida **THE SYSTEM SHALL** renderizar el dashboard con las 4 secciones de `getAttentionSummary`.
2. **WHEN** un usuario completa signup **THE SYSTEM SHALL** redirigir a `/app`, no a `/app/inbox`.
3. **WHEN** un usuario hace login con credenciales correctas **THE SYSTEM SHALL** redirigir a `/app`, no a `/app/inbox`.
4. **WHEN** un usuario visita `/app/inbox` directamente (navegación, no redirect) **THE SYSTEM SHALL** seguir renderizando la bandeja unificada sin cambios de contenido.
5. **WHEN** `pnpm test tests/integration/auth.test.ts` corre **THE SYSTEM SHALL** reportar exit 0 — actualizado en esta misma task si asertaba el destino anterior.

**Verify**

```bash
pnpm typecheck
pnpm test tests/integration/auth.test.ts
# La cobertura e2e completa del dashboard se escribe y corre en E2-T9 — el archivo de test no existe
# todavía en esta task.
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T8: dashboard /app + cambio de destino post-login"
git tag step-61-dashboard-ui
```

### `E2-T9` — E2E + a11y de notificaciones y dashboard

**Depends on:** `E1-T5` (epic `01`), `E2-T8` · **Priority:** p1

Crea `tests/e2e/notifications-opt-in.spec.ts` (primera vez que este archivo existe — el código que
ejercita ya lo construyeron `E1-T4`/`E1-T5`, pero el archivo de test en sí no) cubriendo el flujo
completo: perfil → activa (`context.grantPermissions(["notifications"])`) → confirma fila en
`push_subscription` → desactiva → confirma que la fila se borra. Crea `tests/e2e/dashboard.spec.ts`:
login → aterriza en `/app` → las 4 secciones renderizan (fixtures sembrados). Edita
`tests/e2e/a11y.spec.ts` (existente desde Fase 1, confirma con `grep -n "axe" tests/e2e/a11y.spec.ts`)
agregando `/app` a las rutas auditadas.

**Files**
- `tests/e2e/notifications-opt-in.spec.ts` — new
- `tests/e2e/dashboard.spec.ts` — new
- `tests/e2e/a11y.spec.ts` — edit: agrega `/app`

**Acceptance**

1. **WHEN** `tests/e2e/notifications-opt-in.spec.ts` corre **THE SYSTEM SHALL** reportar el flujo completo activar→verificar→desactivar sin fallos.
2. **WHEN** `tests/e2e/dashboard.spec.ts` corre **THE SYSTEM SHALL** confirmar que login aterriza en `/app` y que las 4 secciones del dashboard renderizan contenido de los fixtures sembrados.
3. **WHEN** `pnpm test:e2e tests/e2e/a11y.spec.ts` corre contra `/app` (además de las 3 rutas ya auditadas por Fase 1) **THE SYSTEM SHALL** reportar 0 violaciones de axe.

**Verify**

```bash
pnpm typecheck
pnpm test:e2e tests/e2e/notifications-opt-in.spec.ts tests/e2e/dashboard.spec.ts
pnpm test:e2e tests/e2e/a11y.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T9: e2e + a11y de notificaciones y dashboard"
git tag step-62-e2e-a11y
```

### `E2-T10` — Verificación final: no regresión sobre Fase 1-3

**Depends on:** `E1-T4` (epic `01`), `E2-T1`, `E2-T2`, `E2-T3`, `E2-T4`, `E2-T5`, `E2-T6`, `E2-T9` ·
**Priority:** p0

No agrega código nuevo. Corre la suite completa del proyecto — unit, integración, e2e, build — para
confirmar que el conjunto de ediciones a Fase 1-3 (E2-T1, E2-T2, E2-T3, E2-T5, E2-T6, E2-T8) no rompió
ningún gate original en conjunto. Confirma que existen al menos 62 tags de checkpoint (`step-01`..
`step-62`) — el `step-63` propio de esta task se agrega después, en su propio `Checkpoint`.

**Files** — ninguno.

**Acceptance**

1. **WHEN** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` corre sobre el árbol completo **THE SYSTEM SHALL** reportar exit 0 en cada comando, en ese orden.
2. **WHEN** `git tag -l 'step-*' | wc -l` corre **THE SYSTEM SHALL** reportar al menos `62` — los 48 heredados más los 14 de esta fase visibles en el momento de este Verify (el `step-63` de esta misma task se añade después, en su Checkpoint).
3. **WHEN** el servidor construido arranca (`node .next/standalone/server.js`, heredado de Fase 1) y se solicita `GET /app` sin sesión **THE SYSTEM SHALL** redirigir a `/login?next=/app` (misma protección de proxy que cualquier otra ruta de `(app)`).

**Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
test "$(git tag -l 'step-*' | wc -l)" -ge 62
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T10: verificacion final notificaciones + dashboard" --allow-empty
git tag step-63-verification
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** un usuario con push activo recibe un mensaje entrante, una aprobación de copiloto, una
   aprobación de contenido, una automatización fallida, o su canal se desconecta **THE SYSTEM SHALL**
   recibir un push distinto para cada evento, cada uno con la URL correcta.
2. **WHEN** un usuario nuevo completa signup **THE SYSTEM SHALL** aterrizar en `/app` mostrando su
   dashboard, no en `/app/inbox`.
3. **WHEN** cualquiera de los tests originales de Fase 1-3 tocados por este epic corre **THE SYSTEM
   SHALL** seguir reportando exit 0.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
```

Run from the project root. All criteria must be decidable by these commands.

## Pitfalls

- **No dupliques la lógica de destinatario entre ganchos.** Cada gancho resuelve su propio criterio
  (asignado/rol/creador/owner) — los 5 criterios ya están documentados distintos a propósito en
  `blueprint.md` §8.
- **`automation_run.status = 'partial'` no dispara push** — la trampa más fácil de este epic.
- **El test de `auth.test.ts` puede asertar literalmente `/app/inbox`.** Si `E2-T8` lo rompe, el
  arreglo es en la misma task — nunca "lo dejamos para después".
- **No toques el contrato de respuesta de los webhooks al cablear `E2-T3`.**
  `tests/integration/webhooks.test.ts` es la prueba de que no lo hiciste — corre siempre, no solo el
  test nuevo.
- **No asumas que el redirect post-login vive en `src/proxy.ts` solo porque el grep de respaldo lo
  menciona.** `E2-T8` requiere inspección real del código antes de editar — ver `blueprint.md` §0.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l
      'step-54-*' 'step-55-*' 'step-56-*' 'step-57-*' 'step-58-*' 'step-59-*' 'step-60-*'
      'step-61-*' 'step-62-*' 'step-63-*'` lists 10.
- [ ] Gate command passes clean, run from the project root.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` unchanged by this epic (no new variables — `01` already added the 3 VAPID ones).
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
