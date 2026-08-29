---
paths:
  - "src/server/automations/**"
  - "tests/automations/**"
---

# Convenciones del dominio de automatizaciones

- `emitAutomationEvent()` nunca se envuelve en un `try/catch` adicional en el llamador — la garantía
  de no-lanzar vive dentro de la función misma. No agregar manejo de errores redundante en Fase 1/2.
- Toda acción nueva se registra en `src/server/automations/actions/catalog.ts` con `configSchema`
  (zod), `requiredPermission` y `execute()`. Nunca se invoca una acción fuera del catálogo.
- El árbol de condición (`condition_json`) se evalúa únicamente con `LogicEngine` de
  `json-logic-engine` en `condition-evaluator.ts`. Un árbol malformado retorna `false`, nunca lanza.
- `automation_run` se crea siempre que el worker evalúa una automatización activa contra un evento —
  matchee o no la condición. No optimizar esto "para ahorrar una fila": es la decisión de
  observabilidad del blueprint (§4).
- Las transiciones de `automation.status` pasan siempre por `validateTransition()` en `service.ts`.
  Nunca un `UPDATE` directo a la columna `status`.
- `send_message` verifica la aprobación en primer uso consultando directamente la tabla propia de esta
  fase, `automation_action_approval` (§4 del blueprint) — por `(org_id, action_type = "send_message")`.
  Nunca reutiliza `runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1: esas tablas exigen
  `runs.conversation_id`/`runs.initiated_by` `not null`, pensados para el contexto conversacional del
  copiloto, que un llamador de sistema no tiene (ver Decisión #7, blueprint §20.3).
- `ai_classify` solo se invoca si existe una fila `automation_action` con ese `action_type` — nunca
  agregar una ruta de invocación implícita "por si acaso".
- Cada consulta a las 5 tablas de esta fase filtra `org_id`, directo o vía join a `automation`
  (`automation_action_approval` filtra `org_id` directo, sin join, desde `send-message.ts`).
- `automation_action_log` solo se escribe desde `action-runner.ts`. Ninguna acción del catálogo
  escribe ahí directamente: una acción que necesita bloquear su propia ejecución (p. ej. `send_message`
  sin aprobación) lanza un error tipado no-reintentable (`ApprovalRequiredError`, definido en
  `actions/errors.ts`) y deja que `action-runner.ts` decida el registro y si pasa por el pipeline de
  reintentos. `ApprovalRequiredError` específicamente nunca se reintenta ni llega a `job_dead_letters`
  — `action-runner.ts` lo detecta por tipo antes de dejarlo caer al backoff genérico de BullMQ.
