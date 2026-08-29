# Núcleo — Fase 1 + Fase 2: Comunicación y Contenido

Bandeja unificada multicanal con copiloto de IA (Fase 1) + calendario editorial, biblioteca de
medios y publicación programada multicanal (Fase 2), para pequeñas y medianas empresas.

<!-- Este archivo reemplaza por completo al CLAUDE.md de Fase 1. Es la fuente única a partir de
     aquí — Bootstrap de Fase 2 lo sobrescribe deliberadamente (cp -f), no lo fusiona. -->

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm dev` — http://localhost:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm lint:fix` |
| Unit + integration tests | `pnpm test` · un archivo: `pnpm test tests/unit/audit.test.ts` |
| E2E | `pnpm test:e2e` |
| DB migrate | `pnpm db:migrate` |
| DB generate migration | `pnpm db:generate` |
| DB seed | `pnpm db:seed` |
| DB studio | `pnpm db:studio` |
| Worker de eventos entrantes | `pnpm worker` |
| Worker de publicación (Fase 2) | `pnpm worker:publish` |
| Servicios locales up/down | `pnpm services:up` · `pnpm services:down` · `pnpm services:reset` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` debe pasar antes de marcar cualquier tarea como
hecha. `pnpm services:up` levanta Postgres + Redis + MinIO juntos (compone
`docker-compose.yml` + `docker-compose.minio.yml`).

Runtime pineado en `.nvmrc` (24.19.0). Versiones de dependencias en `pnpm-lock.yaml`.

## Stack

Next.js 16 (App Router, standalone) · TypeScript 6.0.3 · Tailwind CSS 4 · shadcn/Radix · Postgres 17 ·
Drizzle ORM · better-auth · BullMQ + ioredis · Socket.IO + adaptador Redis · @anthropic-ai/sdk ·
**MinIO (S3-compatible) + @aws-sdk/client-s3 + sharp (Fase 2)** · Docker Compose + Caddy en VPS propio.

## Architecture

**Request path (Fase 1).** Navegador → `src/app/(app)/inbox/page.tsx` (Server) →
`src/server/conversations.ts` → `src/lib/db/index.ts` → Postgres.

**Request path (Fase 2, medios).** Navegador → `POST /api/v1/media` → valida MIME real
(`src/lib/storage/validate-mime.ts`) → sube a MinIO (`src/lib/storage/s3-client.ts`) → genera
miniatura con `sharp` → inserta `media_asset`. Descarga: `GET /api/media/[key]` resuelve
`org_id` antes de hacer streaming del objeto — nunca una URL pública directa a MinIO.

**Request path (Fase 2, publicación).** `content_item` con `content_channel_target.scheduled_at`
vencido → `scripts/worker-publish.ts` (poller BullMQ) → `src/server/publishing/adapters/<canal>.ts`
→ API de publicación saliente del proveedor → actualiza `content_channel_target.status` → emite
evento realtime (`src/lib/realtime/server.ts`, mismo servidor Socket.IO de Fase 1).

**Boundaries.**

| Layer | May import from | Must never |
|---|---|---|
| `src/app/**` (rutas) | `components`, `server`, `lib` | Importar `lib/db/` directamente |
| `src/components/**` | `lib`, otros componentes | Importar `server/` o `lib/db/` |
| `src/server/**` | `lib/db`, `lib` | Importar React ni nada de `components/` |
| `src/lib/db/**` | nada interno | Importar `server/` |
| `src/lib/storage/**` | nada interno | Ser importado por `components/` — solo por `server/` |

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Schema de BD | `src/lib/db/schema.ts` — cambiar aquí, luego `pnpm db:generate && pnpm db:migrate` |
| Acceso a env | `src/lib/env.ts` — validado al boot; nunca leer `process.env` en otro lugar |
| Tokens de diseño | `src/app/globals.css` bajo `@theme` |
| Verificación de tenant | `src/server/tenancy.ts` `requirePermission()` |
| Audit log | `src/lib/audit.ts` `recordAuditEvent()` |
| Sesión de auth | `src/lib/auth.ts` — una sola `getSession()` |
| Gateway de IA | `src/lib/ai/gateway.ts` — único wrapper del SDK de Anthropic |
| Cliente S3/MinIO | `src/lib/storage/s3-client.ts` — único punto que instancia `S3Client` |
| Adaptadores de publicación | `src/server/publishing/adapters/<canal>.ts` — uno por canal |

## Code rules

1. **Un componente por archivo. Máximo 300 líneas.**
2. **Alias de path `@/` → `src/`.** Sin `../../..`.
3. **Server-first.** `"use client"` solo en la hoja que necesita estado/eventos.
4. **Sin barrel files.**
5. **Valida en el borde.** Cada route handler parsea su input con zod antes de tocar lógica de negocio.
6. **Toda mutación pasa por `requirePermission()` primero.** Sin excepciones, incluidos webhooks y
   el worker de publicación.
7. **`recordAuditEvent()` va dentro de la misma transacción que el cambio que describe.**
8. **`COPILOT_MODEL_ID` nunca se hardcodea.**
9. **Ninguna migración se edita a mano tras generarse.**
10. **Ningún objeto de MinIO se sirve por URL pública directa** — siempre vía `GET /api/media/[key]`.
11. **No agregar dependencia nueva sin razón en el mensaje de commit.**

## Design system

Tokens definidos una vez en `src/app/globals.css` bajo `@theme`.

| Role | Value | Used for |
|---|---|---|
| Primary | `#1D4ED8` (light) / `#3B82F6` (dark) | Botones primarios, links, focus ring |
| Background | `#F8FAFC` / `#0B1220` | Fondo de página |
| Surface | `#FFFFFF` / `#131B2E` | Cards, paneles, modales |
| Border | `#E2E8F0` / `#233046` | Divisores, bordes de input |
| Text | `#0F172A` / `#E2E8F0` | Cuerpo |
| Muted text | `#64748B` / `#8B98AE` | Texto secundario |
| Destructive | `#DC2626` / `#F87171` | Errores, eliminar, `content_channel_target` fallido |
| Success | `#16A34A` / `#4ADE80` | Confirmaciones, publicado |
| Warning | `#D97706` / `#FBBF24` | Estados `pending_approval` / `scheduled` (Fase 2) |

- **Type:** Inter (display/heading/body); JetBrains Mono (código).
- **Scale:** 32 / 20 / 15 / 13 px. **Spacing:** base 4px — 4,8,12,16,24,32,48,64.
- **Radius:** 8px inputs/botones, 12px cards, full avatares.
- **Motion:** 150-200ms, `ease-out`/`ease-in-out`. Solo transform y opacity.

## Environment

Ver tabla completa en el blueprint de cada fase, §10. Variables nuevas de Fase 2: `S3_ENDPOINT`,
`S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`.

`.env.example` está comprometido y se mantiene sincronizado. `.env*` con valores reales nunca lo está.

## Rules

| File | Applies to |
|---|---|
| `.claude/rules/database.md` | `src/lib/db/**`, `drizzle/**` |
| `.claude/rules/tenancy.md` | `src/server/**`, `src/app/api/**` |
| `.claude/rules/copilot.md` | `src/server/copilot/**`, `src/lib/ai/**` |
| `.claude/rules/media.md` | `src/lib/storage/**`, `src/server/media/**`, `src/app/api/media/**` |
| `.claude/rules/scheduler.md` | `src/server/publishing/**`, `scripts/worker-publish.ts` |

## Non-negotiable

1. Toda mutación llama `requirePermission()` antes de tocar datos — sin excepciones.
2. `recordAuditEvent()` va en la misma transacción que el cambio, nunca en un paso separado.
3. Nunca commitear secretos, `.env`, ni output de build.
4. Nunca editar a mano una migración generada — genera una nueva.
5. Los webhooks de canal verifican firma sobre el raw body antes de parsear el payload.
6. Ningún objeto de MinIO es públicamente accesible — siempre vía `GET /api/media/[key]`.
7. Nunca marcar una tarea hecha con un comando de gate fallando.
