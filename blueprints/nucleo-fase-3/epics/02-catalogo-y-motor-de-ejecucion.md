# Epic 02: Catálogo completo, evaluador y motor de ejecución

> Después de este épico, un administrador puede crear una automatización desde la UI, y un evento
> real la dispara de punta a punta: condición evaluada, acciones ejecutadas en orden, todo trazado.

| | |
|---|---|
| **Epic id** | `02-catalogo-y-motor-de-ejecucion` |
| **Tasks** | `E2-T1` … `E2-T6` |
| **Depends on** | `01-motor-de-eventos` |
| **Unlocks** | `03-confiabilidad-y-lanzamiento` |
| **Parallel with** | `E2-T1` y `E2-T2` entre sí (archivos distintos); `E2-T3` con ambas |

No necesitas ningún otro archivo para completar este épico. Todo lo de abajo está repetido aquí a
propósito.

---

## Stack

Next.js 16 · TypeScript · Drizzle ORM · Postgres · Redis · BullMQ 6.1.1 · better-auth ·
`@anthropic-ai/sdk` · `json-logic-engine@5.0.7`. Gestor de paquetes: `pnpm`.

| Tarea | Comando |
|---|---|
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {ruta}` |
| E2E (un archivo) | `pnpm test:e2e {ruta}` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea de este
épico como terminada.

Postgres y Redis ya corren desde Fase 1/2 — nada nuevo que levantar.

## Subárbol de directorios

```
src/
  server/
    automations/
      condition-evaluator.ts       # NUEVO
      service.ts                   # NUEVO
      worker.ts                    # NUEVO — consumidor de 'automation-events'
      actions/
        catalog.ts                 # EXISTE (Epic 01) — se le agregan send_message y create_content_draft
        errors.ts                  # NUEVO — ApprovalRequiredError, error tipado no-reintentable
        send-message.ts            # NUEVO — lanza ApprovalRequiredError, nunca escribe automation_action_log
        create-content-draft.ts    # NUEVO
    content/
      items.ts                     # EXISTE (Fase 2) — createContentItem, solo lectura desde create-content-draft.ts
  app/
    api/
      automations/
        route.ts                  # NUEVO
        [id]/
          route.ts                # NUEVO
    (app)/
      automations/
        page.tsx                  # NUEVO
        new/
          page.tsx                # NUEVO
        [id]/
          page.tsx                # NUEVO
scripts/
  worker.ts                        # EXISTE (Fase 1) — EDITAR: registra el nuevo Worker. NO es src/worker.ts (no existe). No es scripts/worker-publish.ts de Fase 2 (proceso separado, no se toca).
tests/
  automations/
    action-send-message.test.ts
    action-create-content-draft.test.ts
    condition-evaluator.test.ts
    api-crud.test.ts
    worker-e2e.test.ts
    fixtures/
      sample-condition.json        # fixture dorado, ya en workspace/ desde el bootstrap
  e2e/
    automations-form.spec.ts
```

Todo lo que esté fuera de este subárbol queda fuera de alcance.

## Modelo de datos tocado aquí

| Entidad | Campos que este épico agrega o lee | Notas |
|---|---|---|
| `automation` | lectura/escritura completa vía `service.ts` | transiciones validadas con `validateTransition()` |
| `automation_action` | lectura/escritura vía `service.ts` | posición ordenada, validada contra `catalog.get(actionType)` |
| `automation_run` | escritura desde `worker.ts` | siempre se crea, matchee o no la condición |
| `automation_action_approval` (Epic 01, `E1-T1`) | solo lectura, consulta directa `(org_id, action_type)` desde `send-message.ts` | tabla propia de esta fase — nunca las tablas `runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1 (Decisión #7, blueprint §20.3) |
| `content_item` (Fase 2) | escritura vía `createContentItem` desde `create-content-draft.ts` | única acción de este épico que cruza a Fase 2 |

## Contratos

**Consumido**:

| De | Interfaz | Garantía |
|---|---|---|
| `01-motor-de-eventos` | `emitAutomationEvent` | la cola `automation-events` recibe los eventos que este épico consume |
| `01-motor-de-eventos` | `catalog` (registro base) | `send_message` y `create_content_draft` se agregan a este mismo registro, nunca uno paralelo |
| `01-motor-de-eventos` | tabla `automation_action_approval` (creada en `E1-T1`) | `send_message` la consulta directo por `(org_id, action_type)` — nunca importa ni consulta `runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1 |
| Fase 2 | `src/server/content/items.ts` → `createContentItem` | crea un `content_item` en `draft` |

**Producido**:

| Export | Firma | Usado por |
|---|---|---|
| `condition-evaluator.ts` → `evaluateCondition` | `(conditionJson, eventPayload) => boolean`, nunca lanza | `03-confiabilidad-y-lanzamiento` (`action-runner.ts` no lo usa directo, pero `worker.ts` sí, y el hardening de `E3-T4` lo endurece) |
| `service.ts` → `validateTransition` | `(current: Status, next: Status) => boolean` | `03-confiabilidad-y-lanzamiento` (UI de runs no la usa, pero cualquier extensión futura del CRUD sí) |
| `worker.ts` (proceso registrado en `scripts/worker.ts` de Fase 1) | consume `automation-events`, produce jobs `automation:execute-action` en la cola `jobs` | `03-confiabilidad-y-lanzamiento` (`action-runner.ts` consume esos jobs) |
| `actions/errors.ts` → `ApprovalRequiredError` | error tipado, no-reintentable, lanzado por `send-message.ts` | `03-confiabilidad-y-lanzamiento` (`action-runner.ts`, `E3-T1`, lo detecta por `instanceof` y lo excluye del pipeline de reintentos) |

## Convenciones que muerden en esta área

- El botón "Activar" en la UI se deshabilita en el cliente, pero la transición `draft → active` sin
  acciones **también** se rechaza en `service.ts` — el cliente nunca es la única barrera.
- `send_message` y `create_content_draft` se registran en el **mismo** `catalog.ts` de Epic 01, no en
  uno nuevo.
- `automation_run` se crea siempre, matchee o no la condición — no lo optimices para saltarte la fila
  cuando no matchea; es la decisión de observabilidad del blueprint.
- `automation_action_log` solo se escribe desde `action-runner.ts` (Epic 03) — ninguna acción de este
  épico escribe ahí directamente. `send_message` sin aprobación lanza `ApprovalRequiredError`
  (`actions/errors.ts`) y deja que `action-runner.ts` decida el registro.

Reglas completas: `CLAUDE.md`. Reglas de esta área: `.claude/rules/automations.md`.

---

## Tareas

### `E2-T1` — Acción `send_message` con aprobación en primer uso

**Depends on:** `E1-T5` (de Epic 01) · **Priority:** p0

Esta acción **no reutiliza** las tablas `runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1
— esas tablas exigen `runs.conversation_id`/`runs.initiated_by` `not null`, pensados para el flujo
conversacional del copiloto, y un llamador de sistema como el motor de automatizaciones no tiene
conversación ni usuario iniciador, estructuralmente, nunca (ver Decisión #7, blueprint §20.3). En su
lugar consulta directamente `automation_action_approval` (tabla propia de esta fase, creada en `E1-T1`
de Epic 01): antes de enviar, busca una fila con `(org_id, action_type) = (orgId del evento,
"send_message")`, sin ningún join a tablas del copiloto. Sin aprobación: no envía y lanza
`ApprovalRequiredError` (clase nueva en `src/server/automations/actions/errors.ts`, error tipado y
explícitamente no-reintentable). **`send-message.ts` nunca escribe en `automation_action_log`** — esa
escritura es responsabilidad exclusiva de `action-runner.ts` (`E3-T1`, ver ese épico para el detalle de
cómo detecta y registra este error sin pasar por el pipeline de reintentos de BullMQ). Con aprobación:
envía por el gateway de canal de Fase 1.

**Files**
- `src/server/automations/actions/send-message.ts` — new
- `src/server/automations/actions/errors.ts` — new: `ApprovalRequiredError`
- `src/server/automations/actions/catalog.ts` — edit: registra `send_message`
- `tests/automations/action-send-message.test.ts` — new

**Acceptance**

1. **WHEN** `send_message` se ejecuta por primera vez para una organización sin fila en `automation_action_approval` para `action_type = "send_message"` **THE SYSTEM SHALL** lanzar `ApprovalRequiredError` sin invocar el gateway de canal.
2. **WHEN** existe una fila en `automation_action_approval` con `action_type = "send_message"` para la organización del evento **THE SYSTEM SHALL** invocar el gateway de canal exactamente una vez con el contenido configurado.
3. **WHEN** `send_message` lanza `ApprovalRequiredError` **THE SYSTEM SHALL** no escribir ninguna fila en `automation_action_log` desde `send-message.ts` — esa escritura ocurre exclusivamente en `action-runner.ts` (paso 12).

**Verify**

```bash
pnpm test tests/automations/action-send-message.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: accion send_message con aprobacion en primer uso"
git tag step-38-action-send-message
```

### `E2-T2` — Acción `create_content_draft` (cruza a Fase 2)

**Depends on:** `E1-T5` · **Priority:** p0

Importa `createContentItem` de `src/server/content/items.ts` (Fase 2, sin modificarlo). Crea
un `content_item` en `draft` vinculado a la organización del evento.

**Files**
- `src/server/automations/actions/create-content-draft.ts` — new
- `src/server/automations/actions/catalog.ts` — edit: registra `create_content_draft`
- `tests/automations/action-create-content-draft.test.ts` — new

**Acceptance**

1. **WHEN** `create_content_draft` se ejecuta con un `configJson` válido **THE SYSTEM SHALL** crear exactamente 1 fila en `content_item` con `status = "draft"`.
2. **WHEN** el `content_item` creado se consulta **THE SYSTEM SHALL** tener el mismo `org_id` que el evento que disparó la automatización.
3. **WHEN** `create_content_draft` se ejecuta con un `configJson` sin el campo `title` requerido **THE SYSTEM SHALL** rechazar con un error zod antes de llamar a `createContentItem`.

**Verify**

```bash
pnpm test tests/automations/action-create-content-draft.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: accion create_content_draft (cruza a Fase 2)"
git tag step-39-action-create-content-draft
```

### `E2-T3` — Evaluador de condiciones json-logic

**Depends on:** `E1-T1` · **Priority:** p0

Envuelve `LogicEngine` de `json-logic-engine`. `{}` siempre evalúa `true`. Un árbol malformado se
captura y retorna `false` (nunca lanza). Usa el fixture ya presente en
`tests/automations/fixtures/sample-condition.json` (copiado desde `workspace/` en el bootstrap).

**Files**
- `src/server/automations/condition-evaluator.ts` — new
- `tests/automations/condition-evaluator.test.ts` — new

**Acceptance**

1. **WHEN** `evaluateCondition({}, anyPayload)` se llama **THE SYSTEM SHALL** retornar `true`.
2. **WHEN** `evaluateCondition(sample-condition.json, { tag: "urgente" })` se llama **THE SYSTEM SHALL** retornar `true`.
3. **WHEN** `evaluateCondition(sample-condition.json, { tag: "normal" })` se llama **THE SYSTEM SHALL** retornar `false`.
4. **WHEN** `evaluateCondition` recibe un árbol que `LogicEngine` no puede interpretar **THE SYSTEM SHALL** retornar `false` sin lanzar excepción.

**Verify**

```bash
pnpm test tests/automations/condition-evaluator.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: evaluador de condiciones json-logic"
git tag step-40-condition-evaluator
```

### `E2-T4` — CRUD de automatizaciones (API)

**Depends on:** `E1-T1`, `E1-T5`, `E2-T3` · **Priority:** p0

`service.ts` con los schemas zod, `validateTransition`, y funciones de acceso a datos con `org_id`
obligatorio. Rutas GET/POST en `route.ts` y GET/PATCH en `[id]/route.ts`.

**Files**
- `src/server/automations/service.ts` — new
- `src/app/api/automations/route.ts` — new
- `src/app/api/automations/[id]/route.ts` — new
- `tests/automations/api-crud.test.ts` — new

**Acceptance**

1. **WHEN** `POST /api/automations` recibe un body válido con 1 acción **THE SYSTEM SHALL** responder 201 con `status: "draft"`.
2. **WHEN** `PATCH /api/automations/[id]` intenta transicionar `draft` a `active` sin ninguna acción configurada **THE SYSTEM SHALL** responder 422 con `code: "INVALID_TRANSITION"`.
3. **WHEN** `PATCH /api/automations/[id]` intenta transicionar `active` a `draft` directamente **THE SYSTEM SHALL** responder 422 con `code: "INVALID_TRANSITION"`.
4. **WHEN** un usuario de la organización B solicita `GET /api/automations/[id]` de una automatización de la organización A **THE SYSTEM SHALL** responder 404.
5. **WHEN** `POST /api/automations` recibe un `triggerEventType` fuera del conjunto soportado **THE SYSTEM SHALL** responder 422 con `code: "VALIDATION_ERROR"`.

**Verify**

```bash
pnpm test tests/automations/api-crud.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: CRUD de automatizaciones (API)"
git tag step-41-crud-api
```

### `E2-T5` — UI de formulario estructurado

**Depends on:** `E2-T4` · **Priority:** p1

`TriggerSelect` (2 opciones: `message.received`, `content.published`), `ConditionBuilder` (filas simples compiladas a AND de json-logic, sin
canvas), `ActionListEditor` (lista ordenada, reordenable por botones, no drag-and-drop).

**Files**
- `src/app/(app)/automations/page.tsx` — new
- `src/app/(app)/automations/new/page.tsx` — new
- `src/app/(app)/automations/[id]/page.tsx` — new
- `tests/e2e/automations-form.spec.ts` — new

**Acceptance**

1. **WHEN** un usuario con `automation:create` visita `/automations/new` **THE SYSTEM SHALL** mostrar el `TriggerSelect` con exactamente 2 opciones.
2. **WHEN** el usuario completa el formulario con 1 acción y envía **THE SYSTEM SHALL** redirigir a `/automations/[id]` mostrando el `status` `draft`.
3. **WHEN** el usuario intenta activar una automatización sin acciones **THE SYSTEM SHALL** mantener el botón "Activar" deshabilitado con un tooltip explicando por qué.

**Verify**

```bash
pnpm test:e2e tests/e2e/automations-form.spec.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: UI de formulario estructurado"
git tag step-42-ui-form
```

### `E2-T6` — Ejecución end-to-end (worker de eventos)

**Depends on:** `E2-T1`, `E2-T2`, `E2-T3`, `E2-T4` · **Priority:** p0

`worker.ts` consume `automation-events`. Por evento: consulta automatizaciones activas con
`trigger_event_type` coincidente, evalúa condición, **crea siempre** un `automation_run`, y si
matchea encola el primer job de acción en la cola `jobs` existente. Edita `scripts/worker.ts` (3-4
líneas) — el único worker de eventos entrantes de Fase 1, no `src/worker.ts` (no existe) ni
`scripts/worker-publish.ts` de Fase 2 (proceso separado, no se toca) — para registrar este Worker
junto a los ya existentes.

**Files**
- `src/server/automations/worker.ts` — new
- `scripts/worker.ts` — edit: 3-4 líneas
- `tests/automations/worker-e2e.test.ts` — new

**Acceptance**

1. **WHEN** llega un evento `message.received` que matchea la condición de una automatización activa **THE SYSTEM SHALL** crear un `automation_run` con `condition_matched = true` y encolar el primer job de acción.
2. **WHEN** llega un evento que no matchea ninguna condición de una automatización activa **THE SYSTEM SHALL** crear un `automation_run` con `condition_matched = false` y `status = "completed"`, sin encolar ninguna acción.
3. **WHEN** no existe ninguna automatización activa para el `trigger_event_type` del evento **THE SYSTEM SHALL** no crear ningún `automation_run`.
4. **WHEN** una automatización `paused` tiene el mismo `trigger_event_type` que el evento **THE SYSTEM SHALL** ignorarla.

**Verify**

```bash
pnpm test tests/automations/worker-e2e.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: worker de ejecucion end-to-end"
git tag step-43-execution-worker
```

---

## Aceptación del épico

1. **WHEN** se crea una automatización activa vía la UI con condición `{}` (siempre verdadera) y 1 acción `tag_conversation`, y llega un evento real de su `trigger_event_type` **THE SYSTEM SHALL** producir un `automation_run` con `condition_matched = true` y un job de acción encolado.
2. **WHEN** se corre el gate completo **THE SYSTEM SHALL** salir en verde incluyendo los tests e2e de este épico.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/automations-form.spec.ts
```

## Trampas

- **Construir un builder visual de condiciones.** El `ConditionBuilder` es una lista de filas simples
  (campo, operador, valor) que se compilan a un AND de json-logic — nunca un canvas.
- **Dejar que `create_content_draft` escriba SQL directo en `content_item`.** Siempre a través de
  `createContentItem` de Fase 2.

## Antes de avanzar

- [ ] Cada tarea de este épico está `done` en `tasks.json`.
- [ ] Cada `verify` de cada tarea pasó completo.
- [ ] `git tag -l 'step-3[8-9]-*' 'step-4[0-3]-*'` lista 6 tags.
- [ ] Gate limpio desde la raíz del proyecto.
- [ ] Cada contrato "Producido" existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] Un commit por tarea, cada uno con su tag de checkpoint.
