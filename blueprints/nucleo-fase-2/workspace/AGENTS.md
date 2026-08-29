# Núcleo — Fase 1 + Fase 2 — agent instructions

Bandeja unificada multicanal con copiloto de IA + calendario editorial, biblioteca de medios y
publicación programada multicanal, para pequeñas y medianas empresas.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Tests | `pnpm test` · E2E: `pnpm test:e2e` |
| DB migrate | `pnpm db:migrate` |
| Servicios locales | `pnpm services:up` (Postgres + Redis + MinIO) |
| Worker de publicación | `pnpm worker:publish` |

## Non-negotiable

1. Toda mutación llama `requirePermission()` antes de tocar datos — sin excepciones.
2. `recordAuditEvent()` va en la misma transacción que el cambio, nunca en un paso separado.
3. Nunca commitear secretos, `.env`, ni output de build.
4. Nunca editar a mano una migración generada — genera una nueva.
5. Los webhooks de canal verifican firma sobre el raw body antes de parsear el payload.
6. Ningún objeto de MinIO es públicamente accesible — siempre vía `GET /api/media/[key]`.
7. Nunca marcar una tarea hecha con un comando de gate fallando.

Arquitectura completa, boundaries y tokens de diseño: ver `CLAUDE.md` en este directorio.
