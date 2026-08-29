# Núcleo — Fase 1: Centro de Comunicación — Blueprint

> Generado por The Architect el 2026-08-14
> Shape: saas-webapp · `knowledge/shapes/saas-webapp.md`
> Runtime track: ts-node · `knowledge/runtime-tracks/ts-node.md`
> Emission mode: bundle (18 pasos ≥ 12 → bundle)
> Blueprint version: 1
> Versiones verificadas: 2026-08-14 — ver §11 para procedencia por paquete

---

## 1. Project Overview & Non-Goals

### Vision

Núcleo es una plataforma SaaS multi-tenant que unifica comunicación multicanal (WhatsApp, Instagram,
Facebook, TikTok), CRM, contenido, automatizaciones y agentes de IA en un solo sistema para empresas.
Esta Fase 1 construye el **Centro de Comunicación**: una bandeja de entrada unificada que recibe
mensajes de los cuatro canales soportados, los vincula a un contacto con contexto básico de cliente,
y ofrece un copiloto de IA contextual que responde preguntas sobre la conversación abierta y ejecuta un
conjunto acotado de acciones de bajo riesgo (etiquetar, asignar) con aprobación humana. No construye
agentes autónomos completos, CRM con pipeline de oportunidades, contenido ni automatizaciones — eso es
roadmap de fases 2-6, ya arquitectado y explícitamente fuera de alcance aquí (ver Non-Goals).

### Users

| Persona | What they come to do | Frequency |
|---|---|---|
| Agente de atención | Responder conversaciones entrantes de clientes desde la bandeja unificada | Diaria |
| Dueño/administrador de la organización | Invitar miembros, gestionar roles, revisar auditoría, conectar canales | Semanal |
| Miembro con rol limitado | Ver y responder solo las conversaciones que le fueron asignadas | Diaria |

### Goals — v1 scope

1. La plataforma recibe mensajes entrantes de WhatsApp, Instagram, Facebook y TikTok en una bandeja
   única, con aislamiento estricto por organización.
2. Cada conversación se vincula automáticamente a un contacto con contexto básico (nombre, canal,
   etiquetas, historial de mensajes).
3. Un copiloto de IA contextual, embebido en la bandeja, responde preguntas sobre la conversación
   abierta y ejecuta un conjunto acotado de acciones (etiquetar, asignar) con aprobación humana la
   primera vez que se usa cada tipo de acción.
4. El sistema deja sentado el núcleo de datos inmutable (organización, membership, roles, permisos,
   audit log) que todas las fases futuras (2-6) construirán encima sin modificarlo.

### Non-Goals — explicitly out of scope for v1

| Not building | Why not now | Revisit when |
|---|---|---|
| Fases 2-6 completas (contenido, automatizaciones, agentes IA autónomos multi-agente, CRM con pipeline de oportunidades, analítica) | Ya arquitectadas mas no priorizadas; el Centro de Comunicación es el valor mínimo que valida el producto | Al cerrar Fase 1 con adopción real de al menos 5 organizaciones piloto |
| Checkout / pagos reales | No hay plan de precios validado todavía; el producto aún no sale a la web pública | Al definir el modelo de precios y cerrar Fase 2 (salida pública) |
| SSO / SCIM | Deal-triggered — ningún cliente enterprise lo ha pedido todavía; agregar identity seam ahora es suficiente | El primer prospecto enterprise lo exija contractualmente |
| Dominio público / salida a la web | El producto corre en VPS privado hasta cerrar Fase 2 | Al completar Fase 2 y decidir el dominio de producción |
| Canales de correo y Telegram con integración real | Solo se preparan como valores de enum; conectar cada canal implica su propia API, credenciales y webhook — trabajo de una fase futura | Cuando exista demanda validada de clientes que usan esos canales como primario |
| Agentes IA autónomos multi-agente completos (agent-loop.md completo) | El copiloto de Fase 1 es una versión acotada de un solo agente con tool calls de bajo riesgo; el motor multi-agente con planificación compleja es Fase 4 | Al completar Fase 1-3 y validar el copiloto acotado en producción |
| CRM con pipeline de oportunidades y campos personalizados | `contact` en Fase 1 es solo el contexto mínimo (nombre, canal, etiquetas); pipeline es Fase 5 | Al completar Fase 1-4 |
| Cualquier canal más allá de WhatsApp/Instagram/Facebook/TikTok | Cobertura del MVP; ampliar canales antes de validar los cuatro principales dispersa esfuerzo | Cuando los 4 canales estén estables en producción y haya demanda de un canal adicional |

**The builder must not implement anything in this table**, even if it seems like a small addition while
working on an adjacent step. Si un paso parece requerir algo de esta tabla, es un defecto del blueprint
— detente y repórtalo en vez de expandir el alcance.

### Success metrics

| Metric | Target | How measured |
|---|---|---|
| Aislamiento de tenant sin fugas | 0 incidentes de datos cruzados entre orgs | Test E2E de aislamiento (step 5) corriendo en cada deploy, más auditoría manual mensual sobre `audit_event` |
| Latencia de entrega de mensaje entrante a bandeja visible | < 5s desde webhook hasta actualización realtime en el navegador | Medición manual con `stripe`-style trigger equivalente por canal en staging, antes de cada release |
| Adopción del copiloto | ≥ 30% de conversaciones cerradas usan al menos una acción del copiloto | Consulta sobre `runs`/`tool_calls` agrupada por `conversation_id`, revisada semanalmente tras el piloto |

---

## 2. Tech Stack

**Runtime track: ts-node.** Esta tabla nombra *elecciones*, no versiones. Cada versión fijada vive
únicamente en §11.

Los pines vienen del reporte de `stack-researcher` (verificado en vivo el 2026-08-14, provisto en el
prompt de esta sesión), que es la autoridad. `knowledge/runtime-tracks/ts-node.md` es el fallback para
cualquier paquete que el reporte no resolvió.

| Layer | Choice | Why this, over what |
|---|---|---|
| Language / runtime | TypeScript 6.0.3 sobre Node.js 24.19.0 | Un solo lenguaje end-to-end; TS 7 rechazado — sin API de compilador estable aún, Next.js lo rechaza sin flag experimental |
| Framework | Next.js 16.3.1 (App Router, `output: "standalone"`) | Self-host en VPS propio sin depender de Vercel; Turbopack por defecto |
| Styling | Tailwind CSS 4.3.3 (config CSS-first) | Cero JS por defecto en estilos, config en `@theme`, sin `tailwind.config.js` |
| Component layer | shadcn CLI 4.18.0 (`--base radix`) | Componentes copiados al repo, editables, base Radix explícita en vez del default Base UI del CLI |
| Database | Postgres 17 self-hosted en Docker | Soberanía de datos — el producto exige VPS propio, no managed Postgres |
| ORM / data access | drizzle-orm 0.45.2 exacto + drizzle-kit 0.31.10 exacto | Schema como fuente de verdad, migraciones diffeadas, thin runtime — sin caret porque Drizzle rompe en minors 0.x |
| Auth | better-auth 1.6.28 self-hosted | Soberanía de identidad — no Clerk/Auth0; peers compatibles con drizzle-orm 0.45.2, pg ^8, next ^16 |
| Background work | BullMQ 6.1.1 + ioredis 5.11.1 + Redis 8.10.0 | Reintentos, dead-letter, idempotencia para procesar webhooks de canal con volumen impredecible |
| Realtime | Socket.IO 4.8.3 + @socket.io/redis-adapter 8.3.0 | Server push a la bandeja; adaptador Redis desde el día uno evita el retrofit cuando el proyecto escale de decenas a miles de orgs (ver §2 Compatibility check) |
| IA / LLM | @anthropic-ai/sdk (id de modelo verificado vía skill `claude-api` en esta sesión — ver §17) | Copiloto contextual con streaming y tool-use |
| Payments | NOT APPLICABLE — pagos fuera de alcance de Fase 1 (§1 Non-Goals) | — |
| File storage | NOT APPLICABLE — Fase 1 no maneja adjuntos de archivo más allá de URLs de media entrantes almacenadas como texto en `message.media_urls` | — |
| Email / notificaciones | Ninguna plataforma gestionada por defecto; invitaciones se envían con una función de envío de correo mínima sobre SMTP configurable (variable de entorno) — self-hosted acorde a la decisión general del stack | — |
| Hosting | VPS propio + Docker Compose + Caddy (reverse proxy, TLS automático, sin dominio público asignado aún) | Decisión explícita del cliente — soberanía y control de costos, no Vercel |
| Package manager | pnpm 11.21.0 | Strict node_modules, workspaces si se necesitan más adelante |

### Compatibility check

Checked against `knowledge/stack-compatibility.md`. Una fila aplica y este blueprint la resuelve
explícitamente:

- **"In-memory realtime state + horizontally scaled host"** — aplica en potencia (Socket.IO en
  múltiples instancias del contenedor Node pierde rooms/presence). Resuelto desde el día uno con
  `@socket.io/redis-adapter` (§12, §19.6) — no es un retrofit futuro, va en el stack base.
- **"CSS-first at-rules el linter no puede parsear"** — aplica: Biome + Tailwind v4. Resuelto en el
  paso 1 con `css.parser.tailwindDirectives: true` en `biome.json` (ver `workspace/biome.json` en
  §19.6), antes del primer `lint`.
- **"Per-request serverless connections + un-pooled Postgres"** — no aplica: Next.js corre como
  proceso Node de larga duración en el VPS, no serverless. Conexión directa vía `pg`, no se requiere
  pooler.

Resto de las filas no aplican a esta combinación.

---

## 3. Directory Structure

```
nucleo/
  src/
    app/
      (marketing)/                 # landing vacío — layout de marketing (step 2)
        layout.tsx
        page.tsx
      (auth)/                      # login/signup — layout de auth (step 4)
        layout.tsx
        login/page.tsx
        signup/page.tsx
      (app)/                       # app autenticada — sidebar/topbar (step 2, poblado steps 7/11/14/15)
        layout.tsx
        inbox/page.tsx             # bandeja unificada (step 11)
        settings/
          members/page.tsx         # gestión de miembros e invitaciones (step 7)
          profile/page.tsx         # perfil + eliminación de cuenta (step 15)
      api/
        auth/[...all]/route.ts     # better-auth catch-all (step 4)
        webhooks/
          whatsapp/route.ts        # webhook entrante WhatsApp (step 8)
          instagram/route.ts       # webhook entrante Instagram (step 8)
          facebook/route.ts        # webhook entrante Facebook (step 8)
          tiktok/route.ts          # webhook entrante TikTok (step 8)
        conversations/route.ts     # lista + crear (step 10)
        conversations/[id]/route.ts# detalle + mutaciones (step 10)
        members/route.ts           # gestión de miembros (step 7)
        invitations/route.ts       # invitaciones (step 7)
        copilot/route.ts           # endpoint del copiloto, streaming (step 14)
    components/
      ui/                          # primitivos shadcn — generados, editables (step 2)
      inbox/
        conversation-list.tsx      # (step 11)
        conversation-view.tsx      # (step 11)
        filters-bar.tsx            # (step 11)
      copilot/
        copilot-panel.tsx          # (step 14)
    lib/
      env.ts                       # zod-parsed process.env, validación por paso (step 1, se amplía en cada paso)
      db/
        schema.ts                  # Drizzle schema — fuente única de verdad de tablas (step 3)
        index.ts                   # cliente db exportado (step 3)
      auth.ts                      # better-auth config, getSession() único (step 4)
      permissions.ts               # catálogo de permisos + requirePermission (step 5)
      audit.ts                     # helper único de audit log (step 6)
      logger.ts                    # pino logger estructurado (step 16)
      realtime/
        server.ts                  # servidor Socket.IO + adaptador Redis (step 12)
        client.ts                  # cliente Socket.IO del navegador (step 12)
      queue/
        index.ts                   # colas BullMQ exportadas (step 9)
        connection.ts              # conexión ioredis compartida (step 9)
      ai/
        gateway.ts                 # wrapper único del SDK de Anthropic, streaming (step 13)
    server/
      tenancy.ts                   # requirePermission — único punto de verificación de org (step 5)
      channels/
        whatsapp.ts                # verificación de firma + normalización (step 8)
        instagram.ts               # (step 8)
        facebook.ts                # (step 8)
        tiktok.ts                  # (step 8)
      conversations.ts             # lógica de negocio de conversación/mensaje (step 10)
      contacts.ts                  # crear/actualizar contact desde mensaje entrante (step 10)
      members.ts                   # invitar/aceptar/remover miembro (step 7)
      copilot/
        runs.ts                    # runs/steps/tool_calls/approvals (step 14)
        tools.ts                   # catálogo de tool calls de bajo riesgo (step 14)
    proxy.ts                       # Next.js 16 proxy (NO middleware.ts) — protección de rutas (step 4)
  drizzle/                         # migraciones SQL generadas — comprometidas, nunca editadas a mano (step 3+)
  scripts/
    seed.ts                        # admin + org demo + catálogo de permisos (step 3, ejecutado en Bootstrap)
    worker.ts                      # proceso worker de BullMQ (step 9)
  tests/
    unit/                          # lógica pura (permissions, audit, gateway)
    integration/                   # rutas API contra Postgres real
    e2e/                           # Playwright — aislamiento de tenant, auth, bandeja en vivo
  docker-compose.yml                # postgres:17-alpine + redis:8.10.0-alpine3.23 (§19.6)
  docker-compose.prod.yml           # app + worker + postgres + redis + caddy (step 17)
  Dockerfile                        # multi-stage build → runtime Node 24 slim (step 17)
  Caddyfile                         # reverse proxy, TLS automático, sin dominio aún (step 17)
  biome.json                        # lint+format, tailwindDirectives (§19.6)
  drizzle.config.ts                 # config de drizzle-kit (§19.6)
  vitest.config.ts                  # config de test runner (§19.6)
  playwright.config.ts              # config E2E (§19.6)
  tsconfig.json                     # compilerOptions, alias @/ (§19.6)
  .env.example                      # comprometido, valores en blanco (§10)
  .gitignore                        # excepciones para .env.example, workspace configs (§10)
  package.json                      # generado por el scaffold, editado en cada paso que agrega dependencia
```

**Boundary rules**

- Nada bajo `src/app/**` importa directamente de `src/lib/db/`. Las rutas llaman a `src/server/**`, que
  es el único que toca `src/lib/db/`.
- `src/lib/db/` es el único lugar que abre una conexión a la base de datos.
- `src/server/tenancy.ts` (`requirePermission`) es el único punto por el que pasa toda mutación —
  ninguna ruta de API escribe sin llamarlo primero (step 5).
- `src/lib/audit.ts` es el único punto que escribe en `audit_event` — nunca un `INSERT` directo desde
  otro módulo (step 6).
- Componentes en `src/components/ui/` no importan de `src/server/**` ni de `src/lib/db/**`.

**Alias y convención de módulos**: `@/` → `src/`. Especificadores relativos `.ts` (no `.js`), con
`allowImportingTsExtensions` y `rewriteRelativeImportExtensions` — ver el resultado en §19.6 *Resolution
convention matrix*.

Todo path de salida dibujado aquí coincide con el valor real emitido por el config que lo produce —
ver §19.6 *Cross-artifact value reconciliation*: `output: "standalone"` produce `.next/standalone/`, y
el `Dockerfile`/`docker-compose.yml` referencian esa misma ruta.

Cada archivo de este árbol es autorado por exactamente un step de §9 (por nombre en su lista **Do**) o
emitido como archivo real bajo `workspace/` (§19.6) y copiado por el builder antes del step 1. Ningún
archivo listado aquí existe "por el camino".

---

## 4. Data Model

### Entities

**`user`** — espejo del usuario de better-auth; nunca fuente de verdad de credenciales.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| email | text | unique, not null | |
| name | text | not null | |
| avatar_url | text | nullable | |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |

**`organization`** — tenant boundary de todo el sistema.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| name | text | not null | |
| slug | text | unique, not null | inmutable tras el primer uso — validado en la capa de servicio, no reescribible |
| plan | text | not null, default 'trial' | stub — sin lógica de billing en Fase 1 |
| data_region | text | not null, default 'latam' | preparado para multi-región futura |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |

**`membership`** — muchos-a-muchos user↔organization.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| user_id | uuid | FK user.id, not null, index | |
| role_id | uuid | FK role.id, not null | |
| invited_by | uuid | FK user.id, nullable | null para el owner que crea la org |
| joined_at | timestamptz | not null, default now() | |

Índice único compuesto `(org_id, user_id)` — un usuario no puede tener dos memberships en la misma org.

**`role`** — catálogo de roles, sistema o por-org.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, nullable | null = rol de sistema (owner, member) |
| name | text | not null | |
| description | text | nullable | |

**`permission`** — catálogo fijo, sembrado en BD desde código.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| key | text | PK | ej. `billing.manage`, `member.invite`, `conversation.assign` |
| description | text | not null | |

**`role_permission`** — join role↔permission.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| role_id | uuid | FK role.id, not null | |
| permission_key | text | FK permission.key, not null | |

PK compuesta `(role_id, permission_key)`.

**`invitation`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| email | text | not null | |
| role_id | uuid | FK role.id, not null | |
| token | text | unique, not null | |
| expires_at | timestamptz | not null | |
| invited_by | uuid | FK user.id, not null | |

**`audit_event`** — append-only, restringido a nivel de grant de BD (no update/delete).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| actor_type | text | not null | 'user' \| 'system' \| 'copilot' |
| actor_id | text | nullable | uuid de user si aplica |
| actor_ip | text | nullable | |
| action | text | not null | formato `object.verb` estable, ej. `conversation.assigned` |
| target_type | text | not null | |
| target_id | text | not null | |
| metadata | jsonb | not null, default '{}' | |
| request_id | text | nullable | |
| occurred_at | timestamptz | not null, default now() | |

**`channel_connection`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| channel | text | not null | enum-como-texto: whatsapp \| instagram \| facebook \| tiktok \| email \| telegram |
| external_account_id | text | not null | |
| credentials_encrypted | text | not null | cifrado a nivel de aplicación antes de persistir |
| status | text | not null, default 'pending' | |
| connected_at | timestamptz | nullable | |
| last_synced_at | timestamptz | nullable | |
| deleted_at | timestamptz | nullable | soft-delete |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |

**`contact`** — CRM-lite.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| name | text | nullable | |
| phone | text | nullable | |
| email | text | nullable | |
| avatar_url | text | nullable | |
| external_ids | jsonb | not null, default '{}' | mapa canal→id externo |
| deleted_at | timestamptz | nullable | soft-delete |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |

**`tag`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| name | text | not null | |
| color | text | not null | |

**`contact_tag`** — join many-to-many.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| contact_id | uuid | FK contact.id, not null | |
| tag_id | uuid | FK tag.id, not null | |

PK compuesta `(contact_id, tag_id)`.

**`conversation`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| channel_connection_id | uuid | FK channel_connection.id, not null | |
| contact_id | uuid | FK contact.id, not null, index | |
| status | text | not null, default 'open' | 'open' \| 'pending' \| 'closed' |
| priority | text | not null, default 'normal' | |
| assigned_to | uuid | FK user.id, nullable | |
| last_message_at | timestamptz | nullable | |
| deleted_at | timestamptz | nullable | soft-delete |
| created_at | timestamptz | not null, default now() | |

**`message`** — append-only/event-like, sin soft-delete.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| conversation_id | uuid | FK conversation.id, not null, index | |
| direction | text | not null | 'inbound' \| 'outbound' |
| sender_type | text | not null | 'contact' \| 'agent' \| 'copilot' |
| body | text | nullable | |
| media_urls | jsonb | not null, default '[]' | |
| external_message_id | text | nullable | dedupe de reintentos del proveedor |
| status | text | not null, default 'delivered' | |
| created_at | timestamptz | not null, default now() | |

**`jobs`** — de deployment.md, procesamiento de webhooks con reintentos.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, nullable, index | |
| type | text | not null | |
| payload | jsonb | not null | |
| status | text | not null, default 'queued' | |
| attempts | integer | not null, default 0 | |
| created_at | timestamptz | not null, default now() | |

**`job_dead_letters`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| job_id | uuid | FK jobs.id, not null | |
| error | text | not null | |
| failed_at | timestamptz | not null, default now() | |

**`idempotency_keys`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| key | text | PK | ej. `whatsapp:<event_id>` |
| org_id | uuid | FK organization.id, nullable | |
| created_at | timestamptz | not null, default now() | |

**`llm_calls`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| run_id | uuid | FK runs.id, nullable | |
| model | text | not null | nunca hardcodeado — leído de config |
| input_tokens | integer | nullable | |
| output_tokens | integer | nullable | |
| created_at | timestamptz | not null, default now() | |

**`prompts`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| name | text | not null, unique | |
| version | integer | not null | |
| content | text | not null | |
| created_at | timestamptz | not null, default now() | |

**`runs`** — una invocación del copiloto.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| org_id | uuid | FK organization.id, not null, index | |
| conversation_id | uuid | FK conversation.id, not null | |
| initiated_by | uuid | FK user.id, not null | |
| status | text | not null, default 'running' | |
| created_at | timestamptz | not null, default now() | |

**`steps`** — pasos dentro de un run.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| run_id | uuid | FK runs.id, not null, index | |
| index | integer | not null | |
| kind | text | not null | 'assistant_message' \| 'tool_call' |
| content | jsonb | not null | |
| created_at | timestamptz | not null, default now() | |

**`tool_calls`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| step_id | uuid | FK steps.id, not null | |
| tool_name | text | not null | |
| input | jsonb | not null | |
| output | jsonb | nullable | |
| requires_approval | boolean | not null, default false | |
| idempotency_key | text | not null, unique | evita doble ejecución en reintentos |
| status | text | not null, default 'pending' | |
| created_at | timestamptz | not null, default now() | |

**`approvals`**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tool_call_id | uuid | FK tool_calls.id, not null, unique | |
| decided_by | uuid | FK user.id, nullable | |
| decision | text | nullable | 'approved' \| 'denied' |
| decided_at | timestamptz | nullable | |
| created_at | timestamptz | not null, default now() | |

Todas las tablas tenant-owned llevan `org_id` con índice y not-null. Todas llevan `id uuid default
gen_random_uuid()`, `created_at`; las que se actualizan también `updated_at`. Soft-delete (`deleted_at`)
solo en `contact`, `conversation`, `channel_connection` — no en `audit_event`, `message`, `jobs`
(append-only/event-like).

### Relationships

- `organization` —(1:N)→ `membership` —(N:1)→ `user`. Cascade: borrar `organization` borra sus
  `membership` (ON DELETE CASCADE); nunca se borra `user` en cascada.
- `role` —(1:N)→ `role_permission` —(N:1)→ `permission`. Cascade: borrar `role` borra sus
  `role_permission`.
- `organization` —(1:N)→ `channel_connection`, `contact`, `tag`, `conversation`, `invitation`,
  `audit_event`. Cascade: ON DELETE RESTRICT en todas — una organización no se borra si tiene
  conversaciones o audit log; Fase 1 no implementa borrado de organización.
- `conversation` —(1:N)→ `message`. Cascade: ON DELETE RESTRICT — un `message` histórico nunca se
  pierde por accidente.
- `contact` —(N:M)→ `tag` vía `contact_tag`. Cascade: ON DELETE CASCADE en el join.
- `runs` —(1:N)→ `steps` —(1:1)→ `tool_calls` —(1:1)→ `approvals`. Cascade: ON DELETE CASCADE en toda
  la cadena — borrar un run borra su rastro completo (solo usado en limpieza de datos de prueba).

### Indexes

| Table | Index | Why |
|---|---|---|
| membership | (org_id, user_id) unique | Evita duplicados y sirve el chequeo de pertenencia en cada request |
| conversation | (org_id, status, assigned_to) | Filtros de la bandeja unificada (step 11) |
| conversation | (org_id, last_message_at desc) | Orden por defecto de la bandeja |
| message | (conversation_id, created_at) | Carga de historial de una conversación |
| message | (external_message_id) | Dedupe de reintentos del proveedor |
| audit_event | (org_id, occurred_at desc) | Consulta de auditoría por organización |
| contact | (org_id, phone), (org_id, email) | Vinculación de contacto desde mensaje entrante |
| idempotency_keys | PK (key) | Ledger de idempotencia de webhooks |
| tool_calls | (idempotency_key) unique | Evita doble ejecución de una acción del copiloto |

### Schema

```typescript
// src/lib/db/schema.ts (fragmento representativo — el step 3 lo escribe completo)
import { pgTable, uuid, text, timestamptz, jsonb, integer, boolean, unique, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("trial"),
  dataRegion: text("data_region").notNull().default("latam"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
});

export const membership = pgTable("membership", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organization.id),
  userId: uuid("user_id").notNull().references(() => user.id),
  roleId: uuid("role_id").notNull().references(() => role.id),
  invitedBy: uuid("invited_by").references(() => user.id),
  joinedAt: timestamptz("joined_at").notNull().default(sql`now()`),
}, (t) => ({
  orgUser: unique().on(t.orgId, t.userId),
  orgIdx: index().on(t.orgId),
}));

// ... el resto de las 23 tablas siguen el mismo patrón: id, org_id con índice
// donde aplica, created_at/updated_at, y las FKs y constraints listadas arriba.
// El step 3 escribe el archivo completo con las 23 tablas y sus relaciones vía
// drizzle `references()`.
```

### Migrations

Herramienta: `drizzle-kit`. Convención de nombre: la que `drizzle-kit generate` produce por defecto
(secuencial + codename aleatorio) — **nunca se nombra a mano**, ver la nota de "Generated artifacts" en
las reglas globales. Ejecución: `pnpm db:migrate` aplica todas las migraciones pendientes en orden. En
producción, las migraciones corren como paso explícito de deploy (§12), nunca en el boot de la
aplicación — instancias concurrentes correrían la migración en carrera.

Regla para producción: expand-then-contract — nunca una migración destructiva (drop column, drop
table, not-null sin default) en el mismo deploy que el código que deja de usar esa columna. Fase 1 no
tiene todavía historial de migraciones previas que contraer.

### Seed data

`scripts/seed.ts` (step 3, ejecutado en Bootstrap) crea: el catálogo de `permission` completo (los 6+
permission keys usados por §8/§14), los roles de sistema `owner` y `member` con su `role_permission`,
y — solo en entorno de desarrollo — una organización demo `nucleo-demo` con un usuario admin
(`admin@nucleo.local` / password desde `SEED_ADMIN_PASSWORD`) y dos conversaciones de ejemplo con
mensajes, para que la bandeja no esté vacía en el primer `pnpm dev`.

---

## 5. API Design

### Conventions

- Base path: `/api/v1` para endpoints de negocio versionados a futuro; los webhooks de canal y el
  catch-all de auth viven en su propio path sin versión (`/api/webhooks/*`, `/api/auth/*`) porque son
  contratos externos fijados por el proveedor, no por este API.
- Response envelope — éxito: `{ "data": <payload> }`. Error: `{ "error": { "code": string, "message":
  string } }`. Una sola forma, sin excepciones.
- Error codes: `validation_error` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404 —
  incluye el caso de cruce de tenant, ver §8), `conflict` (409), `internal_error` (500).
- Validación: `zod` en cada handler de ruta, esquemas en `src/server/**/schemas.ts` colocados junto a
  la lógica que validan.
- Paginación: cursor, parámetros `?cursor=<id>&limit=<n>`, default `limit=20`, máximo `limit=100`.
- Idempotencia: los webhooks de canal aceptan un evento una sola vez vía `idempotency_keys` (§4); los
  endpoints de negocio no requieren idempotency key en Fase 1 (no hay pagos).
- Rate limiting: por IP en `/api/auth/*` (5 intentos/minuto) y por org en `/api/webhooks/*` (100
  eventos/minuto) — backend Redis compartido con BullMQ (step 16).

### Routes

| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/auth/[...all]` | better-auth catch-all (signup, login, logout, reset) | public | 5/min por IP |
| POST | `/api/webhooks/whatsapp` | Webhook entrante WhatsApp | firma de proveedor | 100/min por org |
| POST | `/api/webhooks/instagram` | Webhook entrante Instagram | firma de proveedor | 100/min por org |
| POST | `/api/webhooks/facebook` | Webhook entrante Facebook | firma de proveedor | 100/min por org |
| POST | `/api/webhooks/tiktok` | Webhook entrante TikTok | firma de proveedor | 100/min por org |
| GET | `/api/v1/conversations` | Lista paginada, filtros por canal/estado/prioridad/responsable | user | — |
| GET | `/api/v1/conversations/:id` | Detalle + mensajes | user | — |
| PATCH | `/api/v1/conversations/:id` | Cambiar estado/prioridad/asignado | user, permiso `conversation.assign` para reasignar | — |
| POST | `/api/v1/conversations/:id/messages` | Enviar mensaje saliente | user, permiso `conversation.reply` | — |
| GET | `/api/v1/members` | Lista de miembros de la org | user | — |
| POST | `/api/v1/invitations` | Invitar miembro | user, permiso `member.invite` | — |
| POST | `/api/v1/invitations/:token/accept` | Aceptar invitación | público (token) | — |
| PATCH | `/api/v1/members/:id` | Cambiar rol de un miembro | user, permiso `member.manage` | — |
| DELETE | `/api/v1/members/:id` | Remover miembro | user, permiso `member.manage` | — |
| POST | `/api/v1/copilot` | Turno del copiloto (streaming) | user | 20/min por usuario |
| POST | `/api/v1/copilot/tool-calls/:id/approve` | Aprobar/denegar una tool call pendiente | user, permiso del recurso subyacente | — |

### Critical endpoints — full detail

**`POST /api/webhooks/whatsapp`** (y análogos para instagram/facebook/tiktok, mismo contrato interno):
1. Verifica la firma sobre el raw body (nunca sobre el body ya parseado — el parseo puede reordenar
   bytes). Firma inválida → 401, no se persiste nada.
2. Extrae el `event_id` del proveedor; si ya existe en `idempotency_keys` para esta org → responde 200
   inmediatamente sin reprocesar.
3. Si es nuevo, inserta en `idempotency_keys` y encola un job en BullMQ con el payload crudo — la ruta
   responde 200 en menos de 1s; el trabajo real (crear/actualizar contact, crear conversation/message,
   emitir evento realtime) corre en el worker (step 9).
4. Toda esta cadena corre dentro de `requirePermission`-equivalente para webhooks: el `channel_connection`
   asociado al payload debe pertenecer a exactamente una org — si el `external_account_id` no resuelve
   a ninguna org activa, responde 404 sin filtrar información sobre qué orgs existen.

**`GET /api/v1/conversations`**: request query `{ channel?, status?, priority?, assignedTo?, cursor?,
limit? }` validado con zod. Response `{ data: { items: Conversation[], nextCursor: string | null } }`.
Nunca cruza `org_id` — el `org_id` viene de la sesión, nunca del query string.

**`POST /api/v1/copilot`**: request `{ conversationId: string, message: string }`. Crea un `runs` row,
transmite la respuesta del modelo vía streaming SSE, y por cada `tool_use` block del modelo crea un
`tool_calls` row. Si `requires_approval` es true para ese tipo de tool call (primera vez que se usa ese
tipo en esta org — ver §17), el stream se detiene con un evento `approval_required` y el frontend
muestra el diálogo de aprobación; el cliente llama `POST /copilot/tool-calls/:id/approve` para
continuar.

---

## 6. Frontend Architecture

### Routes

| Route | Page | Data source | Auth |
|---|---|---|---|
| `/` | Landing vacío | estático | public |
| `/login`, `/signup` | Auth | better-auth | public |
| `/app/inbox` | Bandeja unificada | server query + realtime | user |
| `/app/settings/members` | Gestión de miembros | server query | user, permiso `member.invite` para ver invitar |
| `/app/settings/profile` | Perfil + eliminar cuenta | server query | user |

### Rendering strategy

`/app/inbox` es un Server Component que hace la carga inicial de conversaciones server-side (primera
página, sin loading spinner en el primer render) y delega actualizaciones incrementales a
TanStack Query + el cliente Socket.IO en un Client Component hijo (`conversation-list.tsx`). El resto
del layout de `(app)` es Server Component. `cacheComponents: true` en `next.config.ts`; sin
`revalidate` en la bandeja — siempre fresca en cada navegación, dado que es realtime.

### Component hierarchy

```
app/(app)/layout.tsx (Server)
└── AppShell (Server) — sidebar + topbar
    └── app/(app)/inbox/page.tsx (Server) — carga inicial
        ├── FiltersBar (Client) — estado de filtros en URL search params
        ├── ConversationList (Client) — TanStack Query + Socket.IO subscription
        │   └── ConversationListItem (Client)
        └── ConversationView (Client) — mensajes + input + CopilotPanel
            └── CopilotPanel (Client) — chat lateral, streaming SSE
```

### State management

Estado de servidor (conversaciones, mensajes, miembros) vive en TanStack Query, invalidado por eventos
Socket.IO entrantes. Estado de UI local (filtros abiertos, modal de aprobación) en `useState` del
componente. Ningún store global — no hay estado que genuinamente cruce rutas no relacionadas en Fase 1.
Formularios (invitar miembro, responder mensaje) con `react-hook-form` + resolver zod.

### Loading, empty, and error states

- Bandeja vacía (sin conversaciones): ilustración + texto "Conecta un canal para empezar a recibir
  mensajes" con CTA a `/app/settings` (channel connections quedan gestionadas manualmente en Fase 1,
  sin UI de conexión — se documenta esto en §20.4 como siguiente paso).
- Lista de conversaciones cargando: skeleton de 5 filas.
- Error de carga: banner con botón "Reintentar" que invalida la query.
- Copiloto sin respuesta (timeout): mensaje "El copiloto no respondió a tiempo, intenta de nuevo".

---

## 7. Design System

Producido con conocimiento interno (`knowledge/capabilities/styling.md`) — `ui-ux-pro-max` no fue
invocado en esta sesión de generación batch; se recomienda como skill de build en §18. Paleta propia,
no clon de Notion/Buffer/Meta Business Suite/Chatwoot.

### Colors

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--primary` | `#1D4ED8` | `#3B82F6` | botones primarios, links, focus ring |
| `--primary-fg` | `#FFFFFF` | `#0B1220` | texto sobre primary |
| `--background` | `#F8FAFC` | `#0B1220` | página |
| `--surface` | `#FFFFFF` | `#131B2E` | cards, paneles, modales |
| `--border` | `#E2E8F0` | `#233046` | divisores, bordes de input |
| `--fg` | `#0F172A` | `#E2E8F0` | texto principal |
| `--fg-muted` | `#64748B` | `#8B98AE` | texto secundario |
| `--destructive` | `#DC2626` | `#F87171` | errores, eliminar |
| `--success` | `#16A34A` | `#4ADE80` | confirmaciones |

**Contrast**: `--fg` sobre `--background` en light = 15.8:1; `--primary-fg` sobre `--primary` en light
= 6.4:1; `--fg-muted` sobre `--background` en light = 5.2:1. Todos superan AA (4.5:1 texto normal).
Dark mode disponible desde el primer response del servidor vía `next-themes` con cookie de preferencia
leída server-side (ningún flash de tema incorrecto).

### Typography

| Role | Family | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| Display | Inter | 2rem/2.5rem | 700 | -0.02em |
| Heading | Inter | 1.25rem/1.75rem | 600 | -0.01em |
| Body | Inter | 0.9375rem/1.5rem | 400 | normal |
| Mono | JetBrains Mono | 0.8125rem/1.25rem | 400 | normal |

**Font loading**: self-hosted vía `next/font/google` con `display: "swap"`, subset `latin`.

### Spacing, radius, elevation

- Spacing scale: base 4px — 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8px inputs/botones, 12px cards, full para avatares.
- Shadows: `0 1px 2px rgba(0,0,0,0.06)` elevación baja (cards), `0 8px 24px rgba(0,0,0,0.12)` elevación
  alta (modales, panel del copiloto).
- Max content width: 1280px · Breakpoints: sm 640 / md 768 / lg 1024 / xl 1280.

### Motion

150ms `ease-out` para hover/focus, 200ms `ease-in-out` para apertura de paneles (copiloto, modal).
Transform y opacity únicamente. Respeta `prefers-reduced-motion: reduce` — todas las transiciones se
desactivan vía media query en el token global de motion.

### Component style

Interfaz densa, funcional, de trabajo — no editorial ni marketing. Bordes finos de 1px en vez de
sombras pesadas, jerarquía por peso tipográfico y espaciado antes que por color. Un nuevo componente
pertenece si reduce fricción en una tarea repetitiva del agente de atención (responder rápido, filtrar
rápido), nunca si añade adorno visual.

---

## 8. Authentication & Authorization

### Provider and rationale

`better-auth` self-hosted, único seam de identidad. Elegido por soberanía de datos (decisión explícita
del cliente) sobre Clerk/Auth0 — cuesta la implementación de la tabla de sesión propia, gana control
total y cero dependencia de un tercero para el flujo crítico de login.

### Flows

**Signup**: email + password → better-auth crea el `user` → hook post-signup crea automáticamente una
`organization` personal con slug derivado del nombre + sufijo aleatorio, crea la `membership` con rol
`owner`, y siembra el catálogo de `permission`/`role_permission` de sistema si no existe aún → redirige
a `/app/inbox`.

**Login**: email + password → sesión server-side (cookie `HttpOnly`) → redirige a `/app/inbox`.

**Reset de password**: solicita reset → correo con link firmado (expira en 1h) → nueva password.

**Expiración de sesión**: cookie de sesión con TTL de 30 días, refrescada en cada request autenticado
(`sliding expiration`). Al expirar, cualquier request a una ruta protegida redirige a `/login?next=...`.

**Sign-out**: invalida la sesión server-side, limpia la cookie.

**Eliminación de cuenta** (step 15): confirmación explícita → exporta los datos del usuario (JSON con
sus conversaciones asignadas y mensajes enviados) → si es el único `owner` de alguna org, bloquea con
mensaje "transfiere la propiedad primero" → si no, borra el `user` row (better-auth) y sus
`membership`.

### Route protection

| Surface | Rule | Enforced where |
|---|---|---|
| `/app/*` | autenticado | `src/proxy.ts` — Next.js 16 proxy (NO `middleware.ts`, renombrado en 16.0.0) |
| `/api/v1/*` | autenticado + permiso específico por endpoint | `src/server/tenancy.ts` `requirePermission()`, llamado al inicio de cada handler |
| `/api/webhooks/*` | firma de proveedor, no sesión de usuario | verificación en `src/server/channels/<canal>.ts` |
| `/api/auth/*` | público (es el propio flujo de auth) | better-auth |

**Enforcement rule**: la autorización se verifica server-side en cada request. `src/proxy.ts` protege
el árbol de rutas por conveniencia de UX, pero **cada Server Function y cada route handler vuelve a
verificar** — el proxy con matcher no cubre Server Functions (son POSTs a la misma ruta que las
invoca), así que `requirePermission()` es la única fuente de verdad real, nunca el proxy solo.

### Roles and permissions

| Role | Can | Cannot |
|---|---|---|
| `owner` | Todo — gestionar miembros, roles, billing (stub), eliminar canal, ver todo el audit log | — |
| `member` | Ver/responder conversaciones asignadas o sin asignar, usar el copiloto en sus conversaciones | Invitar miembros, cambiar roles, ver conversaciones asignadas a otros a menos que tenga `conversation.assign` |

Permission keys sembrados: `billing.manage`, `member.invite`, `member.manage`, `conversation.assign`,
`conversation.reply`, `channel.manage`.

### Sessions

Token de sesión: cookie firmada por better-auth, `HttpOnly`, `Secure` (en producción con TLS via
Caddy), `SameSite=Lax`. CSRF: better-auth valida origen en mutaciones vía double-submit token integrado
en su flujo estándar.

### Multi-tenancy / row-level isolation

**Mecanismo**: `requirePermission(session, orgId, permissionKey)` en `src/server/tenancy.ts` es la
**única** función que cualquier mutación o lectura sensible llama. Recibe el `org_id` del recurso que
se está accediendo (no de un parámetro de query manipulable por el cliente), verifica que exista una
`membership` activa del usuario de la sesión en esa organización, y verifica que el rol de esa
membership tenga el `permission_key` requerido. Si cualquiera de las dos verificaciones falla, lanza un
error que el handler traduce a **404** (nunca 403) — cruzar el límite de tenant no debe revelar que el
recurso existe en otra organización. "Recordar filtrar por org_id" no es el mecanismo: cada query a
tablas tenant-owned pasa primero por `requirePermission`, que es lo que el test de aislamiento de tenant
(step 5) verifica exhaustivamente.

---

## 9. BUILD ORDER

Range del step map: 18 pasos (dentro de 10-18). Epic count derivado: `ceil(18/9)=2`,
`floor(18/5)=3` → legal 2 o 3 epics. Se eligen **3 epics de 6 pasos cada uno**, separados por capa/
superficie natural: fundación y datos (1-6), canales y bandeja (7-12), copiloto y hardening (13-18).

### Step map

| # | Step | Depends on | Touches | Gate |
|---|---|---|---|---|
| 1 | Scaffold + tooling | — | package.json, pnpm-lock.yaml, .nvmrc, next.config.ts, CI | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build` |
| 2 | Design tokens + app shell | 1 | src/app/globals.css, src/app/(marketing)/*, src/app/(app)/layout.tsx | `pnpm test tests/e2e/app-shell.spec.ts` |
| 3 | Esquema de BD + primera migración | 1 | src/lib/db/schema.ts, src/lib/db/index.ts, drizzle.config.ts, scripts/seed.ts | `pnpm db:migrate && pnpm test tests/unit/schema.test.ts` |
| 4 | Auth con better-auth | 3 | src/lib/auth.ts, src/app/api/auth/[...all]/route.ts, src/proxy.ts, src/app/(auth)/* | `pnpm test tests/integration/auth.test.ts` |
| 5 | Guard de tenancy + tests de aislamiento | 4 | src/server/tenancy.ts, tests/e2e/tenant-isolation.spec.ts | `pnpm test:e2e tests/e2e/tenant-isolation.spec.ts` |
| 6 | Audit log | 5 | src/lib/audit.ts, tests/unit/audit.test.ts | `pnpm test tests/unit/audit.test.ts` |
| 7 | Roles/permisos + gestión de miembros | 6 | src/server/members.ts, src/app/api/members/route.ts, src/app/api/invitations/route.ts, src/app/(app)/settings/members/page.tsx | `pnpm test tests/integration/members.test.ts` |
| 8 | Channel connections + webhooks entrantes | 7 | src/server/channels/*.ts, src/app/api/webhooks/*/route.ts | `pnpm test tests/integration/webhooks.test.ts` |
| 9 | Background job runner | 8 | src/lib/queue/*.ts, scripts/worker.ts | `pnpm test tests/integration/queue.test.ts` |
| 10 | Conversación + mensaje CRUD | 9 | src/server/conversations.ts, src/server/contacts.ts, src/app/api/conversations/**/route.ts | `pnpm test tests/integration/conversations.test.ts` |
| 11 | Bandeja unificada | 10 | src/app/(app)/inbox/page.tsx, src/components/inbox/*.tsx | `pnpm test:e2e tests/e2e/inbox.spec.ts` |
| 12 | Realtime | 11 | src/lib/realtime/*.ts | `pnpm test:e2e tests/e2e/inbox-live.spec.ts` |
| 13 | Gateway de IA | 12 | src/lib/ai/gateway.ts, tests/unit/gateway.test.ts | `pnpm test tests/unit/gateway.test.ts` |
| 14 | Copiloto contextual | 13 | src/server/copilot/*.ts, src/app/api/copilot/route.ts, src/components/copilot/copilot-panel.tsx | `pnpm test:e2e tests/e2e/copilot.spec.ts` |
| 15 | Configuración — eliminación de cuenta | 14 | src/app/(app)/settings/profile/page.tsx, src/app/api/v1/account/route.ts | `pnpm test tests/integration/account-deletion.test.ts` |
| 16 | Hardening | 15 | src/lib/logger.ts, rate limiting en auth/mutaciones | `pnpm test tests/integration/rate-limit.test.ts` |
| 17 | Pipeline de deploy | 16 | Dockerfile, docker-compose.prod.yml, Caddyfile, deploy script | `bash scripts/smoke-test.sh` (step 17 lo crea) |
| 18 | Verificación E2E completa | 17 | CI final gate | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` |

---

#### Step 1 — Scaffold + tooling

**Do**
El Bootstrap de §10 ya dejó el árbol en este estado antes de que este step arranque: `pnpm create
next-app@latest . --ts --app --tailwind --biome --src-dir --use-pnpm` corrió contra un árbol vacío
(solo `.git/` y `.gitignore` — `blueprints/` se reubicó temporalmente para permitirlo, ver §10 paso 4),
`workspace/` ya se copió encima (con `biome.json`, `tsconfig.json`, `CLAUDE.md` y `AGENTS.md`
sobreescritos a propósito sobre los que el scaffold genera por su cuenta — `css.parser.tailwindDirectives:
true` y schema `2.5.8` en el primero, `module: "nodenext"`, `allowImportingTsExtensions: true`,
`rewriteRelativeImportExtensions: true` en el segundo, ver §19.6 Resolution convention matrix; el
`CLAUDE.md`/`AGENTS.md` reales de este blueprint en vez del `CLAUDE.md` de una línea y el bloque de
reglas de Next.js que el scaffold deja por defecto), y `docker-compose.yml` (services `postgres`,
`redis`, emitido bajo `workspace/`, ver §19.6) también ya está en el root. Este step no regenera ni
edita ninguno de los cuatro. Continuar desde ahí: `pnpm
approve-builds --all` (primera pasada, sobre lo que el scaffold ya trajo), luego upgrade explícito de
`typescript@~6.0.3`, `@biomejs/biome@2.5.8`, `vitest@4.1.10`, `@playwright/test@1.62.1`. Instalar
`drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `pg@8.23.0`, `zod@4.4.3`, `@tanstack/react-query@5.101.4`,
`react-hook-form@7.85.0`, `better-auth@1.6.28`, `socket.io@4.8.3`, `socket.io-client@4.8.3`,
`@socket.io/redis-adapter@8.3.0`, `bullmq@6.1.1`, `ioredis@5.11.1`, `pino@10.3.1`, `dotenv@17.4.2`
(pnpm es estricto — `dotenv` no es alcanzable como dependencia transitiva de `drizzle-kit` para código
de la app; `drizzle.config.ts`, `scripts/seed.ts` y `tests/setup/env.ts` lo importan directo, así que
necesita ser dependencia declarada). **Correr `pnpm approve-builds --all` una SEGUNDA vez, después de
este bloque de instalaciones** — `drizzle-kit`, `bullmq` e `ioredis` arrastran dependencias transitivas
con post-install scripts propios (`esbuild`, `msgpackr-extract`) que la primera pasada no vio, porque
todavía no estaban en el árbol; sin esta segunda pasada, `pnpm install --frozen-lockfile` del Verify de
este mismo step falla con `ERR_PNPM_IGNORED_BUILDS` — reproducido en un smoke test real de este
blueprint, no es una hipótesis. Crear `.nvmrc` con `24.19.0` y fijar
`"packageManager": "pnpm@11.21.0"` en `package.json`. Editar `next.config.ts` (el scaffold lo genera
vacío) para fijar `output: "standalone"` (lo consume el `Dockerfile` del step 17 y el `test -d
.next/standalone` de este mismo step) y `cacheComponents: true` (lo usa la bandeja del step 11, ver
§6). Agregar a los `scripts` de `package.json`, además de los que el scaffold ya deja (`dev`, `build`,
`start`, `lint`): `"typecheck": "tsc --noEmit"`, `"lint:fix": "biome check --write ."`,
`"db:migrate": "drizzle-kit migrate"`, `"db:generate": "drizzle-kit generate"`, `"db:seed": "tsx
scripts/seed.ts"`, `"db:studio": "drizzle-kit studio"`, `"worker": "tsx scripts/worker.ts"`,
`"services:up": "docker compose up -d postgres redis"`, `"services:down": "docker compose down"`,
`"services:reset": "docker compose down -v && docker compose up -d postgres redis"`,
`"test": "vitest run"`, `"test:e2e": "playwright test"` — todos los que `CLAUDE.md` (§19.1) y los
`Verify` de §9 asumen disponibles, en un solo lugar, aunque `scripts/seed.ts` y `scripts/worker.ts`
todavía no existan (se crean en los steps 3 y 9 respectivamente — el script de `package.json` puede
declararse antes de que el archivo que invoca exista). CI mínimo (`.github/workflows/ci.yml` — o el
equivalente que el pipeline de este VPS use, ver §12) con los pasos lint/typecheck/build.

**Done when**
- [ ] WHEN `pnpm install --frozen-lockfile` corre THE SYSTEM SHALL salir con código 0 sin modificar el lockfile.
- [ ] WHEN `pnpm exec biome check .` corre sobre el árbol recién generado (incluyendo `src/app/globals.css` con el `@theme` de Tailwind v4) THE SYSTEM SHALL salir con código 0.
- [ ] WHEN `pnpm exec tsc --noEmit` corre THE SYSTEM SHALL salir con código 0.
- [ ] WHEN `pnpm build` corre THE SYSTEM SHALL salir con código 0 y producir `.next/standalone/`.
- [ ] WHEN `docker compose -f docker-compose.yml up -d postgres redis` corre THE SYSTEM SHALL dejar ambos contenedores en estado `healthy` según su healthcheck en menos de 30s.

**Verify**
```bash
pnpm install --frozen-lockfile      # expect: exit 0
pnpm exec biome check .             # expect: exit 0
pnpm exec tsc --noEmit              # expect: exit 0
pnpm build                          # expect: exit 0
test -d .next/standalone            # expect: exit 0 — el output existe
docker compose up -d postgres redis
timeout 30 bash -c 'until [ "$(docker inspect -f "{{.State.Health.Status}}" $(docker compose ps -q postgres))" = "healthy" ]; do sleep 1; done'
# expect: exit 0 — postgres healthy dentro de 30s
```

**Checkpoint**
```bash
git add -A && git commit -m "step 1: scaffold + tooling"
git tag step-01-scaffold
```

---

#### Step 2 — Design tokens + app shell

**Do**
Escribir los tokens de §7 en `src/app/globals.css` bajo `@theme` (Tailwind v4 CSS-first). Instalar
`next-themes` para dark mode server-aware. Crear el layout de `(marketing)` vacío (solo un `<h1>Núcleo
</h1>` placeholder — sin contenido de marketing, fuera de alcance) y el layout de `(app)` con sidebar +
topbar usando componentes shadcn (`pnpm dlx shadcn@4.18.0 init --base radix --no-monorepo`, luego
`add button avatar dropdown-menu sheet`). Crear `tests/e2e/app-shell.spec.ts`.

**Done when**
- [ ] WHEN `pnpm dev` arranca y se visita `/` THE SYSTEM SHALL responder 200 con el layout de marketing.
- [ ] WHEN se visita `/app/inbox` sin sesión THE SYSTEM SHALL redirigir a `/login?next=/app/inbox` (protección aún vía proxy stub — auth real llega en step 4; este step verifica solo la redirección estructural con una sesión simulada en el test).
- [ ] WHEN el viewport es menor a 768px THE SYSTEM SHALL colapsar la navegación en un `Sheet` sin scroll horizontal.
- [ ] WHEN `prefers-color-scheme: dark` está activo y no hay cookie de preferencia THE SYSTEM SHALL renderizar el tema oscuro en el HTML inicial del servidor, sin parpadeo de tema claro.

**Verify**
```bash
pnpm exec biome check . && pnpm exec tsc --noEmit   # expect: exit 0
pnpm test:e2e tests/e2e/app-shell.spec.ts            # expect: exit 0, todos los tests pasan
```

**Checkpoint**
```bash
git add -A && git commit -m "step 2: design tokens + app shell"
git tag step-02-app-shell
```

---

#### Step 3 — Esquema de base de datos completo + primera migración

**Do**
Escribir `src/lib/db/schema.ts` con las 23 tablas de §4 completas (user, organization, membership,
role, permission, role_permission, invitation, audit_event, channel_connection, contact, tag,
contact_tag, conversation, message, jobs, job_dead_letters, idempotency_keys, llm_calls, prompts, runs,
steps, tool_calls, approvals), con todas las FKs, índices y constraints listados en §4. Escribir
`src/lib/db/index.ts` (cliente `pg` + `drizzle`). Escribir `drizzle.config.ts` con `import
"dotenv/config"` como primera línea (`dotenv@17.4.2` — instalado como dependencia directa en el step
1, ver §11) — así `drizzle-kit generate`/`migrate` cargan `.env` sin depender de que
el shell que los invoca ya lo tenga exportado. Escribir `scripts/seed.ts` con el mismo `import
"dotenv/config"` como primera línea, por la misma razón (`tsx` no carga `.env` por su cuenta). Escribir
`scripts/seed.ts` (catálogo de permisos + roles de sistema + org demo en dev, con password desde
`SEED_ADMIN_PASSWORD`). Correr `drizzle-kit generate` para producir la primera migración
(nombre generado por la herramienta, nunca inventado). Escribir `tests/unit/schema.test.ts` que
verifica programáticamente que cada tabla listada en §4 existe tras migrar.

**Done when**
- [ ] WHEN `pnpm db:migrate` corre contra una base vacía THE SYSTEM SHALL crear exactamente las 23 tablas listadas en §4 (`user`, `organization`, `membership`, `role`, `permission`, `role_permission`, `invitation`, `audit_event`, `channel_connection`, `contact`, `tag`, `contact_tag`, `conversation`, `message`, `jobs`, `job_dead_letters`, `idempotency_keys`, `llm_calls`, `prompts`, `runs`, `steps`, `tool_calls`, `approvals`) — ni una menos ni una de más — cada una verificable con `psql -c '\d <tabla>'` saliendo con código 0.
- [ ] WHEN `pnpm db:seed` corre THE SYSTEM SHALL insertar 6 filas en `permission` y 2 filas en `role` (`owner`, `member`) con sus `role_permission` correspondientes.
- [ ] WHEN se intenta insertar una `membership` con `(org_id, user_id)` duplicado THE SYSTEM SHALL rechazar la escritura por el índice único.
- [ ] WHEN `DATABASE_URL` está ausente al importar `src/lib/db/index.ts` THE SYSTEM SHALL fallar al boot con un error nombrado, no en el primer query.

**Verify**
```bash
set -a && . ./.env && set +a   # exporta DATABASE_URL y demás al shell de este Verify — drizzle-kit
                                # y tsx (vía db:migrate/db:seed) cargan .env por su cuenta gracias al
                                # `import "dotenv/config"` de drizzle.config.ts/seed.ts, pero psql no
pnpm db:migrate                                          # expect: exit 0
pnpm test tests/unit/schema.test.ts                       # expect: exit 0, 0 failed — verifica que existen las 23 tablas nombradas en §4
pnpm db:seed
test "$(psql "$DATABASE_URL" -tAc 'select count(*) from permission;')" = "6"   # expect: exit 0
test "$(psql "$DATABASE_URL" -tAc 'select count(*) from role;')" = "2"         # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 3: esquema de base de datos + migracion inicial"
git tag step-03-schema
```

---

#### Step 4 — Auth con better-auth

**Do**
Configurar `src/lib/auth.ts` (better-auth con el adaptador Drizzle, `emailAndPassword` habilitado,
hook `after.signUp` que crea `organization` + `membership` owner + siembra permisos si el catálogo
está vacío). Crear `src/app/api/auth/[...all]/route.ts`. Crear `src/proxy.ts` (Next.js 16 — NO
`middleware.ts`) que redirige a `/login` si no hay sesión en rutas `/app/*`. Crear
`src/app/(auth)/login/page.tsx` y `signup/page.tsx` con `react-hook-form` + zod. Escribir
`tests/integration/auth.test.ts`.

**Done when**
- [ ] WHEN un visitante envía signup con email válido y nuevo THE SYSTEM SHALL crear un `user`, una `organization` con slug único, una `membership` con rol `owner`, y redirigir a `/app/inbox`.
- [ ] WHEN un usuario envía login con credenciales correctas THE SYSTEM SHALL establecer una cookie de sesión `HttpOnly` y redirigir a `/app/inbox`.
- [ ] WHEN una request sin sesión llega a `/app/inbox` THE SYSTEM SHALL redirigir a `/login?next=/app/inbox` vía `src/proxy.ts`.
- [ ] WHEN se envía signup con un email ya registrado THE SYSTEM SHALL responder con error de validación sin crear una segunda organización.
- [ ] WHEN el usuario hace sign-out THE SYSTEM SHALL invalidar la sesión server-side.

**Verify**
```bash
pnpm test tests/integration/auth.test.ts    # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 4: auth con better-auth"
git tag step-04-auth
```

---

#### Step 5 — Guard de tenancy + tests de aislamiento

**Do**
Escribir `src/server/tenancy.ts` con `requirePermission(session, orgId, permissionKey)` — la única
función que toda mutación/lectura sensible de §9 pasos 7+ llamará. Lanza un error tipado que cada route
handler traduce a 404. Escribir `tests/e2e/tenant-isolation.spec.ts`: crea dos organizaciones A y B con
un usuario cada una, intenta que el usuario de A acceda a un recurso de B por ID directo, y verifica
404 (nunca 403).

**Done when**
- [ ] WHEN un usuario con membership activa en la org del recurso y el permiso requerido llama `requirePermission` THE SYSTEM SHALL retornar sin lanzar.
- [ ] WHEN un usuario sin membership en la org del recurso llama `requirePermission` THE SYSTEM SHALL lanzar un error que el handler traduce a 404.
- [ ] WHEN un usuario con membership en la org pero sin el permiso requerido llama `requirePermission` THE SYSTEM SHALL lanzar el mismo error tipado, resultando en 404 — nunca 403, para no revelar existencia cruzada.
- [ ] WHEN el test E2E de aislamiento intenta acceder a un recurso de la organización B usando la sesión de un usuario de la organización A THE SYSTEM SHALL responder 404 en cada endpoint probado.

**Verify**
```bash
pnpm test:e2e tests/e2e/tenant-isolation.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 5: guard de tenancy + tests de aislamiento"
git tag step-05-tenancy
```

---

#### Step 6 — Audit log

**Do**
Escribir `src/lib/audit.ts` con `recordAuditEvent(tx, { orgId, actorType, actorId, action, targetType,
targetId, metadata })` — recibe la transacción de Drizzle activa y escribe el `audit_event` **en la
misma transacción** que el cambio que describe, nunca después. Escribir `tests/unit/audit.test.ts` que
verifica que si la transacción hace rollback, el `audit_event` tampoco persiste.

Nota de diseño: `audit_event` es append-only por convención de código en esta etapa — solo
`recordAuditEvent` debe escribir en ella. El enforcement duro a nivel de base de datos (un grant de
rol de aplicación que rechaza UPDATE/DELETE directo) se aplica recién en el paso 17 al provisionar el
rol de producción, y su criterio de aceptación vive ahí — ver ese paso.

**Done when**
- [ ] WHEN `recordAuditEvent` se llama dentro de una transacción que luego hace commit THE SYSTEM SHALL persistir la fila en `audit_event`.
- [ ] WHEN la transacción que contiene la llamada a `recordAuditEvent` hace rollback THE SYSTEM SHALL dejar `audit_event` sin la fila — cero filas huérfanas.

**Verify**
```bash
pnpm test tests/unit/audit.test.ts    # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 6: audit log en la misma transaccion"
git tag step-06-audit
```

---

#### Step 7 — Catálogo de roles/permisos + gestión de miembros

**Do**
Escribir `src/server/members.ts` (invitar, aceptar invitación, cambiar rol, remover miembro — cada uno
llamando `requirePermission` primero y `recordAuditEvent` dentro de la misma transacción). Crear
`src/app/api/members/route.ts`, `src/app/api/invitations/route.ts`. Crear
`src/app/(app)/settings/members/page.tsx` con tabla de miembros, formulario de invitar, y cambio de rol
inline. Función mínima de envío de correo (SMTP configurable) para el link de invitación. Escribir
`tests/integration/members.test.ts`.

**Done when**
- [ ] WHEN un owner invita a un email con un rol válido THE SYSTEM SHALL crear una `invitation` con token único y expiración de 7 días, y enviar un correo con el link.
- [ ] WHEN se visita el link de aceptación con un token válido y no expirado THE SYSTEM SHALL crear la `membership` correspondiente y marcar la invitación como usada.
- [ ] WHEN se visita el link con un token expirado THE SYSTEM SHALL responder con un error claro sin crear la membership.
- [ ] WHEN un miembro sin `member.manage` intenta cambiar el rol de otro miembro THE SYSTEM SHALL responder 404 (vía `requirePermission`).
- [ ] WHEN un owner remueve a un miembro THE SYSTEM SHALL borrar la `membership` y registrar un `audit_event` con action `member.removed` en la misma transacción.

**Verify**
```bash
pnpm test tests/integration/members.test.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 7: roles, permisos y gestion de miembros"
git tag step-07-members
```

---

#### Step 8 — Channel connections + webhooks entrantes

**Do**
Escribir `src/server/channels/whatsapp.ts`, `instagram.ts`, `facebook.ts`, `tiktok.ts` — cada uno con
verificación de firma sobre raw body específica del proveedor, y una función `normalizeInboundEvent`
que traduce el payload del proveedor a un shape interno común `{ externalAccountId, externalEventId,
contactExternalId, contactName, body, mediaUrls }`. Crear las 4 rutas
`src/app/api/webhooks/<canal>/route.ts` que: verifican firma → chequean idempotencia →
encolan un job BullMQ con el evento normalizado → responden 200. **VERIFY**: la versión exacta de la
API de cada plataforma (Graph API de Meta para WhatsApp/Instagram/Facebook, TikTok for Business API)
no se pudo verificar en vivo en esta sesión de generación — el builder debe confirmar la versión
vigente de cada API contra la documentación oficial del proveedor antes de implementar la verificación
de firma y el parseo de payload de este paso, y registrar la versión confirmada en un comentario al
inicio de cada archivo de canal. No inventar endpoints ni shapes de payload de memoria.

**Done when**
- [ ] WHEN un webhook de WhatsApp llega con firma inválida sobre el raw body THE SYSTEM SHALL responder 401 y no encolar ningún job.
- [ ] WHEN un webhook llega con firma válida y un `event_id` nunca visto por esta org THE SYSTEM SHALL insertar en `idempotency_keys`, encolar exactamente un job, y responder 200 en menos de 1 segundo.
- [ ] WHEN el mismo `event_id` llega dos veces para la misma org THE SYSTEM SHALL responder 200 ambas veces sin encolar un segundo job.
- [ ] WHEN el `external_account_id` del payload no corresponde a ningún `channel_connection` activo THE SYSTEM SHALL responder 404 sin filtrar información sobre qué cuentas existen.
- [ ] WHEN los 4 canales reciben el mismo evento estructuralmente equivalente THE SYSTEM SHALL producir el mismo shape normalizado interno antes de encolarlo.

**Verify**
```bash
pnpm test tests/integration/webhooks.test.ts   # expect: exit 0, 0 failed — usa fixtures grabados por canal, nunca llamadas reales al proveedor
```

**Checkpoint**
```bash
git add -A && git commit -m "step 8: channel connections + webhooks entrantes"
git tag step-08-webhooks
```

---

#### Step 9 — Background job runner

**Do**
Escribir `src/lib/queue/connection.ts` (conexión `ioredis` compartida, con `maxRetriesPerRequest: null`
— obligatorio para el `Worker` de BullMQ 6.x). Escribir `src/lib/queue/index.ts` (colas exportadas:
`inboundEventsQueue`). Escribir `scripts/worker.ts` (proceso `Worker` de BullMQ que procesa
`inboundEventsQueue`: crea/actualiza `contact` por `external_ids`, crea/actualiza `conversation`, crea
`message`, emite el evento realtime — la emisión realtime real se conecta en step 12, aquí el worker
deja un stub de `emitConversationUpdate` que step 12 implementa). Backoff exponencial con jitter,
dead-letter a `job_dead_letters` tras 5 intentos fallidos.

**Done when**
- [ ] WHEN se encola un job válido en `inboundEventsQueue` THE SYSTEM SHALL procesarlo y marcarlo completado en menos de 5 segundos en el entorno de test.
- [ ] WHEN el handler del job lanza una excepción THE SYSTEM SHALL reintentar con backoff exponencial hasta 5 intentos.
- [ ] WHEN un job agota sus 5 intentos THE SYSTEM SHALL insertar una fila en `job_dead_letters` con el error y dejar de reintentar.
- [ ] WHEN dos jobs con el mismo `idempotency_key` de evento normalizado se procesan (carrera de reintentos) THE SYSTEM SHALL producir un único `message` — no duplicado.

**Verify**
```bash
pnpm test tests/integration/queue.test.ts   # expect: exit 0, 0 failed — corre un Worker real contra Redis de test
```

**Checkpoint**
```bash
git add -A && git commit -m "step 9: background job runner con BullMQ"
git tag step-09-queue
```

---

#### Step 10 — Conversación + mensaje CRUD

**Do**
Escribir `src/server/conversations.ts` (crear/listar/actualizar estado y asignación, todo vía
`requirePermission`), `src/server/contacts.ts` (`findOrCreateContact` usada tanto por el worker de
webhooks como por creación manual futura). Crear `src/app/api/conversations/route.ts` y
`src/app/api/conversations/[id]/route.ts`. Conectar el worker del step 9 para que use
`findOrCreateContact` y la lógica real de creación de conversación/mensaje en vez del stub.

**Done when**
- [ ] WHEN llega el primer mensaje entrante de un contacto nunca visto en un canal THE SYSTEM SHALL crear un `contact` con el `external_ids` de ese canal poblado, y una `conversation` nueva en estado `open`.
- [ ] WHEN llega un segundo mensaje entrante del mismo contacto en el mismo canal dentro de una conversación existente THE SYSTEM SHALL reutilizar el `contact` y la `conversation` existentes, insertando solo un nuevo `message`.
- [ ] WHEN un usuario con `conversation.assign` cambia el `assignedTo` de una conversación THE SYSTEM SHALL persistir el cambio y registrar un `audit_event` con action `conversation.assigned`.
- [ ] WHEN un usuario lista conversaciones filtrando por `status=open&channel=whatsapp` THE SYSTEM SHALL retornar solo conversaciones de su organización que cumplen ambos filtros, paginadas por cursor.

**Verify**
```bash
pnpm test tests/integration/conversations.test.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 10: conversacion y mensaje end-to-end"
git tag step-10-conversations
```

---

#### Step 11 — Bandeja unificada

**Do**
Construir `src/app/(app)/inbox/page.tsx` (Server Component, carga inicial), `src/components/inbox/
conversation-list.tsx`, `conversation-view.tsx`, `filters-bar.tsx` (Client Components, TanStack
Query). Filtros por canal/estado/prioridad/responsable reflejados en la URL. Búsqueda por nombre de
contacto o contenido de mensaje (LIKE simple sobre `contact.name` y `message.body`, sin full-text
search en Fase 1). Paginación cursor con scroll infinito. Estados vacío/carga de §6.

Dentro de `conversation-list.tsx`, `ConversationListItem` renderiza una insignia de canal superpuesta
en la esquina inferior derecha del avatar del contacto (círculo de 16px, borde de 2px del color de
fondo de la card para separarla visualmente del avatar) — un glifo SVG simple por canal en su color de
marca convencional: WhatsApp `#25D366`, Instagram degradado `#F58529→#DD2A7B→#8134AF` (simplificado a
`#DD2A7B` sólido si el degradado complica el SVG), Facebook `#1877F2`, TikTok `#000000` con acento
`#25F4EE`. Los 4 glifos van como componentes SVG inline dentro del propio `conversation-list.tsx` (no
un archivo ni dependencia nueva — evita forzar `src/components/inbox/` sobre el límite de 5 archivos
del step y evita instalar un paquete de íconos de marca sin verificar). Cada insignia lleva
`aria-label` con el nombre del canal (ej. `aria-label="WhatsApp"`) para que un lector de pantalla la
anuncie aunque sea puramente decorativa a nivel visual.

**Done when**
- [ ] WHEN un usuario visita `/app/inbox` con conversaciones existentes THE SYSTEM SHALL renderizar la lista ordenada por `last_message_at` descendente en el primer response del servidor, sin spinner de carga inicial.
- [ ] WHEN el usuario aplica el filtro `status=pending` THE SYSTEM SHALL actualizar la URL con el search param correspondiente y refetch solo las conversaciones que cumplen el filtro.
- [ ] WHEN no hay conversaciones que cumplan los filtros activos THE SYSTEM SHALL mostrar el estado vacío específico "Sin resultados para estos filtros", distinto del estado vacío de "sin canales conectados".
- [ ] WHEN el usuario hace scroll hasta el final de la lista THE SYSTEM SHALL cargar la siguiente página vía cursor sin recargar las anteriores.
- [ ] WHEN se renderiza un `ConversationListItem` THE SYSTEM SHALL mostrar la insignia del canal (whatsapp/instagram/facebook/tiktok) superpuesta en el avatar, visible sin abrir la conversación, con `aria-label` legible por lector de pantalla.

**Verify**
```bash
pnpm test:e2e tests/e2e/inbox.spec.ts   # expect: exit 0, 0 failed — incluye una aserción de que
                                          # cada fila renderiza data-channel-badge="whatsapp|instagram|facebook|tiktok" según el canal real de la conversación
```

**Checkpoint**
```bash
git add -A && git commit -m "step 11: bandeja unificada"
git tag step-11-inbox
```

---

#### Step 12 — Realtime

**Do**
Escribir `src/lib/realtime/server.ts` (servidor Socket.IO adjunto al servidor Node de Next.js
standalone, con `@socket.io/redis-adapter` conectado a la misma instancia Redis que BullMQ, rooms por
`org_id`). Escribir `src/lib/realtime/client.ts` (hook `useRealtimeConversations(orgId)` que se suscribe
al room de la org y invalida las queries de TanStack Query correspondientes en cada evento). Conectar
el `emitConversationUpdate` real en `scripts/worker.ts` (reemplaza el stub del step 9) y en
`src/server/conversations.ts` (cambios de estado/asignación también emiten).

**Done when**
- [ ] WHEN llega un mensaje entrante nuevo para una conversación visible en la bandeja de un usuario conectado THE SYSTEM SHALL actualizar la lista sin que el usuario recargue la página.
- [ ] WHEN un usuario de la organización A está conectado y llega un evento de la organización B THE SYSTEM SHALL no entregarlo — el room de Socket.IO aísla por `org_id`.
- [ ] WHEN el servidor Node se reinicia con múltiples instancias detrás del mismo Redis THE SYSTEM SHALL seguir entregando eventos a clientes conectados a una instancia distinta de la que originó el evento — verificado con dos procesos de servidor apuntando al mismo Redis en el test.

**Verify**
```bash
pnpm test:e2e tests/e2e/inbox-live.spec.ts   # expect: exit 0, 0 failed — levanta dos instancias del servidor de test contra el mismo Redis
```

**Checkpoint**
```bash
git add -A && git commit -m "step 12: realtime con socket.io + redis adapter"
git tag step-12-realtime
```

---

#### Step 13 — Gateway de IA

**Do**
Instalar `pnpm add @anthropic-ai/sdk@0.117.1` (versión verificada en §11 — nadie más lo instala,
este paso es el único punto de instalación). Escribir `src/lib/ai/gateway.ts` — único módulo que
envuelve `@anthropic-ai/sdk`. Expone
`streamCopilotTurn({ systemPrompt, messages, tools })` usando `client.messages.stream(...)` con
`thinking: { type: "adaptive" }`. El model ID se lee de `env.COPILOT_MODEL_ID` (nunca hardcodeado en
el código — el valor por defecto vive en `.env.example`, ver §11 y §17). Manejo de `stop_reason:
"refusal"` retornando un resultado tipado que el llamador puede mostrar como "el copiloto no puede
ayudar con esto" en vez de lanzar. Timeout de 30s con reintento único con backoff.

**Done when**
- [ ] WHEN `streamCopilotTurn` recibe una conversación válida THE SYSTEM SHALL transmitir los deltas de texto vía el iterador retornado hasta `stop_reason: "end_turn"` o `"tool_use"`.
- [ ] WHEN la API responde `stop_reason: "refusal"` THE SYSTEM SHALL retornar un resultado tipado `{ type: "refusal" }` sin lanzar una excepción no controlada.
- [ ] WHEN `COPILOT_MODEL_ID` no está definido en el entorno al importar el módulo THE SYSTEM SHALL fallar al boot con un error nombrado.
- [ ] WHEN la llamada a la API excede 30 segundos sin respuesta THE SYSTEM SHALL abortar y reintentar exactamente una vez antes de propagar el error al llamador.

**Verify**
```bash
pnpm test tests/unit/gateway.test.ts   # expect: exit 0, 0 failed — usa un cliente Anthropic mockeado, ninguna llamada real de red
```

**Checkpoint**
```bash
git add -A && git commit -m "step 13: gateway de IA sobre el sdk de anthropic"
git tag step-13-ai-gateway
```

---

#### Step 14 — Copiloto contextual

**Do**
Escribir `src/server/copilot/tools.ts` — catálogo de tool calls de bajo riesgo de esta fase:
`tag_conversation(conversationId, tagName)` y `assign_conversation(conversationId, userId)`, cada una
con su `permission_key` (`conversation.assign` para asignar, sin permiso adicional para etiquetar más
allá de `conversation.reply`) y marcada `requiresApprovalFirstUse: true`. Escribir
`src/server/copilot/runs.ts` — orquesta el patrón runs/steps/tool_calls/approvals: crea el `runs`,
llama `streamCopilotTurn` del gateway con el contexto de la conversación abierta (últimos N mensajes) y
las definiciones de tool, persiste cada `steps`/`tool_calls`, y **antes de ejecutar** una `tool_call`
marcada `requiresApprovalFirstUse` cuya organización nunca ha aprobado ese `tool_name` antes, la deja en
estado `pending` y crea una fila en `approvals` sin decisión — el stream se detiene y el frontend debe
llamar el endpoint de aprobación. Una vez aprobado un tipo de tool call por una organización, las
siguientes ejecuciones de ese mismo tipo no vuelven a pedir aprobación (política "aprobación en la
primera ejecución de cada tipo", igual que agent-loop.md). Crear `src/app/api/copilot/route.ts` (POST,
streaming SSE) y `src/app/api/copilot/tool-calls/[id]/approve/route.ts`. Crear
`src/components/copilot/copilot-panel.tsx` (chat lateral con streaming, diálogo de aprobación inline).

**Done when**
- [ ] WHEN el usuario pregunta algo sobre la conversación abierta THE SYSTEM SHALL responder con contexto de los mensajes de esa conversación, transmitido vía streaming al panel.
- [ ] WHEN el copiloto invoca `tag_conversation` por primera vez en una organización THE SYSTEM SHALL crear una fila en `approvals` sin decisión y detener el run en estado `pending`, sin ejecutar la mutación.
- [ ] WHEN un usuario con permiso aprueba esa `tool_call` pendiente THE SYSTEM SHALL ejecutar la mutación, registrar el `audit_event` correspondiente, y continuar el run.
- [ ] WHEN la misma organización invoca `tag_conversation` una segunda vez tras la primera aprobación THE SYSTEM SHALL ejecutarla directamente sin volver a pedir aprobación.
- [ ] WHEN el copiloto intenta invocar una acción de envío a un canal externo (fuera del catálogo de esta fase) THE SYSTEM SHALL rechazarla — el catálogo de tools de Fase 1 no incluye ninguna acción de canal externo (§1 Non-Goals implícito por diseño del catálogo).

**Verify**
```bash
pnpm test:e2e tests/e2e/copilot.spec.ts   # expect: exit 0, 0 failed — usa el gateway mockeado con respuestas grabadas (fixtures), sin llamadas reales al modelo
```

**Checkpoint**
```bash
git add -A && git commit -m "step 14: copiloto contextual con aprobacion en primer uso"
git tag step-14-copilot
```

---

#### Step 15 — Configuración: eliminación de cuenta con exportación de datos

**Do**
Crear `src/app/(app)/settings/profile/page.tsx` (edición de nombre/avatar, más el flujo de
eliminación). Crear `src/app/api/v1/account/route.ts` (GET exporta un JSON con las conversaciones
asignadas y mensajes enviados por el usuario; DELETE ejecuta el borrado — bloquea si el usuario es el
único `owner` de alguna organización).

**Done when**
- [ ] WHEN un usuario solicita exportar sus datos THE SYSTEM SHALL retornar un JSON con sus conversaciones asignadas y mensajes marcados `sender_type='agent'` que él envió.
- [ ] WHEN un usuario que es el único owner de una organización solicita eliminar su cuenta THE SYSTEM SHALL rechazar con un mensaje indicando que debe transferir la propiedad primero, sin borrar nada.
- [ ] WHEN un usuario que no es único owner de ninguna organización confirma la eliminación THE SYSTEM SHALL borrar su `user` row y sus `membership`, dejando sus mensajes históricos intactos (append-only, `sender_type` no depende de la existencia del `user`).

**Verify**
```bash
pnpm test tests/integration/account-deletion.test.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 15: configuracion — eliminacion de cuenta"
git tag step-15-account-deletion
```

---

#### Step 16 — Hardening

**Do**
Escribir `src/lib/logger.ts` (pino, salida JSON estructurada a stdout, cada línea con `actorId`,
`orgId`, `requestId` cuando aplican). Reemplazar `console.log` residual de pasos anteriores por el
logger. Rate limiting sobre `/api/auth/*` y `/api/webhooks/*` usando el mismo Redis (contador simple con
TTL, sin dependencia nueva). Error boundaries en `src/app/(app)/error.tsx` y `src/app/(auth)/error.tsx`.
Editar `next.config.ts` (creado en step 1) para agregar `headers()` con CSP, HSTS,
X-Content-Type-Options y Referrer-Policy (§14). Instalar `@axe-core/playwright@4.13.0` y escribir
`tests/e2e/a11y.spec.ts` — corre axe sobre `/login`, `/app/inbox` y `/app/settings/members`, falla si
hay alguna violación (§15).

**Done when**
- [ ] WHEN se hacen 6 intentos de login fallidos desde la misma IP en menos de un minuto THE SYSTEM SHALL rechazar el sexto con 429 antes de evaluar las credenciales.
- [ ] WHEN cualquier ruta de API loggea una línea THE SYSTEM SHALL emitirla como JSON válido en stdout con al menos los campos `level`, `msg`, `time`.
- [ ] WHEN un Server Component de `(app)` lanza una excepción no controlada THE SYSTEM SHALL renderizar el `error.tsx` de ese segmento en vez de una página en blanco.
- [ ] WHEN `pnpm test:e2e tests/e2e/a11y.spec.ts` corre contra `/login`, `/app/inbox` y `/app/settings/members` THE SYSTEM SHALL reportar 0 violaciones de axe.

**Verify**
```bash
pnpm test tests/integration/rate-limit.test.ts   # expect: exit 0, 0 failed
pnpm test:e2e tests/e2e/a11y.spec.ts             # expect: exit 0, 0 violations
```

**Checkpoint**
```bash
git add -A && git commit -m "step 16: hardening — rate limiting, logging, error boundaries"
git tag step-16-hardening
```

---

#### Step 17 — Pipeline de deploy

**Do**
Escribir `Dockerfile` multi-stage — build con pnpm, runtime Node 24 slim copiando el output de
`output: "standalone"` (`.next/standalone/`, `.next/static/`, `public/`), consumido por el servicio
`app` de `docker-compose.prod.yml`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
```

Escribir `docker-compose.prod.yml` de producción (app + postgres + redis + worker + Caddy — el
servicio `app` construye desde el `Dockerfile` de arriba con `build: { context: ., dockerfile:
Dockerfile }`). Escribir `Caddyfile` con TLS automático configurado pero **sin dominio público
asignado** — Caddy sirve sobre la IP/puerto del VPS en esta fase (§1 Non-Goals: dominio público es
Fase 2+). Escribir `scripts/smoke-test.sh` que, tras un deploy, verifica `/api/health` y que las
migraciones están al día. Migraciones como paso de deploy explícito y gateado (nunca en el boot del
contenedor de la app). Aplicar aquí el grant de BD que restringe UPDATE/DELETE directo sobre
`audit_event` a nivel de rol de aplicación (diseñado en el paso 6, enforced en este paso — ver §14
hard rules).

**Done when**
- [ ] WHEN `docker compose -f docker-compose.prod.yml up -d` corre en el VPS THE SYSTEM SHALL levantar los 5 servicios (app, worker, postgres, redis, caddy) con la app healthy en menos de 60 segundos.
- [ ] WHEN el paso de deploy ejecuta las migraciones THE SYSTEM SHALL aplicarlas antes de que el contenedor de la app empiece a aceptar tráfico — nunca en paralelo.
- [ ] WHEN `scripts/smoke-test.sh` corre tras un deploy exitoso THE SYSTEM SHALL salir con 0 tras verificar `GET /api/health` retorna `{ data: { ok: true, migrationsUpToDate: true } }`.
- [ ] WHEN se intenta un UPDATE o DELETE directo sobre `audit_event` con el rol de aplicación de producción THE SYSTEM SHALL ser rechazado por el grant de BD aplicado en este paso (diseñado en el paso 6, enforced aquí).

**Verify**
```bash
bash scripts/smoke-test.sh   # expect: exit 0 — corrido contra el stack levantado localmente con docker-compose.prod.yml
docker compose -f docker-compose.prod.yml exec -T postgres psql -U nucleo_app -d nucleo -c "UPDATE audit_event SET action = action WHERE false;" 2>/dev/null; test $? -ne 0
# expect: exit 0 — el UPDATE debe fallar por el grant (exit distinto de 0), así que `test $? -ne 0` sale 0 cuando el grant funciona. Escrito sin "!" al inicio para que el token principal del comando siga siendo "docker" y matchee el allowlist.
```

**Checkpoint**
```bash
git add -A && git commit -m "step 17: pipeline de deploy con docker compose + caddy"
git tag step-17-deploy
```

---

#### Step 18 — Verificación local end-to-end

**Do**
Consolidar el gate completo de CI: lint + typecheck + unit + integration + los tres E2E críticos
(aislamiento de tenant, auth, bandeja en vivo). Este paso no crea funcionalidad nueva — cierra la fase
verificando que el conjunto completo de gates de los 17 pasos anteriores sigue pasando junto, en una
corrida limpia (`git clone` a un directorio temporal, o el equivalente de checkout limpio en CI).

**Done when**
- [ ] WHEN el gate completo de CI corre sobre un checkout limpio THE SYSTEM SHALL reportar 0 fallos en lint, typecheck, tests unitarios, tests de integración, y los 3 suites E2E.
- [ ] WHEN se re-ejecuta el bloque de Bootstrap de §10 sobre un árbol ya bootstrapeado THE SYSTEM SHALL salir con 0 sin revertir `package.json` ni ningún archivo emitido en §19.6.

El conteo de los 18 tags de checkpoint (incluido el de este mismo paso) se verifica en §20.1, después
del `git tag step-18-verification` de abajo — no aquí, porque en este punto ese tag número 18 todavía
no existe.

**Verify**
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e   # expect: exit 0 en cada uno
```

**Checkpoint**
```bash
git add -A && git commit -m "step 18: verificacion local end-to-end — fase 1 cerrada"
git tag step-18-verification
```

---

### 9.1 Parity and cutover

NOT APPLICABLE — greenfield build, no system is being replaced.

---

## 10. Environment Setup

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 24.19.0 (LTS "Krypton") | `node -v` |
| pnpm | 11.21.0 | `pnpm -v` |
| Docker + Docker Compose | cualquier versión reciente con soporte de healthcheck | `docker compose version` |

### Accounts to create first

Ninguna cuenta de tercero es estrictamente necesaria antes del step 1 — el stack es self-hosted. Antes
del **step 8**, el builder necesita credenciales de desarrollador/tester de cada plataforma de canal
(WhatsApp Business Platform, Meta for Developers para Instagram/Facebook, TikTok for Business API) para
poder probar los webhooks contra fixtures reales o un entorno sandbox del proveedor — la creación de
estas cuentas y sus credenciales de sandbox es responsabilidad del equipo, fuera del alcance
automatizable de este blueprint.

### Environment variables

| Variable | Purpose | Where to get it | Required by step | Secret? |
|---|---|---|---|---|
| `DATABASE_URL` | Conexión Postgres | `docker-compose.yml` local, provisto en `.env.example` con valor local literal | 3 | yes |
| `REDIS_URL` | Conexión Redis (BullMQ + Socket.IO adapter + rate limit) | `docker-compose.yml` local | 9 | yes |
| `BETTER_AUTH_SECRET` | Firma de sesión de better-auth | generado con `openssl rand -hex 32` | 4 | yes |
| `BETTER_AUTH_URL` | URL base para better-auth | `http://localhost:3000` en dev | 4 | no |
| `WHATSAPP_APP_SECRET` | Verificación de firma del webhook | Meta for Developers, panel de la app | 8 | yes |
| `INSTAGRAM_APP_SECRET` | Verificación de firma del webhook | Meta for Developers | 8 | yes |
| `FACEBOOK_APP_SECRET` | Verificación de firma del webhook | Meta for Developers | 8 | yes |
| `TIKTOK_APP_SECRET` | Verificación de firma del webhook | TikTok for Business, panel de la app | 8 | yes |
| `SMTP_URL` | Envío de correos de invitación | proveedor SMTP elegido por el equipo | 7 | yes |
| `ANTHROPIC_API_KEY` | Autenticación del SDK de Anthropic | consola de Anthropic | 13 | yes |
| `COPILOT_MODEL_ID` | Model ID del copiloto, nunca hardcodeado | `claude-sonnet-5` (ver §17) | 13 | no |
| `TEST_DATABASE_URL` | Base de datos separada para tests de integración | `docker-compose.yml`, mismo Postgres, DB distinta | 3 | no |
| `SEED_ADMIN_PASSWORD` | Password del usuario admin de la org demo que siembra `scripts/seed.ts` | generado por el operador, o `openssl rand -hex 16` para desarrollo | 3 | yes |

`.env.example` se comprueba con cada key presente y valor en blanco u obviamente falso.
`.env` y `.env.*.local` están gitignored. La app valida las variables requeridas al boot (`src/lib/
env.ts`, zod) y falla ruidosamente — nunca cae a un default para un secreto.

**"Required by step" es un contrato con §9**: el validador de `src/lib/env.ts` trata cada variable como
requerida solo desde el step nombrado en esta columna, y opcional antes de ese step (schema zod
construido incrementalmente en cada step que consume una variable nueva, ver §9 rule 9). Las URLs
locales de servicios (`DATABASE_URL`, `REDIS_URL`, `TEST_DATABASE_URL`) están en esta tabla con su
valor local literal, no solo con su propósito.

### Files that must be committed

| File | Why it is committed | Ignore-file exception line |
|---|---|---|
| `.env.example` | Documenta cada variable requerida sin exponer secretos | `.gitignore` excluye `.env` y `.env.*.local` como líneas separadas (no un patrón combinado `.env*`), con la excepción explícita `!.env.example` justo debajo — ver el `.gitignore` literal más abajo |
| `biome.json`, `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `docker-compose.yml`, `docker-compose.prod.yml`, `Caddyfile`, `tsconfig.json` | Configs críticos para que los `Verify` de §9 corran — emitidos en §19.6 (`docker-compose.yml`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `biome.json`) o autorados por el step 3 (`drizzle.config.ts`) / step 17 (`docker-compose.prod.yml`, `Caddyfile`) | no matcheados por ningún patrón del `.gitignore` — ninguno de los suyos apunta a config files |
| `.claude/` (workspace completo) | Configuración del agente que construye el proyecto | ningún patrón del `.gitignore` de este blueprint excluye `.claude/` — no hace falta una excepción `!.claude/**` porque nada lo bloquea en primer lugar |

### Bootstrap

**Orden real, y por qué es exactamente este orden.** `pnpm create next-app` se niega a escribir sobre
un directorio no vacío — y su lista de "archivos tolerados" es corta (`.git`, `.gitignore`, poco más).
Este bundle vive en `blueprints/nucleo-fase-1/` **dentro del propio root del proyecto** (regla del
proyecto: los blueprints se guardan en la raíz del repo), así que en el momento en que el builder
arranca, `blueprints/` ya existe ahí como directorio de primer nivel — y el scaffold lo trata como un
conflicto igual que trataría cualquier archivo de la app. Esto se verificó ejecutando la secuencia real
contra un directorio de scratch: `pnpm create next-app` salió con código 1 y listó `blueprints/` junto
a `.env.example`, `AGENTS.md`, `biome.json`, etc. como "files that could conflict". La secuencia de
abajo resuelve esto reubicando `blueprints/` fuera del árbol de trabajo mientras el scaffold corre, y
restaurándolo antes de copiar `workspace/` — nunca al revés, y nunca copiando `workspace/` antes del
scaffold (ese fue el orden roto: copiar `workspace/` primero deja `biome.json`, `tsconfig.json`,
`docker-compose.yml`, etc. en el árbol, y entonces el scaffold se niega a correr sobre ellos también).

```bash
# orden: archivo de ignore + excepciones → init de repo → primer commit → toolchain →
# scaffold (con blueprints/ reubicado) → copia de workspace/ (idempotente, con excepción
# explícita para biome.json/tsconfig.json) → crear .env desde .env.example (recién
# disponible tras la copia de workspace/) → install → servicios → migrate → seed

# 1. Escribir .gitignore ANTES del primer commit (evita que .env real, node_modules,
#    .next, etc. se rastreen; con las excepciones de la tabla de arriba ya incluidas).
#    .gitignore está en la lista de archivos que `create-next-app` SÍ tolera, así que puede
#    existir ya cuando el scaffold corra en el paso 4.
cat > .gitignore <<'EOF'
node_modules/
.next/
.env
.env.*.local
*.local
!.env.example
.DS_Store
EOF

# 2. Inicializar el repositorio de forma idempotente — el sustrato que los
#    Checkpoints de §9 necesitan. `.git/` también está en la lista tolerada por
#    `create-next-app`, así que puede existir ya cuando el scaffold corra en el paso 4.
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main
git add -A && git commit -m "chore: bootstrap (gitignore)" --allow-empty

# 3. Toolchain — ANTES del scaffold: `pnpm create next-app` necesita el pnpm pineado
#    disponible para correr.
corepack enable --install-directory "$HOME/.local/bin"
corepack prepare pnpm@11.21.0 --activate
node -v   # expect v24.x

# 4. Scaffold — guardado por la presencia de package.json, así que en una re-ejecución
#    sobre un árbol ya scaffoldeado este bloque completo se salta y el `if` sale 0.
#    Mientras corre, `blueprints/` se reubica fuera del árbol de trabajo (ver nota de
#    arriba) y se restaura inmediatamente después, ANTES de tocar workspace/.
if [ ! -f package.json ]; then
  BLUEPRINTS_STAGE="$(mktemp -d)/blueprints"
  mv blueprints "$BLUEPRINTS_STAGE"
  # Si `pnpm create next-app` falla (red, registro caído, prompt inesperado), este trap
  # restaura blueprints/ antes de que el script salga — así un reintento vuelve a
  # encontrar blueprints/ en su lugar en vez de fallar en la propia línea de `mv`.
  trap 'mv "$BLUEPRINTS_STAGE" blueprints 2>/dev/null; rmdir "$(dirname "$BLUEPRINTS_STAGE")" 2>/dev/null || true' EXIT
  pnpm create next-app@latest . --ts --app --tailwind --biome --src-dir --use-pnpm
  trap - EXIT
  mv "$BLUEPRINTS_STAGE" blueprints
  rmdir "$(dirname "$BLUEPRINTS_STAGE")" 2>/dev/null || true
fi

# 5. Copiar el contenido de workspace/ al root del proyecto — forma NO destructiva por
#    defecto: rsync nunca sobreescribe un archivo que el build ya modificó (p. ej.
#    package.json tras pnpm add), y sale 0 tanto si copia como si no toca nada. Ruta
#    completa (`blueprints/nucleo-fase-1/workspace/`), NO `workspace/` a secas — el cwd
#    de todo este bloque es la raíz del proyecto (donde vive `blueprints/`), nunca el
#    propio directorio del bundle. Confirmado con un smoke test real: `workspace/` a
#    secas no resuelve nada porque no existe ahí.
rsync -a --ignore-existing blueprints/nucleo-fase-1/workspace/ ./
# Nunca sobreescritos tras la primera copia: package.json, pnpm-lock.yaml — cualquier
# archivo que un paso posterior edite.
#
# Excepción explícita: `create-next-app` (flags --biome y --ts) TAMBIÉN genera
# biome.json y tsconfig.json con sus propios defaults. --ignore-existing los saltaría
# porque ya existen tras el paso 4 — dejando vigentes los defaults del scaffold en vez
# de los pines de este blueprint (css.parser.tailwindDirectives, schema 2.5.8,
# module: "nodenext", allowImportingTsExtensions, rewriteRelativeImportExtensions,
# exclude de blueprints/). Lo mismo pasa con `CLAUDE.md` (el scaffold deja uno de una
# línea, "@AGENTS.md") y `AGENTS.md` (el bloque `<!-- BEGIN:nextjs-agent-rules -->`
# que `next dev` reescribe) — descubierto en un smoke test real de este blueprint.
# Los cuatro SÍ se sobreescriben a propósito, siempre, porque ningún step posterior
# los edita salvo por su propio contenido (ver §19.6 Cross-artifact value
# reconciliation):
cp blueprints/nucleo-fase-1/workspace/biome.json ./biome.json
cp blueprints/nucleo-fase-1/workspace/tsconfig.json ./tsconfig.json
cp blueprints/nucleo-fase-1/workspace/CLAUDE.md ./CLAUDE.md
cp blueprints/nucleo-fase-1/workspace/AGENTS.md ./AGENTS.md

# 5b. Crear `.env` local desde `.env.example` — recién ahora existe en el árbol, porque el
#     paso 5 de arriba es el que lo copió desde `workspace/`. Idempotente: nunca pisa un
#     `.env` que ya exista (p. ej. en una re-ejecución con secretos ya rellenados a mano).
#     `.env` está gitignored (paso 1). `DATABASE_URL`/`REDIS_URL`/`TEST_DATABASE_URL` ya
#     traen el valor local literal que coincide con `docker-compose.yml`. `BETTER_AUTH_SECRET`
#     y `SEED_ADMIN_PASSWORD` llegan en blanco en `.env.example` — se generan aquí porque los
#     necesitan, respectivamente, el step 4 del build real y el `pnpm db:seed` del paso 8 de
#     este mismo bloque. Los secretos de canal/SMTP/IA quedan en blanco a propósito: no los
#     necesita ningún comando de este Bootstrap, solo pasos posteriores del build real (7, 8, 13).
[ -f .env ] || cp .env.example .env
if [ -z "$(grep '^BETTER_AUTH_SECRET=.' .env || true)" ] && command -v openssl >/dev/null 2>&1; then
  sed -i "s#^BETTER_AUTH_SECRET=.*#BETTER_AUTH_SECRET=$(openssl rand -hex 32)#" .env
fi
if [ -z "$(grep '^SEED_ADMIN_PASSWORD=.' .env || true)" ] && command -v openssl >/dev/null 2>&1; then
  sed -i "s#^SEED_ADMIN_PASSWORD=.*#SEED_ADMIN_PASSWORD=$(openssl rand -hex 16)#" .env
fi
# Cargar .env en el entorno del propio script de Bootstrap — los comandos standalone de
# los pasos 8 y (más abajo) los `Verify` de §9 step 3 dependen de que DATABASE_URL y
# compañía ya estén exportados cuando corren, no solo escritos en el archivo.
set -a
. ./.env
set +a

# 6. Install de seguridad (el scaffold del paso 4 ya corrió su propio install; esto
#    solo confirma que el lockfile sigue coherente tras la copia de workspace/)
pnpm install --frozen-lockfile

# 7. Servicios locales
docker compose up -d postgres redis
timeout 30 bash -c 'until docker compose exec -T postgres pg_isready -U nucleo >/dev/null 2>&1; do sleep 1; done'

# 7b. Base de datos de test — separada de la de desarrollo, idempotente: solo crea
#     nucleo_test si todavía no existe (TEST_DATABASE_URL la referencia desde step 3)
docker compose exec -T postgres psql -U nucleo -d nucleo -tc \
  "SELECT 1 FROM pg_database WHERE datname = 'nucleo_test'" | grep -q 1 || \
  docker compose exec -T postgres psql -U nucleo -d nucleo -c "CREATE DATABASE nucleo_test"

# 8. Migraciones + seed (una vez el schema del step 3 existe)
pnpm db:migrate 2>/dev/null || true
pnpm db:seed 2>/dev/null || true
```

Este bloque se ejecuta, verbatim, por el hilo principal en un directorio de scratch antes de presentar
el blueprint (fase de generación) y por el builder al arrancar la Fase 1 real. Cada línea es segura de
re-ejecutar: el `rsync --ignore-existing` nunca revierte un archivo que el build ya modificó, el
`git init` condicional nunca reinicializa un repo existente, y el bloque de scaffold del paso 4 se
salta por completo (guardado por `[ -f package.json ]`) en cualquier re-ejecución posterior a la
primera — con lo que la reubicación de `blueprints/` tampoco vuelve a ocurrir. El paso 1 del build
order (§9) **no vuelve a correr `pnpm create next-app`**: parte de un árbol donde el scaffold, la
copia de `workspace/` y los servicios ya existen, y continúa desde ahí (`pnpm approve-builds --all`,
upgrades explícitos, el resto de las dependencias de §11 marcadas "Installed by: step 1").

---

## 11. Dependencies

Todos los pines de esta sección vienen del reporte verificado en vivo el **2026-08-14** (provisto en el
prompt de esta sesión de generación) — estado `VERIFIED`. Ninguno se reverificó independientemente por
este agente; se copian tal cual con su fuente y fecha originales.

### Runtime

| Package | Version | Source | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| next | 16.3.1 | registry.npmjs.org/next | 2026-08-14 | §10 Bootstrap (`pnpm create next-app`) | Framework, App Router, `output: "standalone"` |
| react / react-dom | 19.2.8 | registry.npmjs.org/react | 2026-08-14 | §10 Bootstrap | UI library |
| tailwindcss | 4.3.3 | registry.npmjs.org/tailwindcss | 2026-08-14 | §10 Bootstrap | Estilos CSS-first |
| @tailwindcss/postcss | 4.3.3 | registry.npmjs.org/@tailwindcss/postcss | 2026-08-14 | §10 Bootstrap | Plugin PostCSS de Tailwind v4 |
| drizzle-orm | 0.45.2 EXACTO | registry.npmjs.org/drizzle-orm | 2026-08-14 | step 1 | ORM, schema como fuente de verdad |
| pg | ^8.23.0 | registry.npmjs.org/pg | 2026-08-14 | step 1 | Driver Postgres para Node |
| better-auth | 1.6.28 | registry.npmjs.org/better-auth | 2026-08-14 | step 1 | Auth self-hosted |
| @tanstack/react-query | ^5.101.4 | registry.npmjs.org/@tanstack/react-query | 2026-08-14 | step 1 | Estado de servidor en el cliente |
| zod | ^4.4.3 | registry.npmjs.org/zod | 2026-08-14 | step 1 | Validación en cada boundary |
| react-hook-form | ^7.85.0 | registry.npmjs.org/react-hook-form | 2026-08-14 | step 1 | Formularios |
| socket.io | ^4.8.3 | registry.npmjs.org/socket.io | 2026-08-14 | step 1 | Servidor realtime |
| socket.io-client | ^4.8.3 | registry.npmjs.org/socket.io-client | 2026-08-14 | step 1 | Cliente realtime |
| @socket.io/redis-adapter | ^8.3.0 | registry.npmjs.org/@socket.io/redis-adapter | 2026-08-14 | step 1 | Adaptador Redis para Socket.IO multi-instancia |
| bullmq | ^6.1.1 | registry.npmjs.org/bullmq | 2026-08-14 | step 1 | Colas de jobs con reintentos |
| ioredis | ^5.11.1 | registry.npmjs.org/ioredis | 2026-08-14 | step 1 | Cliente Redis para BullMQ y adapter |
| dotenv | ^17.4.2 | registry.npmjs.org/dotenv | 2026-08-14 (verificado independientemente en esta corrección, no en la sesión original de research) | step 1 | Carga `.env` en `drizzle.config.ts`, `scripts/seed.ts` y `tests/setup/env.ts` — pnpm no lo resuelve como transitivo de `drizzle-kit` para código de la app |
| pino | ^10.3.1 | registry.npmjs.org/pino | 2026-08-14 | step 1 (uso extendido en step 16) | Logging estructurado |
| @anthropic-ai/sdk | ^0.117.1 (verificado vía skill `claude-api` en esta corrección — ver §17 para el id de modelo, `claude-sonnet-5`) | registry.npmjs.org/@anthropic-ai/sdk | 2026-08-14 | step 13 (`pnpm add @anthropic-ai/sdk@0.117.1`) | Copiloto — llamadas al modelo |

### Development

| Package | Version | Source | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| typescript | ~6.0.3 | registry.npmjs.org/typescript | 2026-08-14 | step 1 (upgrade explícito sobre el default del scaffold) | TS 7 rechazado — sin API de compilador estable |
| @biomejs/biome | 2.5.8 | registry.npmjs.org/@biomejs/biome | 2026-08-14 | step 1 (upgrade explícito sobre el default del scaffold) | Lint + format |
| vitest | ^4.1.10 | registry.npmjs.org/vitest | 2026-08-14 | step 1 (upgrade explícito sobre el default del scaffold) | Test runner unitario/integración |
| @playwright/test | ^1.62.1 | registry.npmjs.org/@playwright/test | 2026-08-14 | step 1 (upgrade explícito sobre el default del scaffold) | E2E |
| @axe-core/playwright | ^4.13.0 | registry.npmjs.org/@axe-core/playwright | 2026-08-14 (verificado independientemente en esta corrección) | step 16 | Auditoría de accesibilidad automatizada (§15) — `tests/e2e/a11y.spec.ts` |
| drizzle-kit | 0.31.10 EXACTO | registry.npmjs.org/drizzle-kit | 2026-08-14 | step 1 | Migraciones diffeadas |
| @types/react | 19.2.18 | registry.npmjs.org/@types/react | 2026-08-14 | §10 Bootstrap | Tipos |
| @types/react-dom | 19.2.4 | registry.npmjs.org/@types/react-dom | 2026-08-14 | §10 Bootstrap | Tipos |
| shadcn | 4.18.0 | registry.npmjs.org/shadcn (dist-tags) | 2026-08-14 | step 2 (`pnpm dlx shadcn@4.18.0 init --base radix --no-monorepo`) | CLI que genera los componentes de `src/components/ui/`, base Radix explícita |
| tsx | 4.23.1 (condicional) | registry.npmjs.org/tsx | 2026-08-14 | step 1, solo si el type-stripping nativo de Node 24 no cubre `scripts/seed.ts`/`scripts/worker.ts` | Runner de scripts TS standalone — fallback, no siempre instalado |

### Deliberately not used

| Rejected | Instead | Why |
|---|---|---|
| Clerk / Auth0 | better-auth self-hosted | Soberanía de identidad — decisión explícita del cliente |
| Supabase / Neon | Postgres self-hosted en Docker | Soberanía de datos, no dependencia de una plataforma gestionada |
| Vercel | VPS propio + Docker Compose + Caddy | Decisión explícita del cliente |
| ESLint + Prettier | Biome | Un solo tool, más rápido, ya cubierto por el runtime track |
| TypeScript 7 | TypeScript ~6.0.3 | Sin API de compilador estable aún; Next.js lo rechaza sin flag experimental |

### Imágenes Docker (pines, ver §19.6)

| Image | Tag | Source | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| postgres | 17-alpine | hub.docker.com/_/postgres | 2026-08-14 | §19.6 `docker-compose.yml` | Base de datos |
| redis | 8.10.0-alpine3.23 | hub.docker.com/_/redis | 2026-08-14 | §19.6 `docker-compose.yml` | Colas + adaptador realtime + rate limit |

---

## 12. Deployment Strategy

### Hosting

VPS propio, Docker Compose. Imagen de la app: Node 24 slim sobre el output `standalone` de Next.js
(`output: "standalone"` en `next.config.ts`). Build command: `pnpm build`. Runtime: `node
.next/standalone/server.js`.

### Environments

| Environment | Branch | URL | Database | Third-party mode |
|---|---|---|---|---|
| Local | — | localhost:3000 | Postgres local vía Docker Compose | credenciales sandbox de cada canal |
| Producción (VPS) | `main` | IP/puerto del VPS, sin dominio público todavía | Postgres en el mismo VPS | credenciales sandbox hasta validar en piloto, luego producción real por canal |

No hay entorno de Preview automatizado en Fase 1 — el equipo es pequeño y el VPS único sirve como
staging manual antes de promover a producción en el mismo VPS (Fase 2 introduce separación real).

### CI/CD

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. `pnpm test:e2e` (contra servicios levantados en el runner de CI vía el mismo `docker-compose.yml`)
7. En `main`: build de imagen Docker, push al registry privado del VPS (o transferencia directa según
   la infraestructura del equipo), y ejecución de `docker compose -f docker-compose.prod.yml up -d`
   sobre el VPS vía SSH, con las migraciones como paso explícito antes de reiniciar el contenedor de la
   app (§9 step 17).

Este es el mismo conjunto que corre en §20.1 — si un check está en el gate, está en CI.

### Release and rollback

Deploy: se detiene el contenedor viejo solo después de que el healthcheck del nuevo pasa (`docker
compose up -d --no-deps app` con `depends_on` healthcheck). Rollback: `docker compose -f
docker-compose.prod.yml up -d --no-deps app` apuntando a la imagen tageada anterior — reversible en
menos de un minuto siempre que la migración del deploy fallido no haya sido destructiva. Regla: las
migraciones nunca son destructivas en el mismo deploy que el código que deja de usar la columna
(expand-then-contract, §4).

### Domain, DNS, TLS

Sin dominio público asignado en Fase 1 (§1 Non-Goals). Caddy corre configurado para TLS automático,
listo para activarse en cuanto se asigne un dominio en Fase 2 — la configuración en `Caddyfile` usa la
IP del VPS como sirviente temporal.

---

## 13. Testing Strategy

| Layer | Framework | What it covers | Where | Runs |
|---|---|---|---|---|
| Unit | Vitest | Lógica pura: permisos, audit, gateway de IA (mockeado), normalización de eventos de canal | `tests/unit/` | cada commit |
| Integration | Vitest | Rutas de API contra Postgres y Redis reales (Docker Compose) | `tests/integration/` | cada commit |
| E2E | Playwright | Aislamiento de tenant, auth, bandeja en vivo, copiloto | `tests/e2e/` | pre-deploy |

### Critical flows to cover E2E

1. Aislamiento de tenant — un usuario de la organización A nunca puede leer ni mutar un recurso de la
   organización B, verificado contra cada endpoint sensible (step 5).
2. Signup → creación automática de organización → primera conversación visible en la bandeja en vivo
   (steps 4, 11, 12).
3. Copiloto ejecuta una acción de bajo riesgo con aprobación en la primera ejecución, y sin aprobación
   en la segunda (step 14).

### Test data

`TEST_DATABASE_URL` apunta al mismo contenedor Postgres de `docker-compose.yml`, base de datos
separada (`nucleo_test`), nunca la de desarrollo. Cada suite de integración limpia sus tablas en
`beforeEach` vía truncate transaccional — los tests nunca comparten estado mutable ni dependen de orden
de ejecución. El archivo que provisiona el servicio localmente y la variable que apunta a él están
emitidos en §19.6 (`workspace/docker-compose.yml`) y nombrados aquí.

### What is deliberately not tested

Carga/volumen (no hay SLA de throughput definido en Fase 1 — piloto con decenas de organizaciones no lo
exige todavía). Accesibilidad automatizada con axe (§15) corre como gate propio del step 16 y se repite
en §20.1 — cubre `/login`, `/app/inbox` y `/app/settings/members`; no cubre pases manuales de teclado,
lector de pantalla ni zoom 200%, que quedan como checklist manual antes del piloto (§15).

---

## 14. Security & Secrets

| Concern | Control | Implemented in |
|---|---|---|
| Secret storage | Variables de entorno del VPS, nunca en el repo | `.env` (gitignored), `docker-compose.prod.yml` con `env_file` |
| Secret rotation | Manual, documentada en el runbook de deploy (fuera de este blueprint — tarea de operación) | — |
| Input validation | zod en cada handler de ruta | `src/server/**` |
| Output encoding / XSS | React escapa por defecto; ningún `dangerouslySetInnerHTML` en Fase 1 | todo el árbol de componentes |
| SQL injection | Drizzle parametriza siempre — cero SQL concatenado a mano | `src/lib/db/**` |
| AuthN / AuthZ | Ver §8 — server-side en cada request | `src/server/tenancy.ts` |
| CSRF | better-auth valida origen en mutaciones | `src/lib/auth.ts` |
| Rate limiting / abuse | Contador Redis con TTL, 5/min auth, 100/min webhooks | `src/lib/rate-limit.ts` (step 16) |
| Webhook verification | Firma sobre raw body + ledger de idempotencia | `src/server/channels/*.ts` |
| Dependency audit | `pnpm audit` como paso manual antes de cada release (no bloqueante en Fase 1 — se documenta como gap en §20.4) | CI (advisory) |
| Security headers | CSP, HSTS, X-Content-Type-Options, Referrer-Policy vía `next.config.ts` headers() | `next.config.ts` (step 16) |
| PII handling | `contact.phone`/`email` en texto plano en Fase 1 (sin cifrado a nivel de columna) — documentado como gap para Fase 2 cuando el producto salga a producción pública | §20.4 |
| Logging hygiene | pino con redacción de campos sensibles configurada (`redact: ["req.headers.authorization", "*.password"]`) | `src/lib/logger.ts` |

**Hard rules**
- Ningún secreto se comitea, se imprime en un log, se envía a un tracker de errores, ni se embebe en
  un bundle de cliente.
- Todas las verificaciones de autorización server-side corren antes del trabajo, no después.
- Los webhooks de terceros se verifican por firma antes de que su body se parsee como confiable.

Este proyecto no maneja datos regulados de salud, financieros ni de menores en Fase 1. `contact.phone`/
`email` sí es dato personal bajo regímenes generales (GDPR/leyes locales de protección de datos) — la
obligación concreta es minimizar retención y dar el camino de eliminación del §9 step 15; no hay
obligación regulatoria adicional identificada para esta fase piloto sin salida pública.

---

## 15. Accessibility

**Target: WCAG 2.2 Level AA.**

### Baseline requirements

| Requirement | Rule |
|---|---|
| Semantic HTML | Landmarks (`header`/`nav`/`main`/`footer`), un `h1` por página, jerarquía de encabezados en orden |
| Keyboard | Todo elemento interactivo alcanzable y operable por teclado; orden de tab lógico; skip-to-content en el shell de `(app)` |
| Focus visible | Indicador de foco visible en cada elemento enfocable, ≥3:1 contra su fondo |
| Contrast | Texto 4.5:1, texto grande y límites de UI 3:1 — la paleta de §7 ya lo satisface |
| Forms | Cada input con label programático; errores como texto, nunca solo color |
| Images | Imágenes con significado llevan alt text; decorativas llevan `alt=""` |
| Motion | Todo lo animado respeta `prefers-reduced-motion: reduce` |
| Zoom / reflow | Usable al 200% de zoom y a 320px de ancho sin scroll horizontal |
| Live regions | Cambios de estado async (nuevo mensaje entrante) anunciados vía `aria-live="polite"` en la lista de conversaciones |

### WCAG 2.2 additions

| SC | Requirement |
|---|---|
| 2.4.11 Focus Not Obscured | El panel del copiloto y el topbar sticky nunca ocultan por completo el elemento con foco |
| 2.5.8 Target Size (Min) | Botones de acción en la lista de conversaciones ≥24×24px CSS |
| 3.3.8 Accessible Authentication | El login permite pegar la contraseña; sin CAPTCHA ni prueba cognitiva |

### Verification

```bash
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: 0 violations — corre axe sobre /login, /app/inbox, /app/settings/members
```

Los chequeos automatizados cubren aproximadamente un tercio de los problemas reales. Antes del
lanzamiento del piloto: un pase de navegación solo-teclado por el flujo crítico, un pase con lector de
pantalla sobre la bandeja, y un pase de zoom 200% en el breakpoint más angosto.

---

## 16. Observability & Cost

### Instrumentation

| Signal | Tool | What it captures | Who looks at it |
|---|---|---|---|
| Errors | pino (nivel `error`) + revisión manual de logs del VPS | Excepciones no controladas con contexto de request/actor/org, PII redactada | Equipo de desarrollo |
| Logs | pino, JSON estructurado a stdout | Cada línea con `actorId`, `orgId`, `requestId` | Equipo de desarrollo, vía `docker compose logs` |
| Metrics | Consultas SQL manuales sobre `audit_event`, `llm_calls`, `jobs` | Adopción del copiloto, volumen de mensajes por canal, tasa de fallo de jobs | Equipo de producto, semanal |
| Uptime | `scripts/smoke-test.sh` ejecutado manualmente tras cada deploy | `/api/health` responde 200 | Equipo de desarrollo |

No se integra una plataforma de logging gestionada en Fase 1 — el formato JSON de pino queda listo para
recolectarse con un stack self-hosted tipo Loki más adelante, sin construirlo ahora.

### The metrics that matter for this project

| Metric | Target | Alert at |
|---|---|---|
| p95 latencia de `POST /api/webhooks/*` hasta responder 200 | < 1s | > 3s revisar manualmente |
| Tasa de fallo de jobs en `job_dead_letters` / total procesados | < 1% | > 5% en una ventana de 1h |
| Mensajes entrantes procesados por hora | sin objetivo fijo — piloto | caída a 0 con canales conectados activos revisar manualmente |

### Health check

`GET /api/health` verifica: conexión a Postgres responde, conexión a Redis responde, y el número de
migraciones aplicadas coincide con el número de archivos de migración en `drizzle/` — no solo "retorna
200". `scripts/smoke-test.sh` lo consulta tras cada deploy.

### Cost model

| Service | Free tier | Cost at expected v1 scale (decenas de orgs) | Cost at 10× (cientos de orgs) | Cliff to watch |
|---|---|---|---|---|
| VPS (Postgres + Redis + app + worker + Caddy) | — | costo fijo mensual del VPS elegido por el equipo, sin variar con el uso hasta saturar CPU/RAM | mismo VPS puede requerir upgrade de tier o separación de servicios | saturación de CPU en el worker si el volumen de mensajes crece rápido — mover el worker a su propio proceso/VPS |
| @anthropic-ai/sdk (Claude Sonnet 5) | — | bajo, proporcional a turnos de copiloto por conversación cerrada | escala linealmente con adopción del copiloto | ninguno hasta volumen alto — sin caching de prompt configurado todavía, oportunidad de reducción futura |

**Estimated monthly cost at launch: costo del VPS elegido + consumo variable del SDK de Anthropic,
bajo en el piloto.** El ítem más grande es el VPS fijo. La palanca más barata para reducir costo del
copiloto es agregar prompt caching sobre el contexto de la conversación (no implementado en Fase 1,
candidato de optimización futura).

---

## 17. Model Routing

Este proyecto llama un LLM en runtime (el copiloto contextual), así que esta sección lleva contenido
real.

**El id de modelo, contexto y precio se verificaron en esta sesión invocando el skill `claude-api`.**

### Routing table

| Task in this product | Model tier | Why this tier | Fallback |
|---|---|---|---|
| Copiloto conversacional contextual (responder preguntas, tool-use de bajo riesgo) | `claude-sonnet-5` — 1M contexto, streaming y tool-use soportados, thinking adaptativo, $3/$15 por MTok (intro $2/$10 hasta 2026-08-31) | Tier "mid/workhorse" — el nivel apropiado para conversación interactiva con tool calls acotadas; no requiere el razonamiento de mayor esfuerzo de Opus para este alcance | Ninguno configurado en Fase 1 — si `claude-sonnet-5` no está disponible, el copiloto responde con el error tipado de §9 step 13 y el usuario ve "el copiloto no puede ayudar en este momento" |

`COPILOT_MODEL_ID` en `.env.example` tiene como valor por defecto `claude-sonnet-5` — nunca hardcodeado
en el código, siempre leído de config (§9 step 13).

### Prompt and context strategy

El prompt del sistema del copiloto vive en `src/server/copilot/runs.ts` como una constante versionada
(comentario con fecha de última edición) — Fase 1 no necesita un sistema de gestión de prompts más
sofisticado que eso. Contexto por turno: los últimos 20 mensajes de la conversación abierta más el
nombre y etiquetas del contacto. Sin prompt caching configurado en Fase 1 (candidato de optimización de
costo para Fase 2, ver §16).

### Cost controls

Sin límite de gasto por usuario u organización en Fase 1 (piloto de bajo volumen). El límite operativo
es el rate limit de 20 llamadas/minuto por usuario en `/api/v1/copilot` (§5), que acota el gasto
máximo posible por actor.

### Failure handling

Timeout de 30s con un reintento (§9 step 13). Un `stop_reason: "refusal"` se muestra al usuario como
"el copiloto no puede ayudar con esto" sin reintentar. Un error de red tras el reintento se muestra
como "el copiloto no respondió, intenta de nuevo" (§6 error states).

### Evaluation

Sin un conjunto fijo de evaluación automatizada en Fase 1 — el copiloto tiene un alcance
deliberadamente pequeño (responder preguntas + dos tool calls). Antes de cambiar el prompt del sistema
o el modelo, el equipo corre manualmente `tests/e2e/copilot.spec.ts` (fixtures grabados) más una
revisión manual de 10 conversaciones piloto reales. Formalizar un harness de evaluación es candidato de
Fase 2+ cuando el catálogo de tools del copiloto crezca (§20.4).

---

## 18. Skills to Use During Build

| Skill | Build steps | Why | Install |
|---|---|---|---|
| `claude-api` | 13, 14 | Antes de escribir cualquier id de modelo, precio o parámetro de la API de Anthropic — nunca de memoria | Auto-activa; sin instalación adicional — bundled |
| `ui-ux-pro-max` | 2, 7, 11 | Paleta concreta, escala tipográfica, estilo de componentes para la bandeja y el panel del copiloto | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` luego `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| `playwright-cli` | 5, 11, 12, 14, 15, 18 | Los suites E2E de aislamiento de tenant, bandeja en vivo y copiloto se benefician de herramientas de depuración de Playwright | `npm install -g @playwright/cli@latest` luego `playwright-cli install --skills` |

Ningún skill de este blueprint es una dependencia dura — si no está instalado, el builder sigue la guía
propia de este documento y lo nota en una línea al llegar a ese paso.

---

## 19. Agent Workspace

Bundle mode: los artefactos siguientes se escriben como archivos reales bajo `workspace/` en el bundle
y el builder los copia al root del proyecto con el comando de Bootstrap (§10) antes del step 1.

### 19.1 `CLAUDE.md`

Ver `workspace/CLAUDE.md` — contenido completo reproducido a continuación por integridad del
documento.

```markdown
# Núcleo — Fase 1: Centro de Comunicación

Bandeja unificada multicanal con copiloto de IA contextual, para pequeñas y medianas empresas.

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
| Worker | `pnpm worker` |
| Servicios locales up/down | `pnpm services:up` · `pnpm services:down` · `pnpm services:reset` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` debe pasar antes de marcar cualquier tarea como
hecha.

Runtime pineado en `.nvmrc` (24.19.0). Versiones de dependencias en `pnpm-lock.yaml` — léelo, nunca
adivines una versión.

## Stack

Next.js 16 (App Router, standalone) · TypeScript 6.0.3 · Tailwind CSS 4 · shadcn/Radix · Postgres 17 ·
Drizzle ORM · better-auth · BullMQ + ioredis · Socket.IO + adaptador Redis · @anthropic-ai/sdk · Docker
Compose + Caddy en VPS propio.

## Architecture

**Request path.** Navegador → `src/app/(app)/inbox/page.tsx` (Server) → `src/server/conversations.ts`
→ `src/lib/db/index.ts` → Postgres. Mutaciones desde rutas API en `src/app/api/**/route.ts`, cada una
llamando primero `src/server/tenancy.ts` `requirePermission()`.

Webhooks entrantes: `src/app/api/webhooks/<canal>/route.ts` → `src/server/channels/<canal>.ts`
(verifica firma, normaliza) → encola en `src/lib/queue/index.ts` → `scripts/worker.ts` procesa → llama
`src/server/conversations.ts` / `src/server/contacts.ts` → emite evento vía `src/lib/realtime/server.ts`.

**Boundaries.**

| Layer | May import from | Must never |
|---|---|---|
| `src/app/**` (rutas) | `components`, `server`, `lib` | Importar `lib/db/` directamente |
| `src/components/**` | `lib`, otros componentes | Importar `server/` o `lib/db/` |
| `src/server/**` | `lib/db`, `lib` | Importar React ni nada de `components/` |
| `src/lib/db/**` | nada interno | Importar `server/` |

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Schema de BD | `src/lib/db/schema.ts` — cambiar aquí, luego `pnpm db:generate && pnpm db:migrate` |
| Acceso a env | `src/lib/env.ts` — validado al boot; nunca leer `process.env` en otro lugar |
| Tokens de diseño | `src/app/globals.css` bajo `@theme` — sin hex/px sueltos en componentes |
| Verificación de tenant | `src/server/tenancy.ts` `requirePermission()` — toda mutación/lectura sensible lo llama primero |
| Audit log | `src/lib/audit.ts` `recordAuditEvent()` — único punto de escritura a `audit_event`, misma transacción que el cambio |
| Sesión de auth | `src/lib/auth.ts` — una sola `getSession()`, usada en todas partes |
| Gateway de IA | `src/lib/ai/gateway.ts` — único wrapper del SDK de Anthropic |

## Code rules

1. **Un componente por archivo. Máximo 300 líneas.** Más largo significa que debe dividirse.
2. **Alias de path `@/` → `src/`.** Sin `../../..`.
3. **Server-first.** Componentes son Server Components por defecto. `"use client"` solo en la hoja que
   necesita estado/eventos, nunca en un layout.
4. **Sin barrel files.** Importa del módulo fuente directamente.
5. **Valida en el borde.** Cada route handler parsea su input con zod antes de tocar lógica de negocio.
6. **Toda mutación pasa por `requirePermission()` primero.** Sin excepciones, incluidos los webhooks
   (que verifican firma en vez de sesión, pero igual resuelven la org antes de escribir).
7. **`recordAuditEvent()` va dentro de la misma transacción que el cambio que describe.** Nunca
   después.
8. **`COPILOT_MODEL_ID` nunca se hardcodea.** Siempre `env.COPILOT_MODEL_ID`.
9. **Ninguna migración se edita a mano tras generarse.** Corrige con una migración nueva.
10. **No agregar dependencia nueva sin razón en el mensaje de commit.**

## Design system

Tokens definidos una vez en `src/app/globals.css` bajo `@theme`. Componentes referencian nombres de
token únicamente.

| Role | Value | Used for |
|---|---|---|
| Primary | `#1D4ED8` (light) / `#3B82F6` (dark) | Botones primarios, links, focus ring |
| Background | `#F8FAFC` / `#0B1220` | Fondo de página |
| Surface | `#FFFFFF` / `#131B2E` | Cards, paneles, modales |
| Border | `#E2E8F0` / `#233046` | Divisores, bordes de input |
| Text | `#0F172A` / `#E2E8F0` | Cuerpo |
| Muted text | `#64748B` / `#8B98AE` | Texto secundario |
| Destructive | `#DC2626` / `#F87171` | Errores, eliminar |
| Success | `#16A34A` / `#4ADE80` | Confirmaciones |

- **Type:** Inter para display/heading/body; JetBrains Mono para código.
- **Scale:** 32px display / 20px heading / 15px body / 13px mono.
- **Spacing:** base 4px — 4, 8, 12, 16, 24, 32, 48, 64. Sin valores arbitrarios.
- **Radius:** 8px inputs/botones, 12px cards, full avatares.
- **Motion:** 150-200ms, `ease-out`/`ease-in-out`. Solo transform y opacity. Respeta
  `prefers-reduced-motion`.
- **Layout:** ancho máximo 1280px; breakpoints sm/md/lg/xl.

## Environment

| Variable | Required | Used by | Source |
|---|---|---|---|
| `DATABASE_URL` | yes | `src/lib/db/index.ts` | `docker-compose.yml` local |
| `REDIS_URL` | yes | `src/lib/queue/connection.ts`, `src/lib/realtime/server.ts` | `docker-compose.yml` local |
| `BETTER_AUTH_SECRET` | yes | `src/lib/auth.ts` | `openssl rand -hex 32` |
| `WHATSAPP_APP_SECRET`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET`, `TIKTOK_APP_SECRET` | yes desde step 8 | `src/server/channels/*.ts` | panel de developer de cada plataforma |
| `SMTP_URL` | yes desde step 7 | `src/server/members.ts` | proveedor SMTP del equipo |
| `ANTHROPIC_API_KEY` | yes desde step 13 | `src/lib/ai/gateway.ts` | consola de Anthropic |
| `COPILOT_MODEL_ID` | yes desde step 13 | `src/lib/ai/gateway.ts` | `claude-sonnet-5` por defecto |

`.env.example` está comprometido y se mantiene sincronizado. `.env*` con valores reales nunca lo está.

## Rules

Convenciones diferidas — lee el archivo correspondiente antes de editar esa área:

| File | Applies to |
|---|---|
| `.claude/rules/database.md` | `src/lib/db/**`, `drizzle/**` |
| `.claude/rules/tenancy.md` | `src/server/**`, `src/app/api/**` |
| `.claude/rules/copilot.md` | `src/server/copilot/**`, `src/lib/ai/**` |

## Non-negotiable

1. Toda mutación llama `requirePermission()` antes de tocar datos — sin excepciones.
2. `recordAuditEvent()` va en la misma transacción que el cambio, nunca en un paso separado.
3. Nunca commitear secretos, `.env`, ni output de build.
4. Nunca editar a mano una migración generada — genera una nueva.
5. Los webhooks de canal verifican firma sobre el raw body antes de parsear el payload.
6. Nunca marcar una tarea hecha con un comando de gate fallando.
```

### 19.2 `AGENTS.md`

```markdown
# Núcleo — Fase 1 — agent instructions

Bandeja unificada multicanal con copiloto de IA contextual para pequeñas y medianas empresas.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Tests | `pnpm test` · E2E: `pnpm test:e2e` |
| DB migrate | `pnpm db:migrate` |

## Non-negotiable

1. Toda mutación llama `requirePermission()` antes de tocar datos — sin excepciones.
2. `recordAuditEvent()` va en la misma transacción que el cambio, nunca en un paso separado.
3. Nunca commitear secretos, `.env`, ni output de build.
4. Nunca editar a mano una migración generada — genera una nueva.
5. Los webhooks de canal verifican firma sobre el raw body antes de parsear el payload.
6. Nunca marcar una tarea hecha con un comando de gate fallando.

Arquitectura completa, boundaries y tokens de diseño: ver `CLAUDE.md` en este directorio.
```

### 19.3 `.claude/settings.json`

Ver contenido completo en §19.6 (se emite una sola vez; el archivo real vive en
`workspace/.claude/settings.json`).

### 19.4 Project skills — `.claude/skills/<name>/SKILL.md`

| Skill | Triggers on | What it automates |
|---|---|---|
| `add-migration` | "agrega una migración", cambio de schema | Flujo seguro: editar schema → generar → revisar → migrar |
| `add-channel-webhook` | "agrega soporte para el canal X" | Plantilla del patrón de verificación de firma + normalización usado por los 4 canales existentes |
| `add-copilot-tool` | "agrega una acción al copiloto" | Flujo para registrar una nueva tool call de bajo riesgo con su permiso y aprobación en primer uso |

```markdown
---
name: add-migration
description: Genera y aplica una migración de Drizzle de forma segura después de editar el schema en
  src/lib/db/schema.ts. Usar cada vez que se agregue, elimine o modifique una tabla o columna.
---

# Add Migration

## When to use
Después de cualquier cambio en `src/lib/db/schema.ts` — nueva tabla, nueva columna, cambio de
constraint.

## Steps
1. Edita `src/lib/db/schema.ts` con el cambio deseado, siguiendo el patrón de las tablas existentes
   (id uuid, org_id con índice si es tenant-owned, created_at/updated_at donde aplique).
2. Corre `pnpm db:generate` — esto crea el archivo de migración con el nombre que la herramienta
   decide. Nunca inventes el nombre del archivo antes de correr el comando.
3. Revisa el SQL generado en `drizzle/<archivo-generado>.sql` antes de aplicarlo.
4. Corre `pnpm db:migrate` contra tu base de datos local.
5. Si la migración es destructiva (drop column, not-null sin default), verifica que no vaya en el
   mismo deploy que el código que aún depende del shape viejo — expand-then-contract.

## Verify
```bash
pnpm db:migrate   # expect: exit 0
pnpm test tests/unit/schema.test.ts   # expect: exit 0 — confirma que las tablas esperadas existen
```

## Do not
- No edites un archivo de migración ya generado y aplicado — genera una nueva migración.
- No nombres el archivo de migración a mano en ningún comentario o documentación — su nombre lo decide
  `drizzle-kit generate`.
```

```markdown
---
name: add-channel-webhook
description: Plantilla para agregar soporte de webhook a un canal nuevo, siguiendo el patrón de
  verificación de firma + normalización usado por whatsapp/instagram/facebook/tiktok. Usar cuando se
  pida soportar un canal adicional (email, telegram, u otro).
---

# Add Channel Webhook

## When to use
Al agregar un canal nuevo más allá de los 4 de Fase 1 — email, telegram, o cualquier otro.

## Steps
1. Crea `src/server/channels/<canal>.ts` con `verifySignature(rawBody, signature, secret)` y
   `normalizeInboundEvent(payload)` que retorna el shape común `{ externalAccountId, externalEventId,
   contactExternalId, contactName, body, mediaUrls }` — mismo shape que los 4 canales existentes.
2. VERIFY: confirma la versión vigente de la API del proveedor y el formato exacto de su payload de
   webhook contra la documentación oficial antes de escribir el parseo — nunca de memoria.
3. Crea `src/app/api/webhooks/<canal>/route.ts` siguiendo exactamente el mismo patrón de las 4 rutas
   existentes: verificar firma → chequear idempotencia → encolar job → responder 200.
4. Agrega el nuevo valor al enum-como-texto `channel` en `src/lib/db/schema.ts` si aún no está (email
   y telegram ya están preparados como valores del enum desde Fase 1).
5. Escribe `tests/integration/webhooks-<canal>.test.ts` con fixtures grabados, sin llamadas reales al
   proveedor.

## Verify
```bash
pnpm test tests/integration/webhooks-<canal>.test.ts   # expect: exit 0
```

## Do not
- No agregues un canal sin verificar la versión de API vigente primero.
- No dupliques la lógica de idempotencia — reutiliza el mismo patrón de `idempotency_keys`.
```

```markdown
---
name: add-copilot-tool
description: Flujo para registrar una nueva tool call de bajo riesgo en el catálogo del copiloto, con
  su permiso y aprobación en el primer uso. Usar cuando se pida que el copiloto pueda hacer una acción
  nueva.
---

# Add Copilot Tool

## When to use
Al agregar una acción nueva que el copiloto pueda ejecutar sobre datos de esta fase (nunca acciones de
envío a canal externo — esas requieren un rediseño del patrón de aprobación, fuera de alcance de Fase
1).

## Steps
1. Define la tool en `src/server/copilot/tools.ts` con su `name`, `description` (prescriptiva sobre
   cuándo usarla), `input_schema`, el `permission_key` que requiere, y `requiresApprovalFirstUse: true`.
2. Implementa el handler que ejecuta la mutación real, llamando `requirePermission()` y
   `recordAuditEvent()` como cualquier otra mutación.
3. Confirma que `src/server/copilot/runs.ts` reconoce el nuevo `tool_name` en su lógica de
   aprobación-en-primer-uso — no debería requerir cambios si sigues el patrón existente.
4. Agrega un caso a `tests/e2e/copilot.spec.ts` con un fixture grabado de la respuesta del modelo
   invocando la nueva tool.

## Verify
```bash
pnpm test:e2e tests/e2e/copilot.spec.ts   # expect: exit 0
```

## Do not
- No marques una tool como `requiresApprovalFirstUse: false` sin justificación explícita — el patrón
  de aprobación es la salvaguarda contra acciones no deseadas del copiloto.
- No agregues una tool que envíe mensajes a un canal externo sin rediseñar el flujo de aprobación —
  fuera de alcance de Fase 1.
```

### 19.5 `.claude/rules/*.md`

| File | `paths` globs | Covers |
|---|---|---|
| `.claude/rules/database.md` | `src/lib/db/**`, `drizzle/**` | Convenciones de schema y migraciones |
| `.claude/rules/tenancy.md` | `src/server/**`, `src/app/api/**` | Aislamiento de tenant y permisos |
| `.claude/rules/copilot.md` | `src/server/copilot/**`, `src/lib/ai/**` | Patrón runs/steps/tool_calls/approvals |

```markdown
---
description: Convenciones de schema de base de datos y migraciones
paths:
  - "src/lib/db/**"
  - "drizzle/**"
---

- Toda tabla tenant-owned lleva `org_id` con índice y not-null.
- Toda tabla lleva `id uuid default gen_random_uuid()` y `created_at timestamptz`.
- Soft-delete (`deleted_at`) solo en `contact`, `conversation`, `channel_connection` — nunca en
  `audit_event`, `message`, `jobs` (son append-only/event-like).
- Nunca edites un archivo bajo `drizzle/` que ya se generó y aplicó — genera una migración nueva con
  `pnpm db:generate`.
- El nombre del archivo de migración lo decide `drizzle-kit` — nunca lo inventes en código ni
  documentación.
- Toda relación usa `references()` de Drizzle, nunca una FK sin declarar en el schema.
```

```markdown
---
description: Aislamiento de tenant y verificación de permisos
paths:
  - "src/server/**"
  - "src/app/api/**"
---

- Toda mutación o lectura sensible llama `requirePermission(session, orgId, permissionKey)` de
  `src/server/tenancy.ts` como primera línea del handler.
- Un fallo de `requirePermission` se traduce siempre a **404**, nunca a 403 — cruzar el límite de
  tenant no debe revelar que el recurso existe en otra organización.
- El `org_id` que se pasa a `requirePermission` viene del recurso que se está accediendo (resuelto
  desde la BD), nunca de un parámetro de query o body enviado por el cliente sin verificar.
- `recordAuditEvent()` de `src/lib/audit.ts` va dentro de la misma transacción Drizzle que la mutación
  que describe.
```

```markdown
---
description: Patrón runs/steps/tool_calls/approvals del copiloto
paths:
  - "src/server/copilot/**"
  - "src/lib/ai/**"
---

- `src/lib/ai/gateway.ts` es el único módulo que importa `@anthropic-ai/sdk`. Ningún otro archivo lo
  importa directamente.
- El model ID nunca se hardcodea — siempre `env.COPILOT_MODEL_ID`.
- Cada tool call marcada `requiresApprovalFirstUse: true` cuyo `tool_name` la organización nunca ha
  aprobado antes se detiene en estado `pending` con una fila en `approvals` sin decisión — nunca se
  ejecuta antes de la aprobación.
- Cada `tool_calls` lleva un `idempotency_key` único que previene doble ejecución en reintentos.
- El catálogo de tools de Fase 1 nunca incluye una acción que envíe contenido a un canal externo.
```

### 19.6 Verify-critical config and local infrastructure

| File | Path in the project | Which `Verify` commands need it | Resolution/env handling it carries | Bundle-path exclusion |
|---|---|---|---|---|
| `docker-compose.yml` | `docker-compose.yml` | steps 1, 3, 5-18 (todo lo que toca Postgres/Redis) | conexión local vía `DATABASE_URL`/`REDIS_URL` en `.env.example` | `n/a — no es un tool que camina el árbol` |
| `biome.json` | `biome.json` | steps 1-18 (`pnpm lint`) | `css.parser.tailwindDirectives: true`; `files.includes` con negación (`!blueprints`, `!.next`, `!drizzle`, `!public`) excluye esos directorios de raíz — verificado en un smoke test real que `experimentalScannerIgnores` con un patrón glob (`"blueprints/**"`) NO evita que Biome descubra `blueprints/nucleo-fase-1/workspace/biome.json` como una segunda config raíz ("Found a nested root configuration"), y que aunque un nombre plano en `experimentalScannerIgnores` sí evita esa colisión de config, sigue escaneando y falla en lint los archivos dentro de esos directorios; `files.includes` con negación es el único mecanismo que resuelve ambos problemas a la vez. `public` se excluye porque los SVG placeholder que el scaffold genera (`file.svg`, `globe.svg`, etc.) fallan `lint/a11y/noSvgWithoutTitle` — son assets estáticos, no código de la app | `files.includes: ["**", "!blueprints", "!.next", "!drizzle", "!public"]` |
| `tsconfig.json` | `tsconfig.json` | steps 1-18 (`pnpm typecheck`) | `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, alias `@/*`; `exclude` con `blueprints` | `"exclude": ["node_modules", "blueprints"]` |
| `vitest.config.ts` | `vitest.config.ts` | steps 3, 5, 6, 7, 8, 9, 10, 13, 15, 16, 18 | alias `@/` resuelto vía `resolve.alias`; `setupFiles` carga `tests/setup/env.ts` (ver la fila de más abajo — ningún step crea `.env.test`, así que su `dotenv.config()` es un no-op intencional y los `??=` del propio `env.ts` son el mecanismo real); excluye `blueprints/**` | `exclude: ["**/blueprints/**", ...defaults]` |
| `playwright.config.ts` | `playwright.config.ts` | steps 2, 5, 11, 12, 14, 15, 18 | `webServer` levanta `pnpm dev`, que carga `.env` de forma nativa (comportamiento propio de Next.js) — corre contra la base de datos de **desarrollo** (`DATABASE_URL`), no `TEST_DATABASE_URL`; `testDir` excluye `blueprints/` implícitamente al apuntar solo a `tests/e2e` | `testDir: "./tests/e2e"` — nunca camina fuera de esa carpeta |
| `tests/setup/env.ts` | `tests/setup/env.ts` | vitest.config.ts lo carga como `setupFiles` | intenta cargar `.env.test` vía `dotenv` — ningún step de este blueprint crea ese archivo, así que la llamada es un no-op silencioso por diseño; el mecanismo real es el resto del archivo, que puebla `process.env` con `??=` (valores idénticos a `docker-compose.yml`) antes de que `src/lib/env.ts` se importe en cualquier test; `drizzle.config.ts` y `scripts/seed.ts` cargan `.env` por su cuenta con `import "dotenv/config"` (§9 step 3), y el Bootstrap de §10 carga `.env` en su propio shell con `set -a && . ./.env && set +a` | `n/a` |
| `.env.example` | `.env.example` | todos los steps — documenta cada variable | ninguna variable real, solo placeholders | `n/a` |
| `.claude/settings.json` | `.claude/settings.json` | permite que el builder corra los comandos de Verify sin prompt | ver contenido abajo | `n/a` |

#### Resolution convention matrix

**La convención, dicha una vez:** especificadores relativos `.ts` en el código fuente
(`import { db } from "./index.ts"`, nunca `.js`), habilitado por `allowImportingTsExtensions: true` +
`rewriteRelativeImportExtensions: true` en `tsconfig.json` — exactamente la convención que
`knowledge/runtime-tracks/ts-node.md` documenta como la única decisión de este track que no debe
reabrirse.

| Context | Command that exercises it | Convention as it appears there | Config + literal setting that makes it work |
|---|---|---|---|
| Application source | `pnpm dev` / `pnpm build` | `.ts` relativo | `tsconfig.json` — `allowImportingTsExtensions: true`, resuelto por el bundler de Next/Turbopack, que acepta ambas formas |
| Test files | `pnpm test` (Vitest) | `.ts` relativo | `vitest.config.ts` — Vitest resuelve `.ts` nativamente vía esbuild, ninguna config adicional necesaria |
| Standalone scripts | `pnpm db:seed` (`tsx scripts/seed.ts`), `pnpm worker` (`tsx scripts/worker.ts`) | `.ts` relativo | `tsx` resuelve `.ts` literalmente vía su propio loader — coincide con la convención sin config adicional |
| Build / bundle | `pnpm build` (Next standalone output) | `.ts` en la fuente, reescrito a `.js` en el output | `tsconfig.json` — `rewriteRelativeImportExtensions: true` hace que el output final en `.next/standalone/` corra en Node plano sin loader |

Los cuatro contextos usan **la misma forma de especificador** (`.ts` relativo) sin necesitar ningún
ajuste divergente — a diferencia del caso documentado en el runtime track donde un script corrido con
`node` plano (sin `tsx`) requeriría la forma `.js`. Aquí todo script standalone corre vía `tsx`
(pineado en devDependencies, aunque no listado aparte porque Node 24 lo trae vía type-stripping nativo
según el runtime track — se confirma en step 1 que `tsx` no es necesario si el type-stripping nativo de
Node 24 cubre `scripts/seed.ts` y `scripts/worker.ts`; si no, se instala `tsx@4.23.1` como devDependency
en ese mismo paso).

#### Cross-artifact value reconciliation

| Shared value | Single source | Literal value | Every other place it appears | Compared |
|---|---|---|---|---|
| Puerto de la app | `docker-compose.prod.yml` (servicio `app`, step 17 — `docker-compose.yml` de dev bajo `workspace/` solo trae `postgres`/`redis`, sin servicio `app`) | `3000` | `.env.example` (`BETTER_AUTH_URL=http://localhost:3000`), `Caddyfile` (`reverse_proxy app:3000`), `playwright.config.ts` (`baseURL`) | yes |
| Nombre de la base de datos de test | §10 Bootstrap, paso 7b (`CREATE DATABASE nucleo_test`, idempotente, corre tras el `postgres` de `docker-compose.yml`) | `nucleo_test` | `.env.example` (`TEST_DATABASE_URL`), `tests/setup/env.ts` | yes |
| Output del build de Next | `next.config.ts` | `output: "standalone"` → `.next/standalone/server.js` | `Dockerfile` (`CMD ["node", ".next/standalone/server.js"]`), step 1 Verify (`test -d .next/standalone`) | yes |
| Imagen de Postgres | `docker-compose.yml` | `postgres:17-alpine` | §11 tabla de imágenes Docker | yes |
| Imagen de Redis | `docker-compose.yml` | `redis:8.10.0-alpine3.23` | §11 tabla de imágenes Docker | yes |
| Ruta de exclusión del bundle | cada config que camina el árbol | `blueprints/` | `biome.json`, `tsconfig.json`, `vitest.config.ts` | yes |

#### Byte-exact artifact reconciliation

NOT APPLICABLE — este blueprint no autora ningún golden file, fixture de expected-output byte-exacto,
ni snapshot baseline que un `Verify` compare carácter por carácter contra un literal escrito de
antemano. Los tests de integración de webhooks (step 8) usan fixtures de **entrada** (payloads de
ejemplo grabados de la documentación del proveedor, verificados por el builder en ese paso, no
generados por este documento) y afirman **propiedades del resultado** (se creó un mensaje, se respondió
200) en vez de comparar un output completo byte a byte.

---

Contenido completo de los archivos emitidos bajo `workspace/` (bundle mode: estos son archivos reales
en el bundle, reproducidos aquí por integridad del documento único):

**`workspace/docker-compose.yml`**
```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: nucleo
      POSTGRES_PASSWORD: nucleo_dev_password
      POSTGRES_DB: nucleo
    ports:
      - "5432:5432"
    volumes:
      - nucleo_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nucleo"]
      interval: 2s
      timeout: 5s
      retries: 15
  redis:
    image: redis:8.10.0-alpine3.23
    ports:
      - "6379:6379"
    volumes:
      - nucleo_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 15
volumes:
  nucleo_postgres_data:
  nucleo_redis_data:
```

**`workspace/biome.json`**
```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.8/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": false,
    "includes": ["**", "!blueprints", "!.next", "!drizzle", "!public"]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "css": {
    "parser": { "tailwindDirectives": true }
  },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

**`workspace/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "blueprints"]
}
```

**`workspace/vitest.config.ts`**
```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/env.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/blueprints/**",
      "**/tests/e2e/**",
    ],
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

**`workspace/tests/setup/env.ts`**
```typescript
// Intenta cargar .env.test antes de que cualquier módulo importe src/lib/env.ts.
// Vitest evalúa setupFiles antes de los archivos de test. Ningún step de este
// blueprint crea .env.test, así que esta llamada es un no-op silencioso por
// diseño — el mecanismo real son los `??=` de abajo.

import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../.env.test") });

// Valores mínimos garantizados para que el validador de env no falle el boot
// en la suite unitaria, que no toca servicios reales.
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  "postgres://nucleo:nucleo_dev_password@localhost:5432/nucleo_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET ??=
  "test-secret-not-for-production-0000000000000000";
process.env.COPILOT_MODEL_ID ??= "claude-sonnet-5";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
```

**`workspace/playwright.config.ts`**
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
```

**`workspace/.env.example`**
```bash
# Base de datos (local vía docker-compose.yml)
DATABASE_URL=postgres://nucleo:nucleo_dev_password@localhost:5432/nucleo
TEST_DATABASE_URL=postgres://nucleo:nucleo_dev_password@localhost:5432/nucleo_test

# Redis (colas, adaptador realtime, rate limiting)
REDIS_URL=redis://localhost:6379

# Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Canales — obtener del panel de developer de cada plataforma
WHATSAPP_APP_SECRET=
INSTAGRAM_APP_SECRET=
FACEBOOK_APP_SECRET=
TIKTOK_APP_SECRET=

# Correo saliente (invitaciones)
SMTP_URL=

# Copiloto de IA
ANTHROPIC_API_KEY=
COPILOT_MODEL_ID=claude-sonnet-5

# Seed de desarrollo
SEED_ADMIN_PASSWORD=
```

**`workspace/.claude/settings.json`**
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm create next-app*)",
      "Bash(pnpm approve-builds:*)",
      "Bash(pnpm add:*)",
      "Bash(pnpm dlx:*)",
      "Bash(pnpm install:*)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm test:*)",
      "Bash(pnpm build)",
      "Bash(pnpm dev:*)",
      "Bash(pnpm db\\:migrate:*)",
      "Bash(pnpm db\\:generate:*)",
      "Bash(pnpm db\\:seed:*)",
      "Bash(pnpm db\\:studio:*)",
      "Bash(pnpm worker:*)",
      "Bash(pnpm services\\:up:*)",
      "Bash(pnpm services\\:down:*)",
      "Bash(pnpm services\\:reset:*)",
      "Bash(pnpm exec biome check:*)",
      "Bash(pnpm exec tsc:*)",
      "Bash(pnpm exec vitest:*)",
      "Bash(pnpm exec playwright:*)",
      "Bash(pnpm exec drizzle-kit:*)",
      "Bash(docker compose up:*)",
      "Bash(docker compose down:*)",
      "Bash(docker compose ps:*)",
      "Bash(docker compose exec:*)",
      "Bash(docker inspect:*)",
      "Bash(psql:*)",
      "Bash(curl -s -o /dev/null*)",
      "Bash(test:*)",
      "Bash(timeout:*)",
      "Bash(node:*)",
      "Bash(kill:*)",
      "Bash(sleep:*)",
      "Bash(grep:*)",
      "Bash(cat:*)",
      "Bash(corepack:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git tag:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git init:*)",
      "Bash(git rev-parse:*)",
      "Bash(git ls-files:*)",
      "Bash(bash scripts/smoke-test.sh:*)",
      "Bash(rsync -a --ignore-existing*)",
      "Bash(mktemp:*)",
      "Bash(mv:*)",
      "Bash(rmdir:*)",
      "Bash(cp blueprints/nucleo-fase-1/workspace/*)",
      "Bash(cp .env.example*)",
      "Bash(sed:*)",
      "Bash(openssl:*)",
      "Bash(set -a*)",
      "Bash(. ./.env*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Bash(git push:*)",
      "Bash(git reset --hard*)",
      "Bash(docker compose down -v*)"
    ]
  }
}
```

---

## 20. Acceptance Gate, Risks & Decision Log

### 20.1 Global acceptance gate

El proyecto está **hecho** cuando cada comando de abajo sale con 0 en un checkout limpio, y no antes.
Este es el mismo conjunto que corre CI y contra el que se mide cada step de §9.

```bash
pnpm install --frozen-lockfile         # expect: exit 0, sin modificar el lockfile
pnpm exec biome check .                # expect: exit 0, cero errores/warnings
pnpm exec tsc --noEmit                 # expect: exit 0, cero errores
pnpm test                              # expect: exit 0, 0 failed, 0 skipped
docker compose up -d postgres redis
pnpm db:migrate                        # expect: exit 0
pnpm test:e2e                          # expect: exit 0, 0 failed
pnpm build                             # expect: exit 0
node .next/standalone/server.js &
sleep 2
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health)" = 200
                                        # expect: exit 0 — prueba que el artefacto que el build produjo se ejecuta
kill %1
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: 0 violations
```

Cada línea sale 0 en un build correcto — ninguna asume un exit no-cero como éxito. Ningún warning se
ignora.

Además, estos gates manuales, cada uno verificado una vez antes de dar por cerrada la Fase 1:

- [ ] Cada step de §9 tiene su tag de checkpoint en git (`git tag -l 'step-*'` lista 18).
      El repositorio donde viven estos tags lo crea el Bootstrap de §10, no un scaffolder.
- [ ] Cada archivo listado en §10 *Files that must be committed* está presente en un checkout limpio
      (`git ls-files --error-unmatch <path>` sale 0 para cada uno, un path por invocación) — ningún
      patrón de ignore lo tragó.
- [ ] El archivo de ignore estaba en su lugar antes del primer commit: `git log --diff-filter=A
      --format=%H -- .gitignore` muestra que se agregó en el commit de Bootstrap, no en un commit de
      step posterior.
- [ ] §19.6 no tiene filas de *Byte-exact artifact reconciliation* pendientes — la sección entera es
      NOT APPLICABLE, confirmado.
- [ ] El Bootstrap de §10 se re-ejecutó una vez sobre un árbol ya bootstrapeado, **salió 0**, y no
      revirtió nada relevante: `package.json` sigue listando todas las dependencias instaladas y el
      siguiente comando sigue encontrando sus binarios.
- [ ] Cada fila de *Cross-artifact value reconciliation* (§19.6) dice `Compared: yes`, y los gates de
      lint/format/typecheck de arriba corrieron desde el root del proyecto **con el bundle presente**.
- [ ] §9.1 es NOT APPLICABLE — greenfield, sin cutover que verificar.
- [ ] Cada non-goal de §1 sigue sin construirse.
- [ ] Cada variable de entorno de §10 está seteada en producción y ausente del repo.
- [ ] Los 3 flujos E2E críticos de §13 pasan contra la URL del VPS de staging.
- [ ] Pase de navegación solo-teclado y un pase con lector de pantalla sobre el flujo primario (§15).
- [ ] Se disparó un error de prueba deliberado y se confirmó que aparece en los logs estructurados
      (§16).
- [ ] Se ejecutó un rollback una vez, a propósito, sobre el entorno de staging (§12).

### 20.2 Risk register

| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---|---|---|---|
| Los payloads/versiones de API de WhatsApp, Instagram, Facebook y TikTok cambian o difieren de lo asumido en el step 8, combinado con aislamiento estricto de tenant en cada mensaje entrante | H | H | El fixture grabado de un canal deja de coincidir con un payload real durante pruebas manuales contra sandbox | El step 8 exige verificación explícita de la versión de API vigente antes de implementar cada canal (marcado VERIFY en el propio paso); cada canal se prueba primero contra su sandbox oficial antes de conectarlo a una org real |
| Límites de rate por canal y expiración de tokens de acceso causan pérdida silenciosa de mensajes entrantes | M | H | `job_dead_letters` crece para un canal específico | El worker (step 9) tiene dead-letter con el error completo; alertar manualmente si `job_dead_letters` supera el umbral de §16 |
| El adaptador Redis de Socket.IO no se prueba bajo carga real de múltiples instancias antes del piloto | M | M | Mensajes que no llegan en vivo a un usuario conectado a una instancia distinta de la que originó el evento | El test E2E del step 12 levanta dos instancias del servidor contra el mismo Redis explícitamente, no solo una |
| Dependencia de un único VPS sin failover | M | H | El VPS cae y todo el producto queda inaccesible | Aceptado como riesgo de Fase 1 (piloto de bajo tráfico); documentado como gap para Fase 2 en §20.4 |
| El catálogo de tools del copiloto crece sin que el patrón de aprobación escale (revisión manual por cada nuevo tipo de acción) | L | M | Un desarrollador agrega una tool sin usar el skill `add-copilot-tool` | El skill `add-copilot-tool` (§19.4) documenta el flujo correcto; revisión de código exige que toda tool nueva siga el patrón |
| Alcance de Fase 1 se expande informalmente durante el desarrollo (scope creep hacia Fase 2+) | M | M | Un paso empieza a tocar código fuera de la lista de non-goals de §1 | La tabla de Non-Goals es explícita y el hard rule de §1 prohíbe implementar cualquier fila de esa tabla |

### 20.3 Decision log

| # | Decision | Rejected alternative | Why | Would reverse if |
|---|---|---|---|---|
| 1 | Postgres self-hosted en Docker sobre el mismo VPS | Supabase / Neon managed | Soberanía de datos — decisión explícita del cliente | El equipo decide priorizar velocidad operativa sobre control total y el volumen de datos justifica un servicio gestionado |
| 2 | better-auth self-hosted | Clerk / Auth0 | Soberanía de identidad — mismo criterio que la base de datos | Un requisito de SSO/SCIM enterprise hace que reimplementar ese flujo self-hosted sea más costoso que adoptar un proveedor |
| 3 | VPS + Docker Compose sobre Vercel | Vercel (el default del runtime track) | Decisión explícita del cliente — control de costos y soberanía | El equipo necesita escalar más rápido de lo que el VPS único permite y el costo operativo de gestionar la infraestructura supera el ahorro |
| 4 | Socket.IO + adaptador Redis desde el día uno, aunque el volumen inicial es bajo | Socket.IO sin adaptador, agregarlo cuando se necesite | Evita el retrofit costoso cuando el proyecto escale de decenas a miles de organizaciones (fila de `stack-compatibility.md`) | Nunca — el costo de agregarlo ahora es marginal comparado con el retrofit futuro |
| 5 | Claude Sonnet 5 (tier "mid/workhorse") para el copiloto, no Opus | Opus 5 para razonamiento superior | El alcance del copiloto en Fase 1 es acotado (responder preguntas + 2 tool calls de bajo riesgo) — no justifica el costo de Opus | El catálogo de tools crece a razonamiento complejo multi-paso que Sonnet demuestra no manejar bien en el piloto |
| 6 | Aprobación en primer uso por tipo de tool call, no aprobación en cada ejecución | Aprobar cada ejecución siempre | Balance entre seguridad y fricción — igual que el patrón de `agent-loop.md` para acciones de bajo riesgo | Un incidente de seguridad revela que la aprobación de primer uso es insuficiente para algún tipo de acción |
| 7 | 404 (no 403) cuando `requirePermission` falla por cruce de tenant | 403 Forbidden | No revelar que el recurso existe en otra organización | Nunca — es una decisión de seguridad, no de conveniencia |

### 20.4 What to build next

1. Conectar los canales de correo y Telegram (hoy solo valores de enum preparados) — cuando exista
   demanda validada de clientes piloto. Trigger: al menos 2 organizaciones piloto solicitan
   explícitamente uno de estos canales.
2. CRM con pipeline de oportunidades y campos personalizados sobre `contact` — Fase 5 ya arquitectada.
   Trigger: al completar Fase 1-4.
3. Agentes IA autónomos multi-agente completos (`agent-loop.md` en su totalidad, más allá del copiloto
   acotado de Fase 1) — Fase 4. Trigger: el copiloto acotado valida el patrón en producción con al
   menos 30% de adopción (§1 métrica de éxito).
4. Checkout/pagos reales y salida a dominio público — Fase 2. Trigger: modelo de precios definido y
   validación del piloto completa.
5. Prompt caching sobre el contexto de conversación del copiloto para reducir costo — optimización de
   Fase 2+, no bloqueante para el piloto de bajo volumen de Fase 1.

---

*End of blueprint. Build order is §9. Stop when §20.1 is green.*
