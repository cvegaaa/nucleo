# Núcleo — Notificaciones Push + Dashboard + Alertas de Desconexión — Blueprint

> Generado por The Architect el 2026-08-19
> Shape: SaaS webapp (cambio transversal brownfield) · `knowledge/shapes/saas-webapp.md`
> Runtime track: Next.js 16 / TypeScript / Drizzle / Postgres (heredado de Fase 1-3) · `knowledge/runtime-tracks/nextjs.md`
> Emisión: bundle
> Versión de blueprint: 1
> Versiones verificadas por última vez: 2026-08-19 — ver §11 para procedencia por paquete

---

## 0. Contexto y relación con Fases 1-3

Este blueprint **no es un proyecto nuevo**. Continúa la secuencia global de checkpoints de Núcleo
(`step-01` .. `step-48`, ya construidos y verificados en `blueprints/nucleo-fase-1/`,
`blueprints/nucleo-fase-2/` y `blueprints/nucleo-fase-3/`) con los pasos **`step-49` en adelante**.
Agrega tres capacidades transversales sobre el producto ya construido:

1. **Infraestructura de notificaciones push** (Web Push nativo del navegador, sin librería de UI).
2. **Un dashboard mínimo en `/app`** que reemplaza `/app/inbox` como destino de login/signup.
3. **Alertas de canal desconectado** (push + banner persistente).

Cinco "hooks" conectan esta fase con código ya cerrado de Fases 1-3 — editar ese código es el mayor
riesgo del build (ver §20.2). Cada paso que edita un archivo heredado incluye una confirmación por
`grep` de respaldo y una nota explícita de que el `Verify` **original de esa fase** debe seguir en
verde después del cambio, no solo el `Verify` nuevo de este paso.

**Discrepancia detectada y resuelta — léase antes de tocar el schema.** Los CLAUDE.md acumulados de
Fase 1 y Fase 2 nombran el archivo de schema Drizzle como `src/lib/db/schema.ts` (confirmado en
`blueprints/nucleo-fase-1/blueprint.md` líneas 160/2102 — árbol de directorio y la tabla "Dónde viven
las cosas" respectivamente — y `blueprints/nucleo-fase-2/blueprint.md`
líneas 328/757/839, y en `blueprints/nucleo-fase-1/workspace/CLAUDE.md`). El CLAUDE.md acumulado de
Fase 3, en cambio, nombra `src/db/schema.ts` (`blueprints/nucleo-fase-3/blueprint.md` líneas 84/325/691
y `blueprints/nucleo-fase-3/workspace/CLAUDE.md`) — sin que ningún paso de Fase 3 documente un
`git mv` o migración de ruta. Esto es una inconsistencia real entre blueprints ya cerrados, no algo
que este blueprint deba resolver rediseñando código ajeno. **Regla para todo paso de este blueprint
que toque el schema:** confirmar la ruta real primero con
`find . -name schema.ts -path "*/db/*" -not -path "*/blueprints/*"` (debe devolver exactamente un
archivo) antes de editar, y usar esa ruta — nunca asumir ninguna de las dos por el nombre del
archivo CLAUDE.md que se leyó último. Ver también §20.3 Decisión #1.

---

## 1. Project Overview & Non-Goals

### Vision

Núcleo tiene bandeja, contenido, automatizaciones y copiloto de IA — pero un usuario que cierra la
pestaña no se entera de nada hasta que vuelve a abrirla, y al volver aterriza siempre en `/app/inbox`
sin importar si lo urgente es una conversación, una aprobación pendiente o un canal caído. Esta fase
cierra ese vacío con notificaciones push del navegador para los cinco eventos que ya importan hoy, y
con una pantalla de inicio (`/app`) que resume en un vistazo qué necesita atención — sin rediseñar
nada de lo ya construido.

### Users

| Persona | What they come to do | Frequency |
|---|---|---|
| Agente de conversaciones (`member`) | Enterarse de un mensaje nuevo o una aprobación de copiloto sin tener la pestaña abierta | Diaria |
| Dueño/admin de organización (`owner`) | Ver de un vistazo qué necesita atención al entrar, y enterarse si un canal se desconectó | Diaria |
| Creador de contenido | Enterarse de que su pieza fue aprobada/rechazada, o que hay contenido esperando su aprobación | Varias veces por semana |

### Goals — v1 scope

1. Cualquier usuario puede activar notificaciones push desde su perfil, en cualquier navegador que las
   soporte, sin depender de una librería de UI externa.
2. Cinco eventos del producto ya construido (mensaje nuevo, aprobación de copiloto, canal desconectado,
   aprobación de contenido, automatización fallida) generan una notificación push al usuario correcto.
3. `/app` reemplaza a `/app/inbox` como pantalla de entrada y resume, con datos reales (no maquetados),
   qué necesita atención ahora mismo.
4. Un canal desconectado es visible en toda la app autenticada (banner persistente), no solo en la
   página de configuración de canales.

### Non-Goals — explicitly out of scope for v1

| Not building | Why not now | Revisit when |
|---|---|---|
| Notificaciones por correo | Es un digest diario/configurable de Fase 6 (Analíticas), un producto distinto (resumen periódico vs. alerta en tiempo real) | Cuando Fase 6 defina el motor de digest |
| Preferencias granulares por tipo de evento (elegir qué de los 5 eventos notifica) | v1 es todo-o-nada por usuario; una matriz de preferencias es una tabla y una UI nuevas que no bloquean el valor central | Cuando ≥2 clientes reales pidan silenciar un tipo de evento específico |
| Digest/agrupación de notificaciones (agrupar 10 mensajes en 1 push) | Requiere una ventana de agregación y lógica de deduplicación; v1 prioriza correctitud simple sobre UX pulido | Cuando el volumen de push por usuario/día supere ~30 en datos reales |
| Push en apps nativas (iOS/Android) | No existe app nativa — Núcleo es web-only hoy | Cuando exista un shell nativo o PWA instalable con push nativo |
| Dashboard completo con métricas/gráficas | Es el dashboard de Fase 6; v1 es una lista honesta de "qué necesita atención", no analítica | Cuando Fase 6 (Analíticas) esté planificada |
| Reintentos con backoff en el envío push | `web-push` ya maneja errores de red a nivel de request individual; un job en cola para reintentar push es sobre-ingeniería para una notificación best-effort | Cuando se mida una tasa de entrega push <90% en producción |
| Detección activa de desconexión (polling al proveedor) | v1 detecta desconexión de forma pasiva, en el punto donde ya se resuelve `channel_connection` en el webhook entrante (§9 paso 8) — no agrega un poller nuevo | Cuando un cliente reporte que un canal quedó "silenciosamente" desconectado sin que llegara ningún webhook para detectarlo |
| Preferencia de horario "no molestar" | Añade una dimensión de tiempo/zona horaria a cada envío; v1 envía en cuanto ocurre el evento | Cuando exista feedback real de usuarios sobre notificaciones fuera de horario |

### Success metrics

| Metric | Target | How measured |
|---|---|---|
| % de usuarios activos con ≥1 suscripción push activa | ≥30% a los 30 días de disponibilidad | `select count(distinct user_id) from push_subscription` sobre usuarios con sesión en los últimos 30 días |
| % de sesiones que aterrizan en `/app` y navegan a algo desde ahí (no rebote inmediato a `/app/inbox`) | ≥50% a los 14 días | evento de analítica ya emitido por Fase 1 en cada navegación, filtrado por referrer `/app` |
| Notificaciones push entregadas sin error 410/404 sobre el total enviado | ≥90% | `count(*) filter (where delivered) / count(*)` sobre el log de `sendPushNotification` (§16) |

---

## 2. Tech Stack

**Runtime track: heredado de Fase 1-3 (Next.js 16 / TypeScript / Drizzle / Postgres).** Esta fase no
cambia ninguna elección de stack existente — solo agrega `web-push` como única dependencia nueva. La
tabla lista únicamente lo que esta fase toca; todo lo demás (Next.js, Tailwind, shadcn/Radix,
better-auth, BullMQ, Socket.IO, biome) sigue exactamente como en Fase 1-3.

| Layer | Choice | Why this, over what |
|---|---|---|
| Push delivery | `web-push@3.6.7` (servidor) | Implementación de referencia del protocolo Web Push VAPID en Node — sin dependencias del lado del navegador, mantenida activamente. Alternativa descartada: un servicio SaaS de push (OneSignal, Firebase Cloud Messaging) — agregaría una cuenta de terceros y un vendor lock-in para un envío que `web-push` resuelve en ~40 líneas sobre infraestructura que Núcleo ya opera (su propio VPS) |
| Service Worker | Archivo `public/sw.js` escrito a mano | Next.js 16 no tiene runtime de Service Worker embebido; un SW de 30 líneas para `push`/`notificationclick` no justifica una librería (`next-pwa`, Workbox) que además trae su propia estrategia de cacheo que colisionaría con `cacheComponents: true` ya configurado en Fase 1 |
| Manifest PWA | `app/manifest.ts` (convención nativa de App Router) | Next.js 16 sirve `/manifest.webmanifest` automáticamente desde este archivo — cero configuración adicional en `next.config.ts`, y es la forma soportada por el framework en vez de un `public/manifest.json` estático que el framework no valida |
| Push API del navegador | `Notification` / `PushManager` nativos, sin librería | Es lo que `web-push` produce en el servidor y lo que todo navegador moderno expone directo — una librería de wrapper (`push.js`, etc.) añadiría una capa sin resolver nada que la API nativa no resuelva ya |

### Compatibility check

Checked against `knowledge/stack-compatibility.md` — no known-bad combinations. `web-push` no tiene
conflicto documentado con Next.js 16, BullMQ, ni con el resto del stack heredado; es una dependencia de
servidor pura (no toca el bundle de cliente salvo por la clave pública VAPID, que es un string, no
código).

---

## 3. Directory Structure

```
nucleo/                                       # raíz del repo ya existente (Fase 1-3)
  public/
    sw.js                                     # NUEVO — Service Worker de push (paso 4)
  src/
    app/
      manifest.ts                             # NUEVO — manifest PWA nativo de App Router (paso 4)
      (app)/
        layout.tsx                            # EDITADO (paso 9) — banner de canal desconectado
        page.tsx                              # NUEVO (paso 13) — dashboard, reemplaza el redirect a /app/inbox
        inbox/
          page.tsx                            # EXISTENTE, sin cambios de contenido — ya no es el target del redirect
        settings/
          profile/
            page.tsx                          # EDITADO (paso 5) — sección de opt-in de notificaciones
      api/
        v1/
          push/
            subscribe/route.ts                # NUEVO (paso 2) — POST, guarda push_subscription
            unsubscribe/route.ts               # NUEVO (paso 2) — POST, borra push_subscription
    components/
      push/
        push-opt-in.tsx                       # NUEVO (paso 5) — Client Component, botón activar/desactivar
        sw-register.tsx                       # NUEVO (paso 4) — Client Component, registra el SW al montar
      channels/
        disconnected-banner.tsx               # NUEVO (paso 9) — banner persistente en el shell de (app)
      dashboard/
        attention-list.tsx                    # NUEVO (paso 13) — lista de conversaciones/aprobaciones/fallas
    lib/
      db/
        schema.ts                             # EDITADO (paso 1) — tabla push_subscription (ruta confirmada por grep, ver §0)
      push/
        send.ts                               # NUEVO (paso 3) — sendPushNotification(), aislado de fallos
    server/
      push/
        subscriptions.ts                      # NUEVO (paso 2) — CRUD de push_subscription
      dashboard/
        queries.ts                            # NUEVO (paso 12) — agregaciones para /app
      channels/
        connection-health.ts                  # NUEVO (paso 8) — markChannelDisconnected()
      copilot/
        runs.ts                               # EDITADO (paso 7) — push al aprobador tras crear la fila en approvals
      content/
        approvals.ts                          # EDITADO (paso 10) — push al aprobador tras requestApproval
      automations/
        action-runner.ts                      # EDITADO (paso 11) — push al creador cuando automation_run.status = 'failed'
    app/api/webhooks/
      whatsapp/route.ts                       # EDITADO (paso 8) — llama markChannelDisconnected en la rama 404 existente
      instagram/route.ts                      # EDITADO (paso 8) — idem
      facebook/route.ts                       # EDITADO (paso 8) — idem
      tiktok/route.ts                         # EDITADO (paso 8) — idem
    proxy.ts                                  # EDITADO (paso 13) — el destino post-login/signup cambia de /app/inbox a /app
  scripts/
    worker.ts                                 # EDITADO (paso 6) — push tras emitConversationUpdate
  tests/
    push/
      send.test.ts                            # NUEVO (paso 3)
      subscribe.test.ts                       # NUEVO (paso 2)
    dashboard/
      queries.test.ts                         # NUEVO (paso 12)
    hooks/
      message-push.test.ts                    # NUEVO (paso 6)
      copilot-approval-push.test.ts           # NUEVO (paso 7)
      channel-disconnect-push.test.ts         # NUEVO (paso 8) — markChannelDisconnected + los 4 webhooks
      content-approval-push.test.ts           # NUEVO (paso 10)
      automation-failed-push.test.ts          # NUEVO (paso 11)
    channels/
      disconnected-banner.test.tsx            # NUEVO (paso 9) — renderizado del banner, separado del test de paso 8 tras la división del step original
    e2e/
      notifications-opt-in.spec.ts            # NUEVO (paso 14)
      dashboard.spec.ts                       # NUEVO (paso 14)
  drizzle/                                    # migración nueva generada por drizzle-kit (paso 1) — nombre real no se inventa, ver §9 paso 1
  blueprints/
    nucleo-notificaciones-dashboard/          # este bundle
```

**Boundary rules** — heredadas sin cambios de Fase 1-3 (`src/app/**` no importa `db/` directo,
`src/server/**` no importa React ni `components/`). Reglas nuevas de esta fase:

- `src/lib/push/send.ts` es el **único** lugar que llama al SDK de `web-push`. Ningún hook llama
  `webpush.sendNotification` directo — todos importan `sendPushNotification` desde ahí.
- `src/server/push/subscriptions.ts` es el único módulo que escribe en `push_subscription` (incluida
  la limpieza de suscripciones expiradas que hace `sendPushNotification` al recibir 404/410).
- Ningún hook (pasos 6-11) puede lanzar ni bloquear el flujo que lo llama si `sendPushNotification`
  falla — la garantía de aislamiento vive dentro de `send.ts`, igual que `emitAutomationEvent()` de
  Fase 3 (`blueprints/nucleo-fase-3/blueprint.md` §9 paso 2) nunca lanza hacia quien la llama.

---

## 4. Data Model

### Entities

**`push_subscription`** — una suscripción de navegador/dispositivo a notificaciones push para un
usuario. Un usuario puede tener varias (varios navegadores/dispositivos).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | permite borrar todas las suscripciones de una org si se necesitara en el futuro, sin tocar `user` |
| user_id | uuid | FK user.id, not null, index | |
| endpoint | text | not null, unique | URL única del push service del navegador (FCM/Mozilla push/etc.) — identifica la suscripción |
| p256dh | text | not null | clave pública de cifrado de la suscripción, devuelta por `PushSubscription.toJSON().keys.p256dh` |
| auth_key | text | not null | secreto de autenticación de la suscripción, `keys.auth` |
| created_at | timestamptz | not null, default now() | |
| last_used_at | timestamptz | nullable | actualizado por `sendPushNotification` en cada envío exitoso |

No lleva `deleted_at` — una suscripción inválida (410/404 del push service) se borra físicamente por
`sendPushNotification`, nunca se soft-deletea: no tiene valor histórico, y una fila "borrada" que
alguien vuelve a intentar reusar sería un bug, no una feature.

### Relationships

- `user` —(1:N)→ `push_subscription`. Cascade: ON DELETE CASCADE — al borrarse un `user` (fuera de
  alcance en Fase 1-3, pero el FK debe ser correcto) sus suscripciones no tienen sentido sin él.
- `organization` —(1:N)→ `push_subscription`. Cascade: ON DELETE RESTRICT, igual que el resto de
  tablas tenant-owned de Fase 1 (`organization` —(1:N)→ `channel_connection`, etc.) — consistente con
  la política ya establecida de nunca borrar en cascada una organización con datos.

### Indexes

| Table | Index | Why |
|---|---|---|
| push_subscription | (user_id) | `sendPushNotification(userId, …)` — la consulta que dispara cada uno de los 5 hooks |
| push_subscription | (endpoint) unique | evita duplicar la misma suscripción de navegador si el opt-in se dispara dos veces |

### Schema

```typescript
// src/lib/db/schema.ts (o src/db/schema.ts — confirmar ruta real primero, ver §0) — se agrega al
// archivo existente, no se reemplaza. Mismo patrón que Fase 2/3 (columnas uuid/timestamptz/index
// idénticas al resto de tablas tenant-owned del proyecto).

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    authKey: text("auth_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({
    endpointUnique: uniqueIndex("push_subscription_endpoint_unique").on(table.endpoint),
    userIdx: index("push_subscription_user_id_idx").on(table.userId),
  }),
);
```

### Migrations

Drizzle Kit, mismo flujo que Fase 1-3: editar `schema.ts` → `pnpm db:generate` → revisar el SQL
generado → `pnpm db:migrate`. El nombre del archivo de migración lo asigna `drizzle-kit` (con hash de
timestamp) — este blueprint nunca lo inventa; el paso 1 se refiere a él como "la migración que
`pnpm db:generate` emite para este cambio".

### Seed data

No agrega seed nuevo. `push_subscription` empieza vacía en cualquier entorno — se llena solo cuando un
usuario real activa notificaciones desde `/app/settings/profile` (paso 5). Los tests de integración
insertan sus propias filas de fixture directamente.

---

## 5. API Design

### Conventions

Heredadas sin cambios de Fase 1 (`/api/v1` como base, zod para validación, `requirePermission()` antes
de cualquier mutación sensible). Las dos rutas nuevas de esta fase no introducen convenciones nuevas.

### Routes

| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/v1/push/subscribe` | Registra o actualiza una suscripción push del usuario actual | user (sesión) | ninguno adicional — una acción de perfil, no expuesta a terceros |
| POST | `/api/v1/push/unsubscribe` | Borra la suscripción push cuyo `endpoint` coincide, del usuario actual | user (sesión) | ninguno adicional |

### Critical endpoints — full detail

**`POST /api/v1/push/subscribe`**

Request body (el objeto que devuelve `PushSubscription.toJSON()` del navegador):
```json
{ "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." } }
```
Validación zod: `endpoint` string no vacío, `keys.p256dh` y `keys.auth` strings no vacíos. Efecto:
`upsert` en `push_subscription` por `endpoint` único (si ya existe esa suscripción, actualiza
`user_id`/`org_id`/claves — cubre el caso de un mismo navegador re-suscribiéndose tras revocar y
volver a aceptar el permiso). Respuesta éxito: `201` con `{ id }`. Error de validación: `400` con el
envelope de error estándar de Fase 1 (§5 de `blueprints/nucleo-fase-1/blueprint.md`). Sin sesión: `401`
vía `requirePermission()`, que resuelve la organización desde la sesión igual que cualquier otra ruta
mutante del proyecto.

**`POST /api/v1/push/unsubscribe`**

Request body: `{ "endpoint": "https://..." }`. Efecto: `DELETE` de la fila `push_subscription` cuyo
`endpoint` coincide **y** cuyo `user_id` es el del usuario en sesión (nunca borra la suscripción de
otro usuario aunque alguien adivine el endpoint). Respuesta éxito: `200` con `{ deleted: boolean }` —
`true` si existía una fila, `false` si no (idempotente, nunca `404`: desuscribirse de algo que ya no
existe no es un error).

---

## 6. Frontend Architecture

### Routes

| Route | Page | Data source | Auth |
|---|---|---|---|
| `/app` | Dashboard (nuevo, reemplaza el redirect a `/app/inbox`) | server query (`src/server/dashboard/queries.ts`) | user |
| `/app/inbox` | Bandeja unificada (Fase 1, sin cambios de contenido) | server query + realtime (heredado) | user |
| `/app/settings/profile` | Perfil (Fase 1) + sección nueva de opt-in de notificaciones | server query + Client Component | user |

### Rendering strategy

`/app` es un Server Component puro (mismo patrón que `/app/inbox` de Fase 1: primera carga sin
spinner, datos resueltos server-side). No lleva Client Component salvo por los enlaces de navegación
que ya son parte del shell de `(app)`. `cacheComponents: true` ya está en `next.config.ts` desde
Fase 1 — esta página no cambia esa configuración; sus queries son de lectura fresca en cada request
(no cacheadas), porque "qué necesita atención ahora" pierde su valor si está stale.

### Component hierarchy

```
src/app/(app)/
  layout.tsx                       # Server — EDITADO: agrega <DisconnectedBanner /> (paso 9)
  page.tsx                         # Server — NUEVO, el dashboard (paso 13)
    → AttentionList (Client)       # src/components/dashboard/attention-list.tsx — filtros de vista, sin carga async propia (datos ya vienen del server component padre)
  settings/profile/page.tsx        # Server — EDITADO
    → PushOptIn (Client)           # src/components/push/push-opt-in.tsx — botón activar/desactivar, llama Notification.requestPermission()
  SwRegister (Client, montado una vez en el layout raíz de (app)) # src/components/push/sw-register.tsx
```

### State management

`/app` no lleva estado de cliente propio — es lectura server-side pura. `PushOptIn` mantiene un único
estado local (`'default' | 'granted' | 'denied' | 'subscribing'`) derivado de `Notification.permission`
al montar; no usa TanStack Query porque no hay refetch periódico, solo una acción puntual del usuario.

### Loading, empty, and error states

| Surface | Loading | Empty | Error |
|---|---|---|---|
| `/app` — lista de atención | N/A (Server Component, sin spinner) | "Todo al día — nada requiere tu atención ahora mismo" (mensaje distinto de un error) | `error.tsx` del segmento `(app)`, heredado de Fase 1 |
| `PushOptIn` | Botón deshabilitado con texto "Activando…" mientras `subscribing` | N/A (siempre hay un estado que mostrar: activar o desactivar) | Mensaje inline "No se pudo activar — revisa los permisos del navegador" si `Notification.requestPermission()` devuelve `'denied'` o la suscripción falla |
| `DisconnectedBanner` | N/A (dato ya viene del layout Server Component) | No se renderiza nada si no hay canales desconectados (no hay "empty state" visual — su ausencia es el estado vacío) | N/A — es lectura, no puede fallar de forma que el usuario deba reaccionar |

---

## 7. Design System

Hereda sin cambios los tokens ya establecidos por Fase 1 (`src/app/globals.css` bajo `@theme`) — ver
`blueprints/nucleo-fase-1/workspace/CLAUDE.md` para la tabla completa (`--primary #1D4ED8`/`#3B82F6`,
`--destructive #DC2626`/`#F87171`, etc.). Esta fase **no agrega tokens nuevos** — el banner de canal
desconectado reutiliza `--destructive` (es una alerta, no un estado neutro) y la lista de atención del
dashboard reutiliza `--warning`/`--warning-fg` ya definidos por Fase 3
(`blueprints/nucleo-fase-3/blueprint.md` §7 — confirmado `#B45309`/`#FEF3C7` claro, `#FBBF24`/`#451A03`
oscuro, contraste ≥4.5:1 ya verificado en esa fase) para el badge de "automatización con fallas
recientes", consistente con el mismo significado semántico que ya tienen esos tokens.

**Componente:** `DisconnectedBanner` es una barra de ancho completo, fondo `--destructive` con opacidad
reducida (10%) y texto `--destructive`, fija bajo el header del shell de `(app)` (no flotante, no
descarta el foco de teclado del contenido — cumple 2.4.11 de §15). `AttentionList` reutiliza el
componente `Card` de shadcn ya instalado desde Fase 1, sin estilos nuevos.

---

## 8. Authentication & Authorization

Hereda el modelo completo de Fase 1 (`better-auth`, sesión `HttpOnly`, `requirePermission()` server-side
en cada mutación). Esta fase no agrega roles ni permisos nuevos — reutiliza los ya sembrados
(`conversation.reply`, `conversation.assign`, `content.approve`, y la resolución de permiso por
`tool_name`/`action_type` ya existente en copiloto y automatizaciones).

### Route protection

| Surface | Rule | Enforced where |
|---|---|---|
| `/app/*` (incluye `/app` nuevo) | autenticado | `src/proxy.ts` — heredado, sin cambios en la lógica de protección (solo cambia el destino post-login, ver §9 paso 13) |
| `/api/v1/push/*` | autenticado, resuelve `user_id`/`org_id` de la sesión | `requirePermission()` en cada route handler, mismo patrón que el resto de `/api/v1/*` |

### A quién le llega cada push — la regla de autorización de cada hook

| Hook | Destinatario | Por qué (permiso/campo que ya existe) |
|---|---|---|
| Mensaje entrante (paso 6) | `conversation.assigned_to` si no es null; si es null, todo miembro de la org con permiso `conversation.reply` | Es el mismo criterio que ya decide quién puede responder — no se inventa un permiso nuevo |
| Aprobación de copiloto pendiente (paso 7) | Todo miembro con el `permission_key` del `tool_name` en cuestión (ej. `conversation.assign` para `assign_conversation`) | Mismo `permission_key` que `runs.ts` ya usa para decidir quién puede ejecutar/aprobar esa tool call (§9 paso 14 de Fase 1) |
| Canal desconectado (paso 8) | Todo miembro con rol `owner` de la organización | Gestionar canales es responsabilidad de `owner` en el modelo de roles de Fase 1 (`channel.manage` no está en la lista de permisos de `member`) |
| Aprobación de contenido pendiente (paso 10) | Todo miembro con permiso `content.approve` | Mismo permiso que Fase 2 ya usa para decidir quién puede aprobar (`blueprints/nucleo-fase-2/blueprint.md` línea 918) |
| Automatización fallida (paso 11) | El `created_by` de la automatización | Campo `automation.created_by`, ya existe desde Fase 3 (`blueprints/nucleo-fase-3/blueprint.md` línea 350) — **decisión documentada, no el único criterio posible**: se descartó "todos los `owner`" porque un `member` puede crear y ser dueño de sus propias automatizaciones sin ser `owner` de la org, y silenciar esa señal a su creador sería peor que notificar a alguien que no es admin |

---

## 9. BUILD ORDER

### Step map

| # | Step | Depends on | Touches | Gate |
|---|---|---|---|---|
| 1 | Schema + migración `push_subscription` | — | `package.json`, schema, migración, `.env.example`, `tests/setup/env.ts` (edit) | `pnpm db:migrate` |
| 2 | Rutas subscribe/unsubscribe | 1 | `src/server/push/subscriptions.ts`, `src/app/api/v1/push/{subscribe,unsubscribe}/route.ts`, `tests/push/subscribe.test.ts` | `pnpm test tests/push/subscribe.test.ts` |
| 3 | `sendPushNotification` — envío aislado de fallos | 2 | `src/lib/push/send.ts`, `tests/push/send.test.ts` | `pnpm test tests/push/send.test.ts` |
| 4 | Service Worker + manifest PWA + registro en cliente | 3 | `public/sw.js`, `src/app/manifest.ts`, `src/components/push/sw-register.tsx`, `next.config.ts` (edit) | `pnpm typecheck && pnpm build` + checks `curl` de `/sw.js` y `/manifest.webmanifest` (e2e completo en paso 14) |
| 5 | Opt-in de notificaciones en `/app/settings/profile` | 4 | `src/app/(app)/settings/profile/page.tsx` (edit), `src/components/push/push-opt-in.tsx` | `pnpm typecheck && pnpm build` (e2e completo en paso 14) |
| 6 | Hook — mensaje entrante → push | 3 | `scripts/worker.ts` (edit), `tests/hooks/message-push.test.ts` | `pnpm test tests/hooks/message-push.test.ts` |
| 7 | Hook — aprobación de copiloto pendiente → push | 3 | `src/server/copilot/runs.ts` (edit), `tests/hooks/copilot-approval-push.test.ts` | `pnpm test tests/hooks/copilot-approval-push.test.ts` |
| 8 | Hook — canal desconectado: detección en los 4 webhooks | 3 | `src/server/channels/connection-health.ts`, 4 rutas de webhook (edit), `tests/hooks/channel-disconnect-push.test.ts` | `pnpm test tests/hooks/channel-disconnect-push.test.ts` |
| 9 | Hook — canal desconectado: banner persistente en `(app)` | 8 | `src/components/channels/disconnected-banner.tsx`, `src/app/(app)/layout.tsx` (edit), `tests/channels/disconnected-banner.test.tsx` | `pnpm test tests/channels/disconnected-banner.test.tsx` |
| 10 | Hook — aprobación de contenido pendiente → push | 3 | `src/server/content/approvals.ts` (edit), `tests/hooks/content-approval-push.test.ts` | `pnpm test tests/hooks/content-approval-push.test.ts` |
| 11 | Hook — automatización fallida → push | 3 | `src/server/automations/action-runner.ts` (edit), `tests/hooks/automation-failed-push.test.ts` | `pnpm test tests/hooks/automation-failed-push.test.ts` |
| 12 | Capa de datos del dashboard | 2 | `src/server/dashboard/queries.ts`, `tests/dashboard/queries.test.ts` | `pnpm test tests/dashboard/queries.test.ts` |
| 13 | UI del dashboard `/app` + cambio del destino post-login | 12, 9 | `src/app/(app)/page.tsx`, `src/components/dashboard/attention-list.tsx`, `src/proxy.ts` (edit), `src/lib/auth.ts` (edit — destino post-signup) | `pnpm typecheck && pnpm test tests/integration/auth.test.ts` (e2e completo en paso 14) |
| 14 | E2E + a11y de notificaciones y dashboard | 5, 13 | `tests/e2e/notifications-opt-in.spec.ts`, `tests/e2e/dashboard.spec.ts`, `tests/e2e/a11y.spec.ts` (edit — agrega `/app` a las rutas auditadas) | `pnpm test:e2e tests/e2e/notifications-opt-in.spec.ts tests/e2e/dashboard.spec.ts && pnpm test:e2e tests/e2e/a11y.spec.ts` |
| 15 | Verificación final — no regresión sobre Fase 1-3 | 4, 6, 7, 8, 9, 10, 11, 14 | ninguno (solo ejecuta lo ya escrito) | `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` |

**Nota de división (§9 regla 3, tamaño de paso):** el paso original que agrupaba dependencia + tabla +
rutas de suscripción tocaba 8 archivos, por encima del límite de ~5 — se dividió en el paso 1 (schema +
migración) y el paso 2 (rutas). El paso original que agrupaba detección de desconexión + banner de UI
tocaba igualmente 8 archivos — se dividió en el paso 8 (detección en los 4 webhooks) y el paso 9
(banner). La secuencia de checkpoints permanece continua (`step-49`..`step-63`, 15 en total para esta
fase). El paso 8 queda en 6 archivos tocados (`connection-health.ts` + 4 route handlers + 1 test) — por
encima del límite estricto de ~5, pero deliberadamente no se dividió más: los 4 route handlers reciben
exactamente la misma edición mecánica de una línea cada uno (agregar `markChannelDisconnected` antes de
la respuesta 404 ya existente), no cuatro decisiones de diseño independientes, y separarlos en pasos
distintos multiplicaría el número de checkpoints sin reducir el riesgo real del cambio — el mismo
criterio que Fase 1 ya usó para agrupar sus 4 route handlers de webhook bajo un único paso.

---

#### Paso 1 — Schema + migración `push_subscription`

**Do**

Confirmar la ruta real del schema con `find . -name schema.ts -path "*/db/*" -not -path "*/blueprints/*"`
(ver §0) antes de editar. Instalar `web-push@3.6.7` y `@types/web-push` como dependencia de desarrollo
(§11 — confirmar el número exacto de `@types/web-push` con `npm view @types/web-push version` antes de
fijar el pin, ver la nota de verificación en §11). Agregar la tabla `pushSubscription` de §4 al archivo
de schema encontrado. Correr `pnpm db:generate` y revisar que la migración emitida solo agregue
`push_subscription` — no debe tocar ninguna de las tablas existentes. Generar
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` con `pnpm dlx web-push generate-vapid-keys` y agregar las tres
variables de §10 a `.env.example` (valores en blanco) — **no se leen todavía en este paso**, ninguna
línea de código de este paso llama `webpush.setVapidDetails` (eso es el paso 3), así que el validador
de env (`src/lib/env.ts`) no las marca requeridas aún (§9 regla 9).

Editar `tests/setup/env.ts` (heredado de Fase 1, `blueprints/nucleo-fase-1/workspace/tests/setup/env.ts`,
ya copiado al root del proyecto desde el Bootstrap de Fase 1) agregando
`process.env.VAPID_PUBLIC_KEY ??= "..."` y `process.env.VAPID_PRIVATE_KEY ??= "..."` (valores de test
dummy, mismo patrón `??=` que las 5 variables ya pobladas ahí — `DATABASE_URL`, `REDIS_URL`,
`BETTER_AUTH_SECRET`, `COPILOT_MODEL_ID`, `ANTHROPIC_API_KEY`). Esto se hace **en este paso, no en el
paso 3**, porque el paso 3 es el que marca `VAPID_PRIVATE_KEY` como requerida en `src/lib/env.ts` — si
el fallback de test no existe ya en el árbol para cuando eso ocurra, toda la suite unitaria (incluidos
los reruns de los gates originales de Fase 1-3 que este blueprint usa como red de seguridad, §9 regla 9)
falla en el boot desde el paso 3 en adelante. Ver §19.6.

**Done when**
- [ ] WHEN `pnpm db:migrate` corre sobre la base de Fase 1-3 ya migrada THE SYSTEM SHALL crear la tabla `push_subscription` sin tocar ninguna tabla existente.
- [ ] WHEN se inspecciona `push_subscription` con `\d push_subscription` THE SYSTEM SHALL mostrar las columnas `id`, `org_id`, `user_id`, `endpoint`, `p256dh`, `auth_key`, `created_at`, `last_used_at`.
- [ ] WHEN `pnpm test` corre sobre la suite unitaria heredada de Fase 1-3 después de este paso THE SYSTEM SHALL seguir en verde — `tests/setup/env.ts` puebla `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` con valores dummy para que el arranque de `src/lib/env.ts` no falle antes de que el paso 3 las marque requeridas.
- [ ] WHEN se inspecciona `.env.example` THE SYSTEM SHALL contener las 3 claves VAPID en blanco.

**Verify**
```bash
pnpm typecheck                                    # expect: exit 0
pnpm db:migrate                                   # expect: exit 0
psql "$DATABASE_URL" -c "\d push_subscription"    # expect: exit 0 — columnas id, org_id, user_id, endpoint, p256dh, auth_key, created_at, last_used_at
pnpm test                                         # expect: exit 0, 0 failed, 0 skipped — confirma que el ??= nuevo de tests/setup/env.ts no rompió nada heredado
```

**Checkpoint**
```bash
git add -A && git commit -m "step 49: schema + migracion push_subscription"
git tag step-49-push-schema
# rollback: git reset --hard step-49-push-schema
```

---

#### Paso 2 — Rutas subscribe/unsubscribe

**Do**

Crear `src/server/push/subscriptions.ts` exportando `upsertSubscription(orgId, userId, sub)` y
`deleteSubscription(userId, endpoint)`. Crear `src/app/api/v1/push/subscribe/route.ts` y
`src/app/api/v1/push/unsubscribe/route.ts` según el contrato de §5, cada uno validando el body con zod
y llamando `requirePermission()` primero (mismo patrón que toda ruta mutante de Fase 1), e instalando
`@types/web-push` desde el paso 1 sigue cubriendo los tipos que estas rutas usan al construir el objeto
de suscripción.

**Done when**
- [ ] WHEN un usuario autenticado envía `POST /api/v1/push/subscribe` con un `endpoint`/`keys` válidos THE SYSTEM SHALL crear una fila en `push_subscription` con su `user_id` y `org_id`, y responder `201`.
- [ ] WHEN el mismo `endpoint` se envía dos veces THE SYSTEM SHALL actualizar la fila existente (upsert), no crear una segunda — `select count(*) from push_subscription where endpoint = $1` permanece en `1`.
- [ ] WHEN el body no incluye `keys.p256dh` THE SYSTEM SHALL responder `400` sin crear ninguna fila.
- [ ] WHEN un usuario envía `POST /api/v1/push/unsubscribe` con un `endpoint` que le pertenece THE SYSTEM SHALL borrar esa fila y responder `200` con `{ deleted: true }`.
- [ ] WHEN un usuario envía `POST /api/v1/push/unsubscribe` con un `endpoint` que no existe THE SYSTEM SHALL responder `200` con `{ deleted: false }`, nunca `404`.

**Verify**
```bash
pnpm typecheck                                    # expect: exit 0
pnpm test tests/push/subscribe.test.ts            # expect: exit 0, 0 failed, 0 skipped
```

**Checkpoint**
```bash
git add -A && git commit -m "step 50: rutas subscribe/unsubscribe"
git tag step-50-push-subscriptions
# rollback: git reset --hard step-50-push-subscriptions
```

---

#### Paso 3 — `sendPushNotification` — envío aislado de fallos

**Do**

Crear `src/lib/push/send.ts` exportando
`sendPushNotification(userId: string, payload: { title: string; body: string; url?: string }): Promise<void>`.
Internamente: llama `webpush.setVapidDetails(...)` con `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (primera
lectura de estas dos variables — quedan requeridas desde este paso en `src/lib/env.ts`, §9 regla 9),
consulta `push_subscription` por `user_id`, y llama `webpush.sendNotification(subscription, JSON.stringify(payload))`
para cada una **dentro de un `try/catch` por suscripción** — un fallo en una suscripción no debe
impedir el envío a las demás. Si el error tiene `statusCode` `404` o `410` (suscripción inválida/
expirada, según la especificación de `web-push`), borra esa fila de `push_subscription`. Cualquier otro
error se registra con `logger.warn` (mismo logger heredado de Fase 1) y la función nunca relanza — la
promesa siempre resuelve, igual que `emitAutomationEvent()` de Fase 3 nunca lanza hacia quien la llama
(`blueprints/nucleo-fase-3/blueprint.md` §9 paso 2). Actualiza `last_used_at` en cada envío exitoso.

**Done when**
- [ ] WHEN `sendPushNotification(userId, payload)` se llama y el usuario tiene 2 suscripciones válidas THE SYSTEM SHALL invocar `webpush.sendNotification` una vez por cada una y actualizar `last_used_at` en ambas.
- [ ] WHEN una de las dos suscripciones responde con `statusCode: 410` THE SYSTEM SHALL borrar esa fila de `push_subscription` y enviar igual a la otra suscripción.
- [ ] WHEN el envío a una suscripción falla con un error que no es 404/410 (ej. timeout de red) THE SYSTEM SHALL registrar el error con `logger.warn` y no borrar la fila.
- [ ] WHEN `sendPushNotification` se llama para un usuario sin ninguna suscripción THE SYSTEM SHALL resolver sin error y sin llamar `webpush.sendNotification`.
- [ ] WHEN `sendPushNotification` se llama y `webpush.sendNotification` lanza una excepción no relacionada con el protocolo (ej. JSON inválido) THE SYSTEM SHALL capturarla, registrarla, y la promesa retornada por `sendPushNotification` SHALL resolver igual — nunca rechaza.
- [ ] WHEN `VAPID_PRIVATE_KEY` no está definida al arrancar la app desde este paso en adelante THE SYSTEM SHALL fallar el boot con un error nombrado, no servir tráfico que silenciosamente nunca envíe push.

**Verify**
```bash
pnpm typecheck                          # expect: exit 0
pnpm test tests/push/send.test.ts       # expect: exit 0, 0 failed, 0 skipped
```

**Checkpoint**
```bash
git add -A && git commit -m "step 51: sendPushNotification aislado de fallos"
git tag step-51-push-send
```

---

#### Paso 4 — Service Worker + manifest PWA + registro en cliente

**Do**

Crear `public/sw.js` (JavaScript plano, sin build step — el navegador lo sirve tal cual): listener
`self.addEventListener("push", (event) => { const data = event.data.json(); event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url } })); })`
y listener `self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data.url ?? "/app")); })`.
Crear `src/app/manifest.ts` exportando la función `manifest()` de Next.js 16 con `name`, `short_name`,
`start_url: "/app"`, `display: "standalone"`, `icons` (reutiliza el favicon ya existente de Fase 1 si
hay uno en `public/`, o un icono placeholder de 192x192/512x512 committed en este paso). Editar
`next.config.ts` para agregar, dentro del `headers()` ya existente de Fase 1 (§14), una entrada para
`/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate` (un Service Worker cacheado por el
navegador nunca recibe actualizaciones — HTTP debe forzar revalidación en cada carga). Crear
`src/components/push/sw-register.tsx` (Client Component, `"use client"`, `useEffect` que llama
`navigator.serviceWorker.register("/sw.js")` si `"serviceWorker" in navigator`, sin bloquear el render
si falla) y montarlo una vez en `src/app/(app)/layout.tsx`.

**Done when**
- [ ] WHEN un navegador con soporte de Service Worker visita cualquier ruta de `(app)` THE SYSTEM SHALL registrar `/sw.js` sin errores en consola.
- [ ] WHEN se solicita `GET /sw.js` THE SYSTEM SHALL responder con el header `Cache-Control: no-cache, no-store, must-revalidate`.
- [ ] WHEN se solicita `GET /manifest.webmanifest` THE SYSTEM SHALL responder `200` con `start_url` igual a `/app` y `display` igual a `standalone`.
- [ ] WHEN el navegador no soporta `serviceWorker` (verificado con el guard `"serviceWorker" in navigator`) THE SYSTEM SHALL omitir el registro sin lanzar una excepción no controlada en el árbol de React.

**Verify**
```bash
pnpm typecheck                                                              # expect: exit 0
pnpm build                                                                  # expect: exit 0
pnpm dev & sleep 3
test "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/sw.js)" = 200 # expect: exit 0
curl -s -I localhost:3000/sw.js | grep -qi 'cache-control: no-cache, no-store, must-revalidate'  # expect: exit 0
test "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/manifest.webmanifest)" = 200        # expect: exit 0
kill %1 2>/dev/null || true
```

**Checkpoint**
```bash
git add -A && git commit -m "step 52: service worker + manifest PWA"
git tag step-52-sw-manifest
```

---

#### Paso 5 — Opt-in de notificaciones en `/app/settings/profile`

**Do**

Editar `src/app/(app)/settings/profile/page.tsx` (existente desde Fase 1 paso 15 — grep de respaldo:
`grep -l "eliminar cuenta\|account/route" src/app/(app)/settings/profile/page.tsx`, debe existir)
agregando una sección nueva "Notificaciones" que renderiza `<PushOptIn />`. Crear
`src/components/push/push-opt-in.tsx` (Client Component): botón que, si `Notification.permission` es
`"default"`, llama `Notification.requestPermission()`; si el resultado es `"granted"`, obtiene el
`ServiceWorkerRegistration` activo (`navigator.serviceWorker.ready`), llama
`registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })`
(primera lectura de esta variable — queda requerida desde este paso), y hace `POST /api/v1/push/subscribe`
con el resultado serializado (`sub.toJSON()`). Si el usuario ya está suscrito (verificado con
`registration.pushManager.getSubscription()` al montar), el botón muestra "Desactivar" y llama
`POST /api/v1/push/unsubscribe` + `subscription.unsubscribe()` del lado del navegador.

**Done when**
- [ ] WHEN un usuario con `Notification.permission === "default"` hace clic en "Activar notificaciones" y concede el permiso THE SYSTEM SHALL crear una suscripción push y una fila en `push_subscription` para ese usuario.
- [ ] WHEN el usuario deniega el permiso del navegador THE SYSTEM SHALL mostrar el mensaje inline de error de §6 sin crear ninguna fila.
- [ ] WHEN un usuario ya suscrito visita `/app/settings/profile` THE SYSTEM SHALL mostrar el botón en estado "Desactivar", no "Activar".
- [ ] WHEN un usuario suscrito hace clic en "Desactivar" THE SYSTEM SHALL borrar su fila de `push_subscription` y revertir el botón a "Activar".
- [ ] WHEN `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no está definida al hacer build desde este paso en adelante THE SYSTEM SHALL fallar el build con un error nombrado (validación de env de cliente, mismo mecanismo que Fase 1 usa para variables `NEXT_PUBLIC_*`).

**Verify**
```bash
pnpm typecheck   # expect: exit 0
pnpm build       # expect: exit 0
# La cobertura e2e completa del flujo activar→verificar→desactivar se escribe y corre en el paso 14
# (tests/e2e/notifications-opt-in.spec.ts) — ese archivo no existe todavía en este paso, correrlo
# aquí fallaría contra un archivo inexistente en vez de contra código roto.
```

**Checkpoint**
```bash
git add -A && git commit -m "step 53: opt-in de notificaciones en perfil"
git tag step-53-push-opt-in
```

---

#### Paso 6 — Hook: mensaje entrante → push

**Do**

**Riesgo: edita código de Fase 1 ya cerrado.** Confirmación de respaldo antes de editar:
`grep -n "emitConversationUpdate" scripts/worker.ts` debe devolver al menos un match (la llamada real
que Fase 1 conecta en su paso 12, confirmada en `blueprints/nucleo-fase-1/blueprint.md` línea 1276).
Inmediatamente después de esa llamada, agregar: si `conversation.assignedTo` no es null, llamar
`sendPushNotification(conversation.assignedTo, { title: "Nuevo mensaje", body: <preview del mensaje, máx 120 caracteres>, url: \`/app/inbox?conversation=${conversation.id}\` })`;
si es null, consultar los `user_id` de la organización con permiso `conversation.reply` (vía el mismo
servicio de permisos que `requirePermission()` ya usa internamente) y llamar `sendPushNotification` para
cada uno. **Nunca usar `await` que propague un fallo de `sendPushNotification` hacia el resto del
worker** — se llama sin bloquear el ack del job de BullMQ (mismo principio fire-and-forget que
`emitAutomationEvent`, aunque aquí sí se espera la promesa con `.catch(() => {})` porque
`sendPushNotification` ya nunca rechaza por diseño del paso 3 — el `.catch` es defensivo, no la
garantía real).

**Después de editar:** correr `pnpm test tests/integration/queue.test.ts` (el `Verify` original del
paso 9 de Fase 1) y confirmar que sigue en verde — esta edición no debe cambiar ningún comportamiento
observable de la cola que Fase 1 ya verificó.

**Done when**
- [ ] WHEN el worker procesa un mensaje entrante para una conversación con `assignedTo` no nulo THE SYSTEM SHALL llamar `sendPushNotification` exactamente una vez, con ese `user_id`.
- [ ] WHEN el worker procesa un mensaje entrante para una conversación sin asignar THE SYSTEM SHALL llamar `sendPushNotification` una vez por cada usuario de la organización con permiso `conversation.reply`.
- [ ] WHEN `sendPushNotification` es mockeado para rechazar (simulando un fallo interno no capturado) THE SYSTEM SHALL completar el procesamiento del job igual — el job de BullMQ se marca completado, no se reintenta por esta causa.
- [ ] WHEN `pnpm test tests/integration/queue.test.ts` corre (el test de Fase 1, sin modificar) THE SYSTEM SHALL seguir reportando exit 0, 0 failed — esta edición no rompe el gate original.

**Verify**
```bash
pnpm typecheck                                          # expect: exit 0
pnpm test tests/hooks/message-push.test.ts              # expect: exit 0, 0 failed, 0 skipped
pnpm test tests/integration/queue.test.ts                # expect: exit 0 — gate ORIGINAL de Fase 1 (paso 9), debe seguir verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 54: hook mensaje entrante -> push"
git tag step-54-hook-message
```

---

#### Paso 7 — Hook: aprobación de copiloto pendiente → push

**Do**

**Riesgo: edita código de Fase 1 ya cerrado.** Confirmación de respaldo:
`grep -n "requiresApprovalFirstUse" src/server/copilot/runs.ts` debe devolver al menos un match (la
rama que crea la fila en `approvals`, confirmada en `blueprints/nucleo-fase-1/blueprint.md` líneas
1338-1339). Inmediatamente después de que esa rama crea la fila en `approvals` y detiene el run en
`pending`, agregar: resolver los `user_id` de la organización con el `permission_key` del `tool_name`
en cuestión (mismo campo que `runs.ts` ya usa para decidir quién puede aprobar) y llamar
`sendPushNotification(userId, { title: "Aprobación requerida", body: <descripción de la tool_call>, url: \`/app/inbox?conversation=${conversationId}\` })`
para cada uno.

**Después de editar:** correr `pnpm test tests/integration/copilot.test.ts` (o el nombre real del test
de Fase 1 paso 14 — confirmar con `grep -rl "requiresApprovalFirstUse" tests/` antes de asumir el
nombre) y confirmar que sigue en verde.

**Done when**
- [ ] WHEN el copiloto invoca por primera vez en una organización una tool call marcada `requiresApprovalFirstUse` THE SYSTEM SHALL llamar `sendPushNotification` una vez por cada usuario con el `permission_key` de esa tool.
- [ ] WHEN la misma organización invoca la misma tool una segunda vez (ya aprobada, ejecución directa sin nueva fila en `approvals`) THE SYSTEM SHALL NOT llamar `sendPushNotification` para ese evento.
- [ ] WHEN una organización no tiene ningún usuario con el `permission_key` requerido (caso borde) THE SYSTEM SHALL no llamar `sendPushNotification` y no lanzar ninguna excepción.
- [ ] WHEN el test original de Fase 1 para el flujo de aprobación del copiloto corre THE SYSTEM SHALL seguir reportando exit 0 — esta edición no rompe el gate original.

**Verify**
```bash
pnpm typecheck                                              # expect: exit 0
pnpm test tests/hooks/copilot-approval-push.test.ts         # expect: exit 0, 0 failed, 0 skipped
FILES=$(grep -rl "requiresApprovalFirstUse" tests/); [ -n "$FILES" ] || exit 1; echo "$FILES" | xargs pnpm test  # expect: exit 0 — re-corre el/los test(s) originales de Fase 1 que cubren esta rama; falla ruidosamente si el grep no matchea nada, en vez de pasar en vacío
```

**Checkpoint**
```bash
git add -A && git commit -m "step 55: hook aprobacion de copiloto -> push"
git tag step-55-hook-copilot-approval
```

---

#### Paso 8 — Hook: canal desconectado — detección en los 4 webhooks

**Do**

**Riesgo: edita código de Fase 1 ya cerrado, en 4 archivos.** Confirmación de respaldo:
`grep -rl "external_account_id" src/app/api/webhooks/*/route.ts` debe devolver **4** matches (uno por
canal — whatsapp, instagram, facebook, tiktok), consistente con la rama documentada en
`blueprints/nucleo-fase-1/blueprint.md` línea 1154: "WHEN el `external_account_id` del payload no
corresponde a ningún `channel_connection` activo THE SYSTEM SHALL responder 404". Esta rama es la única
señal de desconexión que el código real de Fase 1 ya expone (ver §0 de este blueprint — Fase 1 no
define ningún otro mecanismo de detección; **decisión documentada, no inventada**: un webhook que
llega para un `channel_connection` inactivo/inexistente es la señal más confiable disponible hoy sin
agregar un poller nuevo, que está explícitamente fuera de alcance, §1 Non-Goals).

Crear `src/server/channels/connection-health.ts` exportando
`markChannelDisconnected(channelConnectionId: string, reason: string): Promise<void>` — actualiza
`channel_connection.status = 'disconnected'` (mismo campo `text`, sin migración de enum — Fase 1 ya lo
documenta como "enum-como-texto", línea 334), y llama `sendPushNotification` para cada `user_id` con
rol `owner` en esa organización. En los **4** route handlers, en la rama que hoy responde `404` para
`external_account_id` sin `channel_connection` activo, agregar la llamada a `markChannelDisconnected`
**antes** de responder `404` — la respuesta HTTP no cambia, solo se agrega el efecto secundario. Crear
`src/server/channels/connection-health.ts` también exportando `listDisconnectedChannels(orgId)` — el
paso 9 (banner de UI) la consume, este paso solo la implementa junto con `markChannelDisconnected`
porque ambas viven en el mismo archivo.

**Después de editar los 4 route handlers:** correr `pnpm test:e2e tests/e2e/tenant-isolation.spec.ts`
y confirmar que sigue en verde — la rama 404 original de Fase 1 no puede cambiar su código ni su body
de respuesta.

**Done when**
- [ ] WHEN llega un webhook con `external_account_id` que no corresponde a ningún `channel_connection` activo THE SYSTEM SHALL responder `404` (comportamiento idéntico al de Fase 1) Y llamar `markChannelDisconnected` para ese `channel_connection`.
- [ ] WHEN `markChannelDisconnected` se ejecuta THE SYSTEM SHALL actualizar `channel_connection.status` a `'disconnected'` y llamar `sendPushNotification` una vez por cada `owner` de la organización.
- [ ] WHEN el test de integración de webhooks original de Fase 1 corre THE SYSTEM SHALL seguir reportando exit 0 — el código y body de la respuesta 404 no cambiaron.

**Verify**
```bash
pnpm typecheck                                              # expect: exit 0
pnpm test tests/hooks/channel-disconnect-push.test.ts       # expect: exit 0, 0 failed, 0 skipped
pnpm test tests/integration/webhooks.test.ts                # expect: exit 0 — gate ORIGINAL de Fase 1 (paso 8, confirmado en blueprints/nucleo-fase-1/blueprint.md línea 862), nombre de archivo real, no un grep
```

**Checkpoint**
```bash
git add -A && git commit -m "step 56: hook canal desconectado -- deteccion en los 4 webhooks"
git tag step-56-hook-disconnect-webhooks
```

---

#### Paso 9 — Hook: canal desconectado — banner persistente en `(app)`

**Do**

Crear `src/components/channels/disconnected-banner.tsx` (Server Component — no necesita
interactividad) que renderiza la barra de §7 si `listDisconnectedChannels` (paso 8) devuelve ≥1 fila.
Editar `src/app/(app)/layout.tsx` para montar `<DisconnectedBanner />` bajo el header.

**Done when**
- [ ] WHEN un usuario visita cualquier ruta de `(app)` y su organización tiene ≥1 `channel_connection` con `status = 'disconnected'` THE SYSTEM SHALL renderizar el banner persistente.
- [ ] WHEN ninguna `channel_connection` de la organización está desconectada THE SYSTEM SHALL NOT renderizar el banner.

**Verify**
```bash
pnpm typecheck                                              # expect: exit 0
pnpm test tests/channels/disconnected-banner.test.tsx       # expect: exit 0, 0 failed, 0 skipped
```

**Checkpoint**
```bash
git add -A && git commit -m "step 57: hook canal desconectado -- banner persistente"
git tag step-57-hook-disconnect-banner
```

---

#### Paso 10 — Hook: aprobación de contenido pendiente → push

**Do**

**Riesgo: edita código de Fase 2 ya cerrado.** Confirmación de respaldo:
`grep -n "requestApproval" src/server/content/approvals.ts` debe devolver al menos un match (confirmado
en `blueprints/nucleo-fase-2/blueprint.md` línea 909). Inmediatamente después de que `requestApproval`
crea la fila `content_approval` en `pending`, agregar: resolver los `user_id` de la organización con
permiso `content.approve` y llamar `sendPushNotification(userId, { title: "Contenido esperando aprobación", body: <título de la pieza>, url: \`/app/content/${contentItemId}\` })`
para cada uno.

**Después de editar:** correr el test de Fase 2 que cubre `requestApproval` (confirmar el nombre real
con `grep -rl "requestApproval\|content_approval" tests/`) y confirmar que sigue en verde.

**Done when**
- [ ] WHEN el creador de una pieza en `draft` solicita aprobación THE SYSTEM SHALL llamar `sendPushNotification` una vez por cada usuario con permiso `content.approve` en la organización.
- [ ] WHEN una organización no tiene ningún usuario con `content.approve` (caso borde) THE SYSTEM SHALL no llamar `sendPushNotification` y no lanzar ninguna excepción.
- [ ] WHEN el test original de Fase 2 para `requestApproval` corre THE SYSTEM SHALL seguir reportando exit 0.

**Verify**
```bash
pnpm typecheck                                              # expect: exit 0
pnpm test tests/hooks/content-approval-push.test.ts         # expect: exit 0, 0 failed, 0 skipped
FILES=$(grep -rl "requestApproval" tests/); [ -n "$FILES" ] || exit 1; echo "$FILES" | xargs pnpm test  # expect: exit 0 — gate ORIGINAL de Fase 2; falla ruidosamente si el grep no matchea nada, en vez de pasar en vacío
```

**Checkpoint**
```bash
git add -A && git commit -m "step 58: hook aprobacion de contenido -> push"
git tag step-58-hook-content-approval
```

---

#### Paso 11 — Hook: automatización fallida → push

**Do**

**Riesgo: edita código de Fase 3 ya cerrado.** Confirmación de respaldo:
`grep -n 'automation_run.status = "failed"' src/server/automations/action-runner.ts` (o el literal
equivalente en el código real — confirmar con `grep -n "'failed'" src/server/automations/action-runner.ts`
si la comilla difiere) debe devolver al menos un match, consistente con
`blueprints/nucleo-fase-3/blueprint.md` líneas 1189-1200. Inmediatamente después de que
`action-runner.ts` marca `automation_run.status = 'failed'`, agregar: resolver `automation.created_by`
(join `automation_run` → `automation`) y llamar
`sendPushNotification(createdBy, { title: "Automatización falló", body: <nombre de la automatización>, url: \`/app/automations/${automationId}/runs/${runId}\` })`.
**No** llamar `sendPushNotification` cuando el status resultante es `'partial'` — solo `'failed'`
completo, para no generar ruido en ejecuciones parcialmente exitosas (decisión documentada, ver §20.3).

**Después de editar:** correr `pnpm test tests/automations/retries-dead-letter.test.ts` (el `Verify`
original del paso 12 de Fase 3) y confirmar que sigue en verde.

**Done when**
- [ ] WHEN `action-runner.ts` marca un `automation_run.status = 'failed'` THE SYSTEM SHALL llamar `sendPushNotification` exactamente una vez, con el `created_by` de esa automatización.
- [ ] WHEN `action-runner.ts` marca un `automation_run.status = 'partial'` THE SYSTEM SHALL NOT llamar `sendPushNotification`.
- [ ] WHEN `action-runner.ts` marca un `automation_run.status = 'completed'` THE SYSTEM SHALL NOT llamar `sendPushNotification`.
- [ ] WHEN `pnpm test tests/automations/retries-dead-letter.test.ts` corre (test original de Fase 3) THE SYSTEM SHALL seguir reportando exit 0.

**Verify**
```bash
pnpm typecheck                                                    # expect: exit 0
pnpm test tests/hooks/automation-failed-push.test.ts              # expect: exit 0, 0 failed, 0 skipped
pnpm test tests/automations/retries-dead-letter.test.ts           # expect: exit 0 — gate ORIGINAL de Fase 3 (paso 12)
```

**Checkpoint**
```bash
git add -A && git commit -m "step 59: hook automatizacion fallida -> push"
git tag step-59-hook-automation-failed
```

---

#### Paso 12 — Capa de datos del dashboard

**Do**

Crear `src/server/dashboard/queries.ts` exportando `getAttentionSummary(orgId, userId)` que agrega, en
paralelo (`Promise.all`), cuatro consultas de solo lectura sobre tablas ya existentes:
1. Conversaciones abiertas sin responder hace más de 2 horas, o asignadas al `userId` actual
   (`conversation` de Fase 1, filtro `status` + `assigned_to`).
2. Aprobaciones pendientes unificadas: `approvals` sin decisión (copiloto, Fase 1) +
   `content_approval` en `pending` (Fase 2) + automatizaciones con `automation_action_approval`
   ausente para una combinación que la requiere (Fase 3) — cada una como su propio campo tipado en el
   resultado, **no fusionadas en una tabla genérica** (evita inventar un esquema común entre 3 dominios
   distintos que no lo comparten).
3. Contenido programado para hoy/mañana (`content_item` con `status = 'scheduled'` y
   `scheduled_at` en el rango, Fase 2).
4. Automatizaciones con `automation_run.status = 'failed'` en las últimas 24 horas (Fase 3).
Cada consulta filtra `org_id` explícito (regla no-negociable heredada de Fase 1-3, §14 de este
blueprint).

**Done when**
- [ ] WHEN `getAttentionSummary` se llama para una organización con 1 conversación sin responder hace 3 horas THE SYSTEM SHALL incluirla en el campo `conversations`.
- [ ] WHEN `getAttentionSummary` se llama para una organización sin ninguna aprobación pendiente en ningún dominio THE SYSTEM SHALL devolver los tres campos de aprobaciones como arrays vacíos, no `null` ni `undefined`.
- [ ] WHEN `getAttentionSummary` se llama para dos organizaciones distintas con datos similares THE SYSTEM SHALL devolver resultados aislados por `org_id` — ninguna fila de la organización B aparece en el resultado de la organización A.
- [ ] WHEN `getAttentionSummary` se llama y no hay automatizaciones fallidas en 24h THE SYSTEM SHALL devolver el campo `failedAutomations` como array vacío.

**Verify**
```bash
pnpm typecheck                                    # expect: exit 0
pnpm test tests/dashboard/queries.test.ts         # expect: exit 0, 0 failed, 0 skipped
```

**Checkpoint**
```bash
git add -A && git commit -m "step 60: capa de datos del dashboard"
git tag step-60-dashboard-queries
```

---

#### Paso 13 — UI del dashboard `/app` + cambio del destino post-login

**Do**

Crear `src/app/(app)/page.tsx` (Server Component) que llama `getAttentionSummary` (paso 12) y renderiza
`<AttentionList />` con las 4 secciones de §1 Goals #3, más los enlaces rápidos (ir a bandeja, crear
contenido, ver automatizaciones — rutas ya existentes de Fase 1-3, ningún enlace nuevo se inventa).
Crear `src/components/dashboard/attention-list.tsx`.

**Riesgo: edita el destino post-login de Fase 1 — la ubicación exacta del literal debe confirmarse por
inspección, no asumirse.** `grep -rn "/app/inbox" src/proxy.ts src/lib/auth.ts` (el grep de respaldo)
solo confirma que el string aparece en alguno de los dos archivos — no confirma **qué hace** cada uno
con él. Las líneas 785/787 de `blueprints/nucleo-fase-1/blueprint.md` son prosa narrativa de la sección
"Flows" (describen el comportamiento esperado, no código), y la línea 1023 documenta que `src/proxy.ts`
redirige a `/login` las sesiones **sin autenticar** que visitan `/app/*` — no documenta ningún destino
por defecto para una sesión ya autenticada. Antes de editar, **inspeccionar el código real** de
`src/proxy.ts` y `src/lib/auth.ts` (no solo grepear el string) para determinar en cuál de los dos vive
la lógica "sesión autenticada tras login/signup → redirect a `/app/inbox`" — lo más probable, dado que
`src/proxy.ts` solo protege rutas no autenticadas (línea 1023), es que el redirect post-login/signup
viva en el handler de `src/lib/auth.ts` o en el componente cliente de `login/signup/page.tsx` que llama
al cliente de better-auth, no en `src/proxy.ts`. Confirmar con la lectura real cuál archivo(s)
contiene(n) el literal `/app/inbox` como destino de un redirect tras autenticación exitosa, y cambiar
**esos** literales a `/app` — nunca asumir que ambos archivos listados en el grep de respaldo son los
correctos solo porque el grep dio matches en ambos; el grep confirma presencia del string, no su rol.
`/app/inbox` sigue existiendo como ruta — solo deja de ser el destino automático. El link "Bandeja" en
la navegación del shell de `(app)` (ya existente desde Fase 1) sigue apuntando a `/app/inbox` sin
cambios.

**Después de editar:** correr `pnpm test tests/integration/auth.test.ts` (el `Verify` original del
paso 4 de Fase 1). Este test **fallará** si aserta literalmente el string `/app/inbox` como destino de
redirect — si eso ocurre, es un caso legítimo de "un paso agrega un requisito que rompe el gate de un
paso anterior" (§9 regla 9 de `templates/blueprint-template.md`): el arreglo correcto es actualizar esa
aserción del test de Fase 1 para esperar `/app` en este mismo paso 13 (no en un paso posterior), porque
este paso es el que posee el cambio de contrato — nunca dejarlo roto ni retrasar el arreglo.

**Done when**
- [ ] WHEN un usuario visita `/app` con sesión válida THE SYSTEM SHALL renderizar el dashboard con las 4 secciones de `getAttentionSummary`.
- [ ] WHEN un usuario completa signup THE SYSTEM SHALL redirigir a `/app`, no a `/app/inbox`.
- [ ] WHEN un usuario hace login con credenciales correctas THE SYSTEM SHALL redirigir a `/app`, no a `/app/inbox`.
- [ ] WHEN un usuario visita `/app/inbox` directamente (navegación, no redirect) THE SYSTEM SHALL seguir renderizando la bandeja unificada sin cambios de contenido.
- [ ] WHEN `pnpm test tests/integration/auth.test.ts` corre THE SYSTEM SHALL reportar exit 0 — actualizado en este mismo paso si asertaba el destino anterior.

**Verify**
```bash
pnpm typecheck                                          # expect: exit 0
pnpm test tests/integration/auth.test.ts                 # expect: exit 0 — actualizado en este paso si era necesario
# La cobertura e2e completa del dashboard se escribe y corre en el paso 14 (tests/e2e/dashboard.spec.ts)
# — ese archivo no existe todavía en este paso.
```

**Checkpoint**
```bash
git add -A && git commit -m "step 61: dashboard /app + cambio de destino post-login"
git tag step-61-dashboard-ui
```

---

#### Paso 14 — E2E + a11y de notificaciones y dashboard

**Do**

Crear `tests/e2e/notifications-opt-in.spec.ts` (primera vez que este archivo existe — los pasos 4 y 5
construyeron el código que este test ejercita, pero no el archivo de test en sí) cubriendo el flujo
completo: visita perfil → activa notificaciones (permiso de navegador mockeado vía el contexto de
Playwright, `context.grantPermissions(["notifications"])`) → confirma fila en `push_subscription` →
desactiva → confirma que la fila se borra. Crear `tests/e2e/dashboard.spec.ts`: login → confirma que
aterriza en `/app`, no en `/app/inbox` → confirma que las 4 secciones renderizan (con datos de fixture
sembrados por el test). Editar
`tests/e2e/a11y.spec.ts` (existente desde Fase 1 paso 16 — grep de respaldo:
`grep -n "axe" tests/e2e/a11y.spec.ts`) agregando `/app` a la lista de rutas auditadas por axe, junto a
las 3 rutas que Fase 1 ya audita.

**Done when**
- [ ] WHEN `tests/e2e/notifications-opt-in.spec.ts` corre THE SYSTEM SHALL reportar el flujo completo activar→verificar→desactivar sin fallos.
- [ ] WHEN `tests/e2e/dashboard.spec.ts` corre THE SYSTEM SHALL confirmar que login aterriza en `/app` y que las 4 secciones del dashboard renderizan contenido de los fixtures sembrados.
- [ ] WHEN `pnpm test:e2e tests/e2e/a11y.spec.ts` corre contra `/app` (además de las 3 rutas ya auditadas por Fase 1) THE SYSTEM SHALL reportar 0 violaciones de axe.

**Verify**
```bash
pnpm typecheck                                                                      # expect: exit 0
pnpm test:e2e tests/e2e/notifications-opt-in.spec.ts tests/e2e/dashboard.spec.ts    # expect: exit 0, 0 failed
pnpm test:e2e tests/e2e/a11y.spec.ts                                                # expect: exit 0, 0 violaciones
```

**Checkpoint**
```bash
git add -A && git commit -m "step 62: e2e + a11y de notificaciones y dashboard"
git tag step-62-e2e-a11y
```

---

#### Paso 15 — Verificación final: no regresión sobre Fase 1-3

**Do**

No agrega código nuevo. Corre la suite completa del proyecto — unit, integración, e2e, build — para
confirmar que el conjunto de ediciones a código de Fase 1-3 (pasos 6-11 y 13) no rompió ningún gate
original en conjunto (cada paso ya lo confirmó de forma aislada; este paso es la confirmación
end-to-end con el árbol completo). Confirma también que los 62 tags de checkpoint (`step-01`..`step-62`)
existen, no solo los 14 nuevos de esta fase (el `step-63` propio de este paso se agrega después, en su
propio Checkpoint — no puede figurar en este conteo, ver "A Verify may not depend on what its own
Checkpoint produces").

**Done when**
- [ ] WHEN `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` corre sobre el árbol completo THE SYSTEM SHALL reportar exit 0 en cada comando, en ese orden.
- [ ] WHEN `git tag -l 'step-*' | wc -l` corre THE SYSTEM SHALL reportar al menos `62` — los 48 heredados más los 14 de esta fase visibles en el momento de este `Verify` (el `step-63` de este mismo paso se añade después, en su `Checkpoint`).
- [ ] WHEN el servidor construido arranca (`node .next/standalone/server.js`, heredado de Fase 1) y se solicita `GET /app` sin sesión THE SYSTEM SHALL redirigir a `/login?next=/app` (misma protección de proxy que cualquier otra ruta de `(app)`).

**Verify**
```bash
pnpm typecheck                                          # expect: exit 0
pnpm lint                                               # expect: exit 0, 0 warnings
pnpm test                                               # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e                                           # expect: exit 0, 0 failed
pnpm build                                              # expect: exit 0
test "$(git tag -l 'step-*' | wc -l)" -ge 62             # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 63: verificacion final notificaciones + dashboard" --allow-empty
git tag step-63-verification
```

---

### 9.1 Parity and cutover

NOT APPLICABLE — greenfield build sobre el producto existente: no se reemplaza ningún sistema en
producción, no hay corte de tráfico ni ventana de sombra. `/app/inbox` deja de ser el destino
*automático* post-login (paso 13), pero la ruta y su contenido no cambian ni se retiran — no hay
decommission. Si esto se considerara una migración de UX, la única "parity" relevante es que
`/app/inbox` siga siendo 100% funcional tras el cambio, lo cual §9 paso 13's "Done when" #4 ya cubre
como criterio machine-checkable.

---

## 10. Environment Setup

### Prerequisites

Heredados sin cambios de Fase 1-3 — Node.js (`.nvmrc`, 24.19.0), pnpm, Docker, Postgres — ver
`blueprints/nucleo-fase-1/blueprint.md` §10. Esta fase no agrega ninguna herramienta de sistema nueva.

### Accounts to create first

Ninguna cuenta de servicio de terceros nueva. Las claves VAPID se generan localmente con
`pnpm dlx web-push generate-vapid-keys` (paso 1) — no requieren registro en ningún proveedor externo, a
diferencia de las credenciales de canal de Fase 1.

### Environment variables

| Variable | Purpose | Where to get it | Required by step | Secret? |
|---|---|---|---|---|
| `VAPID_PUBLIC_KEY` | Clave pública VAPID, usada por `web-push` en el servidor para firmar el envío | `pnpm dlx web-push generate-vapid-keys` (paso 1) | 3 | no |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID, usada por `web-push` en el servidor | `pnpm dlx web-push generate-vapid-keys` (paso 1) | 3 | yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Misma clave pública, expuesta al navegador para `PushManager.subscribe()` | mismo valor que `VAPID_PUBLIC_KEY`, prefijado `NEXT_PUBLIC_` para exposición de cliente | 5 | no |

Las variables heredadas de Fase 1-3 (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
`ANTHROPIC_API_KEY`, etc.) siguen requeridas exactamente desde los pasos que ya las requerían — esta
fase no las retoca. `.env.example` se actualiza en el paso 1 con las 3 variables nuevas, valor en
blanco. La app valida las variables nuevas al boot en `src/lib/env.ts` (zod, mismo mecanismo heredado),
tratándolas como requeridas solo desde el paso indicado en la tabla — nunca antes (§9 regla 9 de
`templates/blueprint-template.md`).

### Files that must be committed

| File | Why it is committed | Ignore-file exception line |
|---|---|---|
| `.env.example` | Ya comprometido desde Fase 1; se actualiza con las 3 variables VAPID, no se recrea | ya tiene `!.env.example` desde Fase 1 — sin cambios |
| `public/sw.js`, `src/app/manifest.ts` | Código de producto — el Service Worker y el manifest deben servirse desde el build real | no matcheados por ningún patrón del `.gitignore` heredado — `public/**` y `src/**` ya están commiteados |
| `.claude/rules/push-notifications.md`, `.claude/settings.json` (fusionado) | Convención del dominio nuevo + permisos del builder — emitidos en §19.6 | `.claude/` ya está commiteado desde Fase 1, ningún patrón lo excluye |
| `tests/push/**`, `tests/dashboard/**`, `tests/hooks/**`, `tests/channels/**` | Tests de esta fase — deben correr en CI igual que el resto de la suite | `tests/**` ya está commiteado desde Fase 1 |
| `tests/setup/env.ts` | Editado en el paso 1 (2 líneas `??=` nuevas para las VAPID_*), no recreado | ya comprometido desde Fase 1, edición sobre archivo existente, `tests/**` ya está commiteado |

El `.gitignore` del proyecto ya existe desde el Bootstrap de Fase 1 (con `!.env.example` ya en su
lugar) — esta fase no lo edita.

### Bootstrap

```bash
# orden: verificar Fase 1-3 completas -> copiar workspace/ nuevo (guardado) -> fusionar settings.json ->
# instalar dependencia nueva -> fusionar VAPID_* dentro de .env real
set -e

# 1. Verificar que las 3 fases previas están completas antes de tocar nada — deben existir al menos
#    48 checkpoints (Fase 1: step-01..step-18, Fase 2: step-19..step-32, Fase 3: step-33..step-48).
#    Mismo mecanismo de verificación que Fase 3 ya usó contra Fase 1+2
#    (blueprints/nucleo-fase-3/blueprint.md §10 Bootstrap).
STEP_TAGS=$(git tag -l 'step-*' | wc -l | tr -d ' ')
if [ "$STEP_TAGS" -lt 48 ]; then
  echo "ABORT: se esperaban al menos 48 checkpoints (Fase 1: step-01..step-18, Fase 2: step-19..step-32, Fase 3: step-33..step-48), se encontraron $STEP_TAGS" >&2
  exit 1
fi
git tag -l 'step-18-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 1
git tag -l 'step-32-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 2
git tag -l 'step-48-*' | grep -q .              # expect: exit 0 — cierre explícito de Fase 3 (nombre exacto del tag final confirmado contra blueprints/nucleo-fase-3/blueprint.md §9 antes de depender de un literal)

# 2. Copiar el workspace de esta fase al root del proyecto — SIEMPRE con rutas completas explícitas,
#    nunca abreviado a "workspace/" a secas (lección de Fase 1, repetida en Fase 3).
rsync -a --ignore-existing \
  "./blueprints/nucleo-notificaciones-dashboard/workspace/" \
  "./"
  # -a: preserva permisos/timestamps · --ignore-existing: nunca pisa un archivo que el build ya cambió.
  # Exit 0 en ambos casos (copia o salta), a diferencia de `cp -n` en BSD/macOS que sale 1 al saltar.

# 3. Fusionar .claude/settings.json de esta fase dentro del acumulado de Fases 1-3, sin pisarlo.
#    scripts/merge-claude-settings.mjs ya existe en el repo desde Fase 2/3 — se reutiliza tal cual,
#    mismo patrón de invocación con argumento explícito que Fase 3 ya estableció.
node scripts/merge-claude-settings.mjs "./blueprints/nucleo-notificaciones-dashboard/workspace/.claude/settings.json"

# 4. Confirmar dependencias (el paso 1 del build order instala web-push explícitamente; aquí solo se
#    confirma el lockfile tras el rsync).
pnpm install --frozen-lockfile

# 5. Fusionar en el .env real cualquier variable de .env.example que .env todavía no tenga — mismo
#    mecanismo establecido en Fase 2 (blueprints/nucleo-fase-2/blueprint.md §10 Bootstrap paso 6).
#    Solo aplica una vez que el paso 1 del build order agregue las 3 líneas VAPID_* a .env.example;
#    en el propio Bootstrap (que corre ANTES del paso 1) .env.example todavía no las tiene, así que
#    esta línea es un no-op la primera vez que Bootstrap corre — se documenta aquí por consistencia
#    con el patrón ya establecido, y vuelve a ser útil si Bootstrap se re-ejecuta después del paso 1.
touch .env
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  key="${line%%=*}"
  grep -q "^${key}=" .env || printf '%s\n' "$line" >> .env
done < .env.example
```

**Re-ejecutar este bloque sobre un árbol ya bootstrapeado es seguro:** el paso 1 no muta nada (solo
lee tags); el paso 2 salta todo lo que ya existe (`rsync --ignore-existing`, exit 0 en ambos casos); el
paso 3 fusiona con `Set` deduplicado (idempotente por diseño, ver `scripts/merge-claude-settings.mjs`
heredado); el paso 4 no reinstala si el lockfile ya está satisfecho; el paso 5 solo añade líneas
ausentes a `.env`, nunca pisa una ya presente.

---

## 11. Dependencies

### Runtime

| Package | Version | Source (registry URL or track file) | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| `web-push` | `3.6.7` | `https://registry.npmjs.org/web-push` — verificado en vivo en esta sesión (`dist-tags.latest`) | 2026-08-19 | §9 paso 1 (`pnpm add web-push@3.6.7`) | Implementación del protocolo Web Push VAPID en el servidor |

### Development

| Package | Version | Source (registry URL or track file) | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| `@types/web-push` | `3.6.4` | `https://registry.npmjs.org/@types/web-push` — verificado en vivo en esta sesión (`dist-tags.latest` al momento de escribir; el builder debe re-confirmar el número exacto con `npm view @types/web-push version` antes de fijar el pin literal en `package.json`, ya que este blueprint no puede garantizar que la versión no haya avanzado entre esta sesión y el build — ver nota) | 2026-08-19 | §9 paso 1 (`pnpm add -D @types/web-push`) | Tipos TypeScript para `web-push`, que no publica sus propios `.d.ts` |

**Nota de verificación — `@types/web-push`:** a diferencia de `web-push`, esta sesión no tiene una
confirmación de registro en vivo igual de firme para el número de versión exacto de `@types/web-push`
al momento de redactar este blueprint. **VERIFY antes del paso 1:** correr
`npm view @types/web-push version` (o `pnpm view`) contra el registro real en el momento del build y
usar ese número — nunca el de esta tabla si difiere. Esto es una brecha documentada, no un pin fijado
de memoria: `pnpm add -D @types/web-push` sin versión fijada obtiene el `latest` real automáticamente
si el builder prefiere no fijar un número, lo cual es aceptable para una dependencia de tipos pura sin
impacto en runtime.

### Deliberately not used

| Rejected | Instead | Why |
|---|---|---|
| Un servicio SaaS de push (OneSignal, Firebase Cloud Messaging, Pusher Beams) | `web-push` + Service Worker propio | Núcleo ya opera su propia infraestructura (VPS, Postgres, Redis) — un servicio de terceros agrega una cuenta, un vendor lock-in y una dependencia de disponibilidad externa para un problema que `web-push` resuelve sin salir del stack ya operado |
| `next-pwa` / Workbox | `public/sw.js` escrito a mano (~30 líneas) | Ambas traen su propia estrategia de cacheo de assets que colisionaría con `cacheComponents: true` ya configurado en Fase 1; el Service Worker de esta fase solo necesita `push` + `notificationclick`, no cacheo offline |
| Una tabla `notification_preference` con flags por tipo de evento | Todo-o-nada por usuario (una fila en `push_subscription` = notificaciones activas) | Explícitamente fuera de alcance en v1, §1 Non-Goals — agregar la tabla ahora es construir la ambigüedad antes de que exista demanda validada |

---

## 12. Deployment Strategy

### Hosting

Sin cambios respecto a Fase 1-3 — mismo VPS, mismo Docker Compose + Caddy, mismo comando de build
(`pnpm build`, `output: "standalone"`) y mismo runtime (`node .next/standalone/server.js`). El
`public/sw.js` y `src/app/manifest.ts` se sirven automáticamente por el mismo servidor Next.js, sin
configuración de hosting adicional.

### Environments

| Environment | Branch | URL | Database | Third-party mode |
|---|---|---|---|---|
| Local | — | localhost | Postgres local heredado | claves VAPID de desarrollo (generadas localmente, sin distinción "test" vs "producción" — VAPID no tiene modo sandbox) |
| Preview | cualquier PR | auto (heredado) | base de datos de rama (heredado) | mismas claves VAPID de desarrollo — un push de preview no debe usar las claves de producción |
| Production | `main` | dominio de producción (heredado) | base de datos de producción (heredado) | claves VAPID de producción, generadas una sola vez y nunca regeneradas (regenerarlas invalida toda suscripción existente) |

### CI/CD

Sin cambios en la estructura del pipeline heredado (`install` → `typecheck` → `lint` → `test` →
`test:e2e` → `build`) — ahora también cubre `src/lib/push/**`, `src/server/push/**`,
`src/server/dashboard/**` y `tests/{push,dashboard,hooks}/**` porque son parte del mismo árbol de
fuentes, sin configuración adicional.

### Release and rollback

Mismo mecanismo heredado. No hay componente desplegable nuevo que coordinar por separado — el Service
Worker se sirve como cualquier archivo estático de `public/`, y `sendPushNotification` corre dentro del
mismo proceso de servidor/worker ya desplegado. Un rollback revierte también el `public/sw.js` — los
navegadores con el SW anterior en caché lo reemplazan en su próximo ciclo de actualización (el header
`no-cache` del paso 4 garantiza que esto ocurra en la siguiente visita, no en semanas).

### Domain, DNS, TLS

Sin cambios.

---

## 13. Testing Strategy

| Layer | Framework | What it covers | Where | Runs |
|---|---|---|---|---|
| Unit | vitest (heredado) | `sendPushNotification`, `getAttentionSummary`, `markChannelDisconnected` | `tests/push/*.test.ts`, `tests/dashboard/*.test.ts` | cada commit |
| Integración | vitest (heredado) contra Postgres/Redis reales de desarrollo | Los 5 hooks (mensaje, aprobación copiloto, desconexión, aprobación contenido, automatización fallida) | `tests/hooks/*.test.ts` | cada commit |
| E2E | Playwright (heredado) | Opt-in de notificaciones, dashboard como destino post-login | `tests/e2e/notifications-opt-in.spec.ts`, `tests/e2e/dashboard.spec.ts` | pre-deploy |

### Critical flows to cover E2E

1. Un usuario activa notificaciones desde su perfil, recibe una suscripción real, la desactiva — la
   fila desaparece. Es el único flujo de esta fase donde un fallo silencioso (permiso denegado sin
   feedback, suscripción que no se persiste) cuesta confianza del usuario sin que nadie lo reporte.
2. Login/signup aterrizan en `/app`, no en `/app/inbox` — regresión directa de la Fase 1 ya construida.

### Test data

Mismo mecanismo heredado — Postgres de desarrollo/test vía `docker-compose.yml` de Fase 1,
`TEST_DATABASE_URL` ya validada. Los tests de hooks (pasos 6-11) insertan sus propios fixtures de
`conversation`/`automation`/`content_item` mínimos, sin depender del seed compartido — cada test es
responsable de su propio estado, mismo principio que Fase 1-3 ya siguen.

### What is deliberately not tested

La entrega real de push a un navegador físico (Chrome/Firefox/Safari reales) no se prueba en CI — los
tests usan `context.grantPermissions` de Playwright, que simula el permiso pero corre contra el
navegador headless real de Playwright (Chromium), no contra cada motor de push service real (FCM,
Mozilla). Decisión: verificar el contrato (`push_subscription` se crea/borra correctamente, el SW se
registra) es suficiente para CI; una prueba manual de "recibí la notificación en mi teléfono" queda en
el checklist de lanzamiento (§20.1), no en el build.

---

## 14. Security & Secrets

| Concern | Control | Implemented in |
|---|---|---|
| Secret storage | `VAPID_PRIVATE_KEY` nunca en el repo, env del servidor únicamente | `src/lib/env.ts` |
| Secret rotation | Regenerar claves VAPID invalida toda suscripción existente (cada usuario debe volver a activar) — documentado como costo de rotación, no automatizado en v1 | `blueprints/nucleo-notificaciones-dashboard/blueprint.md` §12 |
| Input validation | zod en `/api/v1/push/subscribe` y `/unsubscribe`, mismo patrón heredado | `src/app/api/v1/push/{subscribe,unsubscribe}/route.ts` |
| AuthN / AuthZ | `requirePermission()` resuelve la sesión antes de cualquier escritura en `push_subscription`; `unsubscribe` además filtra por `user_id` propio | rutas de §5 |
| PII handling | El payload de una notificación push (título/cuerpo) puede contener el preview de un mensaje de cliente — nunca se loguea el payload completo, solo metadatos (`user_id`, `endpoint` truncado) en caso de error | `src/lib/push/send.ts` |
| Logging hygiene | `sendPushNotification` nunca loguea `p256dh`/`auth_key` (son secretos de la suscripción, equivalentes a una clave de sesión del navegador) — solo el `statusCode` del error y el `user_id` | `src/lib/push/send.ts` |
| Dependency audit | `pnpm audit`, cadencia heredada de CI de Fase 1 | CI |

**Hard rules** (heredadas, reafirmadas para esta fase):
- Ningún secreto (`VAPID_PRIVATE_KEY`) se commitea, imprime en log, o llega al bundle de cliente —
  solo `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (que es pública por diseño del protocolo VAPID) cruza esa
  frontera.
- Toda escritura en `push_subscription` pasa por `requirePermission()` primero.
- Los webhooks de canal (editados en el paso 8) siguen verificando firma sobre el raw body antes de
  parsear el payload — esta fase no toca esa verificación, solo agrega un efecto secundario en una
  rama que ya existía.

Sin datos regulados nuevos — un `endpoint`/`p256dh`/`auth_key` de suscripción push no es PII en el
sentido de identificar a una persona por sí solo (es un identificador de dispositivo/navegador, no de
identidad), y ya está protegido por la misma autenticación que protege el resto de los datos de
usuario.

---

## 15. Accessibility

**Target: WCAG 2.2 Level AA** — heredado sin cambios. Requisitos nuevos de esta fase:

| Requirement | Rule |
|---|---|
| `DisconnectedBanner` no obstruye el foco | Fijo bajo el header, nunca superpuesto al contenido enfocado — cumple 2.4.11 Focus Not Obscured (Min) |
| `PushOptIn` — botón con estado anunciado | El cambio de "Activar" a "Desactivar" se anuncia vía `aria-live="polite"` en el contenedor del botón, para que un lector de pantalla confirme la acción sin que el usuario deba re-explorar la página |
| Targets táctiles | El botón de opt-in y el banner (si es dismissible en una iteración futura) cumplen ≥24×24px — 2.5.8 Target Size (Min), mismo estándar que el resto de componentes de Fase 1 |
| Contraste del banner | `--destructive` sobre fondo con opacidad 10% de `--destructive` — el texto usa `--destructive` sólido sobre `--surface`, no sobre el fondo con opacidad, para mantener el contraste 4.5:1 ya verificado en Fase 1 para ese token |

### Verification

```bash
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: 0 violaciones — incluye /app desde el paso 14
```

Automatizado cubre aproximadamente un tercio de los problemas reales. Antes de lanzar: navegación por
teclado del flujo de opt-in completo, un pase de lector de pantalla sobre `/app` y el banner de
desconexión.

---

## 16. Observability & Cost

### Instrumentation

| Signal | Tool | What it captures | Who looks at it |
|---|---|---|---|
| Errores | herramienta heredada de Fase 1 | Excepciones no controladas en `sendPushNotification` (el `catch` interno registra, no relanza — pero cualquier error inesperado en la propia función de logging se reporta) | equipo de ingeniería |
| Logs | heredado (JSON estructurado en stdout) | Cada intento de `sendPushNotification` — `user_id`, `statusCode` (si hubo error), `subscription_deleted: boolean` | equipo de ingeniería |
| Métricas | heredado | Ver tabla abajo | equipo de ingeniería |

### The metrics that matter for this project

| Metric | Target | Alert at |
|---|---|---|
| Tasa de envíos push que resultan en 410/404 (suscripción muerta) sobre el total | < 15% | > 40% sostenido 1 día — señal de que las claves VAPID rotaron sin que los usuarios se re-suscribieran, o de un bug en el Service Worker |
| Latencia p95 de `sendPushNotification` por suscripción | < 2s | > 8s — el push service del navegador está lento o caído |
| % de organizaciones con ≥1 canal en `status = 'disconnected'` por más de 24h sin resolución | < 5% | > 20% — señal de un bug sistémico en el hook del paso 8, no solo canales individuales caídos |

### Health check

Sin cambios respecto al heredado — `/api/health` (Fase 1) no se extiende para verificar el envío push
(sería un side-effect en un healthcheck, antipatrón); la salud de `push_subscription` se mide por las
métricas de arriba, no por un ping activo a cada push service.

### Cost model

| Service | Free tier | Cost at expected v1 scale | Cost at 10× | Cliff to watch |
|---|---|---|---|---|
| Web Push (FCM, Mozilla push, etc.) | Gratuito — es un protocolo abierto, no un servicio de pago | $0 | $0 | Ninguno — Web Push estándar no tiene un modelo de facturación por notificación, a diferencia de un SaaS de push |
| Infraestructura (Postgres, servidor) | ya cubierta por Fase 1-3 | incremento marginal (1 tabla nueva, sin tráfico adicional significativo) | incremento marginal | Ninguno nuevo — el volumen de `push_subscription` crece linealmente con usuarios activos, no con eventos |

**Estimated monthly cost at launch: $0 adicional.** Web Push no tiene costo de servicio; el único costo
es el tiempo de cómputo marginal de `sendPushNotification` sobre infraestructura ya pagada.

---

## 17. Model Routing

NOT APPLICABLE — this project does not call an LLM at runtime. Los 5 hooks de esta fase reaccionan a
eventos ya generados por el copiloto de IA (Fase 1) y por `ai_classify` (Fase 3), pero ninguna línea de
código de esta fase invoca directamente al SDK de Anthropic — `sendPushNotification` solo formatea y
envía texto ya producido por otras fases.

---

## 18. Skills to Use During Build

| Skill | Build steps | Why | Install |
|---|---|---|---|
| `add-migration` | 1 | Ya instalado en el proyecto desde Fase 1 (`.claude/skills/add-migration/SKILL.md`) — genera y aplica la migración de `push_subscription` de forma segura tras editar el schema | ya presente en el repo, auto-activa (sin instalación adicional) |
| `claude-api` | — | No aplica en esta fase — ningún paso escribe un model ID, precio, o parámetro de la API de Claude (§17) | no se usa |
| `playwright-cli` | 4, 5, 13, 14 | Autocompleta selectores/fixtures de Playwright para los tests e2e nuevos (opt-in, dashboard) | `npm install -g @playwright/cli@latest` seguido de `playwright-cli install --skills` — si no está disponible, el builder escribe los specs a mano contra la config de Playwright ya heredada de Fase 1, sin bloquear el paso |

Ningún skill de este bundle es una dependencia dura — si `playwright-cli` no está disponible, los pasos
4, 5, 13 y 14 se completan igual escribiendo los tests directamente contra `playwright.config.ts`
(heredado desde Fase 1, sin cambios).

---

## 19. Agent Workspace

### 19.1 `CLAUDE.md`

Ver `workspace/CLAUDE.md` — archivo completo emitido en el bundle.

### 19.2 `AGENTS.md`

Ver `workspace/AGENTS.md`.

### 19.3 `.claude/settings.json`

Ver `workspace/.claude/settings.json` — se fusiona dentro del `.claude/settings.json` acumulado del
proyecto vía `scripts/merge-claude-settings.mjs` (§10 Bootstrap paso 3), mismo patrón que Fase 2/3.

### 19.4 Project skills

Ninguno nuevo — esta fase reutiliza `add-migration` ya instalado desde Fase 1. No se emite ningún
`SKILL.md` nuevo.

### 19.5 `.claude/rules/*.md`

| File | `paths` globs | Covers |
|---|---|---|
| `.claude/rules/push-notifications.md` | `src/lib/push/**`, `src/server/push/**`, `src/components/push/**`, `public/sw.js` | Convenciones del dominio de notificaciones push — ver `workspace/.claude/rules/push-notifications.md` |

### 19.6 Verify-critical config and local infrastructure

Esta fase **no agrega ningún runner de tests nuevo, ningún servicio local nuevo, ni ninguna
configuración de resolución de módulos nueva** — reutiliza vitest, Playwright, Postgres y Redis ya
provisionados y configurados por Fase 1 (`workspace/vitest.config.ts`, `workspace/playwright.config.ts`,
`workspace/docker-compose.yml`, todos ya en el root del proyecto desde el Bootstrap de Fase 1). Ningún
`Verify` de §9 de este blueprint invoca un comando, config o servicio que no exista ya en el árbol.

Esta fase **sí edita un archivo verify-crítico heredado**: `tests/setup/env.ts` (paso 1) recibe dos
líneas `??=` nuevas (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) para que la suite unitaria heredada de
Fase 1-3 — que este blueprint re-corre como red de seguridad en cada paso de hook — no falle en el boot
de `src/lib/env.ts` desde que el paso 3 marca `VAPID_PRIVATE_KEY` como requerida. Es una edición, no un
archivo nuevo: el archivo y su mecanismo (`??=` sobre `process.env`) ya existen desde Fase 1.

Los archivos verify-críticos que este blueprint emite o edita son: `.claude/settings.json` (fusionable,
nuevo en este bundle), `.claude/rules/push-notifications.md` (nuevo en este bundle) — ambos bajo
`workspace/`, listados en 19.3/19.5 — y `tests/setup/env.ts` (heredado de Fase 1, editado en el paso 1,
no forma parte del `workspace/` de este bundle porque ya vive en el proyecto desde el Bootstrap de
Fase 1).

#### A resolution convention is decided once and reconciled against every loader

NOT APPLICABLE — este blueprint no introduce ninguna convención de import/resolución nueva. Todo
archivo nuevo (`src/lib/push/send.ts`, `src/server/push/subscriptions.ts`, etc.) sigue el mismo alias
`@/` → `src/` y la misma ausencia de barrel files ya establecidos por Fase 1 (`workspace/CLAUDE.md`
regla 2 y 4), resueltos por el mismo `tsconfig.json` y el mismo `vitest.config.ts` (`resolve.alias`)
ya emitidos en el bundle de Fase 1 — ningún loader nuevo entra en juego.

#### An emitted config must be complete for the stack this blueprint chose

`web-push` es un paquete CommonJS estándar sin condiciones de exportación no triviales, sin binario
nativo, sin paso de codegen — se importa igual en el runtime de Next.js, en vitest, y en cualquier
script standalone del proyecto sin ninguna línea de configuración adicional. No hay nada que reconciliar
aquí.

#### Every tool that reads env vars must be given a way to load them

`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` se leen únicamente dentro de `src/lib/push/send.ts`, un módulo
de aplicación que corre siempre dentro del proceso Next.js/worker ya existente — el mismo mecanismo de
carga de `.env` que Fase 1 ya estableció en `src/lib/env.ts` cubre estas 3 variables sin cambios. Ningún
script standalone nuevo de esta fase lee estas variables fuera de ese proceso.

#### Services a gate depends on must be provisioned by the blueprint

NOT APPLICABLE — ningún `Verify` de §9 necesita un servicio que Postgres/Redis de Fase 1 no provean ya.

#### The bundle sits inside the project, so every emitted config must exclude it

`biome.json` (raíz del proyecto, heredado de Fase 1) ya excluye `blueprints/` con el patrón
`"!blueprints"` en `files.includes` (confirmado leyendo `blueprints/nucleo-fase-1/workspace/biome.json`
línea 6) — cubre `blueprints/nucleo-notificaciones-dashboard/` sin ninguna edición nueva. `tsconfig.json`
y `vitest.config.ts` heredados ya excluyen `**/blueprints/**` (confirmado en
`blueprints/nucleo-fase-1/workspace/vitest.config.ts` línea 11). Ningún archivo emitido en este bundle
requiere una exclusión adicional.

| File | Path in the project | Which `Verify` commands need it | Resolution/env handling it carries | Bundle-path exclusion |
|---|---|---|---|---|
| `biome.json` | `./biome.json` (heredado, no editado) | `pnpm lint` en todo `Verify` de §9 que lo invoca indirectamente vía el gate de §20.1 | none needed: `web-push` resuelve planamente y este tool no lee env vars | ya excluye `blueprints/` desde Fase 1 — línea 6, sin cambios |
| `vitest.config.ts` | `./vitest.config.ts` (heredado, no editado) | todo `pnpm test` de §9, desde el paso 3 en adelante (antes, el boot no requiere las VAPID_*) | `setupFiles: tests/setup/env.ts` — **editado en el paso 1 de esta fase** (no en este archivo de config, que permanece intacto) agregando `process.env.VAPID_PUBLIC_KEY ??= "..."` y `process.env.VAPID_PRIVATE_KEY ??= "..."`, mismo patrón que las 5 variables heredadas de Fase 1, para que `src/lib/env.ts` no falle el boot en la suite unitaria una vez que el paso 3 las marca requeridas | ya excluye `**/blueprints/**` — línea 11, sin cambios |
| `playwright.config.ts` | `./playwright.config.ts` (heredado de Fase 1, no editado) | `pnpm test:e2e` de los pasos 4, 5, 13, 14 y del gate de §20.1 | ninguno nuevo — esta fase no agrega proyectos, `baseURL` ni fixtures a este archivo; los specs nuevos (`notifications-opt-in.spec.ts`, `dashboard.spec.ts`) corren bajo la configuración ya existente | ya excluye `**/blueprints/**` (mismo mecanismo que `vitest.config.ts`, heredado de Fase 1) — sin cambios |
| `docker-compose.yml` | `./docker-compose.yml` (heredado de Fase 1, no editado) | `pnpm db:migrate`, `psql` y `pnpm test` del paso 1, y cualquier `Verify` de §9 que dependa de Postgres/Redis reales | ninguno nuevo — `push_subscription` vive en el mismo Postgres ya provisionado por este archivo; esta fase no agrega ningún servicio nuevo al compose | n/a — no es un archivo que un linter/type-checker/test-runner descubra por convención de directorio, no requiere línea de exclusión |

#### Resolution convention matrix

NOT APPLICABLE — this blueprint states no import or link convention beyond the one already
established and reconciled by `blueprints/nucleo-fase-1/blueprint.md` §19.6, which this blueprint does
not alter.

#### Cross-artifact value reconciliation

| Shared value | Single source — the file that decides it | Literal value | Every other place it appears | Compared |
|---|---|---|---|---|
| Nombre de la tabla nueva | §4 Schema (este blueprint) | `push_subscription` | `src/server/push/subscriptions.ts`, §9 pasos 1/2/6-11, migración generada por `pnpm db:generate`, `workspace/.claude/rules/push-notifications.md` | yes |
| Ruta del endpoint de suscripción | §5 API Design (este blueprint) | `/api/v1/push/subscribe` | `src/app/api/v1/push/subscribe/route.ts`, `src/components/push/push-opt-in.tsx` (paso 5), `tests/push/subscribe.test.ts` | yes |
| Ruta del Service Worker | §2 Tech Stack (este blueprint) | `/sw.js` (servido desde `public/sw.js`) | `src/components/push/sw-register.tsx` (paso 4), `next.config.ts` headers (paso 4), `tests/e2e/notifications-opt-in.spec.ts` | yes |
| Destino post-login/signup | §9 paso 13 (este blueprint) | `/app` | `src/proxy.ts` (edit), `src/lib/auth.ts` (edit), `tests/integration/auth.test.ts` (actualizado en el mismo paso), `tests/e2e/dashboard.spec.ts` | yes |
| Nombre del paquete de push | §11 Dependencies | `web-push@3.6.7` | `package.json` (§9 paso 1, `pnpm add web-push@3.6.7`), `src/lib/push/send.ts` (import) | yes |

#### Byte-exact artifact reconciliation

NOT APPLICABLE — this blueprint authors no byte-exact expected output. Ningún `Verify` de §9 hace
`diff` contra un fixture literal — las aserciones son sobre conteos de filas, códigos de estado HTTP, y
presencia/ausencia de llamadas mockeadas, no sobre bytes exactos de un archivo generado.

---

## 20. Acceptance Gate, Risks & Decision Log

### 20.1 Global acceptance gate

```bash
pnpm install --frozen-lockfile
pnpm typecheck                       # expect: exit 0, zero errors
pnpm lint                            # expect: exit 0, zero errors and zero warnings
pnpm test                            # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e                        # expect: exit 0, 0 failed
pnpm build                           # expect: exit 0
pnpm dev & sleep 3
test "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/app)" = 302   # expect: exit 0 — redirige a login sin sesión, prueba que /app es una ruta real servida por el build
kill %1 2>/dev/null || true
pnpm test:e2e tests/e2e/a11y.spec.ts # expect: 0 violaciones, incluye /app
```

Plus these manual gates, each checked once before launch:

- [ ] Todos los checkpoints de §9 (`step-49` a `step-63`) existen en git (`git tag -l 'step-*' | wc -l`
      reporta al menos `63`), además de los 48 heredados de Fase 1-3.
- [ ] Cada archivo de la tabla *Files that must be committed* (§10) está presente en un checkout
      limpio (`git ls-files --error-unmatch <path>` exit 0 para cada uno, un path por invocación).
- [ ] Los 6 tests originales de Fase 1-3 identificados en los pasos de hooks y de dashboard (mensaje
      entrante, aprobación de copiloto, webhooks de canal, aprobación de contenido, reintentos/dead-letter
      de automatizaciones, auth) siguen en verde — no solo los tests nuevos de esta fase.
- [ ] §10's Bootstrap block se re-ejecutó una vez sobre un árbol ya bootstrapeado, salió con exit 0, y
      no revirtió `package.json` ni ningún archivo de §19.6.
- [ ] Cada fila de la tabla *Cross-artifact value reconciliation* (§19.6) lee `Compared: yes`.
- [ ] Cada variable de entorno de §10 está definida en producción y ausente del repo.
- [ ] Los 2 flujos críticos E2E de §13 pasan contra la URL de producción.
- [ ] Pase de teclado y un pase de lector de pantalla sobre `/app` y el flujo de opt-in (§15).
- [ ] Una notificación push real fue recibida en al menos un navegador físico (Chrome de escritorio o
      Android) antes de anunciar la feature — el gap documentado en §13 *What is deliberately not
      tested*, cerrado manualmente aquí.
- [ ] Un rollback fue ejecutado una vez, a propósito, en un entorno de preview (§12).

**No warnings are ignored.**

### 20.2 Risk register

| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---|---|---|---|
| Una edición a `scripts/worker.ts`, `runs.ts`, `action-runner.ts` o los 4 route handlers de webhook rompe un comportamiento de Fase 1-3 que ningún test cubre explícitamente | M | H | Un test original de Fase 1-3 (no solo el nuevo de esta fase) empieza a fallar tras un paso 6-11/13 | Cada paso de hook re-corre el `Verify` original de la fase que edita, no solo el suyo (§9, ya incorporado en cada paso) — si algo se rompe, se detecta en el mismo paso, no al final |
| El destino post-login (`/app/inbox` → `/app`) rompe un test o una integración externa que asume ese literal (ej. un link de correo transaccional de Fase 1 que apunta directo a `/app/inbox` esperando ser el "home") | M | M | `tests/integration/auth.test.ts` falla tras el paso 13, o un usuario reporta un link roto post-lanzamiento | El paso 13 exige actualizar esa aserción en el mismo paso, nunca dejarla roja; un grep de `"/app/inbox"` en plantillas de correo (fuera de alcance del código, pero mencionado como chequeo manual en el checklist de lanzamiento) |
| La discrepancia de ruta de `src/lib/db/schema.ts` vs `src/db/schema.ts` (§0) hace que el paso 1 edite el archivo equivocado o cree un segundo schema.ts | M | H | `pnpm db:generate` genera una migración que declara tablas ya existentes, o `drizzle.config.ts` apunta a una ruta distinta de la editada | El paso 1 exige `find . -name schema.ts -path "*/db/*"` antes de editar (§0, ya incorporado) — falla ruidosamente si hay 0 o 2 matches, en vez de asumir |
| Un usuario deniega el permiso de notificaciones y no hay forma de re-solicitarlo sin borrar el permiso del navegador manualmente (limitación de la API `Notification`, no de este blueprint) | A | B | Ticket de soporte "no puedo activar notificaciones" | Documentado en el mensaje de error de §6 — se instruye al usuario a revisar la configuración del sitio en su navegador, no se intenta workaroundear la API estándar |
| Las claves VAPID de producción se pierden o rotan accidentalmente, invalidando todas las suscripciones existentes de golpe | B | M | Caída abrupta en la tasa de entrega push (§16 métrica) sin ningún cambio de código correlacionado | Las claves se generan una sola vez (§12) y se tratan como secreto de infraestructura con el mismo respaldo que `BETTER_AUTH_SECRET` ya recibe desde Fase 1 |
| Volumen de push por usuario crece más rápido de lo esperado (ej. una organización muy activa genera decenas de mensajes/hora) y los usuarios desactivan notificaciones por ruido | M | M | Tasa de desuscripción (`DELETE /api/v1/push/unsubscribe`) sube sostenidamente | Explícitamente diferido a Non-Goals (§1) — preferencias granulares y digest se construyen cuando este patrón aparezca en datos reales, no antes |

### 20.3 Decision log

| # | Decision | Rejected alternative | Why | Would reverse if |
|---|---|---|---|---|
| 1 | Usar `src/lib/db/schema.ts` como ruta real del schema, confirmada por `grep`/`find` en el paso 1, no `src/db/schema.ts` (que el CLAUDE.md acumulado de Fase 3 nombra) | Confiar ciegamente en el CLAUDE.md más reciente (Fase 3) | Fase 1 y Fase 2 —dos fuentes independientes y anteriores— coinciden en `src/lib/db/schema.ts`; Fase 3 es la única que difiere y ningún paso de Fase 3 documenta un `git mv`, lo cual sugiere un error de transcripción en su propio CLAUDE.md, no un cambio de ruta real | El `find` del paso 1 devuelve `src/db/schema.ts` en el árbol real — en ese caso esta decisión se revierte automáticamente porque el paso usa lo que el `find` confirme, no el literal de esta tabla |
| 2 | `web-push` propio en vez de un SaaS de push | OneSignal / Firebase Cloud Messaging | Cero cuentas nuevas, cero vendor lock-in, el protocolo VAPID es abierto y Núcleo ya opera su propia infraestructura | Si Núcleo necesitara push a apps nativas (iOS/Android) sin PWA — ahí un SaaS multiplataforma sí aportaría valor que Web Push nativo no cubre |
| 3 | `channel_connection.status = 'disconnected'` se detecta en la rama 404 ya existente del webhook, no con un poller nuevo | Un cron/poller que llame periódicamente a la API de cada proveedor para verificar el token | La rama 404 ya existe y ya se ejecuta con cada tráfico real entrante — agregar detección ahí es una línea; un poller es infraestructura nueva (cola, cron, rate limiting contra 4 APIs externas) para una señal que en la práctica llega sola con el tráfico | Si un cliente reporta que un canal quedó desconectado silenciosamente sin que llegara ningún webhook en días — entonces la detección pasiva no es suficiente y se necesita un poller activo (ya listado como trigger en §1 Non-Goals) |
| 4 | Automatización fallida notifica solo al `created_by`, no a todos los `owner` de la org | Notificar a todos los `owner` | Un `member` puede ser dueño de sus propias automatizaciones sin ser `owner` — silenciar la señal a quien la creó sería peor que notificar a alguien sin rol admin; es además la única relación de "dueño" que ya existe en el schema sin inventar un campo nuevo | Si en producción se observa que los `owner` necesitan visibilidad de fallas de automatizaciones creadas por otros — ahí se agregaría un segundo destinatario, no se reemplazaría al creador |
| 5 | Solo `automation_run.status = 'failed'` dispara push, `'partial'` no | Notificar también en `'partial'` | `'partial'` significa que al menos una acción ya tuvo éxito — es una señal de degradación, no de fallo total; notificar en ambos casos generaría ruido para el caso más común (una automatización con 3 acciones donde la 3ª falla tras 2 éxitos) | Si el dato real muestra que las ejecuciones `'partial'` casi siempre requieren intervención humana igual que `'failed'` |
| 6 | Dashboard en `/app` es un Server Component puro, sin polling/refetch de cliente | TanStack Query con refetch periódico, igual que la bandeja de Fase 1 | La bandeja necesita tiempo real porque un mensaje puede llegar mientras la pantalla está abierta; el dashboard es una foto de "qué necesita atención al entrar" — quedarse stale mientras el usuario ya navegó a otra pantalla no tiene el mismo costo | Si el dashboard se vuelve una pantalla que los usuarios dejan abierta por horas (contradice su propósito actual de punto de entrada) |

### 20.4 What to build next

1. Preferencias granulares por tipo de evento — trigger: ≥2 clientes piden silenciar un tipo específico (§1).
2. Digest de notificaciones agrupadas — trigger: volumen de push por usuario/día supera ~30 en datos reales (§1).
3. Notificaciones por correo como fallback — trigger: cuando Fase 6 (Analíticas) defina el motor de digest periódico (§1).
4. Detección activa de desconexión (poller) — trigger: un cliente reporta un canal desconectado silenciosamente sin tráfico entrante que lo revele (§1, §20.3 Decisión #3).
5. Dashboard completo con métricas/gráficas — trigger: cuando Fase 6 esté planificada (§1).

---

*End of blueprint. Build order is §9. Stop when §20.1 is green.*
