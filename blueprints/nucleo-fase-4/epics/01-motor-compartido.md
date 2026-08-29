# Epic 01: Motor compartido de agentes

> Al terminar este epic, el patrón runs/steps/tool_calls/approvals del copiloto de Fase 1 sirve a
> cualquier `agentKey`, y los backends de onboarding y soporte ya responden a través de él.

| | |
|---|---|
| **Epic id** | `01-motor-compartido` |
| **Tasks** | `E1-T1` … `E1-T6` |
| **Depends on** | nothing — start here |
| **Unlocks** | `02-interfaces-y-contenido`, `03-ventas-y-cierre` |
| **Parallel with** | nada — cada tarea de este epic depende de la anterior en el motor compartido |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16.3.1 (App Router) · TypeScript ~6.0.3 · Postgres 17 + drizzle-orm 0.45.2 exacto ·
better-auth 1.6.28 · `@anthropic-ai/sdk` vía `src/lib/ai/gateway.ts` (único importador). Hosting: VPS
propio + Docker Compose + Caddy. Package manager: `pnpm`. Runtime pinned en `.nvmrc`. Ningún paquete
nuevo en esta fase — ver `blueprint.md` §11.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {path}` |
| Migrar DB | `pnpm db:migrate` |
| Servicios locales | `docker compose up -d postgres redis` / `docker compose down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

Si alguna tarea de abajo verifica contra un servicio real, arráncalo primero con el comando de arriba.
El archivo que lo define ya está en el root del proyecto — `docker-compose.yml`, heredado de Fase 1,
no lo escribes tú.

## Directory subtree

```
src/
  lib/
    db/
      schema.ts          # EDITAS — tabla runs generalizada
  server/
    agents/
      registry.ts         # NUEVO — AGENT_CATALOG, getAgentModelId
      context.ts           # NUEVO — getAgentContext, lector acotado por agente
      onboarding/
        progress.ts         # NUEVO — getOnboardingProgress, derivado en vivo
        tools.ts             # NUEVO — catálogo de tools de onboarding
      support/
        knowledge-base.ts    # NUEVO — loadKnowledgeBase, searchKnowledgeBase
        tools.ts              # NUEVO — catálogo de tools de soporte
    copilot/
      runs.ts             # EDITAS — se generaliza a multi-agente (existe, no lo recreas)
  app/
    api/v1/agents/
      onboarding/route.ts   # NUEVO
      onboarding/progress/route.ts  # NUEVO
      support/route.ts      # NUEVO
    (app)/page.tsx         # EDITAS — agrega checklist de onboarding
docs/
  help/
    conectar-canal.md         # NUEVO — contenido real, no placeholder
    invitar-equipo.md         # NUEVO
    crear-automatizacion.md   # NUEVO
tests/
  unit/
    schema.test.ts             # EDITAS
    agents-registry.test.ts    # NUEVO
    agents-context.test.ts     # NUEVO
    agents-engine.test.ts      # NUEVO
    onboarding-progress.test.ts # NUEVO
    support-knowledge-base.test.ts # NUEVO
  e2e/
    copilot.spec.ts            # NO editas — solo lo re-corres como regresión
    agents-onboarding.spec.ts  # NUEVO
```

Everything outside this subtree is out of scope. Si una tarea parece requerir editar un archivo no
listado aquí, detente y repórtalo — significa que el límite del epic está mal.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `runs` | agrega `agent_key` (text, not null); vuelve `conversation_id`/`initiated_by` nullable | ver `blueprint.md` §4 para el SQL exacto de la migración custom |
| `channel_connection`, `membership`, `automation` | solo lectura (existence/count) para derivar el progreso de onboarding | ninguna se edita — pertenecen a Fase 1/3 |

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| Fase 1 | `src/lib/ai/gateway.ts` — `streamCopilotTurn(...)` | streaming, manejo tipado de `refusal`, reintento único |
| Fase 1 | `src/server/tenancy.ts` — `requirePermission(session, orgId, permissionKey)` | lanza si la membresía/permiso no existe; el handler lo traduce a 404 |
| Fase 1 | `src/lib/audit.ts` — `recordAuditEvent(tx, {...})` | escribe `audit_event` en la misma transacción |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `src/server/agents/registry.ts` → `AGENT_CATALOG`, `getAgentModelId` | `Record<AgentKey, AgentDefinition>`, `(k: AgentKey) => string` | `02-interfaces-y-contenido`, `03-ventas-y-cierre` |
| `src/server/agents/context.ts` → `getAgentContext` | `(agentKey, orgId, params?) => Promise<AgentContext>` | todos los epics siguientes |
| `src/server/copilot/runs.ts` → función orquestadora generalizada (nombre confirmado por lectura en `E1-T3`) | acepta `agentKey`, `conversationId?`, `initiatedBy?` | `02-interfaces-y-contenido`, `03-ventas-y-cierre` |

## Conventions that bite in this area

- **Nunca asumas el nombre exportado de la función orquestadora en `runs.ts`.** `E1-T3` empieza
  leyendo el archivo real antes de tocar nada — Fase 1 lo describe en prosa, nunca publica la firma.
- La migración de `E1-T1` es `--custom` (contenido escrito a mano), no la variante automática de
  `drizzle-kit generate` — una columna `not null` sin default sobre una tabla con filas la necesita.
- `channel_connection` no tiene UI de conexión en Fase 1 — nunca intentes enganchar un hook de
  escritura ahí. El progreso de onboarding se **deriva**, nunca se persiste.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/agents.md`. Both sit in the project root —
the builder copied them there from the bundle's `workspace/` before task one.

---

## Tasks

### `E1-T1` — Migracion expand runs.agent_key + nullable columns

**Depends on:** nothing · **Priority:** p0

Edita `src/lib/db/schema.ts` agregando `agentKey: text("agent_key").notNull()` a `runs` y quitando
`.notNull()` de `conversationId`/`initiatedBy`. Genera la migración con
`pnpm exec drizzle-kit generate --custom` (nombre decidido por la herramienta) y escribe su contenido
a mano: add-nullable → backfill `'copilot'` → set-not-null → drop-not-null en las otras dos columnas →
índice `(org_id, agent_key, created_at desc)`. Edita `src/server/copilot/runs.ts` para pasar
`agentKey: "copilot"` explícito en el insert de `runs` — solo eso, sin generalizar la firma todavía
(eso es `E1-T3`).

**Files**
- `src/lib/db/schema.ts` — edit: columna `agentKey`, nullable en las otras dos
- `drizzle/*.sql` — new: migración custom (nombre decidido por la herramienta)
- `src/server/copilot/runs.ts` — edit: `agentKey: "copilot"` explícito
- `tests/unit/schema.test.ts` — edit: nuevas aserciones sobre `runs`

**Acceptance**

1. **WHEN** `pnpm db:migrate` corre sobre la base ya migrada de Fase 1-3+notificaciones **THE SYSTEM SHALL** agregar la columna `agent_key` a `runs` sin eliminar ni renombrar ninguna columna existente de ninguna tabla.
2. **WHEN** la migración termina **THE SYSTEM SHALL** dejar `conversation_id` e `initiated_by` de `runs` como nullable.
3. **WHEN** se intenta insertar una fila en `runs` sin `agent_key` **THE SYSTEM SHALL** rechazar el insert por violación de NOT NULL.
4. **WHEN** cualquier fila preexistente de `runs` (si la hay) se lee tras la migración **THE SYSTEM SHALL** mostrar `agent_key = 'copilot'`.
5. **WHEN** `tests/e2e/copilot.spec.ts` (heredado de Fase 1, sin ninguna modificación a sus aserciones) corre después de esta migración y de la edición de `runs.ts` **THE SYSTEM SHALL** seguir pasando.

**Verify**

```bash
pnpm db:migrate
test "$(psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='runs' and column_name='conversation_id'" | tr -d '[:space:]')" = "YES"
test "$(psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='runs' and column_name='initiated_by'" | tr -d '[:space:]')" = "YES"
test "$(psql "$DATABASE_URL" -tAc "select is_nullable from information_schema.columns where table_name='runs' and column_name='agent_key'" | tr -d '[:space:]')" = "NO"
pnpm test tests/unit/schema.test.ts
pnpm test:e2e tests/e2e/copilot.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: migracion expand runs.agent_key + nullable columns"
git tag step-64-agent-runs-migration
```

### `E1-T2` — Catalogo de agentes + memoria contextual controlada

**Depends on:** `E1-T1` · **Priority:** p0

Crea `src/server/agents/registry.ts` con `AGENT_CATALOG` (5 claves) y `getAgentModelId`, con fallback
de cada variable `*_MODEL_ID` opcional a `COPILOT_MODEL_ID`. Crea `src/server/agents/context.ts` con
`getAgentContext(agentKey, orgId, params?)`, un `switch` con una rama por agente — cada rama lee
**solo** lo que su fila en `blueprint.md` §8 autoriza.

**Files**
- `src/server/agents/registry.ts` — new
- `src/server/agents/context.ts` — new
- `src/lib/env.ts` — edit: 4 variables nuevas, todas opcionales
- `.env.example` — edit: 4 claves en blanco
- `tests/unit/agents-registry.test.ts` — new

**Acceptance**

1. **WHEN** se importa `AGENT_CATALOG` **THE SYSTEM SHALL** exponer exactamente las 5 claves `copilot`, `onboarding`, `support`, `content_marketing`, `sales`.
2. **WHEN** `getAgentModelId("onboarding")` se llama sin `ONBOARDING_MODEL_ID` definido **THE SYSTEM SHALL** devolver el valor de `env.COPILOT_MODEL_ID`.
3. **WHEN** `getAgentModelId("onboarding")` se llama con `ONBOARDING_MODEL_ID` definido **THE SYSTEM SHALL** devolver ese valor en vez del fallback.
4. **WHEN** `getAgentContext("support", orgId)` se llama **THE SYSTEM SHALL** devolver únicamente `{ organizationName }`, cero filas de `conversation`, `message`, `contact` o `content_item`.
5. **WHEN** `getAgentContext("content_marketing", orgId)` se llama **THE SYSTEM SHALL** devolver solo campos `title`/`status`/`scheduledAt` de `content_item` de esa organización, cero filas de `conversation` o `message`.
6. **WHEN** `getAgentContext("sales", orgId, { conversationId })` se llama con un `conversationId` que pertenece a otra organización **THE SYSTEM SHALL** devolver un resultado vacío en vez de datos de la conversación ajena.

**Verify**

```bash
pnpm test tests/unit/agents-registry.test.ts tests/unit/agents-context.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: catalogo de agentes + memoria contextual controlada"
git tag step-65-agent-registry-context
```

### `E1-T3` — Motor de runs generalizado (multi-agente)

**Depends on:** `E1-T1`, `E1-T2` · **Priority:** p0

**VERIFY primero:** lee `src/server/copilot/runs.ts` real para confirmar el nombre de su función
orquestadora exportada. Generalízala para aceptar `agentKey`, `conversationId?`, `initiatedBy?`, y
resolver tools/system prompt desde `AGENT_CATALOG[agentKey]`. `src/app/api/copilot/route.ts` no cambia
su forma de llamarla.

**Files**
- `src/server/copilot/runs.ts` — edit
- `tests/unit/agents-engine.test.ts` — new

**Acceptance**

1. **WHEN** el motor se invoca con `agentKey="copilot"`, `conversationId` e `initiatedBy` presentes **THE SYSTEM SHALL** crear una fila `runs` con la misma forma que producía el copiloto antes de esta fase.
2. **WHEN** el motor se invoca con un `agentKey` distinto de `copilot` y `conversationId` ausente **THE SYSTEM SHALL** crear la fila `runs` con `conversation_id = null` sin lanzar ni fallar por la ausencia.
3. **WHEN** el motor se invoca con `initiatedBy` ausente **THE SYSTEM SHALL** crear la fila `runs` con `initiated_by = null`.
4. **WHEN** el motor resuelve un `agentKey` no registrado en `AGENT_CATALOG` **THE SYSTEM SHALL** lanzar un error tipado antes de llamar al gateway de IA, sin crear ninguna fila.
5. **WHEN** `tests/e2e/copilot.spec.ts` corre tras esta generalización **THE SYSTEM SHALL** seguir pasando sin ninguna modificación a sus aserciones.

**Verify**

```bash
pnpm test tests/unit/agents-engine.test.ts
pnpm test:e2e tests/e2e/copilot.spec.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: motor de runs generalizado a multi-agente"
git tag step-66-agent-engine
```

### `E1-T4` — Backend del agente de onboarding

**Depends on:** `E1-T2`, `E1-T3` · **Priority:** p1

Crea `progress.ts` (derivación en vivo — nunca una tabla nueva) y `tools.ts` (2 tools, ambas
`requiresApprovalFirstUse: true`). Crea las 2 rutas (`route.ts` de turno + `progress/route.ts` de
lectura, que nunca crea un `run`).

**Files**
- `src/server/agents/onboarding/progress.ts` — new
- `src/server/agents/onboarding/tools.ts` — new
- `src/app/api/v1/agents/onboarding/route.ts` — new
- `tests/unit/onboarding-progress.test.ts` — new
- `tests/e2e/agents-onboarding.spec.ts` — new

**Acceptance**

1. **WHEN** `getOnboardingProgress` se llama para una organización sin canal conectado, con 1 solo miembro y sin automatizaciones **THE SYSTEM SHALL** devolver los 3 items con `completed: false`.
2. **WHEN** una organización tiene 2 filas en `membership` **THE SYSTEM SHALL** devolver `invite_member` con `completed: true`.
3. **WHEN** el agente de onboarding invoca `get_onboarding_progress` por primera vez en una organización **THE SYSTEM SHALL** detener el stream con `approval_required`.
4. **WHEN** se aprueba esa primera invocación **THE SYSTEM SHALL** ejecutar el handler y devolver el progreso real de la organización.
5. **WHEN** `GET /api/v1/agents/onboarding/progress` se llama **THE SYSTEM SHALL** responder sin crear ninguna fila en `runs`.

**Verify**

```bash
pnpm test tests/unit/onboarding-progress.test.ts
pnpm test:e2e tests/e2e/agents-onboarding.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: backend del agente de onboarding"
git tag step-67-onboarding-backend
```

### `E1-T5` — Base de conocimiento estatica + backend del agente de soporte

**Depends on:** `E1-T2`, `E1-T3` · **Priority:** p1

Escribe contenido real (no placeholder) en los 3 archivos markdown. `knowledge-base.ts` carga y
busca por keyword sin dependencia nueva.

**Files**
- `docs/help/conectar-canal.md` — new
- `docs/help/invitar-equipo.md` — new
- `docs/help/crear-automatizacion.md` — new
- `src/server/agents/support/knowledge-base.ts` — new
- `src/server/agents/support/tools.ts` — new

**Acceptance**

1. **WHEN** `loadKnowledgeBase()` se llama **THE SYSTEM SHALL** devolver exactamente 3 entradas, una por archivo de `docs/help/`.
2. **WHEN** `searchKnowledgeBase("conectar canal")` se llama **THE SYSTEM SHALL** devolver `conectar-canal.md` como el primer resultado.
3. **WHEN** `searchKnowledgeBase` se llama con un query que no coincide con ningún documento **THE SYSTEM SHALL** devolver un array vacío, nunca lanzar.
4. **WHEN** el agente de soporte invoca `search_knowledge_base` por primera vez en una organización **THE SYSTEM SHALL** detener el stream con `approval_required`.

**Verify**

```bash
pnpm test tests/unit/support-knowledge-base.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: base de conocimiento estatica + backend del agente de soporte"
git tag step-68-support-backend
```

### `E1-T6` — UI checklist de onboarding en /app

**Depends on:** `E1-T4` · **Priority:** p1

Inspecciona `src/app/(app)/page.tsx` real antes de editar. Monta `<OnboardingChecklist />` en paralelo
con `getAttentionSummary`.

**Files**
- `src/app/(app)/page.tsx` — edit
- `src/components/agents/onboarding-checklist.tsx` — new
- `src/server/dashboard/queries.ts` — edit, solo si la lectura lo requiere (confirmar por inspección)

**Acceptance**

1. **WHEN** un usuario de una organización con checklist incompleto visita `/app` **THE SYSTEM SHALL** renderizar `OnboardingChecklist` con los items pendientes marcados.
2. **WHEN** los 3 items del checklist están completos **THE SYSTEM SHALL** omitir la sección del checklist por completo del dashboard.
3. **WHEN** `pnpm typecheck` corre tras esta edición **THE SYSTEM SHALL** exit 0.

**Verify**

```bash
pnpm typecheck
pnpm test:e2e tests/e2e/agents-onboarding.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: ui de checklist de onboarding en /app"
git tag step-69-onboarding-ui
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** cualquiera de los pasos de este epic se aplica sobre el copiloto de Fase 1 **THE SYSTEM SHALL** dejarlo funcionando exactamente igual — `tests/e2e/copilot.spec.ts` pasa sin ninguna modificación en todo el epic.
2. **WHEN** una organización nueva visita `/app` **THE SYSTEM SHALL** ver el checklist de onboarding con su progreso real derivado de sus propios datos.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/copilot.spec.ts tests/e2e/agents-onboarding.spec.ts
```

## Pitfalls

- **Editar `runs.ts` sin leerlo primero** — el nombre de su función exportada no está publicado en
  ningún blueprint anterior. `E1-T3` empieza con esa lectura, siempre.
- **Inventar un hook de escritura para `channel_connection`** — no existe uno en Fase 1. El progreso se
  deriva, no se persiste.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control.**
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` updated — 4 variables opcionales nuevas de `E1-T2`.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
