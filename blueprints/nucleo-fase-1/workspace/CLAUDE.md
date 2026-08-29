# Núcleo — Fase 1: Centro de Comunicación

Bandeja unificada multicanal con copiloto de IA contextual, para pequeñas y medianas empresas.

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
| Worker | `pnpm worker` |
| Servicios locales up/down | `pnpm services:up` · `pnpm services:down` · `pnpm services:reset` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` debe pasar antes de marcar cualquier tarea como
hecha.

Runtime pineado en `.nvmrc` (24.19.0). Versiones de dependencias en `pnpm-lock.yaml` — léelo, nunca
adivines una versión.

## Stack

Next.js 16 (App Router, standalone) · TypeScript 6.0.3 · Tailwind CSS 4 · shadcn/Radix · Postgres 17 ·
Drizzle ORM · better-auth · BullMQ + ioredis · Socket.IO + adaptador Redis · @anthropic-ai/sdk · Docker
Compose + Caddy en VPS propio.

## Architecture

**Request path.** Navegador → `src/app/(app)/inbox/page.tsx` (Server) → `src/server/conversations.ts`
→ `src/lib/db/index.ts` → Postgres. Mutaciones desde rutas API en `src/app/api/**/route.ts`, cada una
llamando primero `src/server/tenancy.ts` `requirePermission()`.

Webhooks entrantes: `src/app/api/webhooks/<canal>/route.ts` → `src/server/channels/<canal>.ts`
(verifica firma, normaliza) → encola en `src/lib/queue/index.ts` → `scripts/worker.ts` procesa → llama
`src/server/conversations.ts` / `src/server/contacts.ts` → emite evento vía `src/lib/realtime/server.ts`.

**Boundaries.**

| Layer | May import from | Must never |
|---|---|---|
| `src/app/**` (rutas) | `components`, `server`, `lib` | Importar `lib/db/` directamente |
| `src/components/**` | `lib`, otros componentes | Importar `server/` o `lib/db/` |
| `src/server/**` | `lib/db`, `lib` | Importar React ni nada de `components/` |
| `src/lib/db/**` | nada interno | Importar `server/` |

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Schema de BD | `src/lib/db/schema.ts` — cambiar aquí, luego `pnpm db:generate && pnpm db:migrate` |
| Acceso a env | `src/lib/env.ts` — validado al boot; nunca leer `process.env` en otro lugar |
| Tokens de diseño | `src/app/globals.css` bajo `@theme` — sin hex/px sueltos en componentes |
| Verificación de tenant | `src/server/tenancy.ts` `requirePermission()` — toda mutación/lectura sensible lo llama primero |
| Audit log | `src/lib/audit.ts` `recordAuditEvent()` — único punto de escritura a `audit_event`, misma transacción que el cambio |
| Sesión de auth | `src/lib/auth.ts` — una sola `getSession()`, usada en todas partes |
| Gateway de IA | `src/lib/ai/gateway.ts` — único wrapper del SDK de Anthropic |

## Code rules

1. **Un componente por archivo. Máximo 300 líneas.** Más largo significa que debe dividirse.
2. **Alias de path `@/` → `src/`.** Sin `../../..`.
3. **Server-first.** Componentes son Server Components por defecto. `"use client"` solo en la hoja que
   necesita estado/eventos, nunca en un layout.
4. **Sin barrel files.** Importa del módulo fuente directamente.
5. **Valida en el borde.** Cada route handler parsea su input con zod antes de tocar lógica de negocio.
6. **Toda mutación pasa por `requirePermission()` primero.** Sin excepciones, incluidos los webhooks
   (que verifican firma en vez de sesión, pero igual resuelven la org antes de escribir).
7. **`recordAuditEvent()` va dentro de la misma transacción que el cambio que describe.** Nunca
   después.
8. **`COPILOT_MODEL_ID` nunca se hardcodea.** Siempre `env.COPILOT_MODEL_ID`.
9. **Ninguna migración se edita a mano tras generarse.** Corrige con una migración nueva.
10. **No agregar dependencia nueva sin razón en el mensaje de commit.**

## Design system

Tokens definidos una vez en `src/app/globals.css` bajo `@theme`. Componentes referencian nombres de
token únicamente.

| Role | Value | Used for |
|---|---|---|
| Primary | `#1D4ED8` (light) / `#3B82F6` (dark) | Botones primarios, links, focus ring |
| Background | `#F8FAFC` / `#0B1220` | Fondo de página |
| Surface | `#FFFFFF` / `#131B2E` | Cards, paneles, modales |
| Border | `#E2E8F0` / `#233046` | Divisores, bordes de input |
| Text | `#0F172A` / `#E2E8F0` | Cuerpo |
| Muted text | `#64748B` / `#8B98AE` | Texto secundario |
| Destructive | `#DC2626` / `#F87171` | Errores, eliminar |
| Success | `#16A34A` / `#4ADE80` | Confirmaciones |

- **Type:** Inter para display/heading/body; JetBrains Mono para código.
- **Scale:** 32px display / 20px heading / 15px body / 13px mono.
- **Spacing:** base 4px — 4, 8, 12, 16, 24, 32, 48, 64. Sin valores arbitrarios.
- **Radius:** 8px inputs/botones, 12px cards, full avatares.
- **Motion:** 150-200ms, `ease-out`/`ease-in-out`. Solo transform y opacity. Respeta
  `prefers-reduced-motion`.
- **Layout:** ancho máximo 1280px; breakpoints sm/md/lg/xl.

## Environment

| Variable | Required | Used by | Source |
|---|---|---|---|
| `DATABASE_URL` | yes | `src/lib/db/index.ts` | `docker-compose.yml` local |
| `REDIS_URL` | yes | `src/lib/queue/connection.ts`, `src/lib/realtime/server.ts` | `docker-compose.yml` local |
| `BETTER_AUTH_SECRET` | yes | `src/lib/auth.ts` | `openssl rand -hex 32` |
| `WHATSAPP_APP_SECRET`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET`, `TIKTOK_APP_SECRET` | yes desde step 8 | `src/server/channels/*.ts` | panel de developer de cada plataforma |
| `SMTP_URL` | yes desde step 7 | `src/server/members.ts` | proveedor SMTP del equipo |
| `ANTHROPIC_API_KEY` | yes desde step 13 | `src/lib/ai/gateway.ts` | consola de Anthropic |
| `COPILOT_MODEL_ID` | yes desde step 13 | `src/lib/ai/gateway.ts` | `claude-sonnet-5` por defecto |

`.env.example` está comprometido y se mantiene sincronizado. `.env*` con valores reales nunca lo está.

## Rules

Convenciones diferidas — lee el archivo correspondiente antes de editar esa área:

| File | Applies to |
|---|---|
| `.claude/rules/database.md` | `src/lib/db/**`, `drizzle/**` |
| `.claude/rules/tenancy.md` | `src/server/**`, `src/app/api/**` |
| `.claude/rules/copilot.md` | `src/server/copilot/**`, `src/lib/ai/**` |

## Non-negotiable

1. Toda mutación llama `requirePermission()` antes de tocar datos — sin excepciones.
2. `recordAuditEvent()` va en la misma transacción que el cambio, nunca en un paso separado.
3. Nunca commitear secretos, `.env`, ni output de build.
4. Nunca editar a mano una migración generada — genera una nueva.
5. Los webhooks de canal verifican firma sobre el raw body antes de parsear el payload.
6. Nunca marcar una tarea hecha con un comando de gate fallando.
