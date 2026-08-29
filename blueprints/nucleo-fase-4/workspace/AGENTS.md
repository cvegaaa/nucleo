# Núcleo

Plataforma SaaS multi-tenant: comunicación multicanal, CRM, contenido, automatizaciones y agentes IA.

## Fase 4 — Agentes IA

4 agentes (onboarding, soporte, contenido, ventas) comparten el motor runs/steps/tool_calls/approvals
del copiloto de Fase 1, distinguidos por `runs.agent_key`. Ver `CLAUDE.md` para la tabla completa de
endpoints y permisos.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| E2E | `pnpm test:e2e` |
| DB migrate | `pnpm db:migrate` |

## Three rules that matter most

1. `src/server/agents/context.ts` es el único punto de lectura de memoria contextual para los agentes
   nuevos — nunca una query directa a otra tabla desde un handler de tool.
2. Toda tool que muta o sale a un canal externo requiere `requiresApprovalFirstUse: true`, sin
   excepción.
3. `src/server/copilot/runs.ts` es el único orquestador del motor de agentes — no crear un segundo
   bucle de orquestación en ningún archivo nuevo.

`CLAUDE.md` es la fuente de verdad completa.
