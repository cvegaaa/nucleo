# Núcleo — Fase 3: Automatizaciones

SaaS multi-tenant de comunicación + CRM + contenido + automatizaciones + IA. Este archivo cubre las
convenciones agregadas por la Fase 3 (motor de automatizaciones evento→condición→acciones) sobre el
repo ya construido en Fases 1-2.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install` |
| Servidor de desarrollo | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Tests unitarios | `pnpm test` · un archivo: `pnpm test tests/automations/{archivo}.test.ts` |
| E2E | `pnpm test:e2e` |
| Migrar DB | `pnpm db:migrate` |
| Generar migración | `pnpm db:generate` |
| Aprobar builds post-install | `pnpm approve-builds --all` |
| Fusionar settings.json de una fase | `node scripts/merge-claude-settings.mjs <ruta-al-settings-de-la-fase>` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` debe pasar antes de marcar cualquier tarea como
terminada.

## Stack

Next.js 16 · TypeScript · Drizzle ORM · Postgres · Redis · BullMQ 6.1.1 · better-auth · Socket.IO ·
`@anthropic-ai/sdk` · `json-logic-engine@5.0.7` (nuevo en Fase 3).

## Arquitectura — dominio de automatizaciones

**Camino de un evento.** Fase 1/2 escriben un dato (mensaje entrante, publicación) → llaman
`emitAutomationEvent()` (`src/server/automations/events.ts`, fire-and-forget, nunca lanza) → cola
BullMQ `automation-events` → `src/server/automations/worker.ts` evalúa la condición de cada
automatización activa con `src/server/automations/condition-evaluator.ts` → crea siempre una fila
`automation_run` → si matchea, encola el primer job `automation:execute-action` en la cola genérica
`jobs` ya existente → `src/server/automations/action-runner.ts` ejecuta la acción vía el catálogo y
encadena la siguiente.

**Fronteras.** Cruzar una de estas mal rompe el build:

| Capa | Puede importar de | Nunca debe |
|---|---|---|
| `src/server/automations/**` | `src/db`, `src/lib`, `src/server/content/items.ts` (`createContentItem`, solo desde `actions/create-content-draft.ts`) | escribir SQL directo en tablas de otra fase — siempre a través de sus servicios ya existentes |
| `src/server/automations/actions/*.ts` | `catalog.ts` para registrarse | ejecutar sin pasar por `requirePermission` |
| Fase 1/2 (`src/server/channels/{whatsapp,instagram,facebook,tiktok}.ts`, `src/server/publishing/publish.ts`) | `emitAutomationEvent` únicamente | esperar (`await` que propague) la emisión del evento — siempre fire-and-forget |

**Dónde viven las cosas.**

| Concern | Fuente única de verdad |
|---|---|
| Schema DB | `src/db/schema.ts` — editar aquí, luego `pnpm db:generate` + `pnpm db:migrate` |
| Catálogo de acciones | `src/server/automations/actions/catalog.ts` — una acción nueva se registra ahí, nunca inline en el worker |
| Transiciones de ciclo de vida | `src/server/automations/service.ts` → `validateTransition()` |
| Nombre de la cola de eventos | `"automation-events"`, definido en `events.ts`, nunca hardcodeado en otro lugar |

## Reglas de código

1. **`emitAutomationEvent()` nunca lanza.** Cualquier punto de emisión desde Fase 1/2 se agrega sin
   `try/catch` adicional — la garantía vive dentro de la función.
2. **Toda acción del catálogo valida su `config_json` con zod antes de ejecutar.**
3. **Toda consulta a `automation`/`automation_action`/`automation_run`/`automation_action_log` filtra
   `org_id`**, directo o vía join — nunca una consulta sin ese filtro. `automation_action_approval`
   sigue la misma regla (filtro directo, sin join, desde `send-message.ts` — nunca desde las tablas
   del copiloto de Fase 1, ver Decisión #7 en blueprint §20.3).
4. **Nunca se nombra a mano un archivo de migración generado por `drizzle-kit`.** Se describe como
   "la migración que `pnpm db:generate` emite para este cambio".
5. **`send_message` y `ai_classify` nunca ejecutan sin la verificación server-side correspondiente**
   (aprobación previa / presencia explícita en la lista de acciones de la automatización).
6. **El worker de automatizaciones y el `action-runner` nunca invocan una `action_type` que no esté
   en el catálogo** — un tipo desconocido falla la validación en `service.ts` antes de guardarse.
7. **Ningún job de acción se reintenta con una configuración distinta a la registrada** — el
   `config_json` leído en cada intento viene de `automation_action`, nunca de un cierre en memoria.
8. **`automation_action_log` solo se escribe desde `action-runner.ts`.** Ninguna acción del catálogo
   escribe ahí directamente — una acción que necesita bloquear su propia ejecución lanza un error
   tipado (p. ej. `ApprovalRequiredError`, no-reintentable, definido en `actions/errors.ts`) y deja que
   `action-runner.ts` decida cómo registrarlo y si pasa por el pipeline de reintentos de BullMQ.
   `ApprovalRequiredError` específicamente nunca se reintenta ni llega a `job_dead_letters`.

## Sistema de diseño

Hereda tokens, tipografía y componentes ya establecidos por Fases 1-2 — ver el `CLAUDE.md`
acumulado del repo para los valores reales. Esta fase **sí agrega tokens nuevos: `--warning` y
`--warning-fg`** (usados por los badges de estado `partial`/`paused`/`retrying`, ver blueprint.md §7).
No existen en la paleta de Fase 1 — el builder debe definir su valor exacto (claro y oscuro) en el
**paso 13 (UI de historial de runs)** — la primera pantalla que renderiza esos badges, no el paso 10
(formulario) — siguiendo la misma metodología de contraste que Fase 1 usó para el resto de la paleta
(≥4.5:1 entre `--warning-fg` y `--warning`, verificado por el script de contraste del `Verify` del
paso 13), y registrarlo en este `CLAUDE.md` acumulado en ese momento.

## Entorno

Esta fase no agrega variables de entorno nuevas — reutiliza `REDIS_URL` y `ANTHROPIC_API_KEY` ya
validadas en `src/lib/env.ts`.

## Reglas

| Archivo | Aplica a |
|---|---|
| `.claude/rules/automations.md` | `src/server/automations/**`, `tests/automations/**` |

## No negociable

1. `emitAutomationEvent()` nunca puede bloquear ni fallar el flujo que lo llama.
2. Ninguna condición de usuario se evalúa con `eval()` — solo `json-logic-engine`.
3. Nunca commitear secretos, `.env`, ni artefactos de build.
4. Nunca editar a mano una migración generada por `drizzle-kit`.
5. Nunca marcar una tarea terminada con un comando de verificación en rojo.
6. `send_message` y `ai_classify` nunca se ejecutan sin su verificación server-side explícita.
