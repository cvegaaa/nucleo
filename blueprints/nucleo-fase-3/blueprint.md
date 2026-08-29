# Núcleo — Fase 3: Automatizaciones — Blueprint

> Generado por The Architect el 2026-08-15
> Fase incremental sobre repo existente (Fase 1: Centro de Comunicación, Fase 2: Centro de Contenido — ambas construidas y validadas en el mismo repositorio)
> Runtime track: ts-node (heredado, sin cambios) · `knowledge/runtime-tracks/ts-node.md`
> Emisión: bundle
> Versión del blueprint: 1
> Versiones verificadas por última vez: 2026-08-15 — ver §11 para procedencia por paquete

---

## 1. Visión general del proyecto y no-objetivos

### Visión
Núcleo es un SaaS multi-tenant de comunicación + CRM + contenido + automatizaciones + IA. La Fase 1
entregó el Centro de Comunicación (canales, conversaciones, copiloto IA con tools, mensajes, webhooks
de WhatsApp/Instagram/Facebook/TikTok). La Fase 2 entregó el Centro de Contenido (`content_item`,
publish-worker sobre BullMQ, estados draft/scheduled/published). Esta Fase 3 entrega el **Centro de
Automatizaciones**: un motor evento→condición→acciones, determinístico por diseño (Principio
Fundamental 4.4 de la Constitución del Producto — "las automatizaciones determinísticas deben
funcionar sin depender de un modelo de IA; la IA se invoca cuando aporta valor"), con un catálogo de
acciones reutilizables tipadas, reintentos y dead-letter vía la infraestructura BullMQ ya existente,
trazabilidad completa de cada disparo y ejecución, e invocación de IA estrictamente opcional y
explícita por acción (`ai_classify`).

### Usuarios
| Persona | Qué viene a hacer | Frecuencia |
|---|---|---|
| Administrador de organización | Crea y activa automatizaciones (ej. "si llega un mensaje con la palabra 'urgente', etiquetar y asignar") | Semanal |
| Agente/miembro de equipo | Revisa el historial de ejecuciones de una automatización cuando algo no se comportó como esperaba | Semanal |
| Sistema (motor interno) | Emite eventos desde Fase 1/2, evalúa condiciones, ejecuta acciones | Continuo |

### Objetivos — alcance v1
1. El sistema emite eventos internos (`message.received`, `content.published`) desde los puntos donde
   Fase 1 y Fase 2 ya escriben datos, sin bloquear ni afectar esos flujos. `conversation.tagged` se
   evaluó y se descartó del catálogo v1 — ver Decisión #8 en §20.3: Fase 1 no expone ningún primitivo
   de etiquetado fuera del tool `tag_conversation` del copiloto (`src/server/copilot/tools.ts`), y no
   existe un servicio dedicado de una sola línea que editar, a diferencia de los otros dos triggers.
2. Un administrador crea, edita, activa y pausa automatizaciones mediante un formulario estructurado
   (trigger + condición + lista ordenada de acciones), sin necesidad de escribir código.
3. Las condiciones se evalúan con un árbol JSON declarativo — nunca ejecutan código arbitrario del
   usuario.
4. Cada disparo de automatización queda trazado: si la condición matcheó o no, qué acciones se
   ejecutaron, en qué orden, con qué resultado y con reintentos visibles.
5. Las acciones sensibles (enviar un mensaje) requieren aprobación en el primer uso, igual que el
   copiloto de Fase 1.
6. `ai_classify` es la única acción que invoca IA, y solo se ejecuta si el usuario la agregó
   explícitamente a la automatización.

### No-objetivos — explícitamente fuera de alcance v1
| No se construye | Por qué no ahora | Revisar cuando |
|---|---|---|
| Agentes IA autónomos multi-paso (Fase 4+) | Requiere el motor de automatizaciones determinístico como base primero | Fase 3 esté en producción con datos reales |
| CRM con pipeline de oportunidades (Fase 4+) | Fuera del alcance de esta fase, sin dependencia técnica hacia atrás | Roadmap de producto lo priorice |
| Analítica avanzada (Fase 6) | Depende de volumen de datos que esta fase apenas empieza a generar | Haya ≥90 días de `automation_run` en producción |
| Builder visual de flujos tipo canvas (drag-and-drop de nodos) | Nadie lo pidió; un formulario estructurado cubre el 100% del alcance v1 con una fracción del costo de UI | Un cliente reporte que la lista ordenada de acciones es insuficiente para su caso de uso |
| Triggers basados en cron/tiempo | v1 se limita a eventos del sistema; cron introduce un scheduler nuevo y una superficie de pruebas distinta | Un caso de uso real necesite "todos los lunes a las 9am" |
| Motor de colas nuevo | BullMQ 6.1.1 ya está instalado y probado en Fase 1/2; una cola paralela duplicaría infraestructura sin beneficio | Nunca previsto — señal de alarma si se propone |
| Librería de máquina de estados para el ciclo de vida de la automatización | 3 valores sin estados anidados/paralelos no justifican xstate | El ciclo de vida crezca a más de ~5 estados con transiciones condicionales complejas |
| UI de builder visual de condiciones tipo "if/then" gráfico | El formulario estructurado (trigger + lista de condiciones simples compiladas a json-logic) cubre v1 | Usuarios pidan condiciones anidadas AND/OR visuales que el formulario simple no exprese |
| UI/endpoint para solicitar o aprobar `send_message` en primer uso | v1 solo verifica si ya existe una fila en `automation_action_approval` (§4); crearla es una operación manual de un admin contra la base de datos hasta que exista superficie de aprobación | Un cliente real necesite aprobar `send_message` sin acceso directo a la base de datos |

**El builder no debe implementar nada de esta tabla**, aunque parezca una adición pequeña mientras
trabaja en un paso adyacente.

### Métricas de éxito
| Métrica | Objetivo | Cómo se mide |
|---|---|---|
| Automatizaciones activas por organización con ≥1 ejecución exitosa | ≥1 a los 14 días de disponibilidad | `select count(*) from automation where status='active' and id in (select automation_id from automation_run where status='completed')` agrupado por `org_id` |
| Aislamiento de fallos del emisor de eventos | 0 incidentes donde una caída de Redis afecte la recepción de mensajes/publicación de contenido | Prueba de caos trimestral + `tests/automations/events-emission.test.ts` en cada deploy |
| Tasa de acciones en dead-letter | < 2% de acciones ejecutadas | `select count(*) from job_dead_letters where job_type like 'automation:%'` / total de `automation_action_log` |

---

## 2. Stack Tecnológico

**Runtime track: ts-node (heredado de Fases 1-2, sin cambios).** Esta tabla nombra decisiones, no
versiones — cada pin vive únicamente en §11.

| Capa | Elección | Por qué esto, sobre qué |
|---|---|---|
| Lenguaje / runtime | Next.js 16 + TypeScript (heredado) | Ya instalado y validado en Fases 1-2; no hay razón técnica para introducir un segundo runtime en esta fase |
| Framework | Next.js 16 App Router (heredado) | UI de automatizaciones vive en `src/app/(app)/automations/**`, mismo patrón que el resto del producto |
| ORM / acceso a datos | Drizzle ORM (heredado) | Único ORM del proyecto; tablas nuevas se agregan al mismo `src/db/schema.ts` |
| Base de datos | Postgres (heredado) | Mismo cluster; tablas nuevas con `org_id` indexado siguiendo el patrón multi-tenant ya establecido |
| Colas / trabajo en segundo plano | BullMQ 6.1.1 (heredado) | Reutiliza `jobs`/`job_dead_letters`/`idempotency_keys` — Decisión de arquitectura #3, no se introduce un motor nuevo |
| Evaluación de condiciones | `json-logic-engine@5.0.7` (nuevo) | Árbol JSON declarativo — las condiciones del usuario nunca ejecutan código arbitrario, a diferencia de un `eval()`. Ver §11 para la verificación en vivo |
| Auth / permisos | better-auth + `requirePermission` (heredado) | Mismo patrón de permisos por acción que ya usa el copiloto de Fase 1 |
| Realtime | Socket.IO (heredado) | Sin cambios en esta fase — el historial de runs se consulta por API, no requiere push en tiempo real en v1 |
| IA | `@anthropic-ai/sdk` (heredado) | Reutilizado únicamente por la acción `ai_classify`, vía el mismo gateway de IA de Fase 1 |
| Gestor de paquetes | pnpm (heredado) | Sin cambios |

### Verificación de compatibilidad
Checked against `knowledge/stack-compatibility.md` — no known-bad combinations. `json-logic-engine`
es una librería pura en memoria sin driver de red ni dependencia de runtime especial (no toca la fila
"Raw-TCP database driver + runtime sin sockets" ni ninguna otra fila de la tabla). Reutilizar BullMQ
en vez de introducir un segundo motor de colas evita explícitamente la fila "Dos sistemas de
migración" / "un segundo motor duplicado" de la lógica general del archivo.

---

## 3. Estructura de directorios

```
nucleo/
  src/
    db/
      schema.ts                          # EDITAR: se agregan 5 tablas nuevas (§4)
    lib/
      env.ts                             # sin cambios — esta fase no agrega variables de entorno
    server/
      automations/                        # NUEVO — todo el dominio de Fase 3
        types.ts                          # tipos de evento y payloads
        events.ts                         # emitAutomationEvent() — emisor fire-and-forget
        condition-evaluator.ts            # wrapper sobre json-logic-engine
        service.ts                        # CRUD + validación de transiciones de ciclo de vida
        worker.ts                         # BullMQ Worker que consume la cola 'automation-events'
        action-runner.ts                  # BullMQ job processor que ejecuta una acción y encadena la siguiente
        actions/
          catalog.ts                      # registro tipado de acciones
          errors.ts                       # NUEVO — ApprovalRequiredError y otros errores tipados no-reintentables
          tag-conversation.ts
          assign-conversation.ts
          send-message.ts                 # acción sensible — aprobación en primer uso; lanza ApprovalRequiredError, nunca escribe automation_action_log
          create-content-draft.ts         # cruza a Fase 2 (import de src/server/content/items.ts)
          ai-classify.ts                  # única acción que invoca IA
      channels/                           # EXISTENTE, Fase 1 — 4 archivos, cada uno EDITAR (paso 3)
        whatsapp.ts                       # EDITAR: emite 'message.received' tras normalizeInboundEvent
        instagram.ts                      # EDITAR: emite 'message.received' tras normalizeInboundEvent
        facebook.ts                       # EDITAR: emite 'message.received' tras normalizeInboundEvent
        tiktok.ts                         # EDITAR: emite 'message.received' tras normalizeInboundEvent
      publishing/
        publish.ts                       # EDITAR (paso 4), EXISTENTE Fase 2 — emite 'content.published'
      content/
        items.ts                         # EXISTENTE, Fase 2 — importado sin cambios por create-content-draft (createContentItem)
    app/
      globals.css                        # EDITAR (paso 13): agrega los tokens --warning / --warning-fg (§7) bajo @theme — heredado sin cambios hasta este paso
      api/
        automations/
          route.ts                       # NUEVO — GET lista, POST crea
          [id]/
            route.ts                     # NUEVO — GET, PATCH (edición y transiciones)
            runs/
              route.ts                   # NUEVO — GET historial de runs
      (app)/
        automations/
          page.tsx                       # NUEVO — lista
          new/
            page.tsx                     # NUEVO — formulario de creación
          [id]/
            page.tsx                     # NUEVO — edición
            runs/
              page.tsx                   # NUEVO — historial de runs con traza de acciones
  tests/
    automations/
      events.test.ts
      events-emission.test.ts
      events-emission-content.test.ts
      actions-catalog.test.ts
      action-send-message.test.ts
      action-create-content-draft.test.ts
      condition-evaluator.test.ts
      api-crud.test.ts
      worker-e2e.test.ts
      retries-dead-letter.test.ts
      action-ai-classify.test.ts
      hardening.test.ts
      full-phase-e2e.test.ts
      fixtures/
        sample-condition.json             # golden fixture — árbol json-logic de referencia (§19.6)
    e2e/
      automations-form.spec.ts
      automations-runs.spec.ts
  drizzle/                                # migración generada por drizzle-kit (nombre real asignado por la herramienta)
  docker-compose.prod.yml                 # EDITAR (paso 16): confirmación mínima, sin servicio nuevo
  biome.json                              # sin cambios — "!blueprints" ya cubre blueprints/nucleo-fase-3/
  scripts/
    worker.ts                             # EXISTENTE, Fase 1 (blueprints/nucleo-fase-1/blueprint.md §3, `"worker": "tsx scripts/worker.ts"` en package.json) — EDITAR (paso 11): registra el nuevo Worker de automatizaciones. NO es src/worker.ts — ese archivo no existe en el repo.
    worker-publish.ts                     # EXISTENTE, Fase 2 (blueprints/nucleo-fase-2/blueprint.md §9 paso 26) — proceso BullMQ del scheduler de publicación, COMPLETAMENTE SEPARADO de scripts/worker.ts. Esta fase no lo toca ni lo unifica.
    merge-claude-settings.mjs             # EXISTENTE, Fase 2 — reutilizado sin cambios
  blueprints/
    nucleo-fase-3/                        # este bundle — excluido de todo linter/formatter por "!blueprints"
```

**Reglas de frontera**
- `src/server/automations/**` es el único lugar donde se evalúan condiciones y se ejecutan acciones.
  Ninguna otra parte del código invoca `json-logic-engine` directamente.
- `src/server/automations/actions/*.ts` es el único lugar que registra acciones en el catálogo. Una
  acción nueva se agrega ahí, nunca inline en el worker.
- El emisor de eventos (`events.ts`) nunca se importa desde `src/server/automations/**` hacia atrás
  — solo Fase 1/2 lo llaman, para emitir. El motor de automatizaciones solo consume la cola.
- Nada bajo `src/server/automations/**` escribe directamente en tablas de Fase 1/2 (`conversations`,
  `content_item`) salvo a través de los servicios ya existentes de esas fases (`src/server/channels/*.ts`,
  `src/server/content/items.ts` → `createContentItem`) — nunca SQL directo cruzando el límite de fase.
- El Worker de automatizaciones (paso 11) se registra dentro de `scripts/worker.ts` de Fase 1 — el
  único proceso worker de eventos entrantes que existe en el repo (`"worker": "tsx scripts/worker.ts"`
  en `package.json`, servicio `worker` en `docker-compose.prod.yml`). `scripts/worker-publish.ts` de
  Fase 2 es un proceso BullMQ completamente separado, dedicado al scheduler de publicación — esta fase
  **no lo toca ni lo unifica** con `scripts/worker.ts`.

Esta fase no introduce ninguna convención de resolución de módulos nueva (alias, especificador,
condición de export) — reutiliza el alias `@/` y el formato de import ya establecidos por el repo. Ver
§19.6 *Matriz de convención de resolución* para la confirmación explícita.

---

## 4. Modelo de datos

### Entidades nuevas

**`automation`** — una regla evento→condición→acciones configurada por un administrador. Ciclo de
vida `draft → active ⇄ paused`, con soft delete.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `org_id` | uuid | not null, indexado, FK → `organization.id` | límite multi-tenant |
| `name` | text | not null | |
| `description` | text | nullable | |
| `trigger_event_type` | text | not null | uno de: `message.received`, `content.published` — solo 2 en v1, ver Decisión #8 en §20.3 |
| `condition_json` | jsonb | not null, default `{}` | árbol json-logic; `{}` matchea siempre |
| `status` | enum(`draft`,`active`,`paused`) | not null, default `draft` | transición validada en `service.ts`, nunca por escritura directa |
| `created_by` | uuid | not null, FK → `user.id` | |
| `created_at` | timestamptz | not null, default now() | |
| `updated_at` | timestamptz | not null, default now() | |
| `deleted_at` | timestamptz | nullable | soft delete — toda consulta filtra `deleted_at is null` |

**`automation_action`** — una acción dentro de la secuencia ordenada de una automatización.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `automation_id` | uuid | not null, FK → `automation.id` on delete cascade | |
| `position` | integer | not null | orden de ejecución, 0-based, único por `automation_id` |
| `action_type` | text | not null | clave del catálogo (`tag_conversation`, `send_message`, …) |
| `config_json` | jsonb | not null | validado contra el schema zod de esa `action_type` en `service.ts` |
| `created_at` | timestamptz | not null, default now() | |

**`automation_run`** — una fila por cada disparo del evento contra una automatización activa,
matchee o no la condición. **Decisión de observabilidad: se registra un run también cuando la
condición NO matchea.** Justificación: sin esa fila, un administrador que ve "mi automatización nunca
se ejecuta" no puede distinguir "el evento nunca llegó" de "el evento llegó pero la condición nunca
fue verdadera" — la segunda es el bug de configuración más común en un motor de reglas y es
precisamente el caso que la trazabilidad tiene que cubrir. El costo de la fila extra es una escritura
más por evento, aceptable dado que solo automatizaciones `active` generan runs.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `automation_id` | uuid | not null, FK → `automation.id` on delete cascade | |
| `org_id` | uuid | not null, indexado | copiado del evento, no un join, para consultas de auditoría rápidas |
| `trigger_event_type` | text | not null | |
| `trigger_payload` | jsonb | not null | el payload del evento tal como llegó |
| `condition_matched` | boolean | not null | resultado del evaluador |
| `status` | enum(`running`,`completed`,`failed`,`partial`) | not null, default `running` | `completed` si `condition_matched=false` (nada que ejecutar) o si todas las acciones tuvieron éxito; `partial` si al menos una acción tuvo éxito y otra falló definitivamente; `failed` si la primera acción falló sin ningún éxito previo |
| `started_at` | timestamptz | not null, default now() | |
| `finished_at` | timestamptz | nullable | null mientras `status='running'` |

**`automation_action_log`** — traza de cada intento de ejecución de una acción individual.

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `automation_run_id` | uuid | not null, FK → `automation_run.id` on delete cascade | |
| `automation_action_id` | uuid | not null, FK → `automation_action.id` | |
| `action_type` | text | not null | copiado, para que el log sobreviva si la acción se reordena luego |
| `status` | enum(`success`,`failed`,`retrying`) | not null | |
| `attempt` | integer | not null, default 1 | |
| `result` | jsonb | nullable | salida de la acción en éxito |
| `error` | text | nullable | mensaje en fallo |
| `executed_at` | timestamptz | not null, default now() | |

**`automation_action_approval`** — registra qué combinación `(org_id, action_type)` del catálogo de
acciones fue aprobada para ejecución, una sola vez por combinación (aprobación en primer uso). Tabla
**propia de esta fase**, sin relación alguna con `tool_calls`/`approvals` del copiloto de Fase 1 — ver
Decisión #7 en §20.3 para el motivo del rechazo a reutilizar esas tablas (están diseñadas para un
contexto conversacional — `runs.conversation_id` y `runs.initiated_by` NOT NULL — que un llamador de
sistema como el motor de automatizaciones no tiene, estructuralmente, nunca).

| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `org_id` | uuid | not null, FK → `organization.id` | |
| `action_type` | text | not null | clave del catálogo (`src/server/automations/actions/catalog.ts`), p.ej. `"send_message"` — el mismo valor que `automation_action.action_type` |
| `approved_by` | uuid | not null, FK → `user.id` | quién aprobó |
| `approved_at` | timestamptz | not null, default now() | |

La existencia de una fila **es** la aprobación — no hay estado `pending`/`rejected` en v1. Crear esa
fila (quién aprueba y cómo) es un no-objetivo explícito de esta fase — ver la tabla de no-objetivos en
§1 — no un olvido: v1 solo consulta si la fila ya existe antes de ejecutar una acción marcada
`requiresApprovalFirstUse`.

Reutilizadas sin cambios de esquema: `jobs`, `job_dead_letters`, `idempotency_keys` (Fase 1/2) — la
ejecución de cada acción es un job en la cola genérica existente, tipado `automation:execute-action`.

### Relaciones
- `organization` —(1:N)→ `automation` — cascade: al eliminar la organización, cascada estándar ya
  establecida en Fase 1 (fuera de alcance de esta fase).
- `automation` —(1:N)→ `automation_action` — on delete **cascade** (borrar la automatización borra su
  lista de acciones; una automatización nunca queda con acciones huérfanas).
- `automation` —(1:N)→ `automation_run` — on delete **cascade**.
- `automation_run` —(1:N)→ `automation_action_log` — on delete **cascade**.
- `automation_action` —(1:N)→ `automation_action_log` — on delete **restrict** (un log referencia la
  configuración de acción que estaba vigente en el momento de la ejecución; no se borra una acción
  mientras tenga logs — en la práctica nunca ocurre porque el log cascada desde `automation_run`,
  cuyo padre es la misma `automation` que la acción).
- `organization` —(1:N)→ `automation_action_approval` — sin FK a `automation`/`automation_run`: la
  aprobación es por organización, independiente del ciclo de vida de cualquier automatización
  individual (una organización aprueba `send_message` una vez y todas sus automatizaciones que usen
  esa acción quedan habilitadas).

### Índices
| Tabla | Índice | Por qué |
|---|---|---|
| `automation` | `(org_id, status)` | listar automatizaciones activas de una organización — la consulta del worker en cada evento |
| `automation` | `(org_id, trigger_event_type, status)` | el worker filtra automatizaciones activas por tipo de evento en cada disparo |
| `automation_action` | `(automation_id, position)` único | garantiza orden sin huecos ambiguos y evita duplicar posición |
| `automation_run` | `(automation_id, started_at desc)` | historial de runs por automatización, ordenado |
| `automation_run` | `(org_id, started_at desc)` | auditoría cross-automatización por organización |
| `automation_action_log` | `(automation_run_id, automation_action_id, attempt)` | traza ordenada de una ejecución |
| `automation_action_approval` | `(org_id, action_type)` único | responde "¿ya fue aprobada esta combinación?" con una consulta directa, sin join a ninguna tabla del copiloto |

### Schema (Drizzle)
```typescript
// src/db/schema.ts — se agrega al archivo existente, no se reemplaza

export const automationStatusEnum = pgEnum("automation_status", ["draft", "active", "paused"]);
export const automationRunStatusEnum = pgEnum("automation_run_status", [
  "running",
  "completed",
  "failed",
  "partial",
]);
export const automationActionLogStatusEnum = pgEnum("automation_action_log_status", [
  "success",
  "failed",
  "retrying",
]);

export const automation = pgTable(
  "automation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    name: text("name").notNull(),
    description: text("description"),
    triggerEventType: text("trigger_event_type").notNull(),
    conditionJson: jsonb("condition_json").notNull().default({}),
    status: automationStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by").notNull().references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgStatusIdx: index("automation_org_status_idx").on(t.orgId, t.status),
    orgTriggerStatusIdx: index("automation_org_trigger_status_idx").on(
      t.orgId,
      t.triggerEventType,
      t.status,
    ),
  }),
);

export const automationAction = pgTable(
  "automation_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automation.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    actionType: text("action_type").notNull(),
    configJson: jsonb("config_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    automationPositionUnique: uniqueIndex("automation_action_position_unique").on(
      t.automationId,
      t.position,
    ),
  }),
);

export const automationRun = pgTable(
  "automation_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automation.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    triggerEventType: text("trigger_event_type").notNull(),
    triggerPayload: jsonb("trigger_payload").notNull(),
    conditionMatched: boolean("condition_matched").notNull(),
    status: automationRunStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    automationStartedIdx: index("automation_run_automation_started_idx").on(
      t.automationId,
      t.startedAt,
    ),
    orgStartedIdx: index("automation_run_org_started_idx").on(t.orgId, t.startedAt),
  }),
);

export const automationActionLog = pgTable("automation_action_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationRunId: uuid("automation_run_id")
    .notNull()
    .references(() => automationRun.id, { onDelete: "cascade" }),
  automationActionId: uuid("automation_action_id")
    .notNull()
    .references(() => automationAction.id, { onDelete: "restrict" }),
  actionType: text("action_type").notNull(),
  status: automationActionLogStatusEnum("status").notNull(),
  attempt: integer("attempt").notNull().default(1),
  result: jsonb("result"),
  error: text("error"),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationActionApproval = pgTable(
  "automation_action_approval",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organization.id),
    actionType: text("action_type").notNull(),
    approvedBy: uuid("approved_by").notNull().references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgActionTypeUnique: uniqueIndex("automation_action_approval_org_action_type_unique").on(
      t.orgId,
      t.actionType,
    ),
  }),
);
```

### Migraciones
Herramienta: `drizzle-kit` (heredado). Se sigue el patrón del skill `add-migration` ya existente en
el repo: editar `src/db/schema.ts`, correr `pnpm db:generate`, revisar el SQL generado, correr
`pnpm db:migrate`. **El nombre del archivo de migración lo asigna `drizzle-kit` (prefijo numérico +
codename aleatorio) — nunca se escribe a mano ni se referencia por nombre inventado en este
blueprint.** El paso 1 se refiere a él como "la migración que `pnpm db:generate` emite para este
cambio de schema" en todo lugar donde haría falta nombrarlo.

### Datos semilla
Esta fase no agrega semillas nuevas al script de seed existente — una organización de desarrollo
recién creada empieza sin automatizaciones, que es el estado real de cualquier organización nueva en
producción. `NOT APPLICABLE — ninguna semilla nueva; el estado vacío es el estado correcto.`

---

## 5. Diseño de API

### Convenciones
- Base path: `/api/automations` (bajo el mismo prefijo de API interna que Fase 1/2, sin versión
  adicional — se reutiliza la convención ya establecida en el repo).
- Envelope de respuesta: `{ ok: true, data } | { ok: false, error: { code, message } }` — el mismo
  shape que ya define `CLAUDE.md` heredado.
- Códigos de error: `VALIDATION_ERROR` (422), `NOT_FOUND` (404), `FORBIDDEN` (403),
  `INVALID_TRANSITION` (422), `INTERNAL_ERROR` (500).
- Validación: zod, schemas en `src/server/automations/service.ts`.
- Paginación: cursor, parámetros `cursor` y `limit` (default 20, máximo 100) — igual que el listado
  de conversaciones de Fase 1.
- Idempotencia: no aplica a las rutas CRUD (no son reintentables por el cliente en este dominio); la
  ejecución de acciones usa la tabla `idempotency_keys` ya existente, keyed por
  `${automation_run_id}:${action_position}`.
- Rate limit: 60 requests/min por organización en `/api/automations/**`, mismo backend (Redis) y
  helper que Fase 1 ya usa para sus rutas.

### Rutas
| Método | Ruta | Descripción | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/automations` | lista automatizaciones de la organización, paginado | usuario, permiso `automation:read` | 60/min |
| POST | `/api/automations` | crea una automatización en estado `draft` | usuario, permiso `automation:create` | 60/min |
| GET | `/api/automations/[id]` | detalle con sus acciones ordenadas | usuario, permiso `automation:read` | 60/min |
| PATCH | `/api/automations/[id]` | edita nombre/condición/acciones, o transiciona el `status` | usuario, permiso `automation:manage` | 60/min |
| GET | `/api/automations/[id]/runs` | historial de runs con sus action logs | usuario, permiso `automation:read` | 60/min |

### Endpoints críticos — detalle completo

**`POST /api/automations`**
- Request: `{ name: string(1..120), description?: string, triggerEventType: enum, conditionJson?: object, actions: [{ actionType: string, configJson: object }] }` (mín. 0 acciones al crear — se puede activar solo con ≥1).
- Response 201: `{ ok: true, data: { id, status: "draft", ... } }`.
- Validación: `triggerEventType` debe ser uno de los 2 tipos soportados en v1 → si no, 422
  `VALIDATION_ERROR`. `actionType` de cada acción debe existir en el catálogo → si no, 422. Cada
  `configJson` se valida contra el schema zod de esa `actionType` → si no, 422 con el detalle del
  campo. `conditionJson` se valida con profundidad máxima 8 y tamaño serializado máximo 16KB → si
  excede, 422 `VALIDATION_ERROR`.
- Efectos: inserta 1 fila en `automation` + N filas en `automation_action` en una transacción.

**`PATCH /api/automations/[id]` — transición de `status`**
- Request: `{ status: "active" | "paused" | "draft" }`.
- Transiciones válidas: `draft → active` (requiere ≥1 acción, si no 422 `INVALID_TRANSITION`),
  `active → paused`, `paused → active`, `active → draft` **prohibido directamente** (debe pasar por
  `paused` primero — evita que una automatización en producción cambie su condición/acciones sin
  pasar por un estado no-ejecutable), `paused → draft` permitido.
- Error: transición no listada → 404... no, 422 `INVALID_TRANSITION` con el estado actual y el
  solicitado en el mensaje.
- Efectos: solo actualiza `status` y `updated_at`; no toca `condition_json` ni acciones en esta misma
  request (edición de contenido y transición de estado son mutuamente exclusivas por request —
  simplifica la validación y evita una activación accidental al editar).

**`GET /api/automations/[id]/runs`**
- Request: query `cursor?`, `limit?` (default 20, máx 100).
- Response 200: `{ ok: true, data: { runs: [{ id, conditionMatched, status, startedAt, finishedAt, actionLogs: [{ actionType, status, attempt, error, executedAt }] }], nextCursor } }`.
- Aislamiento: el `automation_id` de la URL debe pertenecer a `org_id` del usuario autenticado → si
  no, 404 (nunca 403, para no confirmar la existencia del recurso en otra organización).

---

## 6. Arquitectura de frontend

### Rutas
| Ruta | Página | Fuente de datos | Auth |
|---|---|---|---|
| `/automations` | lista | `GET /api/automations` (server component) | usuario |
| `/automations/new` | formulario de creación | POST al enviar | usuario, `automation:create` |
| `/automations/[id]` | edición | `GET /api/automations/[id]` + PATCH al guardar | usuario, `automation:manage` |
| `/automations/[id]/runs` | historial de ejecuciones | `GET /api/automations/[id]/runs` | usuario |

### Estrategia de renderizado
`/automations` y `/automations/[id]/runs` son server components con `revalidate: 0` (datos siempre
frescos — el estado de una automatización y su historial cambian por eventos externos al usuario
actual). El formulario de `/automations/new` y `/automations/[id]` es un client component para el
constructor de condiciones y la lista ordenada de acciones (estado local antes de guardar).

### Jerarquía de componentes (formulario)
```
AutomationFormPage (client)
  TriggerSelect                # dropdown de los 2 trigger_event_type soportados
  ConditionBuilder              # N filas (campo, operador, valor) → compiladas a json-logic AND
  ActionListEditor              # lista ordenada, agregar/quitar/reordenar, un ActionConfigForm por tipo
    ActionConfigForm[actionType] # formulario específico por acción, generado desde el schema zod del catálogo
  ActivateButton                # deshabilitado + tooltip si actions.length === 0
```

### Estado
El formulario mantiene estado local (`useState`) hasta el submit — no hay borrador auto-guardado en
v1 (no-objetivo implícito: sin persistencia parcial). El historial de runs usa fetching de servidor,
sin caché de cliente — cada visita a `/automations/[id]/runs` es un dato fresco de auditoría.

### Estados de carga, vacío y error
- Lista de automatizaciones: vacío → "Aún no creaste ninguna automatización" + CTA; carga → skeleton
  de 3 filas; error → mensaje + botón reintentar.
- Historial de runs: vacío → "Esta automatización aún no se ha disparado" (distinto del mensaje de
  "sin automatizaciones", porque implica que el trigger simplemente no ha ocurrido); carga →
  skeleton; error → mensaje + reintentar.
- Formulario: error de validación por campo (422 mapeado a mensajes junto a cada input), error de red
  → banner superior con reintentar, sin perder el estado ya ingresado.

---

## 7. Sistema de diseño

Esta fase **hereda de Fase 1 sin cambios** — ver `workspace/CLAUDE.md` acumulado en la raíz del repo
(originado en `blueprints/nucleo-fase-1/blueprint.md` §7) para los valores exactos de tokens,
tipografía, espaciado, radio y elevación. Reutiliza los mismos componentes de formulario, tabla y
badge de estado que el resto del producto — ningún token nuevo se define aquí salvo `--warning` (ver
abajo).

### Colores
Todos los tokens de esta tabla (`--primary`, `--primary-fg`, `--background`, `--surface`, `--border`,
`--fg`, `--fg-muted`, `--destructive`, `--success`) son los de Fase 1 §7, sin modificación — no se
listan sus valores hex aquí para no arriesgar una copia desincronizada; leer directamente de
`workspace/CLAUDE.md` en la raíz del repo antes de construir.

`--warning` (usado por los badges de estado `partial`/`paused`/`retrying` de esta fase) **no existe en
la paleta de Fase 1** — es un token genuinamente nuevo que esta fase necesita. `VERIFY:` el builder
debe definir su valor exacto (claro y oscuro) siguiendo la misma metodología de contraste que Fase 1
usó para el resto de la paleta (≥4.5:1 texto normal sobre `--surface` y sobre sí mismo con
`--primary-fg`/texto oscuro encima), y registrarlo en el `CLAUDE.md` acumulado del repo en el momento
de implementar el **paso 13 (UI de historial de runs)** — no el paso 10 (el formulario de creación no
renderiza ningún badge de estado `partial`/`paused`/`retrying`; la primera pantalla que los renderiza
es la de historial de runs) — no se inventa un hex aquí.

**Contraste:** los pares heredados de Fase 1 ya están verificados ahí (`--fg`/`--background` = 15.8:1,
`--primary-fg`/`--primary` = 6.4:1, `--fg-muted`/`--background` = 5.2:1, todos ≥AA). El único par nuevo
de esta fase (`--warning` sobre su superficie de badge) se verifica cuando se defina, per el `VERIFY`
de arriba.

### Tipografía
Hereda la familia y escala ya definidas en `CLAUDE.md`. Sin cambios en esta fase.

### Espaciado, radio, elevación
Hereda la escala base de 4px y el radio de 8px en inputs/botones ya establecidos. Sin cambios.

### Movimiento
El badge de estado de un run en ejecución (`running`) usa un pulso sutil de opacidad (600ms,
ease-in-out, infinito) que respeta `prefers-reduced-motion: reduce` (se reemplaza por un ícono
estático de reloj).

### Estilo de componente
Formularios densos de línea de negocio, tabla con badges de estado por color, sin decoración —
consistente con el resto del panel de administración de Núcleo.

---

## 8. Autenticación y autorización

Hereda better-auth y el sistema de permisos por acción (`requirePermission`) de Fase 1, sin cambios
de infraestructura.

### Permisos nuevos
| Permiso | Otorgado a | Uso |
|---|---|---|
| `automation:read` | miembro, admin, owner | ver lista, detalle, historial de runs |
| `automation:create` | admin, owner | crear una automatización nueva |
| `automation:manage` | admin, owner | editar, activar, pausar |
| `automation:action:send_message` | admin, owner (+ aprobación en primer uso) | permite que el catálogo registre `send_message` como ejecutable para la organización |
| `automation:action:ai_classify` | admin, owner | permite que el catálogo registre `ai_classify` como ejecutable |

**Por qué `send_message` pide aprobación y `ai_classify` no (asimetría deliberada):** `send_message` es
la única acción de este catálogo que envía contenido a un canal externo (WhatsApp/Instagram/
Facebook/TikTok), por eso exige una fila previa en `automation_action_approval` (§4, §9 paso 6) — la
tabla de aprobación **propia de esta fase**, consultada con una query directa `(org_id, action_type)`,
sin ningún join a las tablas del copiloto. `ai_classify` nunca sale del sistema — invoca el gateway de
IA de Fase 1 y escribe el resultado en `automation_action_log` — así que no la necesita. Nota: esto es
más estricto que el catálogo del copiloto de Fase 1, donde *todo* tool call (incluido `tag_conversation`,
que tampoco sale del sistema) exige aprobación en primer uso — Fase 3 restringe la aprobación al
subconjunto de acciones que sí cruzan el límite del sistema, una decisión de esta fase, no heredada.

### Protección de rutas
| Superficie | Regla | Aplicado en |
|---|---|---|
| `/automations/**` (UI) | usuario autenticado con `automation:read` mínimo | `src/app/(app)/layout.tsx` (heredado) + chequeo por página |
| `/api/automations/**` | `requirePermission` por método, según la tabla de §5 | cada `route.ts` |
| Ejecución de una acción del catálogo | `requirePermission(orgId, action.requiredPermission)` antes de invocar `execute()` | `src/server/automations/action-runner.ts` |

**Regla de aplicación:** la autorización se verifica en el servidor en cada request y en cada
ejecución de acción, nunca solo en el cliente.

### Roles y permisos
| Rol | Puede | No puede |
|---|---|---|
| `member` | ver automatizaciones y su historial de runs | crear, editar, activar/pausar |
| `admin` | todo lo de `member` + crear, editar, activar/pausar, aprobar `send_message` en primer uso | eliminar la organización (fuera de alcance) |
| `owner` | todo lo de `admin` | — |

### Multi-tenant / aislamiento por fila
Toda consulta a `automation`, `automation_action`, `automation_run`, `automation_action_log` filtra
`org_id` (directo o vía join a `automation`) en la capa de `service.ts` — nunca se compone una
consulta a estas tablas fuera de ese módulo. `automation_action_approval` sigue la misma regla de
filtrado por `org_id`, pero se consulta directo desde `send-message.ts` (§9 paso 6), no desde
`service.ts` — es la única tabla de esta fase fuera de ese módulo, porque la aprobación se resuelve en
el momento de ejecutar la acción, no en el CRUD de automatizaciones. Sin RLS de Postgres en esta fase
(Fase 1 ya estableció el mecanismo de "scope obligatorio en la capa de datos" en vez de RLS — Fase 3
sigue el mismo patrón, no lo reabre).

---

## 9. ORDEN DE CONSTRUCCIÓN

16 pasos. `pnpm` es el gestor de paquetes en todos los comandos. Cada `Verify` corre desde la raíz del
proyecto, después de que `workspace/` fue copiado en el paso previo a construcción (§19).

### Mapa de pasos

| # | Paso | Depende de | Toca | Gate |
|---|---|---|---|---|
| 1 | Dependencia + schema + migración | — | `package.json`, `src/db/schema.ts`, migración generada | `pnpm db:migrate` + 5 tablas verificadas |
| 2 | Motor de eventos: emisor fire-and-forget | 1 | `src/server/automations/{types,events}.ts` | `pnpm test tests/automations/events.test.ts` |
| 3 | Emisión desde los canales de Fase 1 (edición mínima) | 2 | `src/server/channels/{whatsapp,instagram,facebook,tiktok}.ts` (edits) | `pnpm test tests/automations/events-emission.test.ts` |
| 4 | Emisión desde publish.ts de Fase 2 (edición mínima) | 2 | `src/server/publishing/publish.ts` (edit) | `pnpm test tests/automations/events-emission-content.test.ts` |
| 5 | Catálogo de acciones base + permisos | 1 | `actions/catalog.ts`, `tag-conversation.ts`, `assign-conversation.ts` | `pnpm test tests/automations/actions-catalog.test.ts` |
| 6 | Acción `send_message` con aprobación en primer uso | 5 | `actions/send-message.ts`, `actions/errors.ts` | `pnpm test tests/automations/action-send-message.test.ts` |
| 7 | Acción `create_content_draft` (cruza a Fase 2) | 5 | `actions/create-content-draft.ts` | `pnpm test tests/automations/action-create-content-draft.test.ts` |
| 8 | Evaluador de condiciones json-logic | 1 | `condition-evaluator.ts` | `pnpm test tests/automations/condition-evaluator.test.ts` |
| 9 | CRUD de automatizaciones (API) | 1, 5, 8 | `service.ts`, `api/automations/**/route.ts` | `pnpm test tests/automations/api-crud.test.ts` |
| 10 | UI de formulario estructurado | 9 | `app/(app)/automations/{page,new/page,[id]/page}.tsx` | `pnpm test:e2e tests/e2e/automations-form.spec.ts` |
| 11 | Ejecución end-to-end (worker) | 6, 7, 8, 9 | `src/server/automations/worker.ts` (nuevo), `scripts/worker.ts` (edit — el único worker de eventos entrantes de Fase 1, no `scripts/worker-publish.ts` de Fase 2) | `pnpm test tests/automations/worker-e2e.test.ts` |
| 12 | Reintentos / dead-letter | 11 | `action-runner.ts` (incluye manejo especial, sin reintento, de `ApprovalRequiredError`) | `pnpm test tests/automations/retries-dead-letter.test.ts` |
| 13 | UI de historial de runs | 11 | `app/(app)/automations/[id]/runs/page.tsx`, `api/automations/[id]/runs/route.ts`, `app/globals.css` (agrega `--warning`/`--warning-fg`) | `pnpm test:e2e tests/e2e/automations-runs.spec.ts` |
| 14 | Acción `ai_classify` con invocación explícita | 5, 11 | `actions/ai-classify.ts` | `pnpm test tests/automations/action-ai-classify.test.ts` |
| 15 | Hardening (rate limit, validación, aislamiento) | 11 | `worker.ts` (edit), `service.ts` (edit) | `pnpm test tests/automations/hardening.test.ts` |
| 16 | Deploy + verificación end-to-end de toda la fase | 12, 13, 14, 15 | `docker-compose.prod.yml` (edit mínima) | `docker compose -f docker-compose.prod.yml config` + `pnpm test tests/automations/full-phase-e2e.test.ts` |

---

#### Paso 1 — Dependencia, schema y migración

**Do**
1. `pnpm add json-logic-engine@5.0.7` (pin verificado en §11).
2. `pnpm approve-builds --all` inmediatamente después, por si el paquete o cualquiera de sus
   dependencias transitivas trae scripts de post-install (lección aprendida en Fase 2).
3. Editar `src/db/schema.ts` agregando los 3 enums y las 5 tablas nuevas del §4 (Schema) — incluida
   `automation_action_approval`, la tabla propia de esta fase que resuelve la aprobación en primer uso
   de `send_message` sin depender de las tablas del copiloto (§4, §9 paso 6) — al final del archivo,
   sin tocar ninguna tabla existente.
4. Correr el skill `add-migration` ya existente en el repo: genera la migración con `pnpm
   db:generate`, revisa el SQL, aplica con `pnpm db:migrate`.

**Done when**
- [ ] WHEN `node -e "require('json-logic-engine')"` se ejecuta THE SYSTEM SHALL salir con código 0.
- [ ] WHEN `pnpm db:migrate` corre contra la base de datos local THE SYSTEM SHALL crear las tablas
      `automation`, `automation_action`, `automation_run`, `automation_action_log`,
      `automation_action_approval`.
- [ ] WHEN se inspecciona `automation` con `\d automation` en `psql` THE SYSTEM SHALL mostrar la
      columna `org_id` como `not null`.
- [ ] WHEN se inspecciona `automation_action` con `\d automation_action` THE SYSTEM SHALL mostrar un
      índice único sobre `(automation_id, position)`.
- [ ] WHEN se inspecciona `automation_action_approval` con `\d automation_action_approval` THE SYSTEM
      SHALL mostrar un índice único sobre `(org_id, action_type)`.
- [ ] WHEN `pnpm approve-builds --all` corre después de la instalación THE SYSTEM SHALL salir con
      código 0.

**Verify**
```bash
pnpm add json-logic-engine@5.0.7
pnpm approve-builds --all                         # expect: exit 0
node -e "require('json-logic-engine'); console.log('ok')"   # expect: prints ok, exit 0
pnpm db:migrate                                    # expect: exit 0
psql "$DATABASE_URL" -c "\d automation" | grep -q "org_id.*not null"          && echo OK1
psql "$DATABASE_URL" -c "\d automation_action" | grep -q "automation_action_position_unique" && echo OK2
psql "$DATABASE_URL" -c "\d automation_run" | grep -q "condition_matched"     && echo OK3
psql "$DATABASE_URL" -c "\d automation_action_log" | grep -q "attempt"        && echo OK4
psql "$DATABASE_URL" -c "\d automation_action_approval" | grep -q "automation_action_approval_org_action_type_unique" && echo OK5
# expect: OK1, OK2, OK3, OK4, OK5 all printed
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 1: dependencia json-logic-engine + schema + migracion"
git tag step-33-json-logic-schema
```

---

#### Paso 2 — Motor de eventos: emisor fire-and-forget

**Do**
Crear `src/server/automations/types.ts` con el tipo unión de eventos soportados
(`AutomationEventType = "message.received" | "content.published"` — solo 2 en v1, ver Decisión #8 en
§20.3) y sus payloads. Crear `src/server/automations/events.ts` exportando
`emitAutomationEvent(type: AutomationEventType, payload: object): void` — internamente crea (o
reutiliza) una `Queue("automation-events", { connection: redisConnection })` de BullMQ y llama
`.add(type, payload)` dentro de un `try/catch` que **nunca** relanza: en el `catch`, solo hace
`logger.error(...)` y retorna. La función no es `async` desde la perspectiva del llamador — internamente
usa `.add(...).catch(err => logger.error(...))` sin `await` en el punto de llamada, para que un
llamador que no hace `await` tampoco quede expuesto a un unhandled rejection.

**Files**
- `src/server/automations/types.ts`
- `src/server/automations/events.ts`
- `tests/automations/events.test.ts`

**Done when**
- [ ] WHEN `emitAutomationEvent("message.received", payload)` se llama con Redis disponible THE
      SYSTEM SHALL encolar exactamente 1 job en la cola `automation-events`.
- [ ] WHEN `emitAutomationEvent(...)` se llama y la conexión a Redis está caída (mock que rechaza)
      THE SYSTEM SHALL no lanzar ninguna excepción hacia el llamador.
- [ ] WHEN `emitAutomationEvent(...)` falla internamente THE SYSTEM SHALL registrar el error con
      `logger.error` incluyendo el `type` del evento.
- [ ] WHEN el test suite de este paso corre THE SYSTEM SHALL reportar 0 fallidos y 0 omitidos.

**Verify**
```bash
pnpm test tests/automations/events.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 2: emisor de eventos fire-and-forget"
git tag step-34-event-emitter
```

---

#### Paso 3 — Emisión desde los canales de Fase 1 (edición mínima) + aislamiento de fallos

**Do**
Fase 1 (`blueprints/nucleo-fase-1/blueprint.md` §3, §9 paso 8) no tiene un `webhook-handler.ts` único
— el manejo de webhooks entrantes son **4 archivos separados**: `src/server/channels/whatsapp.ts`,
`instagram.ts`, `facebook.ts`, `tiktok.ts`, cada uno con verificación de firma y su propia función
`normalizeInboundEvent` que traduce el payload del proveedor a `{ externalAccountId, externalEventId,
contactExternalId, contactName, body, mediaUrls }` (shape confirmado en Fase 1 §5). Editar los **4**
archivos — grep de respaldo si el nombre real difiere: `grep -rl "normalizeInboundEvent"
src/server/channels/*.ts`, se esperan **4 matches**, editar los 4, no asumir uno solo. En cada uno,
inmediatamente después de que `normalizeInboundEvent` produce el evento normalizado, agregar una
única línea: `emitAutomationEvent("message.received", { externalAccountId, externalEventId, channel,
contactExternalId, body })`.

**VERIFY — reconciliación de payload, no inventar:** en Fase 1, la resolución de `org_id` (por
`external_account_id` → `channel_connection`) y la creación de `conversationId`/`messageId` ocurren
**después** de este punto — la primera en la ruta `src/app/api/webhooks/<canal>/route.ts` (§8 Critical
endpoints), las segundas de forma asíncrona en `scripts/worker.ts` (§9 paso 9-10), nunca dentro de
`src/server/channels/*.ts`. Por lo tanto el payload de este paso **no puede incluir** `orgId` ni
`conversationId`/`messageId` — solo lleva `externalAccountId` (que el worker de automatizaciones del
paso 11 debe resolver a `org_id` vía `channel_connection` antes de consultar automatizaciones activas,
igual que ya hace la ruta de webhook). El builder debe confirmar contra el código real de Fase 1 en el
momento de implementar este paso si `normalizeInboundEvent` expone `externalAccountId` como valor de
retorno directo o si hace falta leerlo de la firma de la función en cada archivo de canal — el
blueprint de Fase 1 no lo especifica byte a byte.

`conversation.tagged` **no se implementa en esta fase** — ver Decisión #8 en §20.3: Fase 1 no expone
ningún primitivo de etiquetado de una sola línea que editar (el único camino de escritura es el tool
`tag_conversation` del copiloto, embebido en la orquestación de `src/server/copilot/runs.ts`), así que
`src/server/conversations/tags.ts` **no existe y no se edita en este paso**.

**Files**
- `src/server/channels/whatsapp.ts` (edición: 1 línea agregada)
- `src/server/channels/instagram.ts` (edición: 1 línea agregada)
- `src/server/channels/facebook.ts` (edición: 1 línea agregada)
- `src/server/channels/tiktok.ts` (edición: 1 línea agregada)
- `tests/automations/events-emission.test.ts`

**Done when**
- [ ] WHEN un webhook de WhatsApp con firma válida llega y la conexión a Redis está caída (mock)
      THE SYSTEM SHALL igual responder `200` y persistir el mensaje (vía el worker de Fase 1, sin
      cambios de comportamiento observable).
- [ ] WHEN un webhook de WhatsApp válido llega con Redis disponible THE SYSTEM SHALL encolar 1 evento
      `message.received` con el `externalAccountId` correcto.
- [ ] WHEN los 4 canales reciben un evento normalizado equivalente THE SYSTEM SHALL encolar el mismo
      shape de evento `message.received` en los 4 — verificado con fixtures por canal, uno por archivo.

**Verify**
```bash
grep -rl "normalizeInboundEvent" src/server/channels/*.ts | wc -l | grep -qx 4   # expect: exit 0 — confirma que los 4 archivos existen antes de editarlos
pnpm test tests/automations/events-emission.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                          # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 3: emision de eventos desde los 4 canales de Fase 1 (edicion minima)"
git tag step-35-emit-from-phase1
```

---

#### Paso 4 — Emisión desde el orquestador de publicación de Fase 2 (edición mínima)

**Do**
Fase 2 (`blueprints/nucleo-fase-2/blueprint.md` §3, §9 step 26) no tiene un `publish-worker.ts` con
una función `publishContentItem()` — la publicación real vive en `src/server/publishing/publish.ts`
(el orquestador: dado un `content_channel_target.id`, resuelve el canal, llama al adaptador correcto,
y actualiza `status`/`published_at`/`external_post_id`), consumido por el poller
`scripts/worker-publish.ts`. Editar `src/server/publishing/publish.ts`: justo después de que
`publish.ts` actualiza `content_channel_target.status` a `published`, agregar
`emitAutomationEvent("content.published", { orgId, contentItemId, contentChannelTargetId, channel })`.
Grep de respaldo si el nombre real difiere: `grep -rl "createContentItem" src/server/content` y
`grep -rl "worker-publish\|export.*publish" src/server/publishing scripts` — ambos deben producir al
menos 1 match antes de editar. Un solo punto de inserción; nada más del orquestador se modifica.

**Files**
- `src/server/publishing/publish.ts` (edición: 1 línea agregada)
- `tests/automations/events-emission-content.test.ts`

**Done when**
- [ ] WHEN un job de publicación completa exitosamente THE SYSTEM SHALL encolar 1 evento
      `content.published` con el `contentItemId` correcto.
- [ ] WHEN un job de publicación completa exitosamente y Redis está caído (mock) THE SYSTEM SHALL
      igual marcar el `content_item` como `published` sin lanzar excepción.
- [ ] WHEN un job de publicación falla (antes de llegar al punto de emisión) THE SYSTEM SHALL no
      encolar ningún evento `content.published`.

**Verify**
```bash
grep -rl "createContentItem" src/server/content   # expect: exit 0 — al menos 1 match
grep -rlE "worker-publish|export.*publish" src/server/publishing scripts   # expect: exit 0 — al menos 1 match
pnpm test tests/automations/events-emission-content.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                                  # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 4: emision de eventos desde publish.ts de Fase 2 (edicion minima)"
git tag step-36-emit-from-phase2
```

---

#### Paso 5 — Catálogo de acciones base + permisos (`tag_conversation`, `assign_conversation`)

**Do**
Crear `src/server/automations/actions/catalog.ts`: un registro tipado `{ [actionType]: { configSchema: ZodSchema, requiredPermission: string, execute: (ctx, config) => Promise<{ result: unknown }> } }`, siguiendo el mismo patrón de registro que el catálogo de tools del copiloto de Fase 1 (referencia: el skill `add-copilot-tool` del repo documenta ese patrón) pero en un catálogo **separado**, sin mezclar con el copiloto. Implementar `tag-conversation.ts` (agrega un tag a la conversación del evento, reutilizando el servicio de Fase 1) y `assign-conversation.ts` (asigna a un miembro del equipo, valida que el `memberId` pertenezca a la organización).

**Files**
- `src/server/automations/actions/catalog.ts`
- `src/server/automations/actions/tag-conversation.ts`
- `src/server/automations/actions/assign-conversation.ts`
- `tests/automations/actions-catalog.test.ts`

**Done when**
- [ ] WHEN `catalog.get("tag_conversation")` se llama THE SYSTEM SHALL retornar una entrada con
      `requiredPermission = "automation:action:tag_conversation"`... **corrección:** con
      `requiredPermission` definido y un `execute` invocable.
- [ ] WHEN `execute()` de `tag_conversation` se llama sin el permiso requerido en el contexto THE
      SYSTEM SHALL lanzar un error tipado `PermissionDeniedError` y no escribir el tag.
- [ ] WHEN `execute()` de `assign_conversation` recibe un `memberId` que no pertenece a la
      organización del evento THE SYSTEM SHALL lanzar `ValidationError` y no asignar.
- [ ] WHEN `configSchema` de `assign_conversation` valida un `configJson` sin `memberId` THE SYSTEM
      SHALL rechazar con un error zod, no un `undefined` silencioso.

**Verify**
```bash
pnpm test tests/automations/actions-catalog.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                          # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 5: catalogo de acciones base (tag_conversation, assign_conversation)"
git tag step-37-actions-catalog-base
```

---

#### Paso 6 — Acción `send_message` con aprobación en primer uso

**Do**
Crear `src/server/automations/actions/send-message.ts`. **Esta fase NO reutiliza las tablas
`runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1.** Esas tablas están diseñadas para un
contexto conversacional que un llamador de sistema no siempre tiene:
`runs.conversation_id` (FK a `conversation`) es `not null` y un trigger `content.published` no tiene
conversación en absoluto, estructuralmente, nunca; `runs.initiated_by` (FK a `user`) también es
`not null` y no hay ningún usuario actuando cuando el llamador es el motor interno de automatizaciones.
Forzar esos campos con valores mínimos inventados sería modelar una mentira en el schema del copiloto
para resolver un problema que no es del copiloto. Ver Decisión #7 en §20.3 para el registro completo
de esta decisión.

En su lugar, `send_message` consulta directamente la tabla propia de esta fase,
`automation_action_approval` (§4, creada por la migración del paso 1): antes de enviar, verifica con
una consulta directa — sin ningún join a tablas del copiloto — si existe una fila con
`(org_id, action_type) = (orgId del evento, "send_message")`. Si no existe fila: no envía el mensaje y
lanza `ApprovalRequiredError` (clase nueva en `src/server/automations/actions/errors.ts`, un error
tipado y explícitamente no-reintentable). **`send-message.ts` nunca escribe en
`automation_action_log`** — esa escritura es responsabilidad exclusiva de `action-runner.ts` (paso 12),
el único componente de esta fase autorizado a escribir en esa tabla (ver paso 12 para el detalle de
cómo detecta y registra este error sin pasar por el pipeline de reintentos de BullMQ). Si existe fila:
envía por el mismo gateway de canal que usa Fase 1 para responder mensajes.

**Files**
- `src/server/automations/actions/send-message.ts`
- `src/server/automations/actions/errors.ts` (nuevo: `ApprovalRequiredError`)
- `src/server/automations/actions/catalog.ts` (edición: registra `send_message`)
- `tests/automations/action-send-message.test.ts`

**Done when**
- [ ] WHEN `send_message` se ejecuta por primera vez para una organización sin fila en
      `automation_action_approval` para `action_type = "send_message"` THE SYSTEM SHALL lanzar
      `ApprovalRequiredError` sin invocar el gateway de canal.
- [ ] WHEN existe una fila en `automation_action_approval` con `action_type = "send_message"` para la
      organización del evento THE SYSTEM SHALL invocar el gateway de canal exactamente una vez con el
      contenido configurado.
- [ ] WHEN `send_message` lanza `ApprovalRequiredError` THE SYSTEM SHALL no escribir ninguna fila en
      `automation_action_log` desde `send-message.ts` — esa escritura ocurre exclusivamente en
      `action-runner.ts` (paso 12).

**Verify**
```bash
pnpm test tests/automations/action-send-message.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                              # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 6: accion send_message con aprobacion en primer uso"
git tag step-38-action-send-message
```

---

#### Paso 7 — Acción `create_content_draft` (cruza a Fase 2)

**Do**
Crear `src/server/automations/actions/create-content-draft.ts`, importando `createContentItem` desde
`src/server/content/items.ts` (Fase 2, sin modificarlo) para crear un `content_item` en
estado `draft` vinculado a la organización del evento. **Dependencia cruzada de fase documentada**:
este archivo es el único punto de Fase 3 que importa de `src/server/content/**`.

**Files**
- `src/server/automations/actions/create-content-draft.ts`
- `src/server/automations/actions/catalog.ts` (edición: registra `create_content_draft`)
- `tests/automations/action-create-content-draft.test.ts`

**Done when**
- [ ] WHEN `create_content_draft` se ejecuta con un `configJson` válido THE SYSTEM SHALL crear
      exactamente 1 fila en `content_item` con `status = "draft"`.
- [ ] WHEN el `content_item` creado se consulta THE SYSTEM SHALL tener el mismo `org_id` que el
      evento que disparó la automatización.
- [ ] WHEN `create_content_draft` se ejecuta con un `configJson` sin el campo `title` requerido THE
      SYSTEM SHALL rechazar con un error zod antes de llamar a `createContentItem`.

**Verify**
```bash
pnpm test tests/automations/action-create-content-draft.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                                      # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 7: accion create_content_draft (cruza a Fase 2)"
git tag step-39-action-create-content-draft
```

---

#### Paso 8 — Evaluador de condiciones json-logic

**Do**
Crear `src/server/automations/condition-evaluator.ts` envolviendo `LogicEngine` de
`json-logic-engine`: `evaluateCondition(conditionJson: object, eventPayload: object): boolean`. Un
árbol `{}` (vacío) siempre evalúa a `true` (automatización sin condición = siempre matchea). Un árbol
malformado (que `LogicEngine` no puede parsear) se captura en `try/catch`, se registra con
`logger.warn`, y la función retorna `false` (nunca lanza, nunca bloquea el worker). Crear el fixture
`tests/automations/fixtures/sample-condition.json` con un árbol de referencia
`{"==": [{"var": "tag"}, "urgente"]}`.

**Files**
- `src/server/automations/condition-evaluator.ts`
- `tests/automations/condition-evaluator.test.ts`
- `tests/automations/fixtures/sample-condition.json`

**Done when**
- [ ] WHEN `evaluateCondition({}, anyPayload)` se llama THE SYSTEM SHALL retornar `true`.
- [ ] WHEN `evaluateCondition(sample-condition.json, { tag: "urgente" })` se llama THE SYSTEM SHALL
      retornar `true`.
- [ ] WHEN `evaluateCondition(sample-condition.json, { tag: "normal" })` se llama THE SYSTEM SHALL
      retornar `false`.
- [ ] WHEN `evaluateCondition({ malformed: [1,2,3] } as any, {})` se llama con un árbol que
      `LogicEngine` no puede interpretar THE SYSTEM SHALL retornar `false` sin lanzar excepción.

**Verify**
```bash
pnpm test tests/automations/condition-evaluator.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                              # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 8: evaluador de condiciones json-logic"
git tag step-40-condition-evaluator
```

---

#### Paso 9 — CRUD de automatizaciones (API)

**Do**
Crear `src/server/automations/service.ts` con: schemas zod de creación/edición, `validateTransition(current, next)` (implementa la tabla de transiciones de §5), y las funciones de acceso a datos con `org_id` obligatorio en cada consulta. Crear `src/app/api/automations/route.ts` (GET, POST) y `src/app/api/automations/[id]/route.ts` (GET, PATCH), aplicando `requirePermission` según §8.

**Files**
- `src/server/automations/service.ts`
- `src/app/api/automations/route.ts`
- `src/app/api/automations/[id]/route.ts`
- `tests/automations/api-crud.test.ts`

**Done when**
- [ ] WHEN `POST /api/automations` recibe un body válido con 1 acción THE SYSTEM SHALL responder
      `201` con `status: "draft"`.
- [ ] WHEN `PATCH /api/automations/[id]` intenta transicionar `draft → active` sin ninguna acción
      configurada THE SYSTEM SHALL responder `422` con `code: "INVALID_TRANSITION"`.
- [ ] WHEN `PATCH /api/automations/[id]` intenta transicionar `active → draft` directamente THE
      SYSTEM SHALL responder `422` con `code: "INVALID_TRANSITION"`.
- [ ] WHEN un usuario de la organización B solicita `GET /api/automations/[id]` de una automatización
      de la organización A THE SYSTEM SHALL responder `404`.
- [ ] WHEN `POST /api/automations` recibe un `triggerEventType` fuera del conjunto soportado THE
      SYSTEM SHALL responder `422` con `code: "VALIDATION_ERROR"`.

**Verify**
```bash
pnpm test tests/automations/api-crud.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 9: CRUD de automatizaciones (API)"
git tag step-41-crud-api
```

---

#### Paso 10 — UI de formulario estructurado

**Do**
Crear `src/app/(app)/automations/page.tsx` (lista), `src/app/(app)/automations/new/page.tsx`
(formulario de creación: `TriggerSelect`, `ConditionBuilder` de filas simples campo/operador/valor
compiladas a un AND de json-logic, `ActionListEditor` con reordenamiento por posición — **sin canvas,
sin drag-and-drop de nodos**, per §1 no-objetivos), y `src/app/(app)/automations/[id]/page.tsx`
(edición). `TriggerSelect` lista los 2 `trigger_event_type` soportados (`message.received`,
`content.published`). El botón de activar está deshabilitado con tooltip cuando `actions.length === 0`.

**Files**
- `src/app/(app)/automations/page.tsx`
- `src/app/(app)/automations/new/page.tsx`
- `src/app/(app)/automations/[id]/page.tsx`
- `tests/e2e/automations-form.spec.ts`

**Done when**
- [ ] WHEN un usuario con `automation:create` visita `/automations/new` THE SYSTEM SHALL mostrar el
      `TriggerSelect` con exactamente 2 opciones.
- [ ] WHEN el usuario completa el formulario con 1 acción y envía THE SYSTEM SHALL redirigir a
      `/automations/[id]` mostrando el `status` `draft`.
- [ ] WHEN el usuario intenta activar una automatización sin acciones THE SYSTEM SHALL mantener el
      botón "Activar" deshabilitado con un tooltip explicando por qué.

**Verify**
```bash
pnpm test:e2e tests/e2e/automations-form.spec.ts   # expect: exit 0, 0 failed
pnpm typecheck                                       # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 10: UI de formulario estructurado"
git tag step-42-ui-form
```

---

#### Paso 11 — Ejecución end-to-end (evento → condición → acciones → log)

**Do**
Crear `src/server/automations/worker.ts`: un `Worker` de BullMQ que consume la cola
`automation-events`. Por cada evento: consulta las automatizaciones `active` de esa organización cuyo
`trigger_event_type` coincide (usa el índice del §4), y para **cada** una: evalúa la condición con
`condition-evaluator.ts`, **crea siempre** una fila `automation_run` (matchee o no, por la decisión de
observabilidad del §4). Si matcheó y tiene ≥1 acción: encola el primer job de acción en la cola
genérica `jobs` ya existente, con `jobType = "automation:execute-action"` y `idempotencyKey =
"${automationRunId}:0"`. Editar `scripts/worker.ts` (edición mínima: 3-4 líneas) — el archivo real de
Fase 1 (`blueprints/nucleo-fase-1/blueprint.md` §3, `"worker": "tsx scripts/worker.ts"` en
`package.json`, servicio `worker` en `docker-compose.prod.yml`; **no existe `src/worker.ts`**) — para
registrar este nuevo `Worker` junto a los ya existentes de Fase 1/2, sin tocar los workers previos. El
worker de publicación de Fase 2 (`scripts/worker-publish.ts`, script `worker:publish`) es un proceso
completamente separado — no se toca ni se unifica con `scripts/worker.ts` en este paso.

**Files**
- `src/server/automations/worker.ts`
- `scripts/worker.ts` (edición)
- `tests/automations/worker-e2e.test.ts`

**Done when**
- [ ] WHEN llega un evento `message.received` que matchea la condición de una automatización activa
      THE SYSTEM SHALL crear un `automation_run` con `condition_matched = true` y encolar el primer
      job de acción.
- [ ] WHEN llega un evento que NO matchea ninguna condición de una automatización activa THE SYSTEM
      SHALL crear un `automation_run` con `condition_matched = false` y `status = "completed"`, sin
      encolar ninguna acción.
- [ ] WHEN no existe ninguna automatización `active` para el `trigger_event_type` del evento THE
      SYSTEM SHALL no crear ningún `automation_run`.
- [ ] WHEN una automatización `paused` tiene el mismo `trigger_event_type` que el evento THE SYSTEM
      SHALL ignorarla (no evaluar su condición, no crear run).

**Verify**
```bash
pnpm test tests/automations/worker-e2e.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 11: worker de ejecucion end-to-end"
git tag step-43-execution-worker
```

---

#### Paso 12 — Reintentos y dead-letter vía BullMQ

**Do**
Crear `src/server/automations/action-runner.ts`: el processor del job `automation:execute-action` en
la cola `jobs` ya existente. Ejecuta la acción vía `catalog.get(actionType).execute(...)`, escribe un
`automation_action_log` por intento — **este processor es el único componente de esta fase autorizado a
escribir en `automation_action_log`**; ninguna acción del catálogo (incluida `send_message`, paso 6)
escribe en esa tabla directamente. En éxito: si existe la siguiente acción por `position`, encola su
job (encadenamiento secuencial); si no, marca `automation_run.status = "completed"`.

**Manejo especial de `ApprovalRequiredError`** (lanzado por `send_message`, paso 6, desde
`src/server/automations/actions/errors.ts`): `action-runner.ts` detecta este error por su tipo (`instanceof
ApprovalRequiredError`) **antes** de dejarlo caer al pipeline de reintentos genérico. Cuando lo
detecta: escribe inmediatamente `automation_action_log.status = "failed"` con `error =
"approval_required"`, marca `automation_run.status` con la misma regla que un fallo genérico
(`"partial"` si ya hubo ≥1 acción exitosa antes, `"failed"` si esta era la primera), detiene la
secuencia sin encolar la siguiente acción, y **no reencola el job** — a diferencia de cualquier otro
fallo de acción, `ApprovalRequiredError` nunca llega al backoff/reintento de BullMQ ni a
`job_dead_letters`.

En fallo genérico (cualquier error que no sea `ApprovalRequiredError`): deja que el reintento/backoff
ya configurado de la cola `jobs` (heredado de Fase 1/2) opere; al agotar reintentos, la infraestructura
existente escribe en `job_dead_letters` (sin cambios) y este processor marca
`automation_run.status = "partial"` si ya hubo ≥1 acción exitosa antes, o `"failed"` si esta era la
primera.

**Files**
- `src/server/automations/action-runner.ts`
- `tests/automations/retries-dead-letter.test.ts`

**Done when**
- [ ] WHEN una acción falla y agota los reintentos configurados THE SYSTEM SHALL escribir una fila en
      `job_dead_letters` referenciando el `automation_run_id`.
- [ ] WHEN una acción falla siendo la primera de la secuencia (0 acciones previas exitosas) THE
      SYSTEM SHALL marcar `automation_run.status = "failed"`.
- [ ] WHEN una acción falla después de que al menos 1 acción previa tuvo éxito THE SYSTEM SHALL
      marcar `automation_run.status = "partial"`.
- [ ] WHEN todas las acciones de la secuencia tienen éxito THE SYSTEM SHALL marcar
      `automation_run.status = "completed"` y `finished_at` no nulo.
- [ ] WHEN una acción lanza `ApprovalRequiredError` THE SYSTEM SHALL escribir
      `automation_action_log.status = "failed"` con `error = "approval_required"` de forma inmediata y
      SHALL excluir ese intento del pipeline de reintentos/backoff de BullMQ — 0 reintentos encolados
      para ese job y 0 filas escritas en `job_dead_letters` para ese intento, verificado con un
      spy/mock sobre el mecanismo de reintento de la cola `jobs`.

**Verify**
```bash
pnpm test tests/automations/retries-dead-letter.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                               # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 12: reintentos y dead-letter via BullMQ"
git tag step-44-retries-dead-letter
```

---

#### Paso 13 — UI de historial de runs (observabilidad)

**Do**
Crear `src/app/api/automations/[id]/runs/route.ts` (GET, según §5) y
`src/app/(app)/automations/[id]/runs/page.tsx`: lista de runs ordenados por `started_at desc` con
badge de `status`, expandible para ver los `automation_action_log` en orden con su `status`,
`attempt` y `error`. **Esta es la primera pantalla de la fase que renderiza badges de estado
`partial`/`paused`/`retrying`**, así que este paso también define el token nuevo `--warning` (y su
contraparte de texto `--warning-fg`) en `src/app/globals.css` bajo `@theme` — no existe en la paleta
heredada de Fase 1 (§7). El builder elige un hex real para claro y oscuro, siguiendo la misma
metodología de contraste que Fase 1 usó para el resto de la paleta (≥4.5:1 entre `--warning-fg` y
`--warning`), y registra el valor elegido en el `CLAUDE.md` acumulado del repo en este mismo paso — no
se inventa un hex en el blueprint.

**Files**
- `src/app/api/automations/[id]/runs/route.ts`
- `src/app/(app)/automations/[id]/runs/page.tsx`
- `src/app/globals.css` (edición: agrega `--warning`/`--warning-fg` claro y oscuro bajo `@theme`)
- `tests/e2e/automations-runs.spec.ts`

**Done when**
- [ ] WHEN un usuario visita `/automations/[id]/runs` de una automatización con runs previos THE
      SYSTEM SHALL listar los runs con el más reciente primero.
- [ ] WHEN el usuario expande un run THE SYSTEM SHALL mostrar cada `automation_action_log` en el
      orden de `position` de la acción correspondiente.
- [ ] WHEN una automatización nunca se ha disparado THE SYSTEM SHALL mostrar el mensaje de estado
      vacío específico ("Esta automatización aún no se ha disparado"), no el mensaje genérico de
      lista vacía.
- [ ] WHEN se definen los valores claro y oscuro de `--warning`/`--warning-fg` en
      `src/app/globals.css` THE SYSTEM SHALL cumplir un contraste ≥4.5:1 entre `--warning-fg` y
      `--warning` en ambos esquemas, verificado por el script de contraste del `Verify` de este paso.

**Verify**
```bash
pnpm test:e2e tests/e2e/automations-runs.spec.ts   # expect: exit 0, 0 failed
pnpm typecheck                                       # expect: exit 0
node -e '
const fs = require("fs");
const css = fs.readFileSync("src/app/globals.css", "utf8");
function grab(name, scope) {
  const re = new RegExp(scope.replace(/[.:]/g, "\\$&") + "\\s*\\{[^}]*?--" + name + ":\\s*(#[0-9a-fA-F]{6})");
  const m = css.match(re);
  if (!m) { console.error("token --" + name + " no encontrado en el bloque " + scope); process.exit(1); }
  return m[1];
}
function luminance(hex) {
  const c = hex.slice(1).match(/.{2}/g).map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const L1 = luminance(a), L2 = luminance(b);
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}
let ok = true;
for (const scope of [":root", ".dark"]) {
  const bg = grab("warning", scope);
  const fg = grab("warning-fg", scope);
  const r = ratio(bg, fg);
  if (r < 4.5) { console.error(scope + " contraste " + r.toFixed(2) + " < 4.5"); ok = false; }
  else { console.log(scope + " contraste OK: " + r.toFixed(2)); }
}
process.exit(ok ? 0 : 1);
'                                                     # expect: exit 0, imprime "contraste OK" para :root y .dark
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 13: UI de historial de runs"
git tag step-45-ui-runs-history
```

---

#### Paso 14 — Acción `ai_classify` con invocación explícita

**Do**
Crear `src/server/automations/actions/ai-classify.ts`, invocando el gateway de IA ya existente de
Fase 1 (`@anthropic-ai/sdk` ya integrado). Estructuralmente, `ai_classify` solo se ejecuta cuando
existe una fila `automation_action` con `action_type = 'ai_classify'` para esa automatización — el
worker (paso 11) y el action-runner (paso 12) no tienen ninguna ruta que invoque una acción no
presente en la lista configurada por el usuario, así que "solo se ejecuta si el usuario la agregó
explícitamente" queda garantizado por el diseño del catálogo, no por un chequeo adicional.

**Files**
- `src/server/automations/actions/ai-classify.ts`
- `src/server/automations/actions/catalog.ts` (edición: registra `ai_classify`)
- `tests/automations/action-ai-classify.test.ts`

**Done when**
- [ ] WHEN una automatización no tiene ninguna acción `ai_classify` en su lista THE SYSTEM SHALL
      nunca invocar el cliente de Anthropic durante la ejecución de ese `automation_run` (aserción
      sobre el mock del cliente: 0 llamadas).
- [ ] WHEN una automatización tiene `ai_classify` configurada y se ejecuta THE SYSTEM SHALL invocar
      el cliente de Anthropic exactamente 1 vez con el prompt configurado.
- [ ] WHEN la clasificación responde THE SYSTEM SHALL escribir el resultado en
      `automation_action_log.result`.

**Verify**
```bash
pnpm test tests/automations/action-ai-classify.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                              # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 14: accion ai_classify con invocacion explicita"
git tag step-46-action-ai-classify
```

---

#### Paso 15 — Hardening (rate limit, validación, aislamiento)

**Do**
Editar `src/server/automations/worker.ts`: agregar un límite de N=120 runs/min por organización
usando el helper de rate-limit ya existente de Fase 1 — al exceder, el worker omite crear el run para
esa organización y registra `logger.warn` (no lanza, no bloquea otros eventos). Editar
`src/server/automations/service.ts`: la validación de `conditionJson` ya definida en §5 (profundidad
máxima 8, tamaño serializado máximo 16KB) se hace explícita con una función `validateConditionShape`
reutilizada tanto en creación como en edición.

**Files**
- `src/server/automations/worker.ts` (edición)
- `src/server/automations/service.ts` (edición)
- `tests/automations/hardening.test.ts`

**Done when**
- [ ] WHEN una organización dispara más de 120 eventos matcheables en 1 minuto (simulado) THE SYSTEM
      SHALL omitir la creación de runs adicionales sin afectar otras organizaciones.
- [ ] WHEN `POST /api/automations` recibe un `conditionJson` con profundidad de anidamiento mayor a 8
      THE SYSTEM SHALL responder `422` con `code: "VALIDATION_ERROR"`.
- [ ] WHEN `POST /api/automations` recibe un `conditionJson` serializado mayor a 16KB THE SYSTEM
      SHALL responder `422` con `code: "VALIDATION_ERROR"`.
- [ ] WHEN un usuario de la organización B consulta `GET /api/automations/[id]/runs` de una
      automatización de la organización A THE SYSTEM SHALL responder `404`.

**Verify**
```bash
pnpm test tests/automations/hardening.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                    # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 15: hardening (rate limit, validacion, aislamiento)"
git tag step-47-hardening
```

---

#### Paso 16 — Deploy + verificación end-to-end de toda la fase

**Do**
Revisar `docker-compose.prod.yml`: el worker de automatizaciones (paso 11) corre dentro del proceso
`worker` ya existente (editado en `scripts/worker.ts`), así que **no se agrega ningún servicio nuevo**.
Editar el archivo solo si hace falta confirmar/documentar (comentario) que ese servicio ya cubre la
cola `automation-events` — si no hace falta ningún cambio real, se deja constancia explícita de que
la edición fue una confirmación sin diff funcional. Crear
`tests/automations/full-phase-e2e.test.ts`: prueba de integración que cubre el flujo completo — mensaje
entrante → automatización con condición que matchea → acciones `tag_conversation` + `send_message`
(con una fila pre-insertada en `automation_action_approval` para `action_type = "send_message"` en el
fixture de test) → verifica `automation_run.status = "completed"` y 2 filas en `automation_action_log`
con `status = "success"`.

**Files**
- `docker-compose.prod.yml` (edición mínima o confirmación documentada)
- `tests/automations/full-phase-e2e.test.ts`

**Done when**
- [ ] WHEN `docker compose -f docker-compose.prod.yml config` corre THE SYSTEM SHALL salir con
      código 0.
- [ ] WHEN el flujo completo del test de integración corre (mensaje → condición → 2 acciones) THE
      SYSTEM SHALL terminar con `automation_run.status = "completed"` y 2 `automation_action_log`
      con `status = "success"`.
- [ ] WHEN el mismo test corre sin la aprobación de `send_message` pre-otorgada THE SYSTEM SHALL
      terminar con `automation_run.status = "partial"` (la primera acción `tag_conversation` tuvo
      éxito, la segunda quedó bloqueada por falta de aprobación).

**Verify**
```bash
docker compose -f docker-compose.prod.yml config > /dev/null   # expect: exit 0
pnpm test tests/automations/full-phase-e2e.test.ts             # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck && pnpm lint && pnpm test                        # expect: exit 0 — gate global, toda la fase
```

**Checkpoint**
```bash
git add -A && git commit -m "fase3 paso 16: deploy y verificacion end-to-end de la fase"
git tag step-48-deploy-verification
git tag -l 'step-18-verification' | grep -q .   # expect: exit 0 — cierre de Fase 1 intacto
git tag -l 'step-32-verification' | grep -q .   # expect: exit 0 — cierre de Fase 2 intacto
git tag -l 'step-*' | wc -l | tr -d ' ' | grep -qx 48   # expect: exit 0 — 18 (Fase 1) + 14 (Fase 2) + 16 (esta fase)
```

---

### 9.1 Paridad y cutover

`NOT APPLICABLE — no es una migración; es una funcionalidad nueva agregada a un sistema en
producción, sin reemplazar ningún camino existente. Los pasos 3 y 4 editan código de Fase 1/2 pero
solo agregan una llamada de emisión de evento sin alterar el comportamiento observable de esos
flujos — la Regla de aislamiento de fallos del §9 paso 3/4 y las pruebas asociadas son la evidencia de
"cero regresión", no un plan de corte.`

---

## 10. Configuración del entorno

### Prerrequisitos
| Herramienta | Versión | Verificación |
|---|---|---|
| Node.js | heredado de Fase 1/2 (ver `.nvmrc` del repo) | `node -v` |
| pnpm | heredado | `pnpm -v` |
| Docker | heredado (Postgres/Redis locales) | `docker -v` |
| Postgres | heredado, corriendo vía `docker-compose.yml` de desarrollo ya existente | `psql --version` |

### Cuentas a crear primero
Ninguna cuenta de servicio nueva — esta fase no introduce ningún proveedor externo. `ANTHROPIC_API_KEY`
(usada por `ai_classify` en el paso 14) ya existe desde Fase 1.

### Variables de entorno
Esta fase **no introduce ninguna variable de entorno nueva**. `json-logic-engine` es una librería
pura sin configuración de red. La cola `automation-events` reutiliza la misma `REDIS_URL` ya validada
en `src/lib/env.ts` desde Fase 1. `ai_classify` reutiliza `ANTHROPIC_API_KEY` ya validada. Por lo
tanto el patrón de fusión de `.env.example` → `.env` (mecanismo `touch .env` +
`while IFS= read -r line; do … ; done < .env.example`, establecido en Fase 2) no se ejecuta con
ninguna clave nueva en esta fase — se documenta aquí explícitamente para que quede claro que no fue
omitido por descuido.

### Archivos que deben estar commiteados
| Archivo | Por qué está commiteado | Línea de excepción en el ignore |
|---|---|---|
| `blueprints/nucleo-fase-3/**` (este bundle, hasta que se copie `workspace/` al root) | documentación del diseño de la fase | ya cubierto por el patrón `"!blueprints"` de `biome.json`; el `.gitignore` del repo no excluye `blueprints/` (confirmado — ver §19.6) |
| `.claude/rules/automations.md` (copiado desde `workspace/.claude/rules/`) | convención del dominio nuevo, debe cargar en cada sesión sobre `src/server/automations/**` | no matcheado por ningún patrón de `.gitignore` heredado — `.claude/` ya está commiteado desde Fase 1 |
| `tests/automations/fixtures/sample-condition.json` | fixture dorado usado por el evaluador (§19.6) | no matcheado por ningún patrón de ignore — `tests/**` ya está commiteado |

### Bootstrap
```bash
# orden: verificar checkpoints previos → copiar workspace/ (no-clobber) → dependencias → migracion
set -e

# 1. Verificar que los checkpoints de Fase 1 y Fase 2 existen antes de tocar nada. El esquema de tags
#    es una secuencia GLOBAL sin prefijo de fase (confirmado leyendo ambos blueprints): Fase 1 usa
#    step-01-scaffold .. step-18-verification, Fase 2 continua la misma secuencia con
#    step-19-media-deps .. step-32-verification. Esta fase continua desde step-33.
STEP_TAGS=$(git tag -l 'step-*' | wc -l | tr -d ' ')
if [ "$STEP_TAGS" -lt 32 ]; then
  echo "ABORT: se esperaban al menos 32 checkpoints (Fase 1: step-01..step-18, Fase 2: step-19..step-32), se encontraron $STEP_TAGS" >&2
  exit 1
fi
git tag -l 'step-18-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 1
git tag -l 'step-32-verification' | grep -q .   # expect: exit 0 — cierre explícito de Fase 2

# 2. Copiar el workspace de esta fase al root del proyecto — SIEMPRE con rutas completas explícitas,
#    nunca abreviado a "workspace/" a secas (esto costo retrabajo real en Fase 1).
rsync -a --ignore-existing \
  "./blueprints/nucleo-fase-3/workspace/" \
  "./" \
  # -a: preserva permisos/timestamps · --ignore-existing: nunca pisa un archivo que el build ya cambio,
  # en particular package.json/pnpm-lock.yaml despues de instalar dependencias. Exit 0 en ambos casos.

# 3. Fusionar .claude/settings.json de esta fase dentro del acumulado de Fases 1+2, sin pisarlo.
#    scripts/merge-claude-settings.mjs ya existe en el repo desde Fase 2 — se reutiliza tal cual.
node scripts/merge-claude-settings.mjs "./blueprints/nucleo-fase-3/workspace/.claude/settings.json"

# 4. Dependencias (paso 1 del build order las instala explicitamente; aqui solo se confirma el lockfile).
pnpm install --frozen-lockfile
```

**El bootstrap no scaffoldea nada del framework** — Next.js, Drizzle, BullMQ y better-auth ya están
scaffoldeados desde Fase 1. Este bloque solo verifica los checkpoints previos, copia el workspace de
esta fase, y confirma dependencias. `git init` no aplica aquí — el repositorio ya existe con historial
de Fase 1/2; si `git rev-parse --git-dir` fallara, el bloque abortaría igual en el chequeo de tags
(paso 1 de este bloque), que es la señal correcta de "algo está mal con el repo antes de continuar".

---

## 11. Dependencias

### Runtime
| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| `json-logic-engine` | `5.0.7` | `https://registry.npmjs.org/json-logic-engine` (verificación en vivo en esta sesión, ver nota) | 2026-08-15 | §9 paso 1 (`pnpm add json-logic-engine@5.0.7`) | evaluador de condiciones determinístico sin `eval()` |

**Nota de verificación:** `json-logic-engine@5.0.7` fue verificado en vivo el 2026-08-15 contra
`registry.npmjs.org/json-logic-engine` y la versión `5.0.7` específica del registro, más
confirmación cruzada en Snyk ("latest non-vulnerable version") y Socket.dev ("healthy maintenance
status", 42,091 descargas/semana). Es la versión estable más reciente publicada (~abril 2026),
activamente mantenida. Se descartó `json-logic-js@2.0.5` (última publicación 2024-07-09, sin
mantenimiento activo) y `jsonata` (herramienta de transformación de datos, no de árboles de condición
booleana — ajuste de propósito incorrecto).

### Desarrollo
No se agrega ningún paquete de desarrollo nuevo en esta fase — el runner de tests (asumido vitest,
heredado), el linter/formatter (Biome, heredado) y el runner e2e (asumido Playwright, heredado) ya
están instalados y configurados desde Fase 1/2.

### Deliberately not used
| Rechazado | En su lugar | Por qué |
|---|---|---|
| `json-logic-js@2.0.5` | `json-logic-engine@5.0.7` | Última publicación 2024-07-09, sin actividad de mantenimiento reciente — estancado frente a una alternativa activamente mantenida |
| `jsonata` | `json-logic-engine@5.0.7` | `jsonata` es para transformación de datos, no para evaluar árboles de condición booleana — herramienta equivocada para el problema |
| `xstate` (cualquier versión, incluida `xstate@5.32.5`) | Enum de Postgres (`draft`\|`active`\|`paused`) + `validateTransition()` en código de aplicación | 3 valores sin estados anidados/paralelos no justifican la sobrecarga de una librería de máquina de estados. `xstate@5.32.5` sería el pin correcto si en el futuro hiciera falta, pero no se necesita aquí — no se instala nada |

---

## 12. Estrategia de despliegue

### Hosting
Sin cambios respecto a Fase 1/2 — mismo hosting, misma región, mismo plan. El comando de build y el
directorio de salida son los mismos ya configurados (`pnpm build`, salida estándar de Next.js).

### Entornos
| Entorno | Rama | URL | Base de datos | Modo de terceros |
|---|---|---|---|---|
| Local | — | localhost | Postgres local vía docker-compose de desarrollo (heredado) | claves de test |
| Preview | cualquier PR | auto (heredado) | base de datos de rama (heredado) | claves de test |
| Producción | `main` | dominio de producción (heredado) | base de datos de producción (heredado) | claves reales |

### CI/CD
Sin cambios en la estructura del pipeline — los mismos stages de Fase 1/2 (`install` → `typecheck` →
`lint` → `test` → `test:e2e` → `build`) ahora también cubren `src/server/automations/**` y
`tests/automations/**` porque son parte del mismo árbol de fuentes, sin configuración adicional.

### Release y rollback
Mismo mecanismo heredado. El worker de automatizaciones se despliega junto al proceso `worker`
existente (mismo release, mismo rollback) — no hay un componente desplegable nuevo que coordinar por
separado.

### Dominio, DNS, TLS
Sin cambios.

---

## 13. Estrategia de pruebas

| Capa | Framework | Qué cubre | Dónde | Corre |
|---|---|---|---|---|
| Unitaria | vitest (heredado) | evaluador de condiciones, catálogo de acciones, service.ts | `tests/automations/*.test.ts` | cada commit |
| Integración | vitest (heredado) contra Postgres/Redis reales de desarrollo | CRUD API, worker end-to-end, reintentos/dead-letter, flujo completo de fase | `tests/automations/{api-crud,worker-e2e,retries-dead-letter,full-phase-e2e}.test.ts` | cada commit |
| E2E | Playwright (heredado) | formulario de creación/edición, historial de runs | `tests/e2e/automations-*.spec.ts` | pre-deploy |

### Flujos críticos a cubrir E2E
1. Crear una automatización, agregar 2 acciones, activarla, y verla ejecutarse ante un evento real.
2. Ver el historial de runs de una automatización con acciones fallidas y confirmar que la traza es
   legible.

### Datos de prueba
Reutiliza la base de datos de test ya provisionada por Fase 1/2 (`docker-compose.yml` de desarrollo
existente, sin cambios). Cada archivo de test crea y limpia sus propias filas de `automation` dentro
de una transacción o con `DELETE` explícito al final — nunca comparte estado mutable entre tests, y
no depende del orden de ejecución.

### Qué deliberadamente no se prueba
La latencia del worker bajo carga real (miles de eventos/segundo) queda fuera de v1 — se prueba
funcionalmente, no de rendimiento. Decisión consciente: el volumen esperado en los primeros meses no
justifica una prueba de carga dedicada; se revisita si `automation_run` supera 10k filas/día.

---

## 14. Seguridad y secretos

| Concern | Control | Implementado en |
|---|---|---|
| Almacenamiento de secretos | sin secretos nuevos — reutiliza `ANTHROPIC_API_KEY` y `REDIS_URL` ya gestionados por la plataforma | heredado |
| Validación de entrada | zod en cada `configJson` de acción y en `conditionJson` | `src/server/automations/service.ts`, `actions/*.ts` |
| Inyección en condiciones | árbol json-logic evaluado por `LogicEngine` — nunca `eval()`, nunca código arbitrario del usuario | `condition-evaluator.ts` |
| AuthN/AuthZ | ver §8 — server-side en cada request y en cada ejecución de acción | `service.ts`, `action-runner.ts` |
| Rate limiting / abuso | 120 runs/min por organización (paso 15) | `worker.ts` |
| Auditoría de dependencias | comando heredado de Fase 1/2, sin cambios | CI |
| Higiene de logging | `automation_action_log.error` nunca incluye el contenido crudo de `ANTHROPIC_API_KEY` ni tokens de canal — solo el mensaje de error tipado | `action-runner.ts`, `actions/*.ts` |

**Reglas duras**
- Ningún secreto se commitea, se imprime en log, ni se envía a un tracker de errores.
- `send_message` y `ai_classify` nunca ejecutan sin la verificación server-side correspondiente
  (aprobación previa / presencia explícita en la lista de acciones).

Esta fase no maneja datos regulados adicionales a los ya cubiertos por Fase 1/2 (mensajes de
clientes). Sin obligaciones nuevas.

---

## 15. Accesibilidad

Objetivo: WCAG 2.2 AA, heredado del resto del producto. La UI nueva de esta fase (formulario de
automatización, historial de runs) sigue la línea base ya establecida:

| Requisito | Regla |
|---|---|
| HTML semántico | `ConditionBuilder` y `ActionListEditor` usan `<fieldset>`/`<legend>` por grupo de campos |
| Teclado | reordenar acciones en `ActionListEditor` tiene alternativa de teclado (botones subir/bajar), no solo drag — coherente con no-objetivo de "sin canvas" |
| Foco visible | heredado del sistema de diseño |
| Contraste | ver §7 |
| Formularios | cada campo del `ConditionBuilder` y de `ActionConfigForm` tiene `<label>` programático; errores de validación se anuncian como texto junto al campo |
| Zoom/reflow | la tabla de historial de runs es responsive con scroll horizontal contenido en su propio contenedor a 320px |
| Regiones vivas | el badge de estado `running` de un run se actualiza con `aria-live="polite"` |

### Verificación
```bash
pnpm test:e2e tests/e2e/automations-form.spec.ts --grep a11y   # expect: 0 violaciones (axe)
```

---

## 16. Observabilidad y costo

### Instrumentación
| Señal | Herramienta | Qué captura | Quién lo mira |
|---|---|---|---|
| Errores | herramienta de error tracking heredada de Fase 1 | excepciones no controladas en `action-runner.ts` y `worker.ts`, con `automation_run_id` como contexto | equipo de ingeniería |
| Logs | logger estructurado heredado | cada emisión de evento, cada intento de acción, con `org_id` en cada línea | equipo de ingeniería |
| Métricas | ver abajo | | equipo de producto |

### Métricas que importan para esta fase
| Métrica | Objetivo | Alerta en |
|---|---|---|
| Tasa de `automation_run.status = 'failed'` sobre el total | < 5% | > 15% sostenido 1 hora |
| Profundidad de la cola `automation-events` | < 100 jobs pendientes | > 1000 jobs pendientes por > 5 min |
| Acciones en `job_dead_letters` con `job_type LIKE 'automation:%'` | < 2% de acciones ejecutadas | > 5% en una ventana de 1 hora |

### Health check
Reutiliza el endpoint de health check heredado — este verifica ya la conectividad a Redis y Postgres,
que es la única dependencia nueva de infraestructura que esta fase introduce (ninguna, en realidad:
ambas ya eran monitoreadas desde Fase 1/2).

### Modelo de costo
| Servicio | Free tier | Costo a escala v1 esperada | Costo a 10× | Riesgo a vigilar |
|---|---|---|---|---|
| Redis (cola `automation-events` adicional) | heredado, sin costo incremental esperado a este volumen | $0 adicional | posible upgrade de plan de Redis si la profundidad de cola crece | número de automatizaciones activas × eventos/día |
| Anthropic API (`ai_classify`) | ninguno — pago por uso, ya presupuestado en Fase 1 | marginal, solo si `ai_classify` se usa | proporcional al uso — ver §17 | uso descontrolado si muchas automatizaciones agregan `ai_classify` sin necesidad real |

**Costo mensual estimado adicional de esta fase: marginal (< $10/mes) a la escala v1 esperada.** El
mayor riesgo de costo es `ai_classify`, controlado porque es opt-in explícito por automatización, no
un costo ambiental.

---

## 17. Enrutamiento de modelos

Este proyecto invoca un LLM en tiempo de ejecución únicamente a través de la acción opcional
`ai_classify`, reutilizando el gateway de IA ya configurado en Fase 1 con `@anthropic-ai/sdk`. Esta
fase no cambia el modelo, el enrutamiento ni los controles de costo ya establecidos por Fase 1 — solo
agrega un nuevo punto de invocación opt-in.

### Tabla de enrutamiento
| Tarea en este producto | Nivel de modelo | Por qué este nivel | Fallback |
|---|---|---|---|
| `ai_classify` (clasificación/etiquetado de texto corto) | el mismo nivel económico ya usado por el copiloto de Fase 1 para clasificación — heredado, no se re-decide aquí | tarea de clasificación de bajo riesgo, alto volumen potencial; el nivel más económico capaz ya fue la decisión de Fase 1 | el mismo fallback ya configurado en el gateway de Fase 1 |

### Estrategia de prompt y contexto
El prompt de `ai_classify` se arma desde `configJson.prompt` (definido por el usuario al configurar
la acción) + el payload del evento — vive como parte de `automation_action.config_json`, versionado
implícitamente junto con la automatización misma (cada edición de la acción es una nueva fila lógica
de configuración).

### Controles de costo
Reutiliza los límites de gasto por organización ya establecidos en el gateway de Fase 1 — `ai_classify`
consume del mismo presupuesto, sin un límite adicional específico de automatizaciones en v1.

### Manejo de fallas
Timeout y reintentos heredados del gateway de Fase 1. Si la clasificación falla o se trunca, la acción
se registra como `automation_action_log.status = "failed"` con el error del gateway — el mismo
tratamiento que cualquier otra acción fallida del catálogo (§9 paso 12).

### Evaluación
No se define un set de evaluación nuevo en v1 — `ai_classify` es una capa delgada sobre el gateway ya
evaluado en Fase 1. Se revisita si `ai_classify` empieza a tener prompts específicos de dominio que
ameriten su propio conjunto de casos.

---

## 18. Skills a usar durante la construcción

| Skill | Pasos del build | Por qué | Instalación |
|---|---|---|---|
| `add-migration` | Paso 1 | genera y aplica la migración de Drizzle de forma segura, patrón ya usado en Fase 1/2 | ya presente en el repo (`.claude/skills/add-migration/SKILL.md`), sin instalación adicional |
| `add-copilot-tool` | Referencia de patrón en paso 5 (no se invoca directamente — el catálogo de automatizaciones es separado del catálogo del copiloto, per instrucción explícita del usuario) | documenta el patrón de registro tipado con permiso que el catálogo de acciones de esta fase replica en su propio archivo | ya presente en el repo, sin instalación adicional |
| `add-channel-webhook` | No aplica en esta fase — no se agrega ningún canal nuevo | — | — |

Esta fase no requiere ningún skill de diseño visual (`ui-ux-pro-max`, `emil-design-eng`) porque
hereda el sistema de diseño ya establecido (§7) sin introducir componentes visuales nuevos fuera de
los patrones ya usados por el resto del producto (tabla, formulario, badge).

---

## 19. Workspace del agente

`workspace/` contiene la configuración de agente y todo archivo de configuración crítico para los
`Verify` de esta fase, para ser copiado — con rutas completas explícitas, no abreviadas — al root del
proyecto antes del paso 1, según §10 Bootstrap.

### 19.1 `CLAUDE.md`

Ver `workspace/CLAUDE.md` — contenido completo abajo, bajo 200 líneas.

```markdown
{ver el archivo real workspace/CLAUDE.md — idéntico byte a byte, emitido como archivo real per §19.6 y esta subsección}
```

*(El contenido completo y autoritativo vive en `workspace/CLAUDE.md`; esta subsección y ese archivo
son la misma fuente — ver Sección "Emitir el mismo contenido en workspace/" más abajo en 19.6.)*

### 19.2 `AGENTS.md`

Ver `workspace/AGENTS.md` — stub tool-neutral de ~20 líneas, contenido idéntico al archivo real.

### 19.3 `.claude/settings.json`

Ver `workspace/.claude/settings.json` — permission allowlist completo cubriendo todos los comandos de
§9 y §20.1 de esta fase. Se fusiona (nunca reemplaza) dentro del acumulado de Fases 1+2 vía
`scripts/merge-claude-settings.mjs` ya existente (§10 Bootstrap paso 3).

### 19.4 Skills del proyecto — `.claude/skills/<nombre>/SKILL.md`

Esta fase no agrega ningún skill de proyecto nuevo — reutiliza `add-migration` y el patrón de
`add-copilot-tool` ya presentes en el repo desde Fases 1-2. `NOT APPLICABLE — no se emite ningún
SKILL.md nuevo en esta fase.`

### 19.5 `.claude/rules/*.md`

| Archivo | `paths` globs | Cubre |
|---|---|---|
| `.claude/rules/automations.md` | `src/server/automations/**`, `tests/automations/**` | convenciones del dominio: catálogo de acciones, aislamiento de fallos del emisor, ciclo de vida draft/active/paused |

Ver contenido completo en `workspace/.claude/rules/automations.md`.

### 19.6 Configuración verify-crítica e infraestructura local

| Archivo | Ruta en el proyecto | `Verify` que lo necesitan | Resolución/env que lleva | Exclusión de ruta del bundle |
|---|---|---|---|---|
| `tests/automations/fixtures/sample-condition.json` | `tests/automations/fixtures/sample-condition.json` | paso 8 (`condition-evaluator.test.ts`) | ninguna — JSON estático, ninguna variable de entorno | n/a — no es un archivo de configuración que camine el árbol |
| `.claude/settings.json` (fragmento de esta fase) | fusionado en `.claude/settings.json` del root vía `merge-claude-settings.mjs` | todos los pasos 1-16 y §20.1 | ninguna | n/a — no camina el árbol de fuentes |
| `.claude/rules/automations.md` | `.claude/rules/automations.md` | ninguno directamente (carga por intención al editar `src/server/automations/**`) | ninguna | n/a |

**No se emite ningún runner de tests ni de e2e nuevo.** Esta fase reutiliza el `vitest.config.ts` y la
configuración de Playwright ya presentes en el repo desde Fase 1/2 — los nuevos archivos de test bajo
`tests/automations/**` y `tests/e2e/automations-*.spec.ts` caen dentro de los patrones `include` ya
configurados por esos runners (mismo directorio `tests/`, misma extensión `.test.ts`/`.spec.ts` que
Fase 1/2 ya usan). No se emite `docker-compose.yml` de desarrollo nuevo — Postgres y Redis ya están
provisionados localmente desde Fase 1.

**Confirmación de exclusión del bundle:** `biome.json` ya excluye `blueprints/` con el patrón plano
`"!blueprints"` (formato Biome 2.5.8, sin la clave `"ignore"` que fue removida en esa versión). Como
`"!blueprints"` es un prefijo de directorio, cubre `blueprints/nucleo-fase-3/**` sin necesidad de una
entrada adicional — **verificado explícitamente en esta subsección, no asumido**: el patrón plano de
Biome hace match por segmento de ruta desde la raíz, y `blueprints` es el primer segmento tanto de
`blueprints/nucleo-fase-1/` como de `blueprints/nucleo-fase-3/`, así que la exclusión ya existente
cubre este bundle sin modificación. Ningún otro emisor de esta fase (no hay `vitest.config.ts` ni
`tsconfig.json` nuevos) necesita una exclusión propia.

#### Matriz de convención de resolución

**La convención, una sola vez:** alias `@/` → `src/` (heredado, ya establecido por Fase 1/2, sin
cambios). Ningún archivo de esta fase introduce un especificador, extensión, condición de export o
regla de barrel-file nueva — todos los archivos nuevos usan el mismo alias `@/` que el resto del
repo.

| Contexto | Comando que lo ejercita | Convención tal como aparece ahí | Config + ajuste literal que lo hace funcionar |
|---|---|---|---|
| Código de aplicación (`src/server/automations/**`, `src/app/**`) | `pnpm build` | `@/server/automations/...` | `tsconfig.json` (heredado) — `paths: { "@/*": ["./src/*"] }`, sin cambios |
| Archivos de test (`tests/automations/**`) | `pnpm test tests/automations/<archivo>.test.ts` | `@/server/automations/...` | `vitest.config.ts` (heredado) — hereda el mismo `resolve.alias` de `tsconfig.json` vía el plugin ya configurado en Fase 1, sin cambios |
| Scripts independientes | esta fase no agrega ningún script standalone nuevo fuera del ciclo de vida de Next.js/vitest — el worker (`scripts/worker.ts`) ya corre bajo el mismo `tsx`/build pipeline que Fase 1/2 establecieron | `@/server/automations/...` | mismo mecanismo que ya resuelve `scripts/worker.ts` en Fase 1/2, sin cambios |
| Build / bundle | `pnpm build` | `@/...` se resuelve a rutas relativas en el bundle de Next.js | configuración de Next.js heredada, sin cambios |

**Autochequeo:** ninguna fila requiere un ajuste nuevo — los cuatro contextos ya resuelven `@/` de
forma idéntica desde Fase 1/2, y esta fase no introduce ningún archivo fuera de ese árbol de alias.

#### Reconciliación de valores entre artefactos

| Valor compartido | Fuente única — el archivo que lo decide | Valor literal | Cada otro lugar donde aparece | Comparado |
|---|---|---|---|---|
| Nombre de la cola de eventos | `src/server/automations/events.ts` (creación de la `Queue`) | `automation-events` | `src/server/automations/worker.ts` (consumidor), `scripts/worker.ts` (registro del Worker), §9 pasos 2 y 11, §16 (métrica de profundidad de cola) | yes |
| Tipo de job de ejecución de acción | `src/server/automations/worker.ts` (al encolar) | `automation:execute-action` | `src/server/automations/action-runner.ts` (processor que lo consume), §9 pasos 11 y 12 | yes |
| Clave de catálogo/aprobación de `send_message` | `src/server/automations/actions/catalog.ts` (registro del `actionType`) | `send_message` | `automation_action.action_type`, `automation_action_approval.action_type` (§4), §9 pasos 5 y 6, `tests/automations/action-send-message.test.ts` | yes |
| Nombre del error tipado no-reintentable de aprobación faltante | `src/server/automations/actions/errors.ts` (definición de la clase) | `ApprovalRequiredError` | `send-message.ts` (lo lanza, nunca escribe `automation_action_log`), `action-runner.ts` (lo detecta por `instanceof` y es quien escribe el log, sin reintento), §9 pasos 6 y 12, `tests/automations/action-send-message.test.ts`, `tests/automations/retries-dead-letter.test.ts` | yes |
| Tokens de badge de esta fase | `src/app/globals.css` (definición bajo `@theme`, paso 13) | `--warning` / `--warning-fg` | §7 (Sistema de diseño), `workspace/CLAUDE.md` acumulado del repo (registro del hex elegido), §9 paso 13, script de contraste del `Verify` del paso 13 | yes |
| Base path de la API | `src/app/api/automations/route.ts` (ruta física de Next.js) | `/api/automations` | §5 (Convenciones y tabla de rutas), `tests/automations/api-crud.test.ts` | yes |
| Nombres de tags de checkpoint de esta fase | §9, cada bloque `Checkpoint` | `step-{NN}-{slug}`, NN continuando la secuencia GLOBAL sin prefijo de fase ya establecida por Fase 1 (`step-01`..`step-18`) y Fase 2 (`step-19`..`step-32`) — esta fase usa `step-33`..`step-48` | `tasks.json` (`checkpoint` de cada tarea), cada `epics/*.md`, §10 Bootstrap (verificación de conteo), §20.1 | yes |

#### Reconciliación de artefactos byte-exactos

| Artefacto byte-exacto | Autor | Primer diff en | Reglas del blueprint que lo restringen | Llamada de runtime que lo produce, en el pin de §11 | Ambos confirmados |
|---|---|---|---|---|---|
| `tests/automations/fixtures/sample-condition.json` | paso 8, mismo paso que lo consume | paso 8 (`condition-evaluator.test.ts`) | §4 no restringe este archivo (es un fixture de entrada, no una salida derivada del modelo de datos); su única restricción es la sintaxis de árbol json-logic documentada por el paquete | semántica de evaluación de `LogicEngine` — operador `==` sobre `{"var": "tag"}` — documentada en el README de `json-logic-engine@5.0.7`, consistente entre versiones del operador `==` desde la v1 de la especificación JsonLogic que la librería implementa | yes — el árbol usa únicamente el operador `==` y `var`, ambos parte del núcleo estable de JsonLogic sin variación entre versiones de `json-logic-engine` |

No hay ningún otro golden file, snapshot o salida esperada byte-exacta en esta fase — el resto de las
aserciones son sobre estructura de datos (filas, columnas, códigos HTTP), no sobre bytes literales de
salida generada.

---

## 20. Puerta de aceptación, riesgos y bitácora de decisiones

### 20.1 Puerta de aceptación global

El proyecto está **terminado** cuando cada comando de abajo sale con código 0 en un checkout limpio
con el `workspace/` de esta fase ya copiado, y no antes.

```bash
pnpm install --frozen-lockfile
pnpm typecheck        # expect: exit 0, cero errores
pnpm lint             # expect: exit 0, cero errores y cero warnings
pnpm test             # expect: exit 0, 0 failed, 0 skipped — incluye tests/automations/**
pnpm test:e2e         # expect: exit 0, 0 failed — incluye tests/e2e/automations-*.spec.ts
pnpm build            # expect: exit 0
docker compose -f docker-compose.prod.yml config > /dev/null   # expect: exit 0
pnpm test:e2e tests/e2e/automations-form.spec.ts --grep a11y   # expect: 0 violaciones
```

Gates manuales adicionales:

- [ ] Cada paso del §9 tiene su tag de checkpoint en git: `git tag -l 'step-3[3-9]-*' 'step-4[0-8]-*' | wc -l` → 16.
- [ ] `git tag -l 'step-*' | wc -l` → 48 (18 de Fase 1 + 14 de Fase 2 + 16 de esta fase, todos intactos, sin prefijo de fase).
- [ ] Cada archivo de §10 *Archivos que deben estar commiteados* está presente en un checkout limpio:
      `git ls-files --error-unmatch tests/automations/fixtures/sample-condition.json` → exit 0;
      `git ls-files --error-unmatch .claude/rules/automations.md` → exit 0 (un path por invocación).
- [ ] `git check-ignore -q tests/automations/fixtures/sample-condition.json; test $? -eq 1` → exit 0
      (confirma que el archivo no está ignorado — `1` significa "no matcheado por ningún patrón").
- [ ] Cada fila de la tabla *Reconciliación de artefactos byte-exactos* (§19.6) dice `yes` en "Ambos
      confirmados".
- [ ] El `workspace/` de esta fase fue re-copiado una vez sobre un árbol ya bootstrapeado, salió con
      código 0, y `package.json`/`pnpm-lock.yaml` conservan todas las dependencias instaladas —
      confirma que el guard `rsync --ignore-existing` sostiene la propiedad de re-ejecución segura.
- [ ] Cada fila de *Reconciliación de valores entre artefactos* (§19.6) dice `yes` en "Comparado", y
      los gates de lint/typecheck/test de arriba corrieron con el bundle `blueprints/nucleo-fase-3/`
      presente en el árbol — confirma que la exclusión de `biome.json` sostiene.
- [ ] Ninguno de los no-objetivos del §1 fue construido (sin canvas de flujos, sin triggers cron, sin
      motor de colas nuevo, sin librería de máquina de estados instalada).
- [ ] La prueba de caos de aislamiento de fallos (Redis caído durante un webhook real) se ejecutó una
      vez manualmente antes de producción.

**Ningún warning se ignora.**

### 20.2 Registro de riesgos

| Riesgo | Probabilidad | Impacto | Señal temprana | Mitigación |
|---|---|---|---|---|
| El emisor de eventos bloquea o ralentiza el webhook de Fase 1 bajo carga | M | H | latencia p95 del webhook sube tras el deploy de esta fase | el emisor es fire-and-forget sin `await` bloqueante (paso 3); alertar sobre p95 del endpoint de webhook en el mismo dashboard heredado |
| Una automatización mal configurada crea un bucle (acción A dispara un evento que reactiva la misma automatización) | M | M | crecimiento anómalo de `automation_run` para un `automation_id` en minutos | el rate limit de 120 runs/min por organización (paso 15) actúa como contención; documentar en la UI que las acciones no re-disparan eventos de la misma automatización en v1 (los triggers son solo de Fase 1/2, nunca de Fase 3 sobre sí misma) |
| Cambio de versión de `json-logic-engine` en el futuro altera la semántica de un operador ya usado en producción | B | M | tests de `condition-evaluator.test.ts` fallan tras un `pnpm update` | pin exacto (no rango) en `package.json`; cualquier upgrade pasa por el mismo test suite antes de mergear |
| `ai_classify` se usa sin control de costo suficiente si muchas automatizaciones lo agregan | B | M | gasto de Anthropic API sube desproporcionado al volumen de eventos | reutiliza el límite de gasto por organización ya existente (§17); revisar mensualmente el desglose de costo por `action_type` |
| El worker de automatizaciones compite por recursos con el publish-worker de Fase 2 en el mismo proceso | B | M | latencia de publicación de contenido sube tras el deploy | ambos workers ya comparten proceso desde el diseño (§12); si la contención aparece, separar en procesos es un cambio de despliegue, no de código, y no requiere reabrir esta fase |

### 20.3 Bitácora de decisiones

| # | Decisión | Alternativa rechazada | Por qué | Se revertiría si |
|---|---|---|---|---|
| 1 | `json-logic-engine@5.0.7` para evaluación de condiciones | `json-logic-js@2.0.5` | árbol declarativo seguro sin `eval()`; la alternativa está estancada desde 2024-07 | apareciera un CVE sin parche en `json-logic-engine` |
| 2 | Enum de Postgres + `validateTransition()` en código para el ciclo de vida | `xstate` | 3 estados sin transiciones anidadas/paralelas no justifican una librería de máquina de estados | el ciclo de vida creciera a >5 estados con transiciones condicionales complejas |
| 3 | Reutilizar BullMQ 6.1.1 y las tablas `jobs`/`job_dead_letters`/`idempotency_keys` existentes | un motor de colas dedicado para automatizaciones | evita duplicar infraestructura de reintentos/dead-letter ya probada en producción desde Fase 1/2 | el volumen de acciones de automatización superara ampliamente el de publicación de contenido y necesitara aislamiento de throughput dedicado |
| 4 | Cola dedicada `automation-events` en vez de encolar directo a la cola `jobs` genérica | reutilizar `jobs` directamente para eventos crudos | separa la responsabilidad de "ingesta de evento" de "ejecución de acción", cada una con su propia forma de fallo — un pico de eventos no compite por el mismo backoff que una acción lenta | la separación demostrara no aportar valor operativo tras varios meses en producción |
| 5 | `automation_run` se crea también cuando la condición no matchea | crear el run solo si matchea | trazabilidad completa — permite distinguir "el evento nunca llegó" de "el evento llegó pero la condición nunca fue verdadera", el bug de configuración más común en un motor de reglas | el volumen de runs sin match creciera al punto de dominar el almacenamiento sin aportar valor de auditoría proporcional |
| 6 | Formulario estructurado (trigger + condición simple + lista ordenada de acciones), sin canvas visual | builder visual tipo drag-and-drop de nodos | cubre el 100% del alcance v1 con una fracción del costo de UI; nadie lo pidió | un cliente reportara que condiciones AND/OR anidadas visuales son un bloqueador real |
| 7 | `send_message` usa `automation_action_approval`, tabla de aprobación propia de esta fase, en vez de reutilizar `runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1 | reutilizar las tablas del copiloto, consultando `tool_calls` unida a `approvals` con `tool_name = "automation:send_message"` | `runs.conversation_id` y `runs.initiated_by` son `not null` en el schema de Fase 1 y están pensados para el flujo conversacional del copiloto — un trigger `content.published` no tiene conversación, estructuralmente, nunca, y el llamador es el motor interno de automatizaciones, no un usuario. Insertar esas filas con valores mínimos inventados habría significado modelar una mentira en el schema del copiloto para resolver un problema ajeno a él. Una tabla propia con `(org_id, action_type)` como clave de existencia responde la única pregunta que esta fase necesita — "¿ya fue aprobada esta combinación?" — sin depender de ninguna fila de `runs`/`steps` del copiloto | el copiloto expusiera un mecanismo de aprobación desacoplado del contexto conversacional (p. ej. un `requireApproval(orgId, toolName)` que no dependiera de `runs`/`steps`) |
| 8 | Catálogo de triggers v1 limitado a `message.received` y `content.published` — se descarta `conversation.tagged` | incluir `conversation.tagged` como tercer trigger, editando `src/server/conversations/tags.ts` | Fase 1 no tiene ese archivo ni una función `tagConversation()` de una sola línea que editar — el único camino de escritura de un tag es el tool `tag_conversation` del copiloto, embebido en la orquestación de `src/server/copilot/runs.ts` (crear/steps/tool_calls/approvals). Forzar el trigger ahí exigiría editar el core del copiloto de Fase 1, rompiendo el patrón de "edición mínima de 1 línea" que sostiene los otros dos triggers y el aislamiento de fallos que los acompaña | Fase 1/2 expusieran un servicio de etiquetado de contacto/conversación fuera del copiloto (p. ej. `src/server/conversations/tags.ts` con `tagConversation()`, o el tagging manual de contacto vía `contact_tag` que hoy no tiene UI) |

### 20.4 Qué construir a continuación

1. Triggers basados en cron/tiempo — cuando un caso de uso real necesite "todos los lunes a las 9am".
2. Trigger `contact.tagged` (o `conversation.tagged`) — cuando Fase 1/2 expongan un servicio de
   etiquetado fuera del tool `tag_conversation` del copiloto (ver Decisión #8 en §20.3), permitiendo
   una edición mínima de 1 línea equivalente a la de los pasos 3/4 de esta fase.
3. Condiciones AND/OR anidadas visuales — cuando un cliente reporte que la lista simple de
   condiciones no expresa su caso de uso.
4. Separar el worker de automatizaciones en su propio proceso desplegable — cuando la contención con
   el publish-worker de Fase 2 se vuelva medible.
5. Agentes IA autónomos multi-paso (Fase 4) — sobre la base del motor determinístico de esta fase.
6. CRM con pipeline de oportunidades (Fase 4+).

---

*Fin del blueprint. El orden de construcción es §9. Se detiene cuando §20.1 está en verde.*
