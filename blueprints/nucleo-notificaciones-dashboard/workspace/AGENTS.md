# Núcleo — Notificaciones Push + Dashboard — instrucciones para agentes

Notificaciones push del navegador (Web Push/VAPID), dashboard de inicio `/app`, y alertas de canal
desconectado, sobre el SaaS Núcleo ya construido (Fases 1-3).

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Tests | `pnpm test` · un archivo: `pnpm test tests/push/{archivo}.test.ts` |
| E2E | `pnpm test:e2e` |
| Migrar DB | `pnpm db:migrate` |

## No negociable

1. `sendPushNotification()` nunca puede bloquear ni fallar el flujo que la llama.
2. `VAPID_PRIVATE_KEY` nunca se commitea, imprime en log, ni llega al bundle de cliente.
3. Ningún módulo fuera de `src/lib/push/send.ts` importa el SDK `web-push` directo.
4. Nunca editar a mano una migración generada por `drizzle-kit`.
5. Nunca marcar una tarea terminada con un comando de verificación en rojo — incluido el `Verify`
   original de la fase editada, no solo el nuevo.
6. Nunca cambiar el código/body de una respuesta HTTP ya existente de Fase 1-3 al agregar un efecto
   secundario (push) en una rama que ya corría.

Arquitectura completa, fronteras y sistema de diseño: ver `CLAUDE.md` en este mismo directorio.
