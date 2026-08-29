# Núcleo — Fase 4: Agentes IA — Blueprint

> Generado por The Architect el 2026-08-21
> Shape: saas-webapp (continuación de Fase 1-3 + notificaciones/dashboard) · `knowledge/shapes/saas-webapp.md`
> Runtime track: ts-node · `knowledge/runtime-tracks/ts-node.md`
> Emission mode: bundle (16 pasos ≥ 12 → bundle)
> Blueprint version: 1
> Versiones verificadas: sin paquetes nuevos — ver §11. Última verificación en vivo del stack heredado: 2026-08-14 (Fase 1)

---

## 0. Bitácora de fuentes leídas para este blueprint

Antes de escribir una sola línea se leyeron, textualmente, los siguientes documentos. Todo nombre de
archivo, función, tabla o test citado en este blueprint viene de una de estas lecturas — nunca de
memoria ni de inferencia sin verificar. Donde algo no pudo confirmarse así, este blueprint lo marca
`VERIFY:` en el paso correspondiente en vez de inventarlo.

| Fuente | Qué se confirmó ahí |
|---|---|
| `blueprints/nucleo-fase-1/blueprint.md` §3, §4, §9 (steps 13-14), §19.4-19.5 | Árbol de `src/server/copilot/{runs,tools}.ts`, `src/lib/ai/gateway.ts` (`streamCopilotTurn`, `env.COPILOT_MODEL_ID`), el schema completo de `runs`/`steps`/`tool_calls`/`approvals` (línea 457-502: `runs.conversation_id` FK not null, `runs.initiated_by` FK not null), `src/lib/audit.ts` (`recordAuditEvent(tx, { orgId, actorType, actorId, action, targetType, targetId, metadata })`), `src/server/tenancy.ts` (`requirePermission(session, orgId, permissionKey)` → 404 en fallo), el skill `add-copilot-tool` (flujo de 4 pasos), `tests/e2e/copilot.spec.ts` como Verify real del step 14 |
| `blueprints/nucleo-fase-2/blueprint.md` §4, §9 (step 27) | Schema de `content_item`/`content_channel_target`/`content_approval`/`media_asset` (campos exactos), las tools ya existentes en el catálogo del copiloto: `draft_content_copy` (input `{topic, channel}`, permiso `content.create`, no crea `content_item` directamente) y `suggest_publish_time` (permiso `content.schedule`) — **confirmado: no existe ninguna tool llamada `ai_classify` en Fase 2** |
| `blueprints/nucleo-fase-3/blueprint.md` §4, §9 (paso 6, paso 14), §20.3 Decisión #7 | `automation_action_approval` (tabla propia, `(org_id, action_type)` como aprobación por existencia) y la justificación textual de **por qué no reutiliza `runs`/`steps`/`tool_calls`/`approvals`** del copiloto: `runs.conversation_id` y `runs.initiated_by` son `not null` en el schema de Fase 1, pensados para el flujo conversacional; un llamador de sistema (o, en esta fase, un agente sin conversación) no los tiene, estructuralmente. La Decisión #7 registra explícitamente su condición de reversión: *"el copiloto expusiera un mecanismo de aprobación desacoplado del contexto conversacional (p. ej. un `requireApproval(orgId, toolName)` que no dependiera de `runs`/`steps`)"* — esa condición es exactamente lo que este blueprint construye (§9 paso 64), así que la generalización no contradice la Decisión #7: la cumple. También se confirmó que `ai_classify` **sí existe**, pero como acción de automatización (`src/server/automations/actions/ai-classify.ts`, paso 14 de Fase 3), no como tool del copiloto |
| `blueprints/nucleo-notificaciones-dashboard/blueprint.md` §4, §9 (pasos 12-13, 60-63), §10 Bootstrap | `sendPushNotification` en `src/lib/push/send.ts` (único punto que llama al SDK `web-push`), tabla `push_subscription`, `getAttentionSummary(orgId, userId)` en `src/server/dashboard/queries.ts`, `src/app/(app)/page.tsx` como dashboard en `/app` (reemplaza el redirect a `/app/inbox`), `src/components/dashboard/attention-list.tsx`, el patrón de Bootstrap multi-fase (`STEP_TAGS=$(git tag -l 'step-*' | wc -l)`, `rsync -a --ignore-existing`, `scripts/merge-claude-settings.mjs`), y el tag final `step-63-verification` (63 checkpoints acumulados: Fase 1 `step-01`..`step-18`, Fase 2 `step-19`..`step-32`, Fase 3 `step-33`..`step-48`, notificaciones+dashboard `step-49`..`step-63`) |

**No confirmado por lectura directa — marcado `VERIFY:` en el paso que lo necesita:** el nombre
literal de la función exportada por `src/server/copilot/runs.ts` que orquesta el patrón
runs/steps/tool_calls/approvals (Fase 1 la describe en prosa, nunca publica su firma TypeScript), y
el nombre literal de la función en `src/server/conversations.ts` que escribe un mensaje saliente
(Fase 1 solo confirma el archivo y la ruta `POST /api/v1/conversations/:id/messages`, no el nombre del
export). Ambos se resuelven leyendo el código real en el paso que los toca — ver §9 pasos 66 y 75.

---

## 1. Project Overview & Non-Goals

### Vision

Fase 4 convierte a Núcleo de "una plataforma con un copiloto contextual" a "una plataforma con cuatro
agentes de IA especializados", sin construir un segundo motor de ejecución desde cero. El copiloto de
Fase 1 (bandeja) ya probó en producción piloto el patrón runs/steps/tool_calls/approvals; esta fase lo
generaliza — nunca lo reescribe — para que un agente de onboarding, uno de soporte, uno de
contenido/marketing y uno de atención/ventas lo compartan, cada uno con su propio catálogo acotado de
herramientas, su propio acceso de lectura explícitamente limitado a un subconjunto de datos, y el mismo
patrón de aprobación en primer uso para cualquier acción que mute datos o salga a un canal externo.

### Users

| Persona | What they come to do | Frequency |
|---|---|---|
| Administrador de una organización recién creada | Ser guiado por el agente de onboarding a través del checklist de arranque | Los primeros días de vida de la organización |
| Cualquier miembro | Preguntarle al agente de soporte cómo usar una función del producto, desde cualquier pantalla | Ocasional, según necesidad |
| Community manager / editor | Pedirle al agente de contenido un calendario editorial o una serie de piezas a partir de un tema | Semanal |
| Agente de atención / vendedor | Pedirle al agente de ventas un resumen del historial de un contacto, la siguiente mejor acción, o un borrador de propuesta, dentro de una conversación | Diaria |

### Goals — v1 scope

1. El patrón runs/steps/tool_calls/approvals del copiloto de Fase 1 se generaliza a un motor de
   ejecución de agentes compartido, distinguible por `agent_key`, sin romper el copiloto ya construido.
2. Un agente de onboarding guía proactivamente a una organización nueva a través de un checklist de 3
   pasos (conectar un canal, invitar al equipo, crear una automatización), visible en el dashboard de
   `/app` y disponible como panel de chat opcional.
3. Un agente de soporte responde preguntas sobre el uso del producto desde una base de conocimiento
   estática versionada en el repo, accesible desde cualquier pantalla de la aplicación autenticada.
4. Un agente de contenido/marketing sugiere un calendario editorial completo o una serie de piezas
   relacionadas a partir de un tema, más allá de la generación puntual de una sola pieza que ya existe
   (`draft_content_copy`, Fase 2).
5. Un agente de atención/ventas opera dentro de una conversación existente, con herramientas de
   resumen de historial, sugerencia de siguiente acción y borrador de propuesta, más una única acción
   que sale a un canal externo (responder al contacto), sujeta al mismo patrón de aprobación en primer
   uso que ya usa el copiloto.
6. Cada agente lee solo un subconjunto explícito y acotado de los datos de la organización — nunca el
   dataset completo sin filtro — y respeta los mismos roles/permisos ya establecidos desde Fase 1.
7. Toda acción de todo agente queda auditada en `audit_event` vía el mismo `recordAuditEvent` que ya
   usa el copiloto — ningún mecanismo de auditoría paralelo.

### Non-Goals — explicitly out of scope for v1

| Not building | Why not now | Revisit when |
|---|---|---|
| Búsqueda semántica / vectorial para la base de conocimiento del agente de soporte | v1 mantiene el acceso a datos estructurado y simple (archivos markdown versionados, sin embeddings ni base vectorial) — el catálogo de documentos de ayuda es pequeño y cabe completo en el contexto del modelo | El catálogo de documentos de ayuda crezca al punto de no caber en una ventana de contexto razonable |
| Notificaciones push proactivas de los agentes (recordatorios de onboarding, avisos de sugerencias listas) | Los 4 agentes de esta fase son interactivos/bajo demanda, no daemons en background — no existe un disparador asíncrono ni cron en v1. Fase 3 (Decisión #1, §20.3) ya documentó que los triggers basados en tiempo quedan para cuando exista demanda real | Fase 5+ introduzca triggers basados en cron/tiempo para automatizaciones, infraestructura que estos agentes podrían reutilizar |
| CRM con historial unificado de oportunidades/pipeline para el agente de ventas | Es exactamente el alcance de Fase 5 (roadmap ya arquitectado) — el agente de ventas de esta fase opera sobre `conversation`/`contact` ya existentes, sin pipeline de oportunidades | Al completar Fase 5 |
| Analítica agregada de uso de los agentes (qué agente se usa más, tasa de adopción por tipo) | Es el alcance de Fase 6 (Analíticas) — esta fase solo deja `runs.agent_key` como la columna que hará esa consulta posible más adelante | Fase 6 esté planificada |
| Un mecanismo de aprobación de acciones desacoplado de `runs`/`steps` (tipo `requireApproval(orgId, toolName)` standalone) | Fuera de alcance — esta fase generaliza las tablas existentes (agrega `agent_key`, vuelve nullable dos columnas) en vez de construir un mecanismo de aprobación nuevo; ver Decisión #1 en §20.3 | Un quinto llamador (fuera del motor de agentes) necesite pedir aprobación sin pasar por `runs`/`steps` en absoluto |
| Edición o eliminación de tools de un agente desde la UI (solo vía código + skill `add-agent-tool`) | Ningún cliente lo ha pedido; el catálogo de cada agente es pequeño y cambia con poca frecuencia | Un cliente real pida configurar sus propias tools sin tocar código |
| Cualquier agente que envíe contenido a un canal externo sin pasar por aprobación en primer uso | Rompería la única salvaguarda que existe contra una acción no deseada de IA — no es negociable en ninguna fase | Nunca — esta fila es una regla dura, no un límite de alcance temporal |
| Un quinto agente o la fusión de dos de los cuatro catálogos | El alcance funcional de esta fase (Constitución del producto) define exactamente 4 agentes | Un nuevo caso de uso de negocio valide un quinto agente |

**The builder must not implement anything in this table**, even if it seems like a small addition
while working on an adjacent step. Si un paso parece requerir algo de esta tabla, es un defecto del
blueprint — detente y repórtalo en vez de expandir el alcance.

### Success metrics

| Metric | Target | How measured |
|---|---|---|
| Organizaciones nuevas que completan el checklist de onboarding en sus primeros 14 días | ≥ 40% | Consulta sobre `channel_connection`, `membership`, `automation` filtrada por `organization.created_at`, revisada mensualmente tras el piloto |
| Preguntas al agente de soporte resueltas sin escalar a un humano | ≥ 50% (proxy: la conversación con el agente no continúa con "no entendí"/"hablar con alguien" en los siguientes 2 turnos) | Revisión manual de una muestra de `runs` con `agent_key = 'support'`, semanal |
| Adopción del agente de ventas en conversaciones cerradas | ≥ 20% de conversaciones cerradas por un agente humano tuvieron al menos un `run` con `agent_key = 'sales'` | Consulta sobre `runs`/`tool_calls` agrupada por `conversation_id` y `agent_key`, revisada semanalmente |
| Fugas de datos cruzadas entre organizaciones a través de cualquier agente | 0 incidentes | Extensión del test E2E de aislamiento de tenant (heredado de Fase 1 step 5) para cubrir los 4 endpoints de agentes nuevos (§9 paso 78) |

---

## 2. Tech Stack

**Runtime track: ts-node — sin cambios respecto a Fase 1-3 + notificaciones/dashboard.** Esta fase no
introduce ningún paquete nuevo: reutiliza `@anthropic-ai/sdk` (Fase 1, `src/lib/ai/gateway.ts`),
`drizzle-orm`/`drizzle-kit` (Fase 1), `web-push` (fase de notificaciones, no se usa en esta fase —
ver §1 Non-Goals sobre push proactivo), y toda la infraestructura de Postgres/Redis/Docker Compose ya
provisionada. Ver §11 para la tabla de "sin paquetes nuevos" con su justificación explícita.

| Layer | Choice | Why this, over what |
|---|---|---|
| Language / runtime | TypeScript ~6.0.3 sobre Node.js 24.19.0 (heredado) | Sin cambios — esta fase no toca el compilador ni el runtime |
| Framework | Next.js 16.3.1, App Router (heredado) | Sin cambios |
| Database | Postgres 17 self-hosted, mismo contenedor (heredado) | Sin cambios — se agrega una columna a `runs`, ninguna tabla nueva |
| ORM / data access | drizzle-orm 0.45.2 exacto (heredado) | Sin cambios |
| IA / LLM | `@anthropic-ai/sdk` vía `src/lib/ai/gateway.ts` (heredado, Fase 1) | El único gateway del SDK de Anthropic en todo el proyecto — los 4 agentes nuevos lo importan, ninguno crea un segundo cliente |
| Background work | BullMQ + ioredis (heredado) | Sin cambios — ningún agente de esta fase necesita cola: los 4 son síncronos/bajo demanda |
| Realtime | Socket.IO + adaptador Redis (heredado) | Sin cambios — ningún agente de esta fase emite eventos realtime nuevos |
| Auth | better-auth (heredado) | Sin cambios |
| Hosting | Mismo VPS + Docker Compose + Caddy (heredado) | Sin cambios — cero componentes desplegables nuevos |
| Package manager | pnpm 11.21.0 (heredado) | Sin cambios |

### Compatibility check

Checked against `knowledge/stack-compatibility.md` — no known-bad combinations. Esta fase no agrega
ningún paquete nuevo, así que no introduce ninguna superficie de compatibilidad nueva. La única
superficie compartida es la migración de `runs` (§9 paso 64), que es un cambio de schema, no de stack.

---

## 3. Directory Structure

```
nucleo/
  src/
    app/
      (app)/
        page.tsx                          # EDITADO paso 69 — agrega sección de checklist de onboarding
        inbox/
          page.tsx                        # sin cambios directos — el panel del agente de ventas se monta en conversation-view.tsx (paso 76)
        content/
          calendar/page.tsx                # EDITADO paso 73 — agrega panel de calendario sugerido
        layout.tsx                        # EDITADO paso 71 — monta el widget del agente de soporte globalmente
      api/
        v1/
          agents/
            onboarding/route.ts            # NUEVO paso 67 — turno del agente de onboarding, streaming
            support/route.ts               # NUEVO paso 68 — turno del agente de soporte, streaming
            content/route.ts               # NUEVO paso 72 — turno del agente de contenido, streaming
            sales/route.ts                 # NUEVO paso 74 — turno del agente de ventas, streaming
        copilot/route.ts                   # sin cambios — sigue llamando el motor generalizado con agentKey='copilot' fijo (paso 66)
    components/
      agents/
        agent-panel.tsx                    # NUEVO paso 70 — panel de chat genérico, parametrizado por agentKey
        onboarding-checklist.tsx           # NUEVO paso 69 — checklist visible en el dashboard
        support-widget.tsx                 # NUEVO paso 71 — widget flotante, montado en el layout de (app)
      calendar/
        suggested-calendar-panel.tsx        # NUEVO paso 73 — sugerencias del agente de contenido, botón "usar esta pieza"
      copilot/
        copilot-panel.tsx                  # EDITADO paso 70 — se vuelve un wrapper delgado de agent-panel.tsx con agentKey='copilot', cero cambio visual
    lib/
      ai/
        gateway.ts                         # sin cambios — sigue siendo el único importador de @anthropic-ai/sdk
    server/
      agents/
        registry.ts                        # NUEVO paso 65 — AGENT_CATALOG, las 5 claves (copilot + 4 nuevas)
        context.ts                         # NUEVO paso 65 — lector de memoria contextual acotado por agente
        onboarding/
          progress.ts                      # NUEVO paso 67 — progreso del checklist, derivado en vivo de tablas existentes
          tools.ts                         # NUEVO paso 67 — catálogo de tools del agente de onboarding
        support/
          knowledge-base.ts                # NUEVO paso 68 — loader + búsqueda simple sobre docs/help/*.md
          tools.ts                         # NUEVO paso 68 — catálogo de tools del agente de soporte
        content/
          tools.ts                         # NUEVO paso 72 — catálogo de tools del agente de contenido
        sales/
          tools.ts                         # NUEVO paso 74 (lectura) + EDITADO paso 75 (envío con aprobación)
      copilot/
        runs.ts                            # EDITADO pasos 64 y 66 — generalizado a multi-agente, exportado con la misma firma para el copiloto
        tools.ts                           # sin cambios de contenido — sigue siendo el catálogo propio del agente 'copilot' en AGENT_CATALOG
  docs/
    help/
      conectar-canal.md                    # NUEVO paso 68 — base de conocimiento estática del agente de soporte
      invitar-equipo.md                    # NUEVO paso 68
      crear-automatizacion.md              # NUEVO paso 68
  drizzle/                                 # migración nueva de esta fase, nombre decidido por drizzle-kit/manual — nunca inventado (paso 64)
  tests/
    unit/
      agents-registry.test.ts              # NUEVO paso 65
      agents-context.test.ts               # NUEVO paso 65
      agents-engine.test.ts                # NUEVO paso 66
      onboarding-progress.test.ts          # NUEVO paso 67
      support-knowledge-base.test.ts       # NUEVO paso 68
      content-agent-tools.test.ts          # NUEVO paso 72
      sales-agent-tools.test.ts            # NUEVO paso 74
      agents-audit-coverage.test.ts        # NUEVO paso 77
      schema.test.ts                       # EDITADO paso 64 — nuevas aserciones sobre `runs`
    integration/
      sales-agent-send.test.ts             # NUEVO paso 75
    hooks/                                 # heredado de la fase de notificaciones — sin archivos nuevos de esta fase
    e2e/
      copilot.spec.ts                      # sin cambios de contenido — se re-corre como regresión en pasos 64 y 66
      agents-onboarding.spec.ts            # NUEVO paso 67, EDITADO paso 70
      agents-support.spec.ts               # NUEVO paso 68, EDITADO paso 71
      agents-content.spec.ts               # NUEVO paso 73
      agents-sales.spec.ts                 # NUEVO paso 76
      a11y.spec.ts                         # EDITADO paso 78 — agrega las rutas nuevas de esta fase
  blueprints/
    nucleo-fase-4/                          # este bundle
```

**Boundary rules**

- Ningún agente nuevo importa `@anthropic-ai/sdk` directamente — todos pasan por
  `src/lib/ai/gateway.ts`, exactamente como el copiloto de Fase 1.
- `src/server/agents/context.ts` es el único punto de lectura de "memoria contextual" para los 4
  agentes nuevos — ningún handler de tool en `onboarding/`, `support/`, `content/`, `sales/` hace una
  query directa a una tabla de otra fase; todos pasan por `getAgentContext(agentKey, orgId, params)`.
- Toda mutación (incluido `send_conversation_reply` del agente de ventas) sigue llamando
  `requirePermission()` de `src/server/tenancy.ts` primero y `recordAuditEvent()` de
  `src/lib/audit.ts` dentro de la misma transacción — regla heredada de Fase 1 §8/§14, sin excepción
  para los agentes nuevos.
- `src/server/copilot/runs.ts` sigue siendo el único orquestador de `runs`/`steps`/`tool_calls`/
  `approvals` — ningún agente nuevo crea su propia copia del bucle de orquestación.

**Alias y convención de módulos**: hereda `@/` → `src/` y especificadores relativos `.ts` con
`allowImportingTsExtensions`/`rewriteRelativeImportExtensions`, ya establecidos por Fase 1 §3 y sin
cambios en esta fase — ver §19.6 *Resolution convention matrix* para la confirmación de que ningún
archivo nuevo de esta fase rompe esa convención.

Cada archivo de este árbol es autorado por exactamente un step de §9 (por nombre en su lista **Do**).
Ningún archivo listado aquí existe "por el camino".

---

## 4. Data Model

### Cambios sobre tablas existentes (expand, nunca destructivo)

**`runs`** (Fase 1 §4) — se generaliza de "una invocación del copiloto" a "una invocación de
cualquier agente".

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | sin cambios |
| org_id | uuid | FK organization.id, not null, index | sin cambios |
| **agent_key** | **text** | **NUEVO — not null** | valores: `copilot` \| `onboarding` \| `support` \| `content_marketing` \| `sales`. Backfill: toda fila preexistente recibe `'copilot'` (única fase que escribía esta tabla antes de esta migración) |
| conversation_id | uuid | FK conversation.id, **nullable** (era not null) | null para agentes sin conversación (onboarding, soporte, contenido). El copiloto y el agente de ventas siguen escribiéndolo siempre |
| initiated_by | uuid | FK user.id, **nullable** (era not null) | null = el run fue iniciado por el sistema/proactivamente, sin un usuario actuando en ese instante. El copiloto sigue escribiéndolo siempre (nunca corre proactivamente) |
| status | text | not null, default 'running' | sin cambios |
| created_at | timestamptz | not null, default now() | sin cambios |

`steps`, `tool_calls`, `approvals` — **sin ningún cambio de schema.** Su FK remonta a `runs`/`steps`/
`tool_calls` respectivamente y no referencian `conversation_id` ni `initiated_by` directamente, así
que la nulabilidad nueva de `runs` no se propaga a ninguna de las tres.

### Índice nuevo

| Table | Index | Why |
|---|---|---|
| runs | (org_id, agent_key, created_at desc) | Consultas por tipo de agente — la base de la métrica de adopción de §1 y de una futura analítica de Fase 6 |

### Tablas nuevas de esta fase

**Ninguna.** Decisión deliberada (ver §20.3 Decisión #2): el progreso del checklist de onboarding se
**deriva en vivo** de tablas ya existentes (`channel_connection` de Fase 1, `membership` de Fase 1,
`automation` de Fase 3) en vez de persistirse en una tabla nueva — evita necesitar un hook de escritura
en cada uno de esos tres flujos de otras fases, que además Fase 1 documentó como gestionado
manualmente sin UI de conexión (§6 de Fase 1: "channel connections quedan gestionadas manualmente en
Fase 1, sin UI de conexión"), por lo que no existe siquiera un punto de código único donde enganchar un
hook de escritura para `channel_connection`. La base de conocimiento del agente de soporte vive como
archivos markdown en `docs/help/`, no como tabla.

### Schema

```typescript
// src/lib/db/schema.ts — fragmento de esta fase, agregado al archivo existente de Fase 1-3
// (las tablas de las fases anteriores quedan intactas; solo se edita la definición de `runs`)

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => organization.id),
  agentKey: text("agent_key").notNull(),                       // NUEVO
  conversationId: uuid("conversation_id").references(() => conversation.id), // ya no .notNull()
  initiatedBy: uuid("initiated_by").references(() => user.id),                // ya no .notNull()
  status: text("status").notNull().default("running"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
}, (t) => ({
  orgAgentIdx: index().on(t.orgId, t.agentKey, t.createdAt),
}));
```

### Migrations

Herramienta: `drizzle-kit`, patrón heredado de Fase 1 §4. Esta migración se autora con
`pnpm exec drizzle-kit generate --custom` (no con la variante automática) porque agregar una columna
`not null` sin default a una tabla que puede tener filas requiere una secuencia explícita
add-nullable → backfill → set-not-null — drizzle-kit no la genera automáticamente para este caso, y
adivinar el contenido del archivo generado violaría la regla de "nunca nombres un artefacto que un
generador produce". El **nombre del archivo** lo decide `drizzle-kit generate --custom` — nunca se
inventa. Su **contenido**, que sí se autora a mano en este paso porque `--custom` produce un archivo
vacío para editar, es:

```sql
ALTER TABLE "runs" ADD COLUMN "agent_key" text;
UPDATE "runs" SET "agent_key" = 'copilot' WHERE "agent_key" IS NULL;
ALTER TABLE "runs" ALTER COLUMN "agent_key" SET NOT NULL;
ALTER TABLE "runs" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "runs" ALTER COLUMN "initiated_by" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "runs_org_agent_created_idx" ON "runs" ("org_id", "agent_key", "created_at" DESC);
```

Esta secuencia es segura sin importar cuántas filas existan en `runs` — incluida cero, el caso más
probable dado que el producto todavía no sale a la web pública (§1 Non-Goals de Fase 1, sin cambios en
esta fase). Regla expand-then-contract heredada: ninguna columna se elimina ni se renombra; `agent_key`
llega directamente a `not null` en el mismo despliegue porque el código que la escribe (paso 64) se
edita en el mismo paso que la migración — no hay ventana donde código viejo inserte sin `agent_key`.

### Seed data

`scripts/seed.ts` — **sin cambios en esta fase.** Ningún permiso nuevo se agrega al catálogo (ver
§20.3 Decisión #3: los 4 agentes nuevos reutilizan permisos ya sembrados por Fase 1/Fase 2, cero filas
nuevas de `permission`/`role_permission`).

---

## 5. API Design

### Conventions

Heredadas sin cambios de Fase 1 §5: base path `/api/v1`, envelope `{ data }` / `{ error: { code,
message } }`, error codes `validation_error`(400)/`unauthorized`(401)/`forbidden`(403 — nunca usado
para cruce de tenant, ver §8)/`not_found`(404)/`conflict`(409)/`internal_error`(500), validación zod,
paginación cursor donde aplica, rate limit por usuario en endpoints de agente (mismo backend Redis).

### Routes

| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/v1/agents/onboarding` | Turno del agente de onboarding (streaming) | user | 20/min por usuario |
| GET | `/api/v1/agents/onboarding/progress` | Progreso del checklist, derivado en vivo | user | — |
| POST | `/api/v1/agents/support` | Turno del agente de soporte (streaming) | user autenticado — sin `permission_key` (ver §8, no hay dato sensible de organización involucrado) | 20/min por usuario |
| POST | `/api/v1/agents/content` | Turno del agente de contenido/marketing (streaming) | user, permiso `content.create` | 20/min por usuario |
| POST | `/api/v1/agents/sales` | Turno del agente de ventas/atención (streaming) | user, permiso `conversation.reply` | 20/min por usuario |
| POST | `/api/v1/copilot` | Sin cambios — sigue siendo el turno del copiloto | user | 20/min por usuario (heredado) |

### Critical endpoints — full detail

**`POST /api/v1/agents/onboarding`**: request `{ message: string }` (sin `conversationId` — este
agente nunca tiene uno). Crea una fila `runs` con `agentKey='onboarding'`, `conversationId=null`,
`initiatedBy=<userId de la sesión>` (el usuario sí está presente, solo la conversación no existe).
Transmite la respuesta vía streaming SSE, igual mecanismo que `/api/v1/copilot`.

**`GET /api/v1/agents/onboarding/progress`**: sin crear ningún `run` — es una lectura directa de
`getOnboardingProgress(orgId)` (§9 paso 67), usada tanto por el panel de chat como por el dashboard de
`/app`. Response `{ data: { items: [{ key, label, completed }] } }`, siempre los 3 items en el mismo
orden.

**`POST /api/v1/agents/sales`**: request `{ conversationId: string, message: string }` (obligatorio a
diferencia de onboarding/soporte/contenido — este agente siempre opera dentro de una conversación,
igual que el copiloto). Si el modelo invoca `send_conversation_reply` y la organización nunca aprobó
ese `tool_name` antes, el stream se detiene con `approval_required`, mismo contrato que el copiloto de
Fase 1 §5.

---

## 6. Frontend Architecture

### Routes

| Route | Page | Data source | Auth |
|---|---|---|---|
| `/app` | Dashboard (Fase notificaciones) — EDITADO esta fase | server query + `getOnboardingProgress` | user |
| `/app/inbox` | Bandeja unificada (Fase 1) — EDITADO esta fase: `conversation-view.tsx` monta el panel del agente de ventas | server query + realtime | user |
| `/app/content/calendar` | Calendario editorial (Fase 2) — EDITADO esta fase: agrega el panel de calendario sugerido | server query + client mutations | user |
| Cualquier ruta bajo `(app)` | El widget del agente de soporte se monta en `layout.tsx`, visible en toda la app autenticada | client, bajo demanda | user |

### Rendering strategy

Sin cambios respecto al patrón ya establecido en Fase 1 §6: los paneles de chat de los agentes nuevos
son Client Components montados dentro de Server Components existentes, streaming SSE consumido en el
cliente — mismo patrón que `copilot-panel.tsx` ya usa. Ninguna ruta nueva de esta fase cambia su
estrategia de cacheo respecto a la página que edita.

### Component hierarchy

```
app/(app)/page.tsx (Server) — dashboard, EDITADO paso 69
├── AttentionList (Client, heredado, sin cambios de forma)
└── OnboardingChecklist (Client) — src/components/agents/onboarding-checklist.tsx, NUEVO paso 69
    └── AgentPanel agentKey="onboarding" (Client, opcional, expandible) — NUEVO paso 70

app/(app)/layout.tsx (Server) — EDITADO paso 71
└── SupportWidget (Client) — src/components/agents/support-widget.tsx
    └── AgentPanel agentKey="support" (Client, dentro del widget)

app/(app)/inbox/page.tsx (Server, heredado)
└── ConversationView (Client, heredado) — EDITADO paso 76
    └── CopilotPanel (Client, heredado, ahora wrapper de AgentPanel agentKey="copilot")
    └── AgentPanel agentKey="sales" (Client) — NUEVO paso 76, pestaña separada del copiloto

app/(app)/content/calendar/page.tsx (Server, heredado)
└── EditorialCalendar (Client, heredado)
└── SuggestedCalendarPanel (Client) — NUEVO paso 73
    └── AgentPanel agentKey="content_marketing" (Client)
```

### State management

Sin cambios de patrón: TanStack Query para estado de servidor (progreso del checklist, sugerencias de
calendario), `useState` local para estado de UI (panel abierto/cerrado, mensaje en curso). Ningún store
global nuevo.

### Loading, empty, and error states

- Checklist de onboarding con los 3 items completos: la sección desaparece del dashboard (no queda un
  checklist vacío ocupando espacio) — se documenta como comportamiento explícito, no un olvido.
- Agente de soporte sin respuesta (timeout): mismo mensaje que el copiloto — "el agente no respondió a
  tiempo, intenta de nuevo" (patrón heredado de Fase 1 §6).
- Calendario sugerido antes de pedir uno: estado vacío con CTA "pedir un calendario editorial" que abre
  el panel del agente de contenido.
- Panel del agente de ventas sin conversación seleccionada: no se renderiza — depende de
  `conversationId`, igual que el copiloto ya depende de él.

---

## 7. Design System

**Sin cambios respecto a Fase 1 §7.** Los 4 agentes nuevos reutilizan la paleta, tipografía, espaciado
y estilo de componente ya establecidos — un panel de chat de agente es visualmente el mismo componente
que el panel del copiloto (`agent-panel.tsx` es, de hecho, la generalización literal de
`copilot-panel.tsx`, ver §9 paso 70), así que no hay ninguna decisión de diseño nueva que tomar. El
único elemento visual nuevo es el checklist de onboarding (`onboarding-checklist.tsx`), que reutiliza
los mismos tokens de card/lista ya usados en `attention-list.tsx` (Fase notificaciones) — filas con un
ícono de check (`--success`) para completado y un punto neutro (`--fg-muted`) para pendiente, sin
paleta nueva.

---

## 8. Authentication & Authorization

### Provider and rationale

Sin cambios — better-auth self-hosted, heredado de Fase 1 §8.

### Route protection

| Surface | Rule | Enforced where |
|---|---|---|
| `/api/v1/agents/onboarding*` | autenticado, sin `permission_key` adicional — cualquier miembro puede ver/usar el onboarding de su propia org | `requirePermission` no se invoca para lectura de progreso (es información no sensible de la propia org, expuesta a cualquier miembro); el turno del agente valida sesión vía el middleware de auth ya existente, sin permiso de recurso específico |
| `/api/v1/agents/support` | autenticado, sin `permission_key` | Ídem — la base de conocimiento es estática y no contiene datos de organización; documentado como excepción deliberada, ver más abajo |
| `/api/v1/agents/content` | autenticado + permiso `content.create` (heredado de Fase 2) | `requirePermission(session, orgId, "content.create")` |
| `/api/v1/agents/sales` | autenticado + permiso `conversation.reply` (heredado de Fase 1) | `requirePermission(session, orgId, "conversation.reply")` |

**Excepción deliberada — por qué onboarding y soporte no llaman `requirePermission`:** la regla de
Fase 1 §8 dice "cada mutación o **lectura sensible**" pasa por `requirePermission`. Ni el progreso del
checklist (deriva de conteos ya visibles en otras pantallas para cualquier miembro) ni la base de
conocimiento estática (contenido público del producto, igual para toda organización, sin dato de
cliente) son datos sensibles de organización — no hay ningún `org_id` ajeno que pudiera filtrarse
porque el contenido no varía por organización. Ambos endpoints sí exigen sesión autenticada (nunca
público). Este es el mismo criterio que ya exime a `POST /api/v1/invitations/:token/accept` de
`requirePermission` en la tabla de rutas de Fase 1 §5 (endpoint autenticado por token, no por permiso
de recurso).

### Roles and permissions

Sin cambios — se reutilizan los permission keys ya sembrados por Fase 1 (`conversation.reply`) y Fase 2
(`content.create`). **Cero permission keys nuevos en esta fase** (ver §20.3 Decisión #3).

### Multi-tenancy / row-level isolation

`requirePermission()` sigue siendo el único mecanismo, sin cambios de diseño. La novedad de esta fase
es que **`src/server/agents/context.ts` es un segundo punto de lectura acotada** que debe respetar el
mismo aislamiento — cada función de contexto por agente recibe `orgId` de la sesión (nunca de un
parámetro del cliente) y filtra explícitamente por él en cada query, mismo patrón que
`requirePermission` ya impone para mutaciones. El test E2E de aislamiento de tenant heredado de Fase 1
step 5 se extiende en esta fase (§9 paso 78) para cubrir los 4 endpoints de agentes nuevos.

---

## 9. BUILD ORDER

Range del step map: 16 pasos (dentro de 10-18). Epic count derivado: `ceil(16/9)=2`, `floor(16/5)=3` →
legal 2 o 3 epics. Se eligen **3 epics de 6+5+5 pasos**, separados por capa/superficie natural: motor
compartido (64-69), interfaces + agente de contenido (70-74), agente de ventas + cierre (75-79).

**Numeración de checkpoints:** esta fase continúa la secuencia global sin prefijo ya establecida por
Fase 1 (`step-01`..`step-18`), Fase 2 (`step-19`..`step-32`), Fase 3 (`step-33`..`step-48`) y
notificaciones+dashboard (`step-49`..`step-63`). Esta fase usa `step-64`..`step-79`.

### Step map

| # | Step | Depends on | Touches | Gate |
|---|---|---|---|---|
| 64 | Migración expand `runs.agent_key` + nullable `conversation_id`/`initiated_by` | — | `src/lib/db/schema.ts`, `drizzle/*.sql`, `src/server/copilot/runs.ts`, `tests/unit/schema.test.ts` | `pnpm db:migrate && pnpm test tests/unit/schema.test.ts && pnpm test:e2e tests/e2e/copilot.spec.ts` |
| 65 | Catálogo de agentes + memoria contextual controlada | 64 | `src/server/agents/registry.ts`, `src/server/agents/context.ts`, `src/lib/env.ts`, `.env.example`, `tests/unit/agents-registry.test.ts`, `tests/unit/agents-context.test.ts` | `pnpm test tests/unit/agents-registry.test.ts tests/unit/agents-context.test.ts && pnpm typecheck` |
| 66 | Motor de runs generalizado (multi-agente) | 64, 65 | `src/server/copilot/runs.ts`, `tests/unit/agents-engine.test.ts` | `pnpm test tests/unit/agents-engine.test.ts && pnpm test:e2e tests/e2e/copilot.spec.ts && pnpm typecheck` |
| 67 | Backend del agente de onboarding | 65, 66 | `src/server/agents/onboarding/progress.ts`, `src/server/agents/onboarding/tools.ts`, `src/app/api/v1/agents/onboarding/route.ts`, `tests/unit/onboarding-progress.test.ts`, `tests/e2e/agents-onboarding.spec.ts` | `pnpm test tests/unit/onboarding-progress.test.ts && pnpm test:e2e tests/e2e/agents-onboarding.spec.ts` |
| 68 | Base de conocimiento estática + backend del agente de soporte | 65, 66 | `docs/help/*.md`, `src/server/agents/support/knowledge-base.ts`, `src/server/agents/support/tools.ts`, `src/app/api/v1/agents/support/route.ts`, `tests/unit/support-knowledge-base.test.ts` | `pnpm test tests/unit/support-knowledge-base.test.ts && pnpm typecheck` |
| 69 | UI checklist de onboarding en `/app` | 67 | `src/app/(app)/page.tsx`, `src/components/agents/onboarding-checklist.tsx`, `src/server/dashboard/queries.ts` | `pnpm typecheck && pnpm test:e2e tests/e2e/agents-onboarding.spec.ts` |
| 70 | Panel de chat genérico + wrapper del copiloto | 66 | `src/components/agents/agent-panel.tsx`, `src/components/copilot/copilot-panel.tsx`, `src/app/(app)/page.tsx`, `tests/e2e/agents-onboarding.spec.ts` | `pnpm test:e2e tests/e2e/agents-onboarding.spec.ts tests/e2e/copilot.spec.ts` |
| 71 | Widget del agente de soporte | 68, 70 | `src/components/agents/support-widget.tsx`, `src/app/(app)/layout.tsx`, `tests/e2e/agents-support.spec.ts` | `pnpm test:e2e tests/e2e/agents-support.spec.ts` |
| 72 | Backend del agente de contenido/marketing | 65, 66 | `src/server/agents/content/tools.ts`, `src/app/api/v1/agents/content/route.ts`, `tests/unit/content-agent-tools.test.ts` | `pnpm test tests/unit/content-agent-tools.test.ts && pnpm typecheck` |
| 73 | UI del calendario editorial sugerido | 70, 72 | `src/app/(app)/content/calendar/page.tsx`, `src/components/calendar/suggested-calendar-panel.tsx`, `tests/e2e/agents-content.spec.ts` | `pnpm test:e2e tests/e2e/agents-content.spec.ts` |
| 74 | Backend del agente de ventas/atención — tools de solo lectura | 65, 66 | `src/server/agents/sales/tools.ts`, `src/app/api/v1/agents/sales/route.ts`, `tests/unit/sales-agent-tools.test.ts` | `pnpm test tests/unit/sales-agent-tools.test.ts && pnpm typecheck` |
| 75 | Tool de envío con aprobación (`send_conversation_reply`) | 74 | `src/server/agents/sales/tools.ts`, `tests/integration/sales-agent-send.test.ts` | `pnpm test tests/integration/sales-agent-send.test.ts` |
| 76 | UI del agente de ventas en la bandeja | 70, 75 | `src/components/inbox/conversation-view.tsx`, `tests/e2e/agents-sales.spec.ts` | `pnpm test:e2e tests/e2e/agents-sales.spec.ts` |
| 77 | Auditoría consolidada de los 4 agentes | 67, 68, 72, 75 | `src/server/agents/onboarding/tools.ts`, `src/server/agents/support/tools.ts`, `src/server/agents/content/tools.ts`, `src/server/agents/sales/tools.ts`, `tests/unit/agents-audit-coverage.test.ts` | `pnpm test tests/unit/agents-audit-coverage.test.ts` |
| 78 | E2E completo de aislamiento de tenant + a11y | 69, 71, 73, 76 | `tests/e2e/tenant-isolation.spec.ts` (edit, heredado de Fase 1 step 5), `tests/e2e/a11y.spec.ts` (edit) | `pnpm test:e2e tests/e2e/tenant-isolation.spec.ts && pnpm test:e2e tests/e2e/a11y.spec.ts` |
| 79 | Verificación final de Fase 4 | 77, 78 | ninguno — commit vacío de cierre | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` |

---

#### Step 64 — Migración expand `runs.agent_key` + nullable `conversation_id`/`initiated_by`

**Do**
Editar `src/lib/db/schema.ts`: en la tabla `runs`, agregar `agentKey: text("agent_key").notNull()` y
quitar `.notNull()` de `conversationId` e `initiatedBy` (ver §4 para el fragmento exacto). Generar la
migración con `pnpm exec drizzle-kit generate --custom` (el nombre del archivo lo decide la
herramienta) y editar su contenido con el SQL exacto de §4 (add-nullable → backfill 'copilot' →
set-not-null → drop-not-null en las otras dos columnas → índice nuevo). Editar
`src/server/copilot/runs.ts`: en el punto donde inserta la fila `runs`, agregar `agentKey: "copilot"`
explícito (hardcodeado por ahora — la generalización completa a un parámetro es el paso 66; este paso
solo satisface la columna `not null` sin cambiar ningún otro comportamiento observable del copiloto).

**Done when**
- [ ] WHEN `pnpm db:migrate` corre sobre la base ya migrada de Fase 1-3+notificaciones THE SYSTEM SHALL agregar la columna `agent_key` a `runs` sin eliminar ni renombrar ninguna columna existente de ninguna tabla.
- [ ] WHEN la migración termina THE SYSTEM SHALL dejar `conversation_id` e `initiated_by` de `runs` como nullable.
- [ ] WHEN se intenta insertar una fila en `runs` sin `agent_key` THE SYSTEM SHALL rechazar el insert por violación de `NOT NULL`.
- [ ] WHEN cualquier fila preexistente de `runs` (si la hay) se lee tras la migración THE SYSTEM SHALL mostrar `agent_key = 'copilot'`.
- [ ] WHEN `tests/e2e/copilot.spec.ts` (heredado de Fase 1, sin ninguna modificación a sus aserciones) corre después de esta migración y de la edición de `runs.ts` THE SYSTEM SHALL seguir pasando — el copiloto de Fase 1 sigue funcionando exactamente igual.

**Verify**
```bash
pnpm db:migrate   # expect: exit 0
test "$(psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='runs' and column_name='conversation_id'" | tr -d '[:space:]')" = "YES"
test "$(psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='runs' and column_name='initiated_by'" | tr -d '[:space:]')" = "YES"
test "$(psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='runs' and column_name='agent_key'" | tr -d '[:space:]')" = "NO"
pnpm test tests/unit/schema.test.ts        # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e tests/e2e/copilot.spec.ts    # expect: exit 0, 0 failed — regresión del copiloto de Fase 1, sin editar el spec
```

**Checkpoint**
```bash
git add -A && git commit -m "step 64: migracion expand runs.agent_key + nullable conversation_id/initiated_by"
git tag step-64-agent-runs-migration
```

---

#### Step 65 — Catálogo de agentes + memoria contextual controlada

**Do**
Crear `src/server/agents/registry.ts` exportando `type AgentKey = "copilot" | "onboarding" |
"support" | "content_marketing" | "sales"` y `AGENT_CATALOG: Record<AgentKey, AgentDefinition>` donde
`AgentDefinition` trae `{ key, label, modelEnvVar }`. Exportar `getAgentModelId(agentKey: AgentKey):
string`, que lee `process.env[<PREFIJO>_MODEL_ID]` (`ONBOARDING_MODEL_ID`, `SUPPORT_MODEL_ID`,
`CONTENT_MODEL_ID`, `SALES_MODEL_ID`) y hace fallback a `env.COPILOT_MODEL_ID` si esa variable no está
definida — decisión documentada en §20.3 Decisión #4: los 4 agentes nuevos no requieren una variable
propia en v1, pero el fallback deja la puerta abierta a tiers de modelo distintos por agente sin
requerir una migración de configuración después. Editar `src/lib/env.ts` para declarar las 4 variables
nuevas como **opcionales** (nunca `required`). Editar `.env.example` agregando las 4 claves en blanco
bajo un comentario `# Agentes IA (Fase 4) — opcional, fallback a COPILOT_MODEL_ID`. Crear
`src/server/agents/context.ts` exportando `getAgentContext(agentKey: AgentKey, orgId: string, params?:
{ conversationId?: string }): Promise<AgentContext>` — un `switch` sobre `agentKey` con una función de
lectura acotada por rama: `copilot`/`sales` requieren `conversationId` y leen los últimos 20 mensajes +
datos del `contact` de esa conversación (mismo alcance que el copiloto ya usa desde Fase 1 step 14,
reutilizado, no reimplementado); `onboarding` lee solo `getOnboardingProgress` (stub por ahora, cuerpo
real en paso 67) más conteos de `membership`; `support` no lee ningún dato de organización más allá del
`organization.name`; `content_marketing` lee `content_item` (solo `title`, `status`, `scheduledAt`) de
la organización, nunca `conversation` ni `message`.

**Done when**
- [ ] WHEN se importa `AGENT_CATALOG` THE SYSTEM SHALL exponer exactamente las 5 claves `copilot`, `onboarding`, `support`, `content_marketing`, `sales`.
- [ ] WHEN `getAgentModelId("onboarding")` se llama sin `ONBOARDING_MODEL_ID` definido THE SYSTEM SHALL devolver el valor de `env.COPILOT_MODEL_ID`.
- [ ] WHEN `getAgentModelId("onboarding")` se llama con `ONBOARDING_MODEL_ID` definido THE SYSTEM SHALL devolver ese valor en vez del fallback.
- [ ] WHEN `getAgentContext("support", orgId)` se llama THE SYSTEM SHALL devolver únicamente `{ organizationName }`, cero filas de `conversation`, `message`, `contact` o `content_item`.
- [ ] WHEN `getAgentContext("content_marketing", orgId)` se llama THE SYSTEM SHALL devolver solo campos `title`/`status`/`scheduledAt` de `content_item` de esa organización, cero filas de `conversation` o `message`.
- [ ] WHEN `getAgentContext("sales", orgId, { conversationId })` se llama con un `conversationId` que pertenece a otra organización THE SYSTEM SHALL devolver un resultado vacío en vez de datos de la conversación ajena.

**Verify**
```bash
pnpm test tests/unit/agents-registry.test.ts tests/unit/agents-context.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 65: catalogo de agentes + memoria contextual controlada"
git tag step-65-agent-registry-context
```

---

#### Step 66 — Motor de runs generalizado (multi-agente)

**Do**
**VERIFY antes de editar:** leer el archivo real `src/server/copilot/runs.ts` (tal como quedó tras
Fase 1 step 14 y el edit mínimo del paso 64) para confirmar el nombre exacto de la función exportada
que orquesta el patrón — Fase 1 la describe en prosa ("orquesta el patrón runs/steps/tool_calls/
approvals: crea el `runs`, llama `streamCopilotTurn`...") pero no publica su firma TypeScript literal
en ningún blueprint leído. Generalizar esa función (con el nombre real confirmado) para aceptar
`agentKey: AgentKey`, `conversationId?: string`, `initiatedBy?: string`, y resolver el catálogo de
tools y el system prompt desde `AGENT_CATALOG[agentKey]` (paso 65) en vez de importar siempre
`src/server/copilot/tools.ts` de forma fija. Si `AGENT_CATALOG` no tiene la clave, lanzar un error
tipado **antes** de llamar al gateway de IA, sin crear ninguna fila en `runs`. `src/app/api/copilot/
route.ts` sigue llamando la función exactamente igual que antes (pasa `agentKey: "copilot"` fijo,
`conversationId` e `initiatedBy` siempre presentes) — cero cambio de comportamiento observable para el
copiloto.

**Done when**
- [ ] WHEN el motor se invoca con `agentKey="copilot"`, `conversationId` e `initiatedBy` presentes THE SYSTEM SHALL crear una fila `runs` con la misma forma que producía el copiloto antes de esta fase.
- [ ] WHEN el motor se invoca con un `agentKey` distinto de `copilot` y `conversationId` ausente THE SYSTEM SHALL crear la fila `runs` con `conversation_id = null` sin lanzar ni fallar por la ausencia.
- [ ] WHEN el motor se invoca con `initiatedBy` ausente THE SYSTEM SHALL crear la fila `runs` con `initiated_by = null`.
- [ ] WHEN el motor resuelve un `agentKey` no registrado en `AGENT_CATALOG` THE SYSTEM SHALL lanzar un error tipado antes de llamar al gateway de IA, sin crear ninguna fila.
- [ ] WHEN `tests/e2e/copilot.spec.ts` corre tras esta generalización THE SYSTEM SHALL seguir pasando sin ninguna modificación a sus aserciones.

**Verify**
```bash
pnpm test tests/unit/agents-engine.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e tests/e2e/copilot.spec.ts      # expect: exit 0, 0 failed — regresión del copiloto de Fase 1
pnpm typecheck   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 66: motor de runs generalizado a multi-agente"
git tag step-66-agent-engine
```

---

#### Step 67 — Backend del agente de onboarding

**Do**
Crear `src/server/agents/onboarding/progress.ts` exportando `getOnboardingProgress(orgId: string)`,
que deriva en vivo (sin tabla propia, ver §4) el estado de 3 items: `connect_channel` (existe al menos
una fila en `channel_connection` con `deleted_at is null` para esa org), `invite_member` (la
organización tiene más de 1 fila en `membership`), `create_automation` (existe al menos una fila en
`automation` — Fase 3 — para esa org). Devuelve `{ items: [{ key, label, completed }] }` en ese orden
fijo. Crear `src/server/agents/onboarding/tools.ts` con el catálogo del agente `onboarding`:
`get_onboarding_progress` (llama `getOnboardingProgress`, sin `permission_key` — ver §8) y
`suggest_next_onboarding_step` (lee el progreso y devuelve el primer item incompleto con una
explicación breve de por qué importa; sin mutación). Ambas marcadas `requiresApprovalFirstUse: true`,
siguiendo el flujo del skill `add-agent-tool` (§19.4) — sin justificación de excepción para ninguna de
las dos, consistente con el default estricto ya establecido por Fase 1/Fase 2. Crear
`src/app/api/v1/agents/onboarding/route.ts` (POST, streaming SSE, llama el motor generalizado del paso
66 con `agentKey: "onboarding"`) y `src/app/api/v1/agents/onboarding/progress/route.ts` (GET, llama
`getOnboardingProgress` directamente, sin crear ningún `run`).

**Done when**
- [ ] WHEN `getOnboardingProgress` se llama para una organización sin canal conectado, con 1 solo miembro y sin automatizaciones THE SYSTEM SHALL devolver los 3 items con `completed: false`.
- [ ] WHEN una organización tiene 2 filas en `membership` THE SYSTEM SHALL devolver `invite_member` con `completed: true`.
- [ ] WHEN el agente de onboarding invoca `get_onboarding_progress` por primera vez en una organización THE SYSTEM SHALL detener el stream con `approval_required`, igual que cualquier tool nueva de Fase 1.
- [ ] WHEN se aprueba esa primera invocación THE SYSTEM SHALL ejecutar el handler y devolver el progreso real de la organización.
- [ ] WHEN `GET /api/v1/agents/onboarding/progress` se llama THE SYSTEM SHALL responder sin crear ninguna fila en `runs`.

**Verify**
```bash
pnpm test tests/unit/onboarding-progress.test.ts      # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e tests/e2e/agents-onboarding.spec.ts     # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 67: backend del agente de onboarding"
git tag step-67-onboarding-backend
```

---

#### Step 68 — Base de conocimiento estática + backend del agente de soporte

**Do**
Crear 3 archivos markdown reales en `docs/help/`: `conectar-canal.md`, `invitar-equipo.md`,
`crear-automatizacion.md`, cada uno con un `# Título` en la primera línea y 3-6 párrafos de contenido
de ayuda real sobre esa tarea del producto (no placeholders — contenido genuino que el agente puede
citar). Crear `src/server/agents/support/knowledge-base.ts` exportando `loadKnowledgeBase(): {
title: string, path: string, content: string }[]` (lee `docs/help/*.md` con `fs.readdirSync` al
importar el módulo, sin caché externa) y `searchKnowledgeBase(query: string, limit = 3)` — ranking
simple por conteo de coincidencias de palabras del query (case-insensitive) sobre `title` + `content`,
sin librería de búsqueda ni vector store (§1 Non-Goals). Crear `src/server/agents/support/tools.ts` con
la tool `search_knowledge_base` (input `{ query: string }`, sin `permission_key`, marcada
`requiresApprovalFirstUse: true`). Crear `src/app/api/v1/agents/support/route.ts` (POST, streaming SSE,
`agentKey: "support"`, sin `conversationId`).

**Done when**
- [ ] WHEN `loadKnowledgeBase()` se llama THE SYSTEM SHALL devolver exactamente 3 entradas, una por archivo de `docs/help/`.
- [ ] WHEN `searchKnowledgeBase("conectar canal")` se llama THE SYSTEM SHALL devolver `conectar-canal.md` como el primer resultado.
- [ ] WHEN `searchKnowledgeBase` se llama con un query que no coincide con ningún documento THE SYSTEM SHALL devolver un array vacío, nunca lanzar.
- [ ] WHEN el agente de soporte invoca `search_knowledge_base` por primera vez en una organización THE SYSTEM SHALL detener el stream con `approval_required`.

**Verify**
```bash
pnpm test tests/unit/support-knowledge-base.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 68: base de conocimiento estatica + backend del agente de soporte"
git tag step-68-support-backend
```

---

#### Step 69 — UI checklist de onboarding en `/app`

**Do**
**Inspeccionar el código real** de `src/app/(app)/page.tsx` y `src/components/dashboard/attention-list.tsx`
(heredados de la fase de notificaciones+dashboard) antes de editar — confirmar la forma exacta en que
`getAttentionSummary` se llama y se renderiza, siguiendo el mismo principio de precaución que esa fase
ya aplicó al editar el destino post-login de Fase 1. Editar `src/app/(app)/page.tsx` para llamar
también `getOnboardingProgress(orgId)` (paso 67) en paralelo con `getAttentionSummary` (mismo
`Promise.all`) y pasar el resultado a un componente nuevo `<OnboardingChecklist />`. Crear
`src/components/agents/onboarding-checklist.tsx` — Client Component que renderiza los 3 items con su
estado, **no se renderiza en absoluto si los 3 están completos** (comportamiento documentado en §6).
Editar `src/server/dashboard/queries.ts` solo si `getAttentionSummary` necesita exponer un campo
adicional para el checklist — si no lo necesita (la llamada a `getOnboardingProgress` es independiente
y paralela), no tocar ese archivo; confirmar por lectura antes de decidir si el archivo se edita.

**Done when**
- [ ] WHEN un usuario de una organización con checklist incompleto visita `/app` THE SYSTEM SHALL renderizar `OnboardingChecklist` con los items pendientes marcados.
- [ ] WHEN los 3 items del checklist están completos THE SYSTEM SHALL omitir la sección del checklist por completo del dashboard.
- [ ] WHEN `pnpm typecheck` corre tras esta edición THE SYSTEM SHALL exit 0.

**Verify**
```bash
pnpm typecheck   # expect: exit 0
pnpm test:e2e tests/e2e/agents-onboarding.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 69: ui de checklist de onboarding en /app"
git tag step-69-onboarding-ui
```

---

#### Step 70 — Panel de chat genérico + wrapper del copiloto

**Do**
Crear `src/components/agents/agent-panel.tsx` — Client Component parametrizado por `agentKey:
AgentKey` y `conversationId?: string`, que consume el endpoint `/api/v1/agents/{agentKey}` (o
`/api/v1/copilot` cuando `agentKey==="copilot"`, ver nota de compatibilidad abajo) vía streaming SSE.
Es la generalización literal de la estructura visual y de estado que ya usaba `copilot-panel.tsx` desde
Fase 1 step 14 — mismo diálogo de aprobación inline, mismo indicador de streaming. Editar
`src/components/copilot/copilot-panel.tsx` para que se vuelva un wrapper delgado: `<AgentPanel
agentKey="copilot" conversationId={conversationId} />` — cero cambio visual para el usuario del
copiloto. Nota de compatibilidad de endpoint: `agent-panel.tsx` mapea `agentKey==="copilot"` a la ruta
`/api/v1/copilot` (no `/api/v1/agents/copilot`, que no existe — el copiloto conserva su ruta original
de Fase 1 sin cambios, ver §5). Editar `src/app/(app)/page.tsx` para montar
`<AgentPanel agentKey="onboarding" />` como panel expandible dentro de `OnboardingChecklist` (paso 69).

**Done when**
- [ ] WHEN `agent-panel.tsx` se monta con `agentKey="copilot"` THE SYSTEM SHALL consumir `/api/v1/copilot`, nunca `/api/v1/agents/copilot`.
- [ ] WHEN `agent-panel.tsx` se monta con `agentKey="onboarding"` THE SYSTEM SHALL consumir `/api/v1/agents/onboarding`.
- [ ] WHEN `tests/e2e/copilot.spec.ts` corre tras convertir `copilot-panel.tsx` en wrapper THE SYSTEM SHALL seguir pasando sin ninguna modificación a sus aserciones — la UI del copiloto es indistinguible para el usuario.

**Verify**
```bash
pnpm test:e2e tests/e2e/agents-onboarding.spec.ts tests/e2e/copilot.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 70: panel de chat generico + wrapper del copiloto"
git tag step-70-agent-panel
```

---

#### Step 71 — Widget del agente de soporte

**Do**
Crear `src/components/agents/support-widget.tsx` — botón flotante fijo (esquina inferior derecha,
mismo z-index/patrón de overlay que el diálogo de aprobación del copiloto) que al hacer clic expande
`<AgentPanel agentKey="support" />` sin `conversationId`. Editar `src/app/(app)/layout.tsx` para montar
`<SupportWidget />` una sola vez, visible en toda ruta bajo `(app)`.

**Done when**
- [ ] WHEN un usuario navega a cualquier ruta bajo `(app)` THE SYSTEM SHALL mostrar el botón flotante del widget de soporte.
- [ ] WHEN se hace clic en el botón THE SYSTEM SHALL expandir el panel del agente de soporte sin recargar la página.
- [ ] WHEN el foco está en el panel abierto y se presiona `Escape` THE SYSTEM SHALL cerrar el panel y devolver el foco al botón flotante (§15).

**Verify**
```bash
pnpm test:e2e tests/e2e/agents-support.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 71: widget del agente de soporte"
git tag step-71-support-widget
```

---

#### Step 72 — Backend del agente de contenido/marketing

**Do**
Crear `src/server/agents/content/tools.ts` con la tool `suggest_content_series` (input `{ topic:
string, pieceCount: number, channel: "whatsapp"|"instagram"|"facebook"|"tiktok", startDate?: string }`,
permiso `content.create` — reutilizado de Fase 2, sin permiso nuevo). El handler llama
`src/lib/ai/gateway.ts` (sin cambios) con un prompt que pide `pieceCount` piezas relacionadas sobre
`topic`; si `startDate` está presente, cada pieza sugiere una fecha espaciada a partir de ahí
(comportamiento de "calendario"); si está ausente, devuelve una serie ordenada sin fechas
(comportamiento de "serie"). **No crea ningún `content_item`** — mismo principio que `draft_content_copy`
de Fase 2 ("el usuario decide si usar el borrador sugerido"). Marcada `requiresApprovalFirstUse: true`,
consistente con el precedente de `draft_content_copy`/`suggest_publish_time` de Fase 2 (ambas ya
requieren aprobación pese a no mutar directamente). Crear `src/app/api/v1/agents/content/route.ts`
(POST, streaming SSE, `agentKey: "content_marketing"`).

**Done when**
- [ ] WHEN `suggest_content_series` se invoca con `startDate` presente THE SYSTEM SHALL devolver `pieceCount` piezas, cada una con una fecha sugerida distinta y creciente.
- [ ] WHEN `suggest_content_series` se invoca sin `startDate` THE SYSTEM SHALL devolver `pieceCount` piezas sin campo de fecha.
- [ ] WHEN el agente de contenido invoca `suggest_content_series` por primera vez en una organización THE SYSTEM SHALL detener el stream con `approval_required`.
- [ ] WHEN se invoca sin el permiso `content.create` THE SYSTEM SHALL responder con el mismo 403 tipado que cualquier otra mutación de Fase 1 §8.

**Verify**
```bash
pnpm test tests/unit/content-agent-tools.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 72: backend del agente de contenido/marketing"
git tag step-72-content-agent-backend
```

---

#### Step 73 — UI del calendario editorial sugerido

**Do**
Editar `src/app/(app)/content/calendar/page.tsx` (Fase 2, heredado) agregando
`<SuggestedCalendarPanel />`. Crear `src/components/calendar/suggested-calendar-panel.tsx` — monta
`<AgentPanel agentKey="content_marketing" />` para pedir una serie/calendario, y por cada pieza
sugerida en la respuesta muestra un botón "usar esta pieza" que llama el endpoint **ya existente**
`POST /api/v1/content` de Fase 2 (permiso `content.create`, sin endpoint nuevo — reutiliza la creación
de `content_item` tal cual la dejó Fase 2 §5) con el título y cuerpo de la pieza sugerida precargados en
estado `draft`.

**Done when**
- [ ] WHEN el usuario pide un calendario editorial y recibe piezas sugeridas THE SYSTEM SHALL mostrar un botón "usar esta pieza" por cada una.
- [ ] WHEN se hace clic en "usar esta pieza" THE SYSTEM SHALL crear un `content_item` en estado `draft` vía `POST /api/v1/content`, con el título y cuerpo de la sugerencia.
- [ ] WHEN la pieza recién creada aparece en la lista de contenido THE SYSTEM SHALL mostrarla como cualquier otro `content_item` en `draft` — sin campo especial que la distinga de una pieza creada manualmente.

**Verify**
```bash
pnpm test:e2e tests/e2e/agents-content.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 73: ui del calendario editorial sugerido"
git tag step-73-content-agent-ui
```

---

#### Step 74 — Backend del agente de ventas/atención — tools de solo lectura

**Do**
Crear `src/server/agents/sales/tools.ts` con 3 tools, todas con permiso `conversation.reply`
(reutilizado de Fase 1, sin permiso nuevo) y `requiresApprovalFirstUse: true`: `summarize_contact_history`
(input `{ conversationId }`, lee vía `getAgentContext("sales", orgId, { conversationId })` del paso 65
y devuelve un resumen de texto de los últimos mensajes + datos del contacto), `suggest_next_action`
(mismo input, devuelve una sugerencia breve de siguiente paso), `draft_proposal` (input `{
conversationId, notes?: string }`, devuelve un borrador de texto de propuesta). Ninguna de las 3
mutan datos ni salen del sistema. Crear `src/app/api/v1/agents/sales/route.ts` (POST, streaming SSE,
`agentKey: "sales"`, `conversationId` obligatorio en el body — a diferencia de onboarding/soporte/
contenido).

**Done when**
- [ ] WHEN `summarize_contact_history` se invoca para una conversación válida THE SYSTEM SHALL devolver un resumen no vacío basado en los mensajes de esa conversación.
- [ ] WHEN cualquiera de las 3 tools se invoca con un `conversationId` que pertenece a otra organización THE SYSTEM SHALL responder 404, nunca los datos de la conversación ajena (mismo mecanismo de §8).
- [ ] WHEN `POST /api/v1/agents/sales` recibe un body sin `conversationId` THE SYSTEM SHALL responder `400 validation_error`.
- [ ] WHEN cualquiera de las 3 tools se invoca por primera vez en una organización THE SYSTEM SHALL detener el stream con `approval_required`.

**Verify**
```bash
pnpm test tests/unit/sales-agent-tools.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 74: backend del agente de ventas — tools de solo lectura"
git tag step-74-sales-agent-readonly
```

---

#### Step 75 — Tool de envío con aprobación (`send_conversation_reply`)

**Do**
**VERIFY antes de editar:** leer el archivo real `src/server/conversations.ts` (tal como lo dejó Fase 1
step 10) para confirmar el nombre exacto de la función exportada que escribe un mensaje saliente y
respalda `POST /api/v1/conversations/:id/messages` — Fase 1 confirma el archivo y la ruta, no el
nombre del export. Editar `src/server/agents/sales/tools.ts` agregando `send_conversation_reply`
(input `{ conversationId, body: string }`, permiso `conversation.reply`, `requiresApprovalFirstUse:
true`) cuyo handler llama esa función real confirmada — **nunca duplica su lógica**, reutiliza el mismo
camino de escritura que ya usa la ruta HTTP existente, incluida la emisión del evento realtime que ese
camino ya dispara (Fase 1 §6, sin cambios). Es la **única** tool de todo el catálogo de esta fase que
envía contenido a un canal externo — el resto del catálogo (§9 pasos 67, 68, 72, 74) nunca sale del
sistema.

**Done when**
- [ ] WHEN el agente de ventas invoca `send_conversation_reply` por primera vez en una organización THE SYSTEM SHALL detener el stream con `approval_required` y no escribir ningún `message`.
- [ ] WHEN se aprueba esa primera invocación THE SYSTEM SHALL escribir un `message` con `direction='outbound'`, `sender_type='copilot'` en la conversación indicada, y registrar `audit_event` con action `conversation.replied` (o el nombre real de acción confirmado por lectura del handler existente).
- [ ] WHEN la misma organización invoca `send_conversation_reply` una segunda vez tras la primera aprobación THE SYSTEM SHALL ejecutarla directamente sin volver a pedir aprobación.
- [ ] WHEN se invoca sin el permiso `conversation.reply` THE SYSTEM SHALL responder con el mismo 403 tipado que cualquier otra mutación.

**Verify**
```bash
pnpm test tests/integration/sales-agent-send.test.ts   # expect: exit 0, 0 failed, 0 skipped
```

**Checkpoint**
```bash
git add -A && git commit -m "step 75: tool de envio con aprobacion (send_conversation_reply)"
git tag step-75-sales-agent-send
```

---

#### Step 76 — UI del agente de ventas en la bandeja

**Do**
Editar `src/components/inbox/conversation-view.tsx` (Fase 1, heredado) agregando una pestaña separada
del copiloto que monta `<AgentPanel agentKey="sales" conversationId={conversationId} />` — el copiloto
y el agente de ventas coexisten como dos paneles distintos dentro de la misma conversación, cada uno
con su propio catálogo de tools (nunca se fusionan).

**Done when**
- [ ] WHEN un usuario abre una conversación en la bandeja THE SYSTEM SHALL mostrar dos pestañas distintas: "Copiloto" y "Ventas".
- [ ] WHEN se cambia a la pestaña "Ventas" THE SYSTEM SHALL mostrar el panel del agente de ventas con el `conversationId` de la conversación abierta.
- [ ] WHEN se usa `send_conversation_reply` desde el panel de ventas THE SYSTEM SHALL reflejar el mensaje saliente en la lista de mensajes de la conversación en vivo, vía el mismo mecanismo realtime de Fase 1.

**Verify**
```bash
pnpm test:e2e tests/e2e/agents-sales.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 76: ui del agente de ventas en la bandeja"
git tag step-76-sales-agent-ui
```

---

#### Step 77 — Auditoría consolidada de los 4 agentes

**Do**
Revisar cada handler de tool en `src/server/agents/{onboarding,support,content,sales}/tools.ts`
(pasos 67, 68, 72, 74, 75) y confirmar que toda tool que **muta** datos llama `recordAuditEvent()` de
`src/lib/audit.ts` dentro de la misma transacción que la mutación — mismo patrón exacto que el
copiloto de Fase 1 ya establece (§14 de Fase 1). Las tools de solo lectura (`get_onboarding_progress`,
`suggest_next_onboarding_step`, `search_knowledge_base`, `suggest_content_series`,
`summarize_contact_history`, `suggest_next_action`, `draft_proposal`) no requieren `audit_event` — no
mutan nada, mismo criterio que ya aplica el copiloto (Fase 1 nunca audita una lectura). Solo
`send_conversation_reply` (paso 75) es una mutación real en este catálogo; confirmar que su llamada a
`recordAuditEvent` quedó dentro de la transacción en el paso 75 y, si no, corregirla en este paso.

**Done when**
- [ ] WHEN `send_conversation_reply` se ejecuta con éxito THE SYSTEM SHALL registrar exactamente una fila en `audit_event` dentro de la misma transacción que el `message` insertado.
- [ ] WHEN la transacción de `send_conversation_reply` hace rollback (fallo simulado) THE SYSTEM SHALL dejar `audit_event` sin la fila — cero filas huérfanas, mismo comportamiento que `recordAuditEvent` ya garantiza desde Fase 1 step 6.
- [ ] WHEN se audita estáticamente el código de las 7 tools de solo lectura del catálogo de esta fase THE SYSTEM SHALL confirmar que ninguna llama `recordAuditEvent` — no hay auditoría espuria de lecturas.

**Verify**
```bash
pnpm test tests/unit/agents-audit-coverage.test.ts   # expect: exit 0, 0 failed, 0 skipped
```

**Checkpoint**
```bash
git add -A && git commit -m "step 77: auditoria consolidada de los 4 agentes"
git tag step-77-agents-audit
```

---

#### Step 78 — E2E completo de aislamiento de tenant + a11y

**Do**
Editar el test E2E de aislamiento de tenant heredado de Fase 1 step 5 (`tests/e2e/tenant-isolation.spec.ts`
— **VERIFY**: confirmar el nombre real del archivo por lectura del repo antes de editar; Fase 1 §13
lo describe como "Test E2E de aislamiento" sin publicar el nombre literal del archivo) agregando 4
casos: un usuario de la organización A nunca puede leer el progreso de onboarding, la base de
conocimiento (no aplica — es global, sin dato de org, se documenta como no aplicable en el caso de
prueba), las sugerencias de contenido, ni resumir una conversación de la organización B a través de
ninguno de los 4 endpoints nuevos de `/api/v1/agents/*`. Editar `tests/e2e/a11y.spec.ts` (heredado de
Fase 1 step 16) agregando las rutas nuevas de esta fase a la auditoría automatizada de axe: `/app`
(con el checklist visible), `/app/inbox` (con la pestaña de ventas abierta), `/app/content/calendar`
(con el panel de calendario sugerido abierto).

**Done when**
- [ ] WHEN un usuario de la organización A invoca cualquiera de los 4 endpoints de agentes nuevos con un `conversationId`/`orgId` de la organización B THE SYSTEM SHALL responder 404 sin filtrar datos, para los 3 casos aplicables (onboarding, contenido, ventas — soporte no aplica por no tener dato de org).
- [ ] WHEN axe corre sobre `/app`, `/app/inbox` con la pestaña de ventas abierta, y `/app/content/calendar` con el panel de calendario sugerido abierto THE SYSTEM SHALL reportar 0 violaciones.

**Verify**
```bash
pnpm test:e2e tests/e2e/tenant-isolation.spec.ts   # expect: exit 0, 0 failed
pnpm test:e2e tests/e2e/a11y.spec.ts               # expect: exit 0, 0 failed — 0 violaciones
```

**Checkpoint**
```bash
git add -A && git commit -m "step 78: e2e de aislamiento de tenant + a11y para los 4 agentes"
git tag step-78-agents-tenant-isolation-a11y
```

---

#### Step 79 — Verificación final de Fase 4

**Do**
Correr la puerta de aceptación completa (§20.1) sobre un checkout limpio, confirmar que los 79 tags de
checkpoint acumulados existen (63 heredados + 16 de esta fase), y cerrar la fase con un commit vacío de
verificación — mismo patrón exacto que el paso de cierre de la fase de notificaciones+dashboard
(`step-63-verification`).

**Done when**
- [ ] WHEN `git tag -l 'step-*' | wc -l` corre THE SYSTEM SHALL reportar exactamente `79`.
- [ ] WHEN la puerta de aceptación completa de §20.1 corre sobre un checkout limpio THE SYSTEM SHALL exit 0 en cada línea.

**Verify**
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
test "$(git tag -l 'step-*' | wc -l | tr -d ' ')" = "79"
```

**Checkpoint**
```bash
git add -A && git commit -m "step 79: verificacion final fase 4 — agentes ia" --allow-empty
git tag step-79-verification
```

---

### 9.1 Parity and cutover

`NOT APPLICABLE — greenfield build sobre código existente, no reemplaza ningún sistema en producción.`
Esta fase generaliza el schema de `runs` de forma expand-only (§4) y edita `runs.ts` en el mismo paso
que la migración, con regresión del E2E del copiloto corrida en ese mismo paso — no hay un sistema
paralelo, ni shadow period, ni cutover: el copiloto de Fase 1 nunca deja de estar disponible durante
esta fase, en ningún punto del build.

---

## 10. Environment Setup

### Prerequisites

Sin cambios respecto a Fase 1-3 + notificaciones. Ver `blueprints/nucleo-fase-1/blueprint.md` §10 para
la tabla completa (Node 24.19.0, pnpm 11.21.0, Docker Compose).

### Cuentas a crear primero

Ninguna cuenta nueva — esta fase no introduce ningún proveedor externo. `ANTHROPIC_API_KEY` ya existe
desde Fase 1.

### Environment variables

| Variable | Purpose | Where to get it | Required by step | Secret? |
|---|---|---|---|---|
| `ONBOARDING_MODEL_ID` | Override opcional del modelo para el agente de onboarding | ver §17 — opcional, fallback a `COPILOT_MODEL_ID` | 65 | no |
| `SUPPORT_MODEL_ID` | Override opcional del modelo para el agente de soporte | ídem | 65 | no |
| `CONTENT_MODEL_ID` | Override opcional del modelo para el agente de contenido | ídem | 65 | no |
| `SALES_MODEL_ID` | Override opcional del modelo para el agente de ventas | ídem | 65 | no |

Las 4 son **opcionales** — ninguna requiere valor para que el build funcione, todas hacen fallback a
`COPILOT_MODEL_ID` (ya requerido y validado desde Fase 1 step 13, sin cambios). `.env.example` las
agrega en blanco bajo el comentario `# Agentes IA (Fase 4) — opcional, fallback a COPILOT_MODEL_ID`.

### Files that must be committed

| File | Why it is committed | Ignore-file exception line |
|---|---|---|
| `docs/help/*.md` | Base de conocimiento estática del agente de soporte — contenido de producto, no configuración local | no matcheado por ningún patrón del `.gitignore` heredado — `docs/**` no está en ningún patrón de ignore de Fase 1-3 |
| `.env.example` (líneas nuevas) | Documenta las 4 variables opcionales nuevas | `!.env.example` ya en su lugar desde el Bootstrap de Fase 1 — esta fase no edita el `.gitignore` |

El `.gitignore` del proyecto ya existe desde el Bootstrap de Fase 1 (con `!.env.example` ya en su
lugar) — esta fase no lo edita.

### Bootstrap

```bash
# orden: verificar Fase 1-3+notificaciones completas -> copiar workspace/ de esta fase (guardado) ->
# instalar dependencias (ninguna nueva) -> fusionar .env.example -> .env (no-op, sin claves requeridas nuevas)
set -e

# 1. Verificar que las fases previas están completas antes de tocar nada — deben existir al menos
#    63 checkpoints (Fase 1: step-01..step-18, Fase 2: step-19..step-32, Fase 3: step-33..step-48,
#    notificaciones+dashboard: step-49..step-63). Mismo mecanismo que Fase 3 y notificaciones ya usaron.
STEP_TAGS=$(git tag -l 'step-*' | wc -l | tr -d ' ')
if [ "$STEP_TAGS" -lt 63 ]; then
  echo "ABORT: se esperaban al menos 63 checkpoints (Fase 1-3 + notificaciones/dashboard), se encontraron $STEP_TAGS" >&2
  exit 1
fi
git tag -l 'step-18-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 1
git tag -l 'step-32-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 2
git tag -l 'step-48-deploy-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 3 (nombre confirmado por lectura de blueprints/nucleo-fase-3/blueprint.md §9 paso 16, no asumido)
git tag -l 'step-63-verification' | grep -q .   # expect: exit 0 — cierre explícito de notificaciones+dashboard

# 2. Copiar el workspace de esta fase al root del proyecto — rutas completas explícitas.
rsync -a --ignore-existing \
  "./blueprints/nucleo-fase-4/workspace/" \
  "./"
  # -a: preserva permisos/timestamps · --ignore-existing: nunca pisa un archivo que el build ya cambió.
  # Exit 0 en ambos casos (copia o salta) — nunca uses `cp -n`, que sale 1 al saltar en BSD/macOS.

# 3. Fusionar .claude/settings.json de esta fase dentro del acumulado — esta fase no agrega ninguna
#    entrada nueva de permisos (§19.3), pero se invoca por consistencia con el patrón establecido y
#    porque el script es idempotente si el archivo de esta fase no aporta nada nuevo.
node scripts/merge-claude-settings.mjs "./blueprints/nucleo-fase-4/workspace/.claude/settings.json"

# 4. Confirmar dependencias — esta fase no agrega ningún paquete nuevo (§11), pero se confirma el
#    lockfile tras el rsync por el mismo principio que las fases anteriores.
pnpm install --frozen-lockfile

# 5. Fusionar en el .env real cualquier variable de .env.example que .env todavía no tenga — mismo
#    mecanismo establecido en Fase 2. Esta fase agrega 4 claves opcionales; el merge es un no-op si
#    ya existen (aunque sea en blanco) y las agrega en blanco si no existen — ninguna es requerida
#    para que el build siga funcionando.
touch .env
while IFS= read -r line; do
  case "$line" in
    ''|'#'*) continue ;;
  esac
  key="${line%%=*}"
  grep -q "^${key}=" .env || printf '%s\n' "$line" >> .env
done < .env.example
```

**Re-ejecutar este bloque sobre un árbol ya bootstrapeado es seguro:** el paso 1 no muta nada (solo lee
tags); el paso 2 salta todo lo que ya existe (`rsync --ignore-existing`, exit 0 en ambos casos); el
paso 3 fusiona con `Set` deduplicado (idempotente, heredado); el paso 4 no reinstala si el lockfile ya
está satisfecho; el paso 5 solo añade líneas ausentes a `.env`, nunca pisa una ya presente.

---

## 11. Dependencies

**Esta fase no agrega ningún paquete nuevo.** Reutiliza `@anthropic-ai/sdk` (Fase 1, `^0.117.1`,
instalado en Fase 1 step 13), `drizzle-orm`/`drizzle-kit` (Fase 1), y toda la infraestructura de
Postgres/Redis/Docker Compose ya provisionada por Fase 1. Ningún paquete de esta tabla requiere
verificación en vivo porque ninguno se instala en esta fase.

### Runtime

`NOT APPLICABLE — sin paquetes nuevos en esta fase.`

### Development

`NOT APPLICABLE — sin paquetes nuevos en esta fase.`

### Deliberately not used

| Rejected | Instead | Why |
|---|---|---|
| Una librería de búsqueda vectorial (`pgvector`, un servicio de embeddings) para la base de conocimiento del agente de soporte | Búsqueda por keyword simple sobre archivos markdown, sin dependencia nueva | §1 Non-Goals — el catálogo de documentos de ayuda es pequeño en v1; agregar infraestructura vectorial ahora es sobre-ingeniería sin demanda validada |
| Un segundo cliente/wrapper del SDK de Anthropic para los agentes nuevos | Reutilizar `src/lib/ai/gateway.ts` (Fase 1), único importador del SDK en todo el proyecto | Evita duplicar la lógica de streaming, manejo de `refusal` y reintentos ya construida y probada en Fase 1 |
| Un motor de ejecución de agentes nuevo, paralelo a `runs`/`steps`/`tool_calls`/`approvals` | Generalizar las tablas existentes del copiloto (§4, §9 paso 64) | Repetiría exactamente el problema que Fase 3 evitó al no reutilizar esas tablas para automatizaciones (Decisión #7, Fase 3) — la diferencia aquí es que la condición de reversión de esa misma decisión ya se cumple: el copiloto ahora expone un mecanismo de aprobación desacoplado del contexto conversacional (`agent_key` + columnas nullable), así que generalizar es correcto en esta fase donde no lo era en Fase 3 |

---

## 12. Deployment Strategy

### Hosting

Sin cambios — mismo VPS, mismo Docker Compose + Caddy, mismo comando de build (`pnpm build`,
`output: "standalone"`) y mismo runtime (`node .next/standalone/server.js`). Ningún componente
desplegable nuevo — los 4 endpoints de agentes corren dentro del mismo proceso Next.js ya desplegado.

### Environments

Sin cambios respecto a Fase 1-3 + notificaciones.

### CI/CD

Sin cambios en la estructura del pipeline heredado (`install` → `typecheck` → `lint` → `test` →
`test:e2e` → `build`) — ahora también cubre `src/server/agents/**`, `src/components/agents/**`,
`src/app/api/v1/agents/**`, `docs/help/**` y `tests/{unit,integration,e2e}/agents*.test.ts` /
`*agents*.spec.ts`, sin configuración adicional porque son parte del mismo árbol de fuentes.

### Release and rollback

Sin cambios — mismo mecanismo heredado. No hay componente desplegable nuevo que coordinar por
separado. Rollback: `docker compose -f docker-compose.prod.yml up -d --no-deps app` apuntando a la
imagen anterior — la migración de `runs.agent_key` (§9 paso 64) es aditiva y no bloquea un rollback de
código (la columna nueva simplemente queda sin usar si se revierte el código, sin romper nada).

### Domain, DNS, TLS

Sin cambios.

---

## 13. Testing Strategy

| Layer | Framework | What it covers | Where | Runs |
|---|---|---|---|---|
| Unit | Vitest (heredado) | `AGENT_CATALOG`, `getAgentContext`, motor generalizado, progreso de onboarding, base de conocimiento, tools de contenido/ventas, cobertura de auditoría | `tests/unit/agents*.test.ts`, `tests/unit/onboarding-progress.test.ts`, `tests/unit/support-knowledge-base.test.ts`, `tests/unit/content-agent-tools.test.ts`, `tests/unit/sales-agent-tools.test.ts` | cada commit |
| Integration | Vitest (heredado) contra Postgres real | `send_conversation_reply` de punta a punta (aprobación, escritura de mensaje, audit_event) | `tests/integration/sales-agent-send.test.ts` | cada commit |
| E2E | Playwright (heredado) | Flujos completos de los 4 agentes, aislamiento de tenant extendido, a11y de las rutas nuevas | `tests/e2e/agents-*.spec.ts`, `tests/e2e/tenant-isolation.spec.ts`, `tests/e2e/a11y.spec.ts` | pre-deploy |

### Critical flows to cover E2E

1. Aislamiento de tenant a través de los 4 endpoints de agentes nuevos — extensión directa del test de
   Fase 1 step 5 (§9 paso 78).
2. El copiloto de Fase 1 sigue funcionando exactamente igual tras la migración y la generalización del
   motor (`tests/e2e/copilot.spec.ts`, re-corrido sin modificación en los pasos 64, 66 y 70).
3. Aprobación en primer uso de `send_conversation_reply` — la única acción de esta fase que sale a un
   canal externo, mismo patrón que el copiloto (paso 75).

### Test data

`TEST_DATABASE_URL` — sin cambios, mismo Postgres separado ya provisionado por Fase 1
(`docker-compose.yml`, heredado, ninguna variable ni servicio nuevo en esta fase).

### What is deliberately not tested

Ranking de relevancia de `searchKnowledgeBase` más allá de "el documento correcto aparece primero" — no
hay un benchmark de calidad de búsqueda en v1 dado que es una implementación deliberadamente simple
(§1 Non-Goals). Latencia de los 4 endpoints de agentes bajo carga — mismo criterio que Fase 1 §13, sin
SLA de throughput definido todavía.

---

## 14. Security & Secrets

Hereda íntegramente la tabla de Fase 1 §14 — sin cambios de mecanismo. Filas específicas de esta fase:

| Concern | Control | Implemented in |
|---|---|---|
| Aislamiento de memoria contextual entre agentes | Cada rama de `getAgentContext` lee solo el subconjunto de tablas documentado en §4/§8 — nunca una query genérica parametrizada por tabla | `src/server/agents/context.ts` |
| La única acción de esta fase que sale a un canal externo | `send_conversation_reply` — aprobación en primer uso obligatoria, mismo patrón que el copiloto | `src/server/agents/sales/tools.ts` |
| Auditoría de mutaciones de agentes | `recordAuditEvent()` dentro de la misma transacción — verificado explícitamente en §9 paso 77 | `src/lib/audit.ts` |

**Reglas duras heredadas, sin excepción para los agentes nuevos:**
- Ningún secreto se comitea, se imprime en log, ni se embebe en un bundle de cliente.
- Toda verificación de autorización server-side corre antes del trabajo, no después.
- Ninguna tool de ningún agente sale a un canal externo sin aprobación en primer uso.

Sin datos regulados nuevos — los 4 agentes leen subconjuntos de datos ya cubiertos por la evaluación de
Fase 1 §14 (mensajes, contactos, contenido), nunca un dataset más amplio.

---

## 15. Accessibility

**Target: WCAG 2.2 Level AA — heredado, sin cambios de baseline.**

Elemento nuevo de esta fase: el widget flotante del agente de soporte (§9 paso 71) es un patrón de
diálogo modal — `Escape` cierra y devuelve el foco al botón que lo abrió (criterio ya escrito en el
"Done when" del paso 71), y el foco queda atrapado dentro del panel mientras está abierto (2.4.11 Focus
Not Obscured, mismo criterio que ya aplica el panel del copiloto desde Fase 1 §15).

### Verification

```bash
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: 0 violations — cubre /app, /app/inbox y /app/content/calendar con los paneles de agente abiertos (§9 paso 78)
```

---

## 16. Observability & Cost

### Instrumentation

Hereda pino + logs estructurados de Fase 1 §16, sin cambios de mecanismo. Métrica nueva: `runs`
agrupado por `agent_key` es ahora consultable directamente gracias al índice de §4 — habilita la
métrica de adopción de §1 sin construir ninguna tabla de analítica nueva.

### The metrics that matter for this project

| Metric | Target | Alert at |
|---|---|---|
| Distribución de `runs` por `agent_key` en 7 días | sin objetivo fijo — piloto | un agente con 0 runs tras 2 semanas de disponibilidad revisar manualmente si la UI lo expone correctamente |
| Tasa de aprobación denegada en `send_conversation_reply` | sin objetivo fijo — piloto | tasa de denegación > 30% revisar el prompt/calidad de las sugerencias del agente de ventas |

### Health check

Sin cambios — `GET /api/health` (Fase 1) no requiere ninguna adición porque esta fase no introduce
ningún servicio nuevo.

### Cost model

| Service | Free tier | Cost at expected v1 scale | Cost at 10× | Cliff to watch |
|---|---|---|---|---|
| `@anthropic-ai/sdk` (4 agentes nuevos, mismo modelo por defecto que el copiloto) | — | incremental sobre el costo ya presupuestado del copiloto en Fase 1, proporcional a turnos de los 4 agentes | escala linealmente con adopción | ninguno hasta volumen alto — sin prompt caching configurado, mismo gap ya documentado en Fase 1 §16 |

**Estimated additional monthly cost: marginal, proporcional al uso de los 4 agentes nuevos, sobre el
mismo modelo y la misma facturación ya presupuestada por el copiloto de Fase 1.** Ningún componente de
infraestructura nuevo (VPS, Postgres, Redis) — el único costo variable de esta fase es la llamada
adicional al SDK de Anthropic.

---

## 17. Model Routing

Este proyecto llama un LLM en runtime a través de 5 puntos de invocación ahora (copiloto + 4 agentes
nuevos), todos vía el mismo `src/lib/ai/gateway.ts` de Fase 1. **El id de modelo, contexto y precio ya
se verificaron en Fase 1 invocando el skill `claude-api`** — esta fase no re-verifica porque no cambia
el modelo, solo agrega la posibilidad de un override por agente.

### Routing table

| Task in this product | Model tier | Why this tier | Fallback |
|---|---|---|---|
| Agente de onboarding, soporte, contenido, ventas (todos, por defecto) | mismo tier que el copiloto (`claude-sonnet-5`, ver Fase 1 §17) | Los 4 agentes tienen alcance acotado (catálogos de 1-4 tools cada uno, sin razonamiento multi-paso complejo) — no justifican un tier superior a Opus, mismo criterio que ya aplicó Fase 1 al copiloto | Si `ONBOARDING_MODEL_ID`/`SUPPORT_MODEL_ID`/`CONTENT_MODEL_ID`/`SALES_MODEL_ID` se define individualmente, ese agente usa ese modelo en vez del default — mecanismo de override, no de fallback ante fallo |

### Prompt and context strategy

Cada agente tiene su propio system prompt, versionado como constante con comentario de fecha dentro de
su propio archivo de tools/route — mismo patrón ya establecido por `runs.ts` en Fase 1 (constante
versionada, sin sistema de gestión de prompts dedicado en v1). Contexto por turno: acotado por
`getAgentContext` (§4/§8), nunca el dataset completo de la organización.

### Cost controls

Mismo rate limit heredado (20 llamadas/minuto por usuario, ahora aplicado también a los 4 endpoints
nuevos, ver §5) — sin límite de gasto adicional por agente en v1, mismo criterio que Fase 1 §17.

### Failure handling

Idéntico al copiloto: timeout de 30s con un reintento (heredado de `streamCopilotTurn`, sin cambios),
`stop_reason: "refusal"` mostrado como "el agente no puede ayudar con esto", error de red tras
reintento mostrado como "el agente no respondió, intenta de nuevo".

### Evaluation

Sin conjunto de evaluación automatizada nuevo — antes de cambiar el prompt de cualquiera de los 4
agentes, el equipo corre manualmente el spec E2E correspondiente (`tests/e2e/agents-{onboarding,
support,content,sales}.spec.ts`) más una revisión manual de conversaciones piloto reales, mismo
criterio que Fase 1 §17 ya aplica al copiloto.

---

## 18. Skills to Use During Build

| Skill | Build steps | Why | Install |
|---|---|---|---|
| `claude-api` | ninguno directo — esta fase no cambia ningún id de modelo, precio ni parámetro; se invoca solo si algún paso decide fijar un `*_MODEL_ID` distinto del default en producción | Verificar cualquier id de modelo antes de escribirlo, si llegara a necesitarse | Auto-activa; bundled |
| `add-agent-tool` | 67, 68, 72, 74, 75 | Flujo de 4 pasos para registrar una tool nueva en el catálogo de un agente, generalización del skill `add-copilot-tool` de Fase 1 para cubrir los 5 `agentKey` — ver §19.4 | Auto-activa; sin instalación adicional — emitido en `workspace/.claude/skills/add-agent-tool/` |
| `playwright-cli` | 67, 68, 71, 73, 76, 78 | Los 4 suites E2E nuevos de esta fase se benefician de las herramientas de depuración de Playwright ya instaladas desde Fase 1 §18 | `npm install -g @playwright/cli@latest` luego `playwright-cli install --skills` (heredado, ya instalado si Fase 1 se siguió) |

Ningún skill de este blueprint es una dependencia dura — si no está instalado, el builder sigue la guía
propia de este documento y lo nota en una línea al llegar a ese paso.

---

## 19. Agent Workspace

Bundle mode: los artefactos siguientes se escriben como archivos reales bajo `workspace/` en el bundle
y el builder los copia al root del proyecto con el comando de Bootstrap (§10) antes del step 64.

### 19.1 `CLAUDE.md`

`CLAUDE.md` ya existe en el root del proyecto (Fase 1, extendido por Fase 2/3/notificaciones). Esta
fase **no reemplaza el archivo** — el builder aplica el bloque de abajo como una inserción manual bajo
la sección "Fases" del `CLAUDE.md` existente (mismo patrón que Fase 2/3/notificaciones ya establecieron
al no regenerar el archivo completo). Se reproduce aquí el bloque completo por integridad del
documento — es el contenido que `workspace/CLAUDE.md` trae para fusionar.

```markdown
## Fase 4 — Agentes IA

4 agentes nuevos comparten el motor runs/steps/tool_calls/approvals del copiloto (Fase 1),
distinguidos por `runs.agent_key`.

| Agente | `agent_key` | Conversación | Endpoint | Permiso |
|---|---|---|---|---|
| Onboarding | `onboarding` | nunca | `POST /api/v1/agents/onboarding` | ninguno |
| Soporte | `support` | nunca | `POST /api/v1/agents/support` | ninguno |
| Contenido/marketing | `content_marketing` | nunca | `POST /api/v1/agents/content` | `content.create` |
| Ventas/atención | `sales` | siempre | `POST /api/v1/agents/sales` | `conversation.reply` |

Reglas:
- Cualquier tool nueva de cualquier agente sigue el skill `add-agent-tool`.
- `src/server/agents/context.ts` es el único punto de lectura de memoria contextual para los 4 agentes
  nuevos — nunca una query directa a otra tabla desde un handler de tool.
- Solo `send_conversation_reply` (agente de ventas) sale a un canal externo — cualquier tool nueva que
  también lo haga necesita el mismo patrón de aprobación en primer uso, sin excepción.
- El copiloto de Fase 1 (`agent_key = 'copilot'`) sigue funcionando exactamente igual — su UI
  (`copilot-panel.tsx`) es un wrapper de `agent-panel.tsx`, no un componente separado.
```

### 19.2 `AGENTS.md`

`AGENTS.md` ya existe (Fase 1). Esta fase agrega el mismo bloque de arriba, sin duplicar contenido —
el archivo permanece bajo 40 líneas totales, apuntando a `CLAUDE.md` como fuente de verdad.

### 19.3 `.claude/settings.json`

**Esta fase no agrega ninguna entrada nueva a `permissions.allow`.** Cada comando usado en los `Verify`
de §9 (`pnpm test:*`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`/`pnpm exec playwright:*`, `pnpm
db:migrate`, `psql`, `git tag`/`git commit`/`git status`) ya coincide con un glob existente en el
`settings.json` acumulado de Fase 1 (§19.3 de `nucleo-fase-1/blueprint.md`, líneas 2644-2711):

| Verify command de esta fase | Glob existente que lo cubre |
|---|---|
| `pnpm db:migrate` | `Bash(pnpm db\:migrate:*)` |
| `pnpm test tests/unit/*.test.ts` | `Bash(pnpm test:*)` |
| `pnpm test:e2e tests/e2e/*.spec.ts` | `Bash(pnpm test:*)` (el script `test:e2e` de `package.json` invoca Playwright, cubierto también por `Bash(pnpm exec playwright:*)`) |
| `pnpm typecheck` | `Bash(pnpm typecheck)` |
| `pnpm lint` | `Bash(pnpm lint:*)` |
| `pnpm build` | `Bash(pnpm build)` |
| `psql "$DATABASE_URL" -tAc "..."` | `Bash(psql:*)` |
| `git tag -l 'step-*'`, `git add`, `git commit`, `git tag` | `Bash(git tag:*)`, `Bash(git add:*)`, `Bash(git commit:*)` |

`workspace/.claude/settings.json` se emite de todos modos, con el mismo contenido heredado sin
modificación, para que `scripts/merge-claude-settings.mjs` (§10 Bootstrap) tenga un archivo válido que
fusionar — el merge es un no-op porque cada entrada ya existe en el acumulado.

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm test:*)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm build)",
      "Bash(pnpm exec playwright:*)",
      "Bash(pnpm exec vitest:*)",
      "Bash(pnpm db\\:migrate:*)",
      "Bash(psql:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git tag:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(rsync -a --ignore-existing*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Bash(git push:*)",
      "Bash(git reset --hard*)"
    ]
  }
}
```

### 19.4 Project skills — `.claude/skills/add-agent-tool/SKILL.md`

```markdown
---
name: add-agent-tool
description: Flujo para registrar una nueva tool call en el catálogo de cualquiera de los 5 agentes
  (copilot, onboarding, support, content_marketing, sales), con su permiso y aprobación en el primer
  uso. Generalización del skill add-copilot-tool de Fase 1 para cubrir los 4 agentes nuevos. Usar
  cuando se pida que un agente pueda hacer una acción nueva.
---

# Add Agent Tool

## When to use
Al agregar una acción nueva que cualquiera de los 5 agentes pueda ejecutar sobre datos ya expuestos
por `src/server/agents/context.ts` para ese agente (nunca datos fuera de su acceso acotado — ver
`blueprint.md` §4/§8 de Fase 4 para el subconjunto exacto de cada agente).

## Steps
1. Define la tool en `src/server/agents/{agentKey}/tools.ts` (o `src/server/copilot/tools.ts` si
   `agentKey === "copilot"`) con su `name`, `description` prescriptiva, `input_schema`, el
   `permission_key` que requiere (o ninguno si el agente no toca dato sensible de organización, ver
   §8 de este blueprint), y `requiresApprovalFirstUse: true` por defecto.
2. Implementa el handler, llamando `requirePermission()` si aplica y `recordAuditEvent()` dentro de
   la misma transacción si la tool muta algo. Una tool de solo lectura no llama `recordAuditEvent()`.
3. Si la tool necesita leer datos de otra tabla, agrega la rama correspondiente en
   `src/server/agents/context.ts` en vez de hacer la query directamente en el handler.
4. Confirma que el motor generalizado (`src/server/copilot/runs.ts`) reconoce el nuevo `tool_name` en
   su lógica de aprobación-en-primer-uso — no debería requerir cambios si sigues el patrón existente.
5. Agrega un caso al spec E2E del agente correspondiente con un fixture grabado de la respuesta del
   modelo invocando la nueva tool.

## Verify
```bash
pnpm test:e2e tests/e2e/agents-{agentKey}.spec.ts   # expect: exit 0
```

## Do not
- No marques una tool como `requiresApprovalFirstUse: false` sin justificación explícita.
- No agregues una tool que envíe contenido a un canal externo sin el mismo patrón de aprobación que ya
  usa `send_conversation_reply` — sin excepción.
- No hagas una query directa a una tabla fuera del subconjunto ya expuesto por
  `src/server/agents/context.ts` para ese agente — si necesitas un dato nuevo, amplía `context.ts`
  primero, en su propia rama por agente.
```

### 19.5 `.claude/rules/*.md`

| File | `paths` globs | Covers |
|---|---|---|
| `.claude/rules/agents.md` | `src/server/agents/**`, `src/app/api/v1/agents/**` | Convenciones del motor de agentes generalizado |

```markdown
---
description: Convenciones del motor de agentes generalizado (Fase 4)
paths:
  - "src/server/agents/**"
  - "src/app/api/v1/agents/**"
---

- `src/server/copilot/runs.ts` sigue siendo el único orquestador de `runs`/`steps`/`tool_calls`/
  `approvals` — ningún agente crea su propio bucle de orquestación paralelo.
- `src/server/agents/context.ts` es el único punto de lectura de memoria contextual para los agentes
  nuevos — ninguna tool hace una query directa a una tabla fuera de su rama en ese archivo.
- Todo `agentKey` nuevo se registra primero en `AGENT_CATALOG` (`src/server/agents/registry.ts`) antes
  de usarse en cualquier otro archivo.
- Solo una tool marcada explícitamente (`send_conversation_reply`, o su equivalente futuro) puede
  enviar contenido a un canal externo, y siempre con `requiresApprovalFirstUse: true`.
- `runs.agent_key` es obligatorio en todo insert — nunca se omite ni se infiere.
```

Nota: `.claude/rules/copilot.md` (Fase 1) sigue vigente sin cambios — describe el patrón interno de
`runs`/`steps`/`tool_calls`/`approvals`, que esta fase generaliza pero no reemplaza. No se edita en
esta fase.

### 19.6 Verify-critical config and local infrastructure

**Ningún archivo de configuración nuevo en esta fase.** Todo `Verify` de §9 usa infraestructura ya
provisionada por Fase 1: `vitest.config.ts`, `playwright.config.ts`, `tests/setup/env.ts`,
`docker-compose.yml` (Postgres + Redis), `drizzle.config.ts`, `tsconfig.json` — ninguno se edita en
esta fase porque ningún test nuevo necesita una convención de resolución, un alias o una variable de
entorno que esos archivos no cubran ya. Los 4 archivos markdown de `docs/help/` no son configuración
de infraestructura, son contenido de producto autorado en §9 paso 68.

| File | Path in the project | Which `Verify` commands need it | Resolution/env handling it carries | Bundle-path exclusion |
|---|---|---|---|---|
| `vitest.config.ts` | `vitest.config.ts` | pasos 64-68, 72, 74, 75, 77 | heredado de Fase 1, sin cambios — ya excluye `blueprints/` | `blueprints/**` ya excluido desde Fase 1 §19.6 |
| `playwright.config.ts` | `playwright.config.ts` | pasos 67-71, 73, 76, 78 | heredado de Fase 1, sin cambios | ídem |
| `tests/setup/env.ts` | `tests/setup/env.ts` | todos los `Verify` que corren contra Postgres/Redis reales | heredado — ya carga `.env.test`/`.env` vía `dotenv/config`, ninguna variable nueva de esta fase es requerida (todas opcionales, §10) | n/a |
| `docker-compose.yml` | `docker-compose.yml` | pasos 64 (`psql`), 75 (integración) | heredado, sin cambios — mismo Postgres/Redis de Fase 1 | ídem |

#### Resolution convention matrix

`NOT APPLICABLE — esta fase no introduce ningún import/link convention nuevo.` Todo archivo nuevo usa
el alias `@/` → `src/` y especificadores relativos `.ts` ya establecidos por Fase 1 §3, sin ninguna
excepción ni contexto de carga adicional (ningún script standalone nuevo, ningún codegen).

#### Cross-artifact value reconciliation

| Shared value | Single source — the file that decides it | Literal value | Every other place it appears | Compared |
|---|---|---|---|---|
| Nombres de tags de checkpoint de esta fase | §9, cada bloque `Checkpoint` | `step-{64..79}-{slug}`, continuando la secuencia global sin prefijo ya establecida (Fase 1 `step-01`..`step-18`, Fase 2 `step-19`..`step-32`, Fase 3 `step-33`..`step-48`, notificaciones+dashboard `step-49`..`step-63`) | `tasks.json` (`checkpoint` de cada tarea), cada `epics/*.md`, §10 Bootstrap (verificación de conteo, `-lt 63`), §20.1 | yes |
| Las 5 claves de `AgentKey` | `src/server/agents/registry.ts` (§9 paso 65) | `"copilot" \| "onboarding" \| "support" \| "content_marketing" \| "sales"` | §5 (rutas), §6 (componentes), §8 (permisos por endpoint), cada paso de §9 que crea un endpoint nuevo | yes |
| Ruta base de cada endpoint de agente | §5 Routes table | `/api/v1/agents/{onboarding,support,content,sales}` (copilot conserva `/api/v1/copilot`, sin prefijo `agents/`) | `agent-panel.tsx` (paso 70, mapeo de `agentKey` a ruta), cada `route.ts` de §9 (pasos 67, 68, 72, 74) | yes |

#### Byte-exact artifact reconciliation

`NOT APPLICABLE — esta fase no autora ningún golden file, fixture de snapshot ni literal que un
Verify compare byte a byte contra una salida generada. Los contenidos de docs/help/*.md (paso 68) son
contenido de producto leído por el agente en tiempo de ejecución, nunca diffeados contra una salida
esperada.`

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
pnpm test:e2e                          # expect: exit 0, 0 failed
pnpm build                             # expect: exit 0
node .next/standalone/server.js &      # arranca el servidor construido
sleep 2
test "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/health)" = "200"
kill %1
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: exit 0, 0 violations
```

**Todo lo de arriba exit 0 en un build correcto** (§9 reglas 11/16) — ninguna línea gatea en un exit
distinto de 0 sin envolver la aserción del código específico.

Plus these manual gates, each checked once before launch:

- [ ] Los 16 checkpoints de esta fase (`step-64` a `step-79`) existen en git, y el total acumulado es
      exactamente 79 (`git tag -l 'step-*' | wc -l`).
- [ ] `tests/e2e/copilot.spec.ts` sigue pasando sin ninguna modificación a sus aserciones — la
      generalización del motor (pasos 64, 66) no cambió el comportamiento observable del copiloto.
- [ ] Cada uno de los 4 agentes nuevos tiene al menos un `run` real registrado con su `agent_key`
      correcto tras una sesión piloto manual.
- [ ] Toda mutación de los 4 agentes nuevos (en la práctica, solo `send_conversation_reply`) tiene su
      fila correspondiente en `audit_event` — confirmado por §9 paso 77.
- [ ] Cada no-objetivo de §1 sigue sin construirse — en particular, ningún trigger cron/proactivo se
      agregó a ningún agente.
- [ ] El checklist de onboarding desaparece del dashboard cuando los 3 items están completos —
      verificado manualmente contra una organización piloto real.

**No warnings are ignored.**

### 20.2 Risk register

| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---|---|---|---|
| La migración de `runs` rompe el copiloto de Fase 1 en producción | L | H | `tests/e2e/copilot.spec.ts` falla en el paso 64 o 66 | Verify de ambos pasos re-corre ese spec exacto sin modificarlo, en el mismo paso que toca las tablas — nunca se pospone al final (§9, riesgo declarado por el usuario) |
| El nombre real de la función orquestadora de `runs.ts` o de la función de envío en `conversations.ts` difiere de lo asumido | M | M | El paso 66 o 75 falla al compilar tras la generalización | Ambos pasos empiezan con una lectura explícita del código real (`VERIFY:` en el `Do`) antes de editar — nunca se asume el nombre |
| Un builder marca una tool nueva como `requiresApprovalFirstUse: false` sin justificación real | B | M | Una acción de un agente muta datos sin que el usuario la haya aprobado nunca | El skill `add-agent-tool` (§19.4) lo prohíbe explícitamente; todas las tools de esta fase quedan `true` por diseño, sin ninguna excepción que defender |
| El catálogo de agentes crece sin control de costo por agente | B | M | Gasto de Anthropic API sube desproporcionado al volumen de uso de un agente específico | Mismo rate limit heredado de Fase 1 (20/min por usuario) aplica a los 4 endpoints nuevos; revisar mensualmente el desglose de costo por `agent_key` una vez la métrica de §16 esté disponible |
| El agente de ventas y el copiloto compiten por la atención del usuario dentro de la misma conversación, generando confusión sobre cuál usar | M | B | Feedback de piloto reportando confusión entre pestañas "Copiloto" y "Ventas" | Documentado como riesgo de UX aceptado en v1 — separar visualmente las dos pestañas (paso 76) es la mitigación mínima; una fusión de catálogos queda explícitamente fuera de alcance (§1 Non-Goals) |
| La base de conocimiento estática queda desactualizada respecto al producto real | M | B | Un usuario reporta que la respuesta del agente de soporte no coincide con el comportamiento actual | Los 3 archivos de `docs/help/` son código versionado — cualquier cambio de producto que afecte una respuesta documentada debe actualizar el archivo correspondiente en el mismo PR, mismo criterio que cualquier otra documentación versionada |

### 20.3 Decision log

| # | Decision | Rejected alternative | Why | Would reverse if |
|---|---|---|---|---|
| 1 | Generalizar `runs`/`steps`/`tool_calls`/`approvals` (agregar `agent_key`, volver `conversation_id`/`initiated_by` nullable) en vez de crear tablas paralelas para los 4 agentes nuevos | Una tabla `agent_runs`/`agent_steps` nueva por dominio, siguiendo el patrón de `automation_action_approval` que Fase 3 ya usó para un problema similar | Fase 3 (Decisión #7, §20.3 de `nucleo-fase-3/blueprint.md`) rechazó reutilizar estas tablas explícitamente **porque** `conversation_id`/`initiated_by` eran `not null` — un llamador de sistema no los tenía. Esa misma Decisión #7 registró su propia condición de reversión: *"el copiloto expusiera un mecanismo de aprobación desacoplado del contexto conversacional... que no dependiera de runs/steps"*. Esta fase construye exactamente eso (columnas nullable + `agent_key`), así que la condición de reversión de Fase 3 ya se cumplió — generalizar ahora es la continuación correcta de esa decisión, no una contradicción de ella | Un quinto llamador necesitara aprobación sin pasar por `runs`/`steps` en absoluto (ver §1 Non-Goals) |
| 2 | El progreso del checklist de onboarding se deriva en vivo de tablas existentes (`channel_connection`, `membership`, `automation`) en vez de persistirse en una tabla `onboarding_checklist_item` propia | Una tabla de progreso con filas que representan "completado", análoga a `automation_action_approval` de Fase 3 | Fase 1 §6 documenta que `channel_connection` se gestiona manualmente en la base de datos, **sin ningún punto de código único en la app** donde enganchar un hook de escritura — una tabla de progreso habría requerido inventar ese hook donde no existe, o quedar desincronizada de la realidad. Derivar en vivo evita ambos problemas y no requiere ninguna migración de schema para el onboarding | Se agregue una UI real de conexión de canal en una fase futura, con un punto de código único donde enganchar un evento de completación explícito |
| 3 | Los 4 agentes nuevos reutilizan permisos ya sembrados (`content.create`, `conversation.reply`) en vez de introducir permission keys nuevos | Un permission key por agente (`onboarding.manage`, `support.use`, etc.) | Ninguna acción de los agentes de onboarding o soporte toca dato sensible de organización (§8); el agente de contenido y el de ventas operan exactamente sobre el mismo dominio que ya protegen `content.create` y `conversation.reply` — introducir permisos nuevos habría exigido editar `scripts/seed.ts` y los roles de sistema sin ninguna necesidad real de granularidad adicional en v1 | Un cliente real pida que un rol tenga acceso a un agente pero no a la acción equivalente que ya protege ese permiso (p. ej., poder usar el agente de ventas sin poder responder manualmente) |
| 4 | Cada agente tiene una variable de entorno de modelo opcional con fallback a `COPILOT_MODEL_ID`, en vez de reutilizar una sola variable para los 5 agentes o exigir 4 variables nuevas obligatorias | Una sola `COPILOT_MODEL_ID` global para los 5 agentes, sin posibilidad de override | Exigir 4 variables nuevas obligatorias habría violado la regla de "un paso no rompe el gate de un paso anterior" (cualquier build existente fallaría el boot hasta configurar 4 valores nuevos); reutilizar una sola variable sin posibilidad de override cierra la puerta a tiers de modelo distintos por agente sin una migración de configuración futura. El fallback opcional resuelve ambos sin costo — ningún build existente se rompe, y la extensibilidad queda disponible sin usarla todavía | Un agente específico demuestre necesitar consistentemente un tier de modelo distinto al del copiloto en producción real |
| 5 | `send_conversation_reply` reutiliza el camino de escritura ya existente en `src/server/conversations.ts` (confirmado por lectura antes de editar) en vez de duplicar la lógica de inserción de mensaje dentro del handler de la tool | Escribir el `INSERT` de `message` directamente en el handler de la tool, sin pasar por `conversations.ts` | Duplicar la lógica de escritura habría significado dos caminos que insertan en `message` con reglas potencialmente distintas (idempotencia, emisión de evento realtime) — un bug clásico de "casi el mismo código en dos lugares". Reutilizar el camino existente garantiza que el mensaje enviado por el agente de ventas dispara exactamente el mismo evento realtime que ya usa la bandeja desde Fase 1, sin código nuevo que replicarlo | El camino existente demuestre no ser reutilizable sin refactor (p. ej., si asume que siempre corre dentro de un route handler HTTP y no puede invocarse desde un handler de tool) |

### 20.4 What to build next

1. Notificaciones push proactivas de los agentes (recordatorios de onboarding, avisos de sugerencias
   listas) — cuando exista infraestructura de triggers basados en tiempo (Fase 5+, ver §1 Non-Goals).
2. Búsqueda semántica para la base de conocimiento del agente de soporte — cuando el catálogo de
   `docs/help/` crezca más allá de lo que cabe cómodamente en una ventana de contexto.
3. CRM con historial unificado de oportunidades para el agente de ventas — alcance de Fase 5.
4. Analítica agregada de adopción por `agent_key` — alcance de Fase 6, habilitado por el índice ya
   creado en esta fase (§4).
5. Un mecanismo de configuración de tools por UI (sin tocar código) — cuando un cliente real lo pida.

---

*End of blueprint. Build order is §9. Stop when §20.1 is green.*
