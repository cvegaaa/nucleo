# Núcleo — Fase 3: Automatizaciones — instrucciones para agentes

Motor de automatizaciones evento→condición→acciones sobre el SaaS Núcleo, determinístico por diseño,
con IA estrictamente opcional por acción.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Tests | `pnpm test` · un archivo: `pnpm test tests/automations/{archivo}.test.ts` |
| E2E | `pnpm test:e2e` |
| Migrar DB | `pnpm db:migrate` |

## No negociable

1. `emitAutomationEvent()` nunca puede bloquear ni fallar el flujo que lo llama.
2. Ninguna condición de usuario se evalúa con `eval()` — solo `json-logic-engine`.
3. Nunca commitear secretos, `.env`, ni artefactos de build.
4. Nunca editar a mano una migración generada por `drizzle-kit`.
5. Nunca marcar una tarea terminada con un comando de verificación en rojo.
6. `send_message` y `ai_classify` nunca se ejecutan sin su verificación server-side explícita.

Arquitectura completa, fronteras y sistema de diseño: ver `CLAUDE.md` en este mismo directorio.
