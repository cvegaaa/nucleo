# Epic 03: Agente de ventas + cierre de Fase 4

> Al terminar este epic, el agente de ventas puede enviar una respuesta a un contacto (con aprobación
> en primer uso, la única acción de esta fase que sale a un canal externo), su UI vive en la bandeja,
> las 4 agentes quedan auditados de forma consolidada, el aislamiento de tenant se extiende a los
> nuevos endpoints, y la fase cierra con la puerta de aceptación completa.

| | |
|---|---|
| **Epic id** | `03-ventas-y-cierre` |
| **Tasks** | `E3-T1` … `E3-T5` |
| **Depends on** | `01-motor-compartido`, `02-interfaces-y-contenido` |
| **Unlocks** | nothing — último epic de la fase |
| **Parallel with** | nada — cada tarea depende de la anterior o de un cierre transversal |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16.3.1 · TypeScript ~6.0.3 · Postgres 17 · Playwright (E2E) · Vitest (unit/integration).
Package manager: `pnpm`.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test | `pnpm test {path}` |
| E2E | `pnpm test:e2e {path}` |
| Build | `pnpm build` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

## Directory subtree

```
src/
  server/
    agents/
      sales/
        tools.ts                    # EDITAS — agrega send_conversation_reply
      onboarding/tools.ts           # solo auditas, no reescribes lógica
      support/tools.ts              # ídem
      content/tools.ts              # ídem
  components/
    inbox/
      conversation-view.tsx         # EDITAS — pestaña "Ventas"
tests/
  integration/
    sales-agent-send.test.ts        # NUEVO
  e2e/
    agents-sales.spec.ts            # NUEVO
    tenant-isolation.spec.ts        # EDITAS (heredado de Fase 1 — confirmar nombre real por lectura)
    a11y.spec.ts                    # EDITAS
  unit/
    agents-audit-coverage.test.ts   # NUEVO
```

Everything outside this subtree is out of scope.

## Data model touched here

Ninguna tabla ni columna nueva. `send_conversation_reply` escribe en `message` y `audit_event`, ambas
ya existentes desde Fase 1 — a través del camino de escritura ya existente en
`src/server/conversations.ts` (confirmado por lectura antes de editar, no asumido).

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `01-motor-compartido` | motor generalizado, `getAgentContext` | ver ese epic |
| `02-interfaces-y-contenido` | `AgentPanel` | `{ agentKey, conversationId? }` |
| Fase 1 | camino de escritura de mensaje saliente en `src/server/conversations.ts` (nombre exacto confirmado por lectura en `E3-T1`) | escribe `message`, emite evento realtime |

**Produced**

Ninguno — este epic es el último de la fase, no hay consumidores posteriores dentro de Fase 4.

## Conventions that bite in this area

- `send_conversation_reply` es la **única** tool de todo el catálogo de esta fase que sale a un canal
  externo. Cualquier tool futura que también lo haga sigue exactamente el mismo patrón de aprobación —
  sin excepción, sin importar cuán "de bajo riesgo" parezca.
- El test de aislamiento de tenant que se edita en `E3-T4` es el heredado de Fase 1 step 5 — no crees
  uno nuevo desde cero; confirma su nombre real por lectura antes de editarlo.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/agents.md`.

---

## Tasks

### `E3-T1` — Tool de envio con aprobacion (send_conversation_reply)

**Depends on:** `E2-T5` (de `02-interfaces-y-contenido`) · **Priority:** p0

**VERIFY primero:** lee `src/server/conversations.ts` real para confirmar el nombre exacto de la
función que escribe un mensaje saliente. Reutilízala — nunca dupliques su lógica.

**Files**
- `src/server/agents/sales/tools.ts` — edit
- `tests/integration/sales-agent-send.test.ts` — new

**Acceptance**

1. **WHEN** el agente de ventas invoca `send_conversation_reply` por primera vez en una organización **THE SYSTEM SHALL** detener el stream con `approval_required` y no escribir ningún `message`.
2. **WHEN** se aprueba esa primera invocación **THE SYSTEM SHALL** escribir un `message` con `direction='outbound'`, `sender_type='copilot'` en la conversación indicada, y registrar `audit_event`.
3. **WHEN** la misma organización invoca `send_conversation_reply` una segunda vez tras la primera aprobación **THE SYSTEM SHALL** ejecutarla directamente sin volver a pedir aprobación.
4. **WHEN** se invoca sin el permiso `conversation.reply` **THE SYSTEM SHALL** responder con el mismo 403 tipado que cualquier otra mutación.

**Verify**

```bash
pnpm test tests/integration/sales-agent-send.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: tool de envio con aprobacion (send_conversation_reply)"
git tag step-75-sales-agent-send
```

### `E3-T2` — UI del agente de ventas en la bandeja

**Depends on:** `E2-T1` (de `02-interfaces-y-contenido`), `E3-T1` · **Priority:** p1

Pestaña "Ventas" separada de "Copiloto" dentro de la misma conversación — nunca fusionadas.

**Files**
- `src/components/inbox/conversation-view.tsx` — edit
- `tests/e2e/agents-sales.spec.ts` — new

**Acceptance**

1. **WHEN** un usuario abre una conversación en la bandeja **THE SYSTEM SHALL** mostrar dos pestañas distintas: "Copiloto" y "Ventas".
2. **WHEN** se cambia a la pestaña "Ventas" **THE SYSTEM SHALL** mostrar el panel del agente de ventas con el `conversationId` de la conversación abierta.
3. **WHEN** se usa `send_conversation_reply` desde el panel de ventas **THE SYSTEM SHALL** reflejar el mensaje saliente en la lista de mensajes de la conversación en vivo.

**Verify**

```bash
pnpm test:e2e tests/e2e/agents-sales.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: ui del agente de ventas en la bandeja"
git tag step-76-sales-agent-ui
```

### `E3-T3` — Auditoria consolidada de los 4 agentes

**Depends on:** `E1-T4`, `E1-T5` (de `01-motor-compartido`), `E2-T3` (de `02-interfaces-y-contenido`), `E3-T1` · **Priority:** p1

Confirma que `send_conversation_reply` audita dentro de transacción y que las 7 tools de solo lectura
del catálogo de esta fase no auditan nada.

**Files**
- `src/server/agents/onboarding/tools.ts` — edit si falta algo
- `src/server/agents/support/tools.ts` — edit si falta algo
- `src/server/agents/content/tools.ts` — edit si falta algo
- `src/server/agents/sales/tools.ts` — edit si falta algo
- `tests/unit/agents-audit-coverage.test.ts` — new

**Acceptance**

1. **WHEN** `send_conversation_reply` se ejecuta con éxito **THE SYSTEM SHALL** registrar exactamente una fila en `audit_event` dentro de la misma transacción que el `message` insertado.
2. **WHEN** la transacción de `send_conversation_reply` hace rollback **THE SYSTEM SHALL** dejar `audit_event` sin la fila.
3. **WHEN** se audita estáticamente el código de las 7 tools de solo lectura del catálogo de esta fase **THE SYSTEM SHALL** confirmar que ninguna llama `recordAuditEvent`.

**Verify**

```bash
pnpm test tests/unit/agents-audit-coverage.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: auditoria consolidada de los 4 agentes"
git tag step-77-agents-audit
```

### `E3-T4` — E2E completo de aislamiento de tenant + a11y

**Depends on:** `E1-T6` (de `01-motor-compartido`), `E2-T2`, `E2-T4` (de `02-interfaces-y-contenido`), `E3-T2` · **Priority:** p0

**VERIFY primero:** confirma el nombre real del spec de aislamiento de tenant heredado de Fase 1 step 5
por lectura del repo antes de editarlo.

**Files**
- `tests/e2e/tenant-isolation.spec.ts` — edit
- `tests/e2e/a11y.spec.ts` — edit

**Acceptance**

1. **WHEN** un usuario de la organización A invoca cualquiera de los 4 endpoints de agentes nuevos con un `conversationId`/`orgId` de la organización B **THE SYSTEM SHALL** responder 404 sin filtrar datos, para los 3 casos aplicables.
2. **WHEN** axe corre sobre `/app`, `/app/inbox` con la pestaña de ventas abierta, y `/app/content/calendar` con el panel de calendario sugerido abierto **THE SYSTEM SHALL** reportar 0 violaciones.

**Verify**

```bash
pnpm test:e2e tests/e2e/tenant-isolation.spec.ts
pnpm test:e2e tests/e2e/a11y.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: e2e de aislamiento de tenant + a11y para los 4 agentes"
git tag step-78-agents-tenant-isolation-a11y
```

### `E3-T5` — Verificacion final de Fase 4

**Depends on:** `E3-T3`, `E3-T4` · **Priority:** p0

**Files**

Ninguno — commit vacío de cierre.

**Acceptance**

1. **WHEN** `git tag -l 'step-*' | wc -l` corre **THE SYSTEM SHALL** reportar exactamente `79`.
2. **WHEN** la puerta de aceptación completa corre sobre un checkout limpio **THE SYSTEM SHALL** exit 0 en cada línea.

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
git add -A && git commit -m "E3-T5: verificacion final fase 4 — agentes ia" --allow-empty
git tag step-79-verification
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** el agente de ventas envía un mensaje aprobado desde la bandeja **THE SYSTEM SHALL** hacerlo visible en tiempo real, exactamente como cualquier otro mensaje saliente de Fase 1.
2. **WHEN** la puerta de aceptación completa de `blueprint.md` §20.1 corre sobre un checkout limpio **THE SYSTEM SHALL** exit 0 en cada línea, con los 79 checkpoints acumulados presentes.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
```

Run from the project root.

## Pitfalls

- **Duplicar la lógica de escritura de mensaje saliente dentro del handler de la tool** — reutiliza
  siempre el camino existente de `src/server/conversations.ts`.
- **Auditar una tool de solo lectura** — solo `send_conversation_reply` llama `recordAuditEvent` en
  todo el catálogo de esta fase.
- **Cerrar la fase sin confirmar el conteo total de 79 tags** — `E3-T5` lo asegura explícitamente.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `git tag -l 'step-*'`
      reporta 79 en total tras `E3-T5`.
- [ ] Gate command passes clean, run from the project root.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` — sin cambios en este epic.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
