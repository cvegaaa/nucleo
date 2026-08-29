# Epic 02: Interfaces de onboarding/soporte + agente de contenido

> Al terminar este epic, el panel de chat genérico existe y sirve al copiloto, onboarding y soporte;
> el agente de contenido/marketing puede sugerir un calendario editorial o una serie de piezas; y el
> agente de ventas tiene su backend de solo lectura listo (su UI y su acción de envío son el epic 03).

| | |
|---|---|
| **Epic id** | `02-interfaces-y-contenido` |
| **Tasks** | `E2-T1` … `E2-T5` |
| **Depends on** | `01-motor-compartido` |
| **Unlocks** | `03-ventas-y-cierre` |
| **Parallel with** | `E2-T3`/`E2-T5` pueden correr en paralelo entre sí (no comparten archivos) una vez `E2-T1` termina |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16.3.1 (App Router) · TypeScript ~6.0.3 · TanStack Query (cliente) · Socket.IO (realtime,
heredado, sin cambios en este epic). Package manager: `pnpm`.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test E2E (un archivo) | `pnpm test:e2e {path}` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

## Directory subtree

```
src/
  components/
    agents/
      agent-panel.tsx           # NUEVO — panel genérico, parametrizado por agentKey
      support-widget.tsx         # NUEVO — botón flotante + panel de soporte
    copilot/
      copilot-panel.tsx         # EDITAS — se vuelve wrapper de agent-panel
    calendar/
      suggested-calendar-panel.tsx  # NUEVO
  server/
    agents/
      content/
        tools.ts                 # NUEVO — suggest_content_series
      sales/
        tools.ts                  # NUEVO en este epic — solo las 3 tools de lectura
  app/
    (app)/
      page.tsx                   # EDITAS — monta AgentPanel agentKey="onboarding"
      layout.tsx                 # EDITAS — monta SupportWidget
      content/calendar/page.tsx  # EDITAS — monta SuggestedCalendarPanel
    api/v1/agents/
      support/route.ts            # ya existe de 01-motor-compartido, no lo tocas
      content/route.ts             # NUEVO
      sales/route.ts                # NUEVO
tests/
  e2e/
    agents-support.spec.ts       # NUEVO
    agents-content.spec.ts       # NUEVO
  unit/
    content-agent-tools.test.ts  # NUEVO
    sales-agent-tools.test.ts    # NUEVO
```

Everything outside this subtree is out of scope.

## Data model touched here

Ninguna tabla nueva ni columna nueva. `E2-T3` y `E2-T4` leen/escriben `content_item` a través del
endpoint **ya existente** de Fase 2 (`POST /api/v1/content`), nunca directo a la tabla.

## Contracts

**Consumed** — already exists, do not rebuild:

| From | Interface | Guarantee |
|---|---|---|
| `01-motor-compartido` | `AGENT_CATALOG`, `getAgentContext`, motor generalizado de `runs.ts` | ver ese epic |
| Fase 2 | `POST /api/v1/content` | crea un `content_item` en `draft`, permiso `content.create` |

**Produced** — later epics depend on exactly these signatures. Changing one breaks them:

| Export | Signature | Used by |
|---|---|---|
| `src/components/agents/agent-panel.tsx` → `AgentPanel` | `{ agentKey: AgentKey, conversationId?: string }` | `03-ventas-y-cierre` (`E3-T2`) |
| `src/server/agents/sales/tools.ts` (parcial, solo lectura) | 3 tools sin mutación | `03-ventas-y-cierre` (`E3-T1` agrega la 4ª) |

## Conventions that bite in this area

- `agent-panel.tsx` mapea `agentKey==="copilot"` a `/api/v1/copilot` (ruta original de Fase 1) —
  **nunca** a `/api/v1/agents/copilot`, que no existe.
- `suggested-calendar-panel.tsx` **nunca** llama un endpoint nuevo para "aplicar" una sugerencia —
  reutiliza `POST /api/v1/content` de Fase 2 tal cual.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/agents.md`.

---

## Tasks

### `E2-T1` — Panel de chat generico + wrapper del copiloto

**Depends on:** `E1-T3` (de `01-motor-compartido`) · **Priority:** p0

Crea `agent-panel.tsx` como la generalización literal de la estructura ya usada por
`copilot-panel.tsx`. Convierte `copilot-panel.tsx` en wrapper delgado.

**Files**
- `src/components/agents/agent-panel.tsx` — new
- `src/components/copilot/copilot-panel.tsx` — edit
- `src/app/(app)/page.tsx` — edit

**Acceptance**

1. **WHEN** `agent-panel.tsx` se monta con `agentKey="copilot"` **THE SYSTEM SHALL** consumir `/api/v1/copilot`, nunca `/api/v1/agents/copilot`.
2. **WHEN** `agent-panel.tsx` se monta con `agentKey="onboarding"` **THE SYSTEM SHALL** consumir `/api/v1/agents/onboarding`.
3. **WHEN** `tests/e2e/copilot.spec.ts` corre tras convertir `copilot-panel.tsx` en wrapper **THE SYSTEM SHALL** seguir pasando sin ninguna modificación a sus aserciones.

**Verify**

```bash
pnpm test:e2e tests/e2e/agents-onboarding.spec.ts tests/e2e/copilot.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: panel de chat generico + wrapper del copiloto"
git tag step-70-agent-panel
```

### `E2-T2` — Widget del agente de soporte

**Depends on:** `E1-T5` (de `01-motor-compartido`), `E2-T1` · **Priority:** p1

**Files**
- `src/components/agents/support-widget.tsx` — new
- `src/app/(app)/layout.tsx` — edit
- `tests/e2e/agents-support.spec.ts` — new

**Acceptance**

1. **WHEN** un usuario navega a cualquier ruta bajo `(app)` **THE SYSTEM SHALL** mostrar el botón flotante del widget de soporte.
2. **WHEN** se hace clic en el botón **THE SYSTEM SHALL** expandir el panel del agente de soporte sin recargar la página.
3. **WHEN** el foco está en el panel abierto y se presiona `Escape` **THE SYSTEM SHALL** cerrar el panel y devolver el foco al botón flotante.

**Verify**

```bash
pnpm test:e2e tests/e2e/agents-support.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: widget del agente de soporte"
git tag step-71-support-widget
```

### `E2-T3` — Backend del agente de contenido/marketing

**Depends on:** `E1-T2`, `E1-T3` (de `01-motor-compartido`) · **Priority:** p1

`suggest_content_series` — con `startDate` es un calendario, sin él es una serie ordenada.
**No crea ningún `content_item`.**

**Files**
- `src/server/agents/content/tools.ts` — new
- `src/app/api/v1/agents/content/route.ts` — new
- `tests/unit/content-agent-tools.test.ts` — new

**Acceptance**

1. **WHEN** `suggest_content_series` se invoca con `startDate` presente **THE SYSTEM SHALL** devolver `pieceCount` piezas, cada una con una fecha sugerida distinta y creciente.
2. **WHEN** `suggest_content_series` se invoca sin `startDate` **THE SYSTEM SHALL** devolver `pieceCount` piezas sin campo de fecha.
3. **WHEN** el agente de contenido invoca `suggest_content_series` por primera vez en una organización **THE SYSTEM SHALL** detener el stream con `approval_required`.
4. **WHEN** se invoca sin el permiso `content.create` **THE SYSTEM SHALL** responder con el mismo 403 tipado que cualquier otra mutación de Fase 1.

**Verify**

```bash
pnpm test tests/unit/content-agent-tools.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: backend del agente de contenido/marketing"
git tag step-72-content-agent-backend
```

### `E2-T4` — UI del calendario editorial sugerido

**Depends on:** `E2-T1`, `E2-T3` · **Priority:** p1

Cada pieza sugerida trae un botón "usar esta pieza" que llama `POST /api/v1/content` (Fase 2, sin
endpoint nuevo).

**Files**
- `src/app/(app)/content/calendar/page.tsx` — edit
- `src/components/calendar/suggested-calendar-panel.tsx` — new
- `tests/e2e/agents-content.spec.ts` — new

**Acceptance**

1. **WHEN** el usuario pide un calendario editorial y recibe piezas sugeridas **THE SYSTEM SHALL** mostrar un botón "usar esta pieza" por cada una.
2. **WHEN** se hace clic en "usar esta pieza" **THE SYSTEM SHALL** crear un `content_item` en estado `draft` vía `POST /api/v1/content`, con el título y cuerpo de la sugerencia.
3. **WHEN** la pieza recién creada aparece en la lista de contenido **THE SYSTEM SHALL** mostrarla como cualquier otro `content_item` en `draft`.

**Verify**

```bash
pnpm test:e2e tests/e2e/agents-content.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: ui del calendario editorial sugerido"
git tag step-73-content-agent-ui
```

### `E2-T5` — Backend del agente de ventas/atencion — tools de solo lectura

**Depends on:** `E1-T2`, `E1-T3` (de `01-motor-compartido`) · **Priority:** p1

3 tools de solo lectura, permiso `conversation.reply`. `send_conversation_reply` **no** va aquí — es
`03-ventas-y-cierre` `E3-T1`.

**Files**
- `src/server/agents/sales/tools.ts` — new
- `src/app/api/v1/agents/sales/route.ts` — new
- `tests/unit/sales-agent-tools.test.ts` — new

**Acceptance**

1. **WHEN** `summarize_contact_history` se invoca para una conversación válida **THE SYSTEM SHALL** devolver un resumen no vacío basado en los mensajes de esa conversación.
2. **WHEN** cualquiera de las 3 tools se invoca con un `conversationId` que pertenece a otra organización **THE SYSTEM SHALL** responder 404, nunca los datos de la conversación ajena.
3. **WHEN** `POST /api/v1/agents/sales` recibe un body sin `conversationId` **THE SYSTEM SHALL** responder `400 validation_error`.
4. **WHEN** cualquiera de las 3 tools se invoca por primera vez en una organización **THE SYSTEM SHALL** detener el stream con `approval_required`.

**Verify**

```bash
pnpm test tests/unit/sales-agent-tools.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: backend del agente de ventas — tools de solo lectura"
git tag step-74-sales-agent-readonly
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** cualquiera de los 3 agentes con panel de UI (onboarding, soporte, contenido) se usa desde su interfaz **THE SYSTEM SHALL** completar un turno de principio a fin sin error de consola.
2. **WHEN** una pieza sugerida por el agente de contenido se acepta **THE SYSTEM SHALL** aparecer en `/app/content/calendar` como una pieza real, editable como cualquier otra.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/agents-support.spec.ts tests/e2e/agents-content.spec.ts
```

## Pitfalls

- **Inventar un endpoint nuevo para "aplicar" una sugerencia de contenido** — reutiliza
  `POST /api/v1/content` de Fase 2, siempre.
- **Montar `AgentPanel agentKey="copilot"` esperando que pegue a `/api/v1/agents/copilot`** — esa ruta
  no existe, el copiloto conserva `/api/v1/copilot`.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control.**
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` — sin cambios en este epic.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
