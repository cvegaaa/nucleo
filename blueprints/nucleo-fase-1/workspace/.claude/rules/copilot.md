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
