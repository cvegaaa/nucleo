# Núcleo — Notificaciones Push + Dashboard

SaaS multi-tenant de comunicación + CRM + contenido + automatizaciones + IA. Este archivo cubre las
convenciones agregadas por esta fase (push del navegador + dashboard de inicio + alertas de canal
desconectado, `step-49`..`step-63`) sobre el repo ya construido en Fases 1-3.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install` |
| Servidor de desarrollo | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Tests unitarios | `pnpm test` · un archivo: `pnpm test tests/push/{archivo}.test.ts` |
| E2E | `pnpm test:e2e` · un archivo: `pnpm test:e2e tests/e2e/{archivo}.spec.ts` |
| Migrar DB | `pnpm db:migrate` |
| Generar migración | `pnpm db:generate` |
| Generar claves VAPID | `pnpm dlx web-push generate-vapid-keys` |
| Fusionar settings.json de una fase | `node scripts/merge-claude-settings.mjs <ruta-al-settings-de-la-fase>` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` debe pasar antes de marcar cualquier tarea como
terminada.

## Stack

Next.js 16 · TypeScript · Drizzle ORM · Postgres · Redis · BullMQ · better-auth · Socket.IO ·
`web-push@3.6.7` (nuevo en esta fase — implementación de Web Push/VAPID en el servidor).

## Arquitectura — dominio de notificaciones push

**Un solo punto de envío.** `src/lib/push/send.ts` exporta `sendPushNotification(userId, payload)` —
es el **único** módulo que importa el SDK `web-push`. Ningún gancho llama `webpush.sendNotification`
directo. La función nunca lanza: cualquier fallo (incluida la limpieza de suscripciones 404/410) se
maneja dentro de ella, igual que `emitAutomationEvent()` de Fase 3.

**Los 5 eventos que disparan push**, cada uno resolviendo destinatarios con un criterio ya existente
en el proyecto — nunca un permiso nuevo:

| Evento | Dónde se cablea | Destinatario |
|---|---|---|
| Mensaje entrante | `scripts/worker.ts`, tras `emitConversationUpdate` | `conversation.assignedTo`, o todo miembro con `conversation.reply` |
| Aprobación de copiloto pendiente | `src/server/copilot/runs.ts`, rama `requiresApprovalFirstUse` | usuarios con el `permission_key` de la tool |
| Canal desconectado | 4 route handlers de webhook, rama 404 existente + `src/server/channels/connection-health.ts` | todo `owner` de la organización |
| Aprobación de contenido pendiente | `src/server/content/approvals.ts`, tras `requestApproval` | usuarios con `content.approve` |
| Automatización fallida (`status = 'failed'` únicamente, nunca `'partial'`) | `src/server/automations/action-runner.ts` | `automation.created_by` |

**Detección de canal desconectado es pasiva, no un poller.** Se apoya en la rama 404 que ya existe en
cada webhook cuando `external_account_id` no resuelve a un `channel_connection` activo — decisión
documentada, ver blueprint §20.3 Decisión #3. No agregar un cron/poller nuevo.

**Dónde viven las cosas.**

| Concern | Fuente única de verdad |
|---|---|
| Schema DB | ruta confirmada con `find . -name schema.ts -path "*/db/*" -not -path "*/blueprints/*"` antes de editar — Fase 1/2 y Fase 3 discrepan en el nombre acumulado, ver blueprint §0 |
| Envío de push | `src/lib/push/send.ts` — única función exportada, `sendPushNotification` |
| CRUD de suscripciones | `src/server/push/subscriptions.ts` — único módulo que escribe en `push_subscription` |
| Estado de conexión de canal | `src/server/channels/connection-health.ts` — `markChannelDisconnected`, `listDisconnectedChannels` |
| Agregación del dashboard | `src/server/dashboard/queries.ts` — `getAttentionSummary(orgId, userId)` |
| Fallback de test para las VAPID_* | `tests/setup/env.ts` (heredado de Fase 1, editado en el paso 1) — mismo patrón `??=` que las 5 variables ya pobladas ahí |

## Reglas de código

1. **`sendPushNotification` nunca lanza.** Ningún llamador necesita `try/catch` adicional.
2. **`org_id`/`user_id` de `push_subscription` siempre vienen de la sesión**, nunca del body de la
   request — mismo principio que toda tabla tenant-owned del proyecto.
3. **Cada gancho (pasos 6-11) es una llamada aditiva al final de una función ya existente**, nunca una
   reescritura del flujo original de Fase 1-3.
4. **El test original de la fase editada corre siempre junto al test nuevo del gancho** — cada paso
   que edita código de Fase 1-3 lo re-verifica explícitamente, no solo el test nuevo.
5. **`automation_run.status = 'partial'` nunca dispara push** — solo `'failed'` completo (blueprint
   §20.3 Decisión #5).
6. **`getAttentionSummary` filtra `org_id` explícito en sus 4 consultas**, y no fusiona
   `approvals`/`content_approval`/`automation_action_approval` en un esquema genérico — son tres
   dominios distintos, tres campos separados en el resultado.
7. **Nunca nombrar a mano la migración generada por `drizzle-kit`** — se describe como "la migración
   que `pnpm db:generate` emite para este cambio".
8. **No cambiar el código ni el body de la respuesta 404 de los 4 webhooks** al agregar
   `markChannelDisconnected` — solo se agrega el efecto secundario, nunca se toca el contrato HTTP.

## Sistema de diseño

Sin tokens nuevos — hereda `--destructive` (banner de desconexión) y `--warning`/`--warning-fg`
(badge de automatización fallida) ya definidos por Fase 1/3. Ver el `CLAUDE.md` acumulado del repo
para los valores hex reales.

## Entorno

| Variable | Requerida desde | Secreto |
|---|---|---|
| `VAPID_PUBLIC_KEY` | paso 3 (`sendPushNotification`) | no |
| `VAPID_PRIVATE_KEY` | paso 3 | sí — nunca en el repo, nunca en el bundle de cliente |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | paso 5 (opt-in de cliente) | no — pública por diseño del protocolo VAPID |

## Reglas

| Archivo | Aplica a |
|---|---|
| `.claude/rules/push-notifications.md` | `src/lib/push/**`, `src/server/push/**`, `src/components/push/**`, `public/sw.js` |

## No negociable

1. `sendPushNotification()` nunca puede bloquear ni fallar el flujo que la llama.
2. `VAPID_PRIVATE_KEY` nunca se commitea, imprime en log, ni llega al bundle de cliente.
3. Ningún módulo fuera de `src/lib/push/send.ts` importa el SDK `web-push` directo.
4. Nunca editar a mano una migración generada por `drizzle-kit`.
5. Nunca marcar una tarea terminada con un comando de verificación en rojo — incluido el `Verify`
   **original** de la fase editada, no solo el nuevo.
6. Nunca cambiar el código/body de una respuesta HTTP ya existente de Fase 1-3 al agregar un efecto
   secundario (push) en una rama que ya corría.
