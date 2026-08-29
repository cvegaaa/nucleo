---
name: add-agent-tool
description: Flujo para registrar una nueva tool call en el catálogo de cualquiera de los 5 agentes
  (copilot, onboarding, support, content_marketing, sales), con su permiso y aprobación en el primer
  uso. Generalización del skill add-copilot-tool de Fase 1 para cubrir los 4 agentes nuevos. Usar
  cuando se pida que un agente pueda hacer una acción nueva.
---

# Add Agent Tool

## When to use
Al agregar una acción nueva que cualquiera de los 5 agentes pueda ejecutar sobre datos ya expuestos
por `src/server/agents/context.ts` para ese agente (nunca datos fuera de su acceso acotado — ver
`blueprint.md` §4/§8 de Fase 4 para el subconjunto exacto de cada agente).

## Steps
1. Define la tool en `src/server/agents/{agentKey}/tools.ts` (o `src/server/copilot/tools.ts` si
   `agentKey === "copilot"`) con su `name`, `description` prescriptiva, `input_schema`, el
   `permission_key` que requiere (o ninguno si el agente no toca dato sensible de organización, ver
   §8 de este blueprint), y `requiresApprovalFirstUse: true` por defecto.
2. Implementa el handler, llamando `requirePermission()` si aplica y `recordAuditEvent()` dentro de
   la misma transacción si la tool muta algo. Una tool de solo lectura no llama `recordAuditEvent()`.
3. Si la tool necesita leer datos de otra tabla, agrega la rama correspondiente en
   `src/server/agents/context.ts` en vez de hacer la query directamente en el handler.
4. Confirma que el motor generalizado (`src/server/copilot/runs.ts`) reconoce el nuevo `tool_name` en
   su lógica de aprobación-en-primer-uso — no debería requerir cambios si sigues el patrón existente.
5. Agrega un caso al spec E2E del agente correspondiente con un fixture grabado de la respuesta del
   modelo invocando la nueva tool.

## Verify
```bash
pnpm test:e2e tests/e2e/agents-{agentKey}.spec.ts   # expect: exit 0
```

## Do not
- No marques una tool como `requiresApprovalFirstUse: false` sin justificación explícita.
- No agregues una tool que envíe contenido a un canal externo sin el mismo patrón de aprobación que ya
  usa `send_conversation_reply` — sin excepción.
- No hagas una query directa a una tabla fuera del subconjunto ya expuesto por
  `src/server/agents/context.ts` para ese agente — si necesitas un dato nuevo, amplía `context.ts`
  primero, en su propia rama por agente.
