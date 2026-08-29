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
