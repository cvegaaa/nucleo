# Epic 03: Confiabilidad y lanzamiento

> Después de este épico, las acciones fallidas se reintentan y caen a dead-letter de forma visible,
> un administrador puede auditar cada ejecución desde la UI, la IA solo actúa cuando el usuario la
> configuró explícitamente, el sistema resiste abuso, y toda la fase está verificada end-to-end.

| | |
|---|---|
| **Epic id** | `03-confiabilidad-y-lanzamiento` |
| **Tasks** | `E3-T1` … `E3-T5` |
| **Depends on** | `02-catalogo-y-motor-de-ejecucion` |
| **Unlocks** | nada — última fase del build |
| **Parallel with** | `E3-T2` y `E3-T3` y `E3-T4` entre sí (archivos distintos, todas dependen solo de `E2-T6`) |

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
| Validar compose de producción | `docker compose -f docker-compose.prod.yml config` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea de este
épico como terminada.

## Subárbol de directorios

```
src/
  server/
    automations/
      action-runner.ts             # NUEVO — processor de jobs 'automation:execute-action'
      worker.ts                    # EXISTE (Epic 02) — EDITAR: rate limit por organizacion
      service.ts                   # EXISTE (Epic 02) — EDITAR: validacion de profundidad/tamano de conditionJson
      actions/
        ai-classify.ts             # NUEVO
        catalog.ts                 # EXISTE — EDITAR: registra ai_classify
        errors.ts                  # EXISTE (Epic 02, E2-T1) — ApprovalRequiredError, consumido aqui via instanceof, no editado
  app/
    globals.css                    # EXISTE — EDITAR (E3-T2): agrega --warning/--warning-fg bajo @theme
    api/
      automations/
        [id]/
          runs/
            route.ts               # NUEVO
    (app)/
      automations/
        [id]/
          runs/
            page.tsx               # NUEVO
docker-compose.prod.yml            # EDITAR (minima o confirmacion documentada)
tests/
  automations/
    retries-dead-letter.test.ts
    action-ai-classify.test.ts
    hardening.test.ts
    full-phase-e2e.test.ts
  e2e/
    automations-runs.spec.ts
```

Todo lo que esté fuera de este subárbol queda fuera de alcance.

## Modelo de datos tocado aquí

| Entidad | Campos que este épico agrega o lee | Notas |
|---|---|---|
| `automation_action_log` | escritura por intento vía `action-runner.ts` | `status`, `attempt`, `result`, `error` |
| `automation_run` | actualización de `status`/`finished_at` al terminar la secuencia | `completed`/`failed`/`partial` según §4 del blueprint |
| `job_dead_letters` (Fase 1/2, sin cambio de schema) | escritura vía la infraestructura BullMQ ya existente | referencia `automation_run_id` en su payload |

## Contratos

**Consumido**:

| De | Interfaz | Garantía |
|---|---|---|
| `02-catalogo-y-motor-de-ejecucion` | `worker.ts` (encola jobs `automation:execute-action`) | el job trae `automationRunId`, `automationActionId`, `attempt` |
| `02-catalogo-y-motor-de-ejecucion` | `catalog.get(actionType)` | `ai-classify.ts` se registra en el mismo catálogo |
| `02-catalogo-y-motor-de-ejecucion` (`E2-T1`) | `actions/errors.ts` → `ApprovalRequiredError` | `action-runner.ts` la detecta por `instanceof` y es el único que la traduce a una fila de `automation_action_log`, sin pasar por el pipeline de reintentos de BullMQ |
| Fase 1 | gateway de IA (`@anthropic-ai/sdk`) | invocable con prompt configurado |

**Producido**: ninguno — este es el último épico, nada depende hacia adelante de él dentro de esta
fase.

## Convenciones que muerden en esta área

- Cada intento de acción lee `config_json` de `automation_action` en la base de datos, nunca de un
  cierre en memoria del intento anterior — un reintento con configuración editada a mitad de camino
  usa la configuración vigente, no la original.
- `ai_classify` nunca se invoca "por si acaso" — solo cuando existe la fila `automation_action`
  correspondiente. No agregues una ruta de invocación implícita.
- El rate limit de `E3-T4` es por organización, nunca global — una organización abusiva no debe
  degradar a las demás.
- `automation_action_log` solo se escribe desde `action-runner.ts` — ninguna acción del catálogo
  (Epic 01/02) escribe ahí directamente. `ApprovalRequiredError` es la única excepción de flujo: se
  detecta por tipo y se registra de inmediato, sin pasar por el backoff/reintento de BullMQ ni llegar
  nunca a `job_dead_letters`.

Reglas completas: `CLAUDE.md`. Reglas de esta área: `.claude/rules/automations.md`.

---

## Tareas

### `E3-T1` — Reintentos y dead-letter vía BullMQ

**Depends on:** `E2-T6` · **Priority:** p0

`action-runner.ts` ejecuta la acción vía el catálogo, escribe un log por intento — **este processor es
el único componente de esta fase autorizado a escribir en `automation_action_log`**; ninguna acción del
catálogo (incluida `send_message`, `E2-T1`) escribe ahí directamente. Éxito: encadena la siguiente
acción o marca `completed`.

Manejo especial de `ApprovalRequiredError` (lanzado por `send_message`, `E2-T1`, desde
`actions/errors.ts`): `action-runner.ts` lo detecta por tipo (`instanceof ApprovalRequiredError`)
**antes** de dejarlo caer al pipeline de reintentos genérico. Cuando lo detecta: escribe
inmediatamente `automation_action_log.status = "failed"` con `error = "approval_required"`, marca
`automation_run.status` con la misma regla que un fallo genérico, detiene la secuencia sin encolar la
siguiente acción, y **no reencola el job** — nunca llega al backoff/reintento de BullMQ ni a
`job_dead_letters`.

Fallo genérico (cualquier error que no sea `ApprovalRequiredError`): deja operar el backoff ya
configurado de la cola `jobs`; al agotar reintentos, la infraestructura existente escribe en
`job_dead_letters` y este processor marca `partial` (si hubo éxito previo) o `failed` (si no).

**Files**
- `src/server/automations/action-runner.ts` — new
- `tests/automations/retries-dead-letter.test.ts` — new

**Acceptance**

1. **WHEN** una acción falla y agota los reintentos configurados **THE SYSTEM SHALL** escribir una fila en `job_dead_letters` referenciando el `automation_run_id`.
2. **WHEN** una acción falla siendo la primera de la secuencia **THE SYSTEM SHALL** marcar `automation_run.status = "failed"`.
3. **WHEN** una acción falla después de que al menos 1 acción previa tuvo éxito **THE SYSTEM SHALL** marcar `automation_run.status = "partial"`.
4. **WHEN** todas las acciones de la secuencia tienen éxito **THE SYSTEM SHALL** marcar `automation_run.status = "completed"` y `finished_at` no nulo.
5. **WHEN** una acción lanza `ApprovalRequiredError` **THE SYSTEM SHALL** escribir `automation_action_log.status = "failed"` con `error = "approval_required"` de forma inmediata y **SHALL** excluir ese intento del pipeline de reintentos/backoff de BullMQ — 0 reintentos encolados para ese job y 0 filas escritas en `job_dead_letters` para ese intento, verificado con un spy/mock sobre el mecanismo de reintento de la cola `jobs`.

**Verify**

```bash
pnpm test tests/automations/retries-dead-letter.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: reintentos y dead-letter via BullMQ"
git tag step-44-retries-dead-letter
```

### `E3-T2` — UI de historial de runs

**Depends on:** `E2-T6` · **Priority:** p1

Lista de runs ordenados por `started_at desc` con badge de `status`, expandible para ver
`automation_action_log` en orden de `position`. **Esta es la primera pantalla de la fase que
renderiza badges de estado `partial`/`paused`/`retrying`**, así que esta tarea también define el
token nuevo `--warning` (y su contraparte de texto `--warning-fg`) en `src/app/globals.css` bajo
`@theme` — no existe en la paleta heredada de Fase 1 (blueprint §7). El builder elige un hex real
para claro y oscuro, siguiendo la misma metodología de contraste que Fase 1 usó para el resto de la
paleta (≥4.5:1 entre `--warning-fg` y `--warning`), y registra el valor elegido en el `CLAUDE.md`
acumulado del repo en esta misma tarea.

**Files**
- `src/app/api/automations/[id]/runs/route.ts` — new
- `src/app/(app)/automations/[id]/runs/page.tsx` — new
- `src/app/globals.css` — edit: agrega `--warning`/`--warning-fg` claro y oscuro bajo `@theme`
- `tests/e2e/automations-runs.spec.ts` — new

**Acceptance**

1. **WHEN** un usuario visita `/automations/[id]/runs` de una automatización con runs previos **THE SYSTEM SHALL** listar los runs con el más reciente primero.
2. **WHEN** el usuario expande un run **THE SYSTEM SHALL** mostrar cada `automation_action_log` en el orden de `position` de la acción correspondiente.
3. **WHEN** una automatización nunca se ha disparado **THE SYSTEM SHALL** mostrar el mensaje de estado vacío específico, no el mensaje genérico de lista vacía.
4. **WHEN** se definen los valores claro y oscuro de `--warning`/`--warning-fg` en `src/app/globals.css` **THE SYSTEM SHALL** cumplir un contraste >=4.5:1 entre `--warning-fg` y `--warning` en ambos esquemas, verificado por el script de contraste del Verify de esta tarea.

**Verify**

```bash
pnpm test:e2e tests/e2e/automations-runs.spec.ts
pnpm typecheck
node -e 'const fs = require("fs");const css = fs.readFileSync("src/app/globals.css", "utf8");function grab(name, scope) { const re = new RegExp(scope.replace(/[.:]/g, "\\$&") + "\\s*\\{[^}]*?--" + name + ":\\s*(#[0-9a-fA-F]{6})"); const m = css.match(re); if (!m) { console.error("token --" + name + " no encontrado en el bloque " + scope); process.exit(1); } return m[1]; }function luminance(hex) { const c = hex.slice(1).match(/.{2}/g).map((h) => { const v = parseInt(h, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }function ratio(a, b) { const L1 = luminance(a), L2 = luminance(b); const lighter = L1 > L2 ? L1 : L2; const darker = L1 > L2 ? L2 : L1; return (lighter + 0.05) / (darker + 0.05); }let ok = true;for (const scope of [":root", ".dark"]) { const bg = grab("warning", scope); const fg = grab("warning-fg", scope); const r = ratio(bg, fg); if (r < 4.5) { console.error(scope + " contraste " + r.toFixed(2) + " < 4.5"); ok = false; } else { console.log(scope + " contraste OK: " + r.toFixed(2)); } }process.exit(ok ? 0 : 1);'
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: UI de historial de runs"
git tag step-45-ui-runs-history
```

### `E3-T3` — Acción `ai_classify` con invocación explícita

**Depends on:** `E1-T5` (Epic 01), `E2-T6` · **Priority:** p1

Invoca el gateway de IA de Fase 1. Solo se ejecuta si existe la fila `automation_action`
correspondiente — garantizado estructuralmente por el catálogo, no por un chequeo adicional.

**Files**
- `src/server/automations/actions/ai-classify.ts` — new
- `src/server/automations/actions/catalog.ts` — edit: registra `ai_classify`
- `tests/automations/action-ai-classify.test.ts` — new

**Acceptance**

1. **WHEN** una automatización no tiene ninguna acción `ai_classify` en su lista **THE SYSTEM SHALL** nunca invocar el cliente de Anthropic durante la ejecución de ese `automation_run`.
2. **WHEN** una automatización tiene `ai_classify` configurada y se ejecuta **THE SYSTEM SHALL** invocar el cliente de Anthropic exactamente 1 vez con el prompt configurado.
3. **WHEN** la clasificación responde **THE SYSTEM SHALL** escribir el resultado en `automation_action_log.result`.

**Verify**

```bash
pnpm test tests/automations/action-ai-classify.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: accion ai_classify con invocacion explicita"
git tag step-46-action-ai-classify
```

### `E3-T4` — Hardening (rate limit, validación, aislamiento)

**Depends on:** `E2-T6` · **Priority:** p0

Rate limit de 120 runs/min por organización en `worker.ts`. Validación explícita de `conditionJson`
(profundidad máxima 8, tamaño serializado máximo 16KB) en `service.ts`.

**Files**
- `src/server/automations/worker.ts` — edit
- `src/server/automations/service.ts` — edit
- `tests/automations/hardening.test.ts` — new

**Acceptance**

1. **WHEN** una organización dispara más de 120 eventos matcheables en 1 minuto **THE SYSTEM SHALL** omitir la creación de runs adicionales sin afectar otras organizaciones.
2. **WHEN** `POST /api/automations` recibe un `conditionJson` con profundidad de anidamiento mayor a 8 **THE SYSTEM SHALL** responder 422 con `code: "VALIDATION_ERROR"`.
3. **WHEN** `POST /api/automations` recibe un `conditionJson` serializado mayor a 16KB **THE SYSTEM SHALL** responder 422 con `code: "VALIDATION_ERROR"`.
4. **WHEN** un usuario de la organización B consulta `GET /api/automations/[id]/runs` de una automatización de la organización A **THE SYSTEM SHALL** responder 404.

**Verify**

```bash
pnpm test tests/automations/hardening.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: hardening (rate limit, validacion, aislamiento)"
git tag step-47-hardening
```

### `E3-T5` — Deploy y verificación end-to-end de la fase

**Depends on:** `E3-T1`, `E3-T2`, `E3-T3`, `E3-T4` · **Priority:** p0

Confirma `docker-compose.prod.yml` (el worker de automatizaciones corre en el proceso `worker` ya
existente — sin servicio nuevo). Crea la prueba de integración completa de la fase.

**Files**
- `docker-compose.prod.yml` — edit: mínima o confirmación documentada
- `tests/automations/full-phase-e2e.test.ts` — new

**Acceptance**

1. **WHEN** `docker compose -f docker-compose.prod.yml config` corre **THE SYSTEM SHALL** salir con código 0.
2. **WHEN** el flujo completo del test de integración corre (mensaje, condición, 2 acciones) **THE SYSTEM SHALL** terminar con `automation_run.status = "completed"` y 2 `automation_action_log` con `status = "success"`.
3. **WHEN** el mismo test corre sin la aprobación de `send_message` pre-otorgada **THE SYSTEM SHALL** terminar con `automation_run.status = "partial"`.

**Verify**

```bash
docker compose -f docker-compose.prod.yml config
pnpm test tests/automations/full-phase-e2e.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T5: deploy y verificacion end-to-end de la fase"
git tag step-48-deploy-verification
```

---

## Aceptación del épico

1. **WHEN** se ejecuta `tests/automations/full-phase-e2e.test.ts` **THE SYSTEM SHALL** cubrir el
   flujo completo evento → condición → acciones → log sin intervención manual.
2. **WHEN** se ejecuta el gate global de la fase **THE SYSTEM SHALL** salir en verde.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
docker compose -f docker-compose.prod.yml config
```

## Trampas

- **Crear un servicio Docker nuevo para el worker de automatizaciones.** Corre en el proceso `worker`
  ya existente — no dupliques infraestructura.
- **Dejar que un reintento agotado silencie el `automation_run`.** Siempre termina en `failed` o
  `partial`, nunca se queda en `running` indefinidamente.

## Antes de avanzar

- [ ] Cada tarea de este épico está `done` en `tasks.json`.
- [ ] Cada `verify` de cada tarea pasó completo.
- [ ] `git tag -l 'step-4[4-8]-*'` lista 5 tags.
- [ ] Gate limpio desde la raíz del proyecto, con `blueprints/nucleo-fase-3/` presente en el árbol.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] Un commit por tarea, cada uno con su tag de checkpoint.
- [ ] `git tag -l 'step-3[3-9]-*' 'step-4[0-8]-*' | wc -l` → 16 al cerrar este épico — la fase completa.
      `git tag -l 'step-*' | wc -l` → 48 (18 Fase 1 + 14 Fase 2 + 16 esta fase).
