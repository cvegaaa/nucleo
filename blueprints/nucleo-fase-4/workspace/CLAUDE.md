## Fase 4 — Agentes IA

4 agentes nuevos comparten el motor runs/steps/tool_calls/approvals del copiloto (Fase 1),
distinguidos por `runs.agent_key`.

| Agente | `agent_key` | Conversación | Endpoint | Permiso |
|---|---|---|---|---|
| Onboarding | `onboarding` | nunca | `POST /api/v1/agents/onboarding` | ninguno |
| Soporte | `support` | nunca | `POST /api/v1/agents/support` | ninguno |
| Contenido/marketing | `content_marketing` | nunca | `POST /api/v1/agents/content` | `content.create` |
| Ventas/atención | `sales` | siempre | `POST /api/v1/agents/sales` | `conversation.reply` |

Reglas:
- Cualquier tool nueva de cualquier agente sigue el skill `add-agent-tool`.
- `src/server/agents/context.ts` es el único punto de lectura de memoria contextual para los 4 agentes
  nuevos — nunca una query directa a otra tabla desde un handler de tool.
- Solo `send_conversation_reply` (agente de ventas) sale a un canal externo — cualquier tool nueva que
  también lo haga necesita el mismo patrón de aprobación en primer uso, sin excepción.
- El copiloto de Fase 1 (`agent_key = 'copilot'`) sigue funcionando exactamente igual — su UI
  (`copilot-panel.tsx`) es un wrapper de `agent-panel.tsx`, no un componente separado.

Este bloque se inserta bajo la sección "Fases" del `CLAUDE.md` ya existente en el root del proyecto
(Fase 1, extendido por Fase 2/3/notificaciones) — no reemplaza el archivo completo.
