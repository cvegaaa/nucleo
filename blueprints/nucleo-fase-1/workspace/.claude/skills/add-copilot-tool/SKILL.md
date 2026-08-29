---
name: add-copilot-tool
description: Flujo para registrar una nueva tool call de bajo riesgo en el catálogo del copiloto, con
  su permiso y aprobación en el primer uso. Usar cuando se pida que el copiloto pueda hacer una acción
  nueva.
---

# Add Copilot Tool

## When to use
Al agregar una acción nueva que el copiloto pueda ejecutar sobre datos de esta fase (nunca acciones de
envío a canal externo — esas requieren un rediseño del patrón de aprobación, fuera de alcance de Fase
1).

## Steps
1. Define la tool en `src/server/copilot/tools.ts` con su `name`, `description` (prescriptiva sobre
   cuándo usarla), `input_schema`, el `permission_key` que requiere, y `requiresApprovalFirstUse: true`.
2. Implementa el handler que ejecuta la mutación real, llamando `requirePermission()` y
   `recordAuditEvent()` como cualquier otra mutación.
3. Confirma que `src/server/copilot/runs.ts` reconoce el nuevo `tool_name` en su lógica de
   aprobación-en-primer-uso — no debería requerir cambios si sigues el patrón existente.
4. Agrega un caso a `tests/e2e/copilot.spec.ts` con un fixture grabado de la respuesta del modelo
   invocando la nueva tool.

## Verify
```bash
pnpm test:e2e tests/e2e/copilot.spec.ts   # expect: exit 0
```

## Do not
- No marques una tool como `requiresApprovalFirstUse: false` sin justificación explícita — el patrón
  de aprobación es la salvaguarda contra acciones no deseadas del copiloto.
- No agregues una tool que envíe mensajes a un canal externo sin rediseñar el flujo de aprobación —
  fuera de alcance de Fase 1.
