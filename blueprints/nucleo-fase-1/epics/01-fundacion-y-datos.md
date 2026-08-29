# Epic 01: Fundación y datos

> Al terminar esta epic existe: el proyecto scaffoldeado y verificado, el shell visual de la app,
> el esquema completo de base de datos con 23 tablas, auth con better-auth, el guard de tenancy
> (`requirePermission`) probado con un test de aislamiento cruzado, y el audit log transaccional.
> Todo lo que las fases 2-6 de Núcleo construirán encima, sin modificarlo.

| | |
|---|---|
| **Epic id** | `01-fundacion-y-datos` |
| **Tasks** | `E1-T1` … `E1-T6` |
| **Depends on** | nothing — start here |
| **Unlocks** | `02-canales-y-bandeja` |
| **Parallel with** | nothing — es la base de todo lo demás |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16 (App Router, `output: "standalone"`) · TypeScript 6.0.3 · Tailwind CSS 4 (CSS-first,
`@theme`) · shadcn/Radix · Postgres 17 self-hosted · Drizzle ORM 0.45.2 exacto + drizzle-kit 0.31.10
exacto · better-auth 1.6.28 self-hosted · Docker Compose (VPS propio, sin Vercel).
Package manager: `pnpm`. Runtime pinned in `.nvmrc` (24.19.0). Dependency versions are in
`pnpm-lock.yaml` — read it, never guess one.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` (alias de `pnpm exec tsc --noEmit`) |
| Lint | `pnpm lint` (alias de `pnpm exec biome check .`) |
| Test (un archivo) | `pnpm test {path}` |
| E2E (un archivo) | `pnpm test:e2e {path}` |
| Migrar | `pnpm db:migrate` |
| Generar migración | `pnpm db:generate` |
| Sembrar datos | `pnpm db:seed` |
| Servicios locales | `docker compose up -d postgres redis` / `docker compose down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

Todo task de esta epic que verifica contra Postgres real necesita `docker compose up -d postgres
redis` corriendo primero. El archivo que lo define (`docker-compose.yml`) ya está en el root del
proyecto — fue copiado desde `workspace/` antes de `E1-T1` — tú no lo escribes.

## Directory subtree

Solo las partes que esta epic toca:

```
src/
  app/
    globals.css                  # tokens de diseño bajo @theme — NEW en E1-T2
    (marketing)/
      layout.tsx                 # NEW en E1-T2 — landing vacío
      page.tsx                   # NEW en E1-T2
    (auth)/
      layout.tsx                 # NEW en E1-T4
      login/page.tsx             # NEW en E1-T4
      signup/page.tsx            # NEW en E1-T4
    (app)/
      layout.tsx                 # NEW en E1-T2 — sidebar/topbar; poblado en epics futuras
    api/
      auth/[...all]/route.ts     # NEW en E1-T4 — catch-all de better-auth
  lib/
    env.ts                       # NEW en E1-T1 — validación zod de process.env, se amplía cada epic
    db/
      schema.ts                  # NEW en E1-T3 — las 23 tablas del núcleo, fuente única de verdad
      index.ts                   # NEW en E1-T3 — cliente pg + drizzle
    auth.ts                      # NEW en E1-T4 — config better-auth, getSession() único
    audit.ts                     # NEW en E1-T6 — recordAuditEvent(), único punto de escritura
  server/
    tenancy.ts                   # NEW en E1-T5 — requirePermission(), único punto de verificación
  proxy.ts                       # NEW en E1-T4 — Next.js 16 proxy (NO middleware.ts)
drizzle/                          # migraciones generadas — NEW en E1-T3, nunca editadas a mano
scripts/
  seed.ts                        # NEW en E1-T3
tests/
  unit/
    schema.test.ts               # NEW en E1-T3
    audit.test.ts                # NEW en E1-T6
  integration/
    auth.test.ts                 # NEW en E1-T4
  e2e/
    app-shell.spec.ts            # NEW en E1-T2
    tenant-isolation.spec.ts     # NEW en E1-T5
```

Everything outside this subtree is out of scope. Si una tarea parece requerir editar un archivo no
listado aquí, detente y repórtalo — significa que el límite de la epic está mal.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `user` | todos | espejo de better-auth, nunca fuente de verdad de credenciales |
| `organization` | todos | slug único inmutable tras el primer uso |
| `membership` | todos | índice único compuesto `(org_id, user_id)` |
| `role`, `permission`, `role_permission` | todos | catálogo sembrado por `scripts/seed.ts` |
| `invitation` | declarada aquí, poblada en Epic 02 (`member.invite`) | |
| `audit_event` | todos | append-only, escrita solo por `recordAuditEvent()` en la misma transacción que el cambio |

Las 23 tablas completas viven en `blueprint.md` §4 — esta epic las crea todas de una vez en
`E1-T3`, aunque solo `user`/`organization`/`membership`/`role`/`permission`/`role_permission`/
`invitation`/`audit_event` se usan activamente en esta epic. El resto (channel_connection, contact,
tag, contact_tag, conversation, message, jobs, job_dead_letters, idempotency_keys, llm_calls,
prompts, runs, steps, tool_calls, approvals) se crea aquí para que ninguna epic futura tenga que
tocar el schema base — solo lo consumen.

## Contracts

**Consumed** — nada, esta epic es la raíz del build.

**Produced** — las epics 02 y 03 dependen exactamente de estas firmas. Cambiar una las rompe:

| Export | Signature | Used by |
|---|---|---|
| `src/server/tenancy.ts` → `requirePermission` | `(session: Session, orgId: string, permissionKey: string) => Promise<void>` — lanza si falla, el handler traduce a 404 | `02-canales-y-bandeja`, `03-copiloto-y-hardening` |
| `src/lib/audit.ts` → `recordAuditEvent` | `(tx: DrizzleTx, event: { orgId, actorType, actorId, action, targetType, targetId, metadata }) => Promise<void>` | `02-canales-y-bandeja`, `03-copiloto-y-hardening` |
| `src/lib/auth.ts` → `getSession` | `(req: Request) => Promise<Session \| null>` | todas las rutas API de epics posteriores |
| `src/lib/db/index.ts` → `db` | cliente Drizzle exportado, único punto de conexión | todo módulo bajo `src/server/**` |

## Conventions that bite in this area

- El nombre del archivo de migración lo decide `drizzle-kit generate` — nunca lo inventes en código
  ni en un test.
- `env.ts` valida solo las variables requeridas hasta el step actual (ver la tabla "Required by
  step" en `blueprint.md` §10) — no agregues una validación que rompa una tarea anterior de esta
  epic.
- Todo componente bajo `src/app/(app)/**` es Server Component por defecto; `"use client"` solo en la
  hoja que necesita estado/eventos.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`,
`.claude/rules/tenancy.md`. Both sit in the project root — the builder copied them there from the
bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom.

### `E1-T1` — Scaffold project and pin toolchain

**Depends on:** nothing · **Priority:** p0

El Bootstrap de §10 del blueprint ya corrió `pnpm create next-app@latest . --ts --app --tailwind
--biome --src-dir --use-pnpm` (contra un árbol vacío — `blueprints/` se reubicó temporalmente para
permitirlo, ver §10 paso 4) y ya copió `blueprints/nucleo-fase-1/workspace/` encima (ruta completa,
no `workspace/` a secas — el cwd de todo el Bootstrap es la raíz del proyecto). `biome.json`,
`tsconfig.json`, `CLAUDE.md` y `AGENTS.md` fueron sobreescritos a propósito con el contenido real de
este blueprint (no simplemente copiados con `--ignore-existing`, porque `create-next-app` también
genera su propia versión de los cuatro — incluido un `CLAUDE.md` de una línea y un `AGENTS.md` con
reglas de Next.js, descubierto en un smoke test real), y `docker-compose.yml` llegó vía la copia
normal de `workspace/`. Esta tarea no regenera ni edita ninguno de los cuatro — continúa desde ahí:
`pnpm approve-builds --all`. Sube explícitamente `typescript@~6.0.3`, `@biomejs/biome@2.5.8`,
`vitest@4.1.10`, `@playwright/test@1.62.1`. Instala `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`,
`pg@8.23.0`, `zod@4.4.3`, `@tanstack/react-query@5.101.4`, `react-hook-form@7.85.0`,
`better-auth@1.6.28`, `socket.io@4.8.3`, `socket.io-client@4.8.3`, `@socket.io/redis-adapter@8.3.0`,
`bullmq@6.1.1`, `ioredis@5.11.1`, `pino@10.3.1`, `dotenv@17.4.2` (dependencia directa — pnpm no la
resuelve como transitiva de `drizzle-kit` para código de la app; la necesitan `drizzle.config.ts`,
`scripts/seed.ts` y `tests/setup/env.ts` en `E1-T3`). **Corre `pnpm approve-builds --all` una SEGUNDA
vez, después de este bloque de instalaciones** — `drizzle-kit`, `bullmq` e `ioredis` arrastran
dependencias transitivas con post-install scripts propios (`esbuild`, `msgpackr-extract`) que la
primera pasada no ve, porque todavía no estaban en el árbol; sin esta segunda pasada, `pnpm install
--frozen-lockfile` del Verify de esta misma tarea falla con `ERR_PNPM_IGNORED_BUILDS` — reproducido en
un smoke test real de este blueprint. Crea `.nvmrc` con `24.19.0`, fija `"packageManager":
"pnpm@11.21.0"` en `package.json`, y un workflow de CI mínimo con los pasos lint/typecheck/build.

**Files**
- `package.json` — edit: dependencias (incl. `dotenv@17.4.2`), `packageManager`, scripts (`dev`,
  `build`, `typecheck`, `lint`, `lint:fix`, `test`, `test:e2e`, `db:migrate`, `db:generate`,
  `db:seed`, `db:studio`, `worker`, `services:up`, `services:down`, `services:reset`)
- `pnpm-lock.yaml` — new (generado por install)
- `.nvmrc` — new
- `next.config.ts` — edit: `output: "standalone"`, `cacheComponents: true`
- `.github/workflows/ci.yml` — new

**Acceptance**

1. **WHEN** `pnpm install --frozen-lockfile` corre **THE SYSTEM SHALL** salir con código 0 sin
   modificar el lockfile.
2. **WHEN** `pnpm exec biome check .` corre sobre el árbol recién generado (incluyendo
   `src/app/globals.css` con el `@theme` de Tailwind v4) **THE SYSTEM SHALL** salir con código 0.
3. **WHEN** `pnpm exec tsc --noEmit` corre **THE SYSTEM SHALL** salir con código 0.
4. **WHEN** `pnpm build` corre **THE SYSTEM SHALL** salir con código 0 y producir
   `.next/standalone/`.
5. **WHEN** `docker compose -f docker-compose.yml up -d postgres redis` corre **THE SYSTEM SHALL**
   dejar ambos contenedores en estado `healthy` según su healthcheck en menos de 30s.

**Verify**

```bash
pnpm install --frozen-lockfile
pnpm exec biome check .
pnpm exec tsc --noEmit
pnpm build
test -d .next/standalone
docker compose up -d postgres redis
timeout 30 bash -c 'until [ "$(docker inspect -f "{{.State.Health.Status}}" $(docker compose ps -q postgres))" = "healthy" ]; do sleep 1; done'
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: scaffold project and pin toolchain"
git tag step-01-scaffold
```

### `E1-T2` — Design tokens and app shell

**Depends on:** E1-T1 · **Priority:** p0

Escribe los tokens de diseño en `src/app/globals.css` bajo `@theme` (Tailwind v4 CSS-first) —
paleta, tipografía, espaciado y radius de `CLAUDE.md` § Design system. Instala `next-themes` para
dark mode server-aware (cookie leída server-side, sin flash). Crea el layout de `(marketing)` vacío
(solo un placeholder — sin contenido de marketing, fuera de alcance de Fase 1) y el layout de
`(app)` con sidebar + topbar usando shadcn (`pnpm dlx shadcn@4.18.0 init --base radix
--no-monorepo`, luego `add button avatar dropdown-menu sheet`).

**Files**
- `src/app/globals.css` — edit: tokens bajo `@theme`
- `src/app/(marketing)/**` — new: `layout.tsx`, `page.tsx`
- `src/app/(app)/layout.tsx` — new
- `tests/e2e/app-shell.spec.ts` — new

**Acceptance**

1. **WHEN** `pnpm dev` arranca y se visita `/` **THE SYSTEM SHALL** responder 200 con el layout de
   marketing.
2. **WHEN** se visita `/app/inbox` sin sesión **THE SYSTEM SHALL** redirigir a
   `/login?next=/app/inbox` (protección estructural vía proxy stub — auth real llega en `E1-T4`).
3. **WHEN** el viewport es menor a 768px **THE SYSTEM SHALL** colapsar la navegación en un `Sheet`
   sin scroll horizontal.
4. **WHEN** `prefers-color-scheme: dark` está activo y no hay cookie de preferencia **THE SYSTEM
   SHALL** renderizar el tema oscuro en el HTML inicial del servidor, sin parpadeo de tema claro.

**Verify**

```bash
pnpm exec biome check . && pnpm exec tsc --noEmit
pnpm test:e2e tests/e2e/app-shell.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: design tokens and app shell"
git tag step-02-app-shell
```

### `E1-T3` — Complete database schema and first migration

**Depends on:** E1-T1 · **Priority:** p0

Escribe `src/lib/db/schema.ts` con las 23 tablas completas del núcleo de datos (ver Data model
arriba y `blueprint.md` §4 para el detalle campo por campo). Toda tabla tenant-owned lleva `org_id`
con índice y not-null; toda tabla lleva `id uuid default gen_random_uuid()` y `created_at`.
Soft-delete (`deleted_at`) solo en `contact`, `conversation`, `channel_connection`. Escribe
`src/lib/db/index.ts` (cliente `pg` + `drizzle`, falla al boot si `DATABASE_URL` falta). Escribe
`scripts/seed.ts` (catálogo de 6 `permission`, 2 `role` de sistema con su `role_permission`, org demo
en dev con password desde `SEED_ADMIN_PASSWORD`). Ambos, `drizzle.config.ts` y `scripts/seed.ts`,
empiezan con `import "dotenv/config"` (`dotenv@17.4.2`, dependencia directa instalada en `E1-T1` —
pnpm no resuelve la copia transitiva de `drizzle-kit` para código de la app; ni `drizzle-kit` ni `tsx`
cargan `.env` por su cuenta). Corre
`pnpm db:generate` para producir la primera migración — nunca inventes su nombre.

**Files**
- `src/lib/db/schema.ts` — new
- `src/lib/db/index.ts` — new
- `drizzle.config.ts` — new
- `scripts/seed.ts` — new
- `tests/unit/schema.test.ts` — new

**Acceptance**

1. **WHEN** `pnpm db:migrate` corre contra una base vacía **THE SYSTEM SHALL** crear exactamente las
   23 tablas (`user`, `organization`, `membership`, `role`, `permission`, `role_permission`,
   `invitation`, `audit_event`, `channel_connection`, `contact`, `tag`, `contact_tag`,
   `conversation`, `message`, `jobs`, `job_dead_letters`, `idempotency_keys`, `llm_calls`,
   `prompts`, `runs`, `steps`, `tool_calls`, `approvals`) — ni una menos ni una de más — cada una
   verificable con `psql -c '\d <tabla>'` saliendo con código 0.
2. **WHEN** `pnpm db:seed` corre **THE SYSTEM SHALL** insertar 6 filas en `permission` y 2 filas en
   `role` (`owner`, `member`) con sus `role_permission` correspondientes.
3. **WHEN** se intenta insertar una `membership` con `(org_id, user_id)` duplicado **THE SYSTEM
   SHALL** rechazar la escritura por el índice único.
4. **WHEN** `DATABASE_URL` está ausente al importar `src/lib/db/index.ts` **THE SYSTEM SHALL**
   fallar al boot con un error nombrado, no en el primer query.

**Verify**

```bash
set -a && . ./.env && set +a
pnpm db:migrate
pnpm test tests/unit/schema.test.ts
pnpm db:seed
test "$(psql "$DATABASE_URL" -tAc 'select count(*) from permission;')" = "6"
test "$(psql "$DATABASE_URL" -tAc 'select count(*) from role;')" = "2"
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: complete database schema and first migration"
git tag step-03-schema
```

### `E1-T4` — Auth with better-auth

**Depends on:** E1-T3 · **Priority:** p0

Configura `src/lib/auth.ts` (better-auth con adaptador Drizzle, `emailAndPassword` habilitado, hook
`after.signUp` que crea `organization` + `membership` owner + siembra el catálogo de permisos si
está vacío). Crea `src/app/api/auth/[...all]/route.ts`. Crea `src/proxy.ts` (Next.js 16 — **NO**
`middleware.ts`, renombrado en 16.0.0) que redirige a `/login` si no hay sesión en `/app/*`. Crea
`src/app/(auth)/login/page.tsx` y `signup/page.tsx` con `react-hook-form` + resolver zod.

**Files**
- `src/lib/auth.ts` — new
- `src/app/api/auth/[...all]/route.ts` — new
- `src/proxy.ts` — new
- `src/app/(auth)/**` — new: `layout.tsx`, `login/page.tsx`, `signup/page.tsx`
- `tests/integration/auth.test.ts` — new

**Acceptance**

1. **WHEN** un visitante envía signup con email válido y nuevo **THE SYSTEM SHALL** crear un
   `user`, una `organization` con slug único, una `membership` con rol `owner`, y redirigir a
   `/app/inbox`.
2. **WHEN** un usuario envía login con credenciales correctas **THE SYSTEM SHALL** establecer una
   cookie de sesión `HttpOnly` y redirigir a `/app/inbox`.
3. **WHEN** una request sin sesión llega a `/app/inbox` **THE SYSTEM SHALL** redirigir a
   `/login?next=/app/inbox` vía `src/proxy.ts`.
4. **WHEN** se envía signup con un email ya registrado **THE SYSTEM SHALL** responder con error de
   validación sin crear una segunda organización.
5. **WHEN** el usuario hace sign-out **THE SYSTEM SHALL** invalidar la sesión server-side.

**Verify**

```bash
pnpm test tests/integration/auth.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: auth with better-auth"
git tag step-04-auth
```

### `E1-T5` — Tenancy guard and isolation tests

**Depends on:** E1-T4 · **Priority:** p0

Escribe `src/server/tenancy.ts` con `requirePermission(session, orgId, permissionKey)` — la única
función que toda mutación/lectura sensible de las epics futuras llamará. Lanza un error tipado que
cada route handler traduce a **404** (nunca 403 — cruzar el límite de tenant no debe revelar que el
recurso existe en otra organización). Escribe `tests/e2e/tenant-isolation.spec.ts`: crea dos
organizaciones A y B con un usuario cada una, intenta que el usuario de A acceda a un recurso de B
por ID directo, verifica 404.

**Files**
- `src/server/tenancy.ts` — new
- `tests/e2e/tenant-isolation.spec.ts` — new

**Acceptance**

1. **WHEN** un usuario con membership activa en la org del recurso y el permiso requerido llama
   `requirePermission` **THE SYSTEM SHALL** retornar sin lanzar.
2. **WHEN** un usuario sin membership en la org del recurso llama `requirePermission` **THE SYSTEM
   SHALL** lanzar un error que el handler traduce a 404.
3. **WHEN** un usuario con membership en la org pero sin el permiso requerido llama
   `requirePermission` **THE SYSTEM SHALL** lanzar el mismo error tipado, resultando en 404 — nunca
   403.
4. **WHEN** el test E2E de aislamiento intenta acceder a un recurso de la organización B usando la
   sesión de un usuario de la organización A **THE SYSTEM SHALL** responder 404 en cada endpoint
   probado.

**Verify**

```bash
pnpm test:e2e tests/e2e/tenant-isolation.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: tenancy guard and isolation tests"
git tag step-05-tenancy
```

### `E1-T6` — Audit log written in the same transaction

**Depends on:** E1-T5 · **Priority:** p0

Escribe `src/lib/audit.ts` con `recordAuditEvent(tx, { orgId, actorType, actorId, action,
targetType, targetId, metadata })` — recibe la transacción de Drizzle activa y escribe el
`audit_event` en la **misma transacción** que el cambio que describe, nunca después. Escribe
`tests/unit/audit.test.ts` que verifica que si la transacción hace rollback, el `audit_event`
tampoco persiste.

**Files**
- `src/lib/audit.ts` — new
- `tests/unit/audit.test.ts` — new

**Acceptance**

1. **WHEN** `recordAuditEvent` se llama dentro de una transacción que luego hace commit **THE
   SYSTEM SHALL** persistir la fila en `audit_event`.
2. **WHEN** la transacción que contiene la llamada a `recordAuditEvent` hace rollback **THE SYSTEM
   SHALL** dejar `audit_event` sin la fila — cero filas huérfanas.

`audit_event` es append-only por convención de código en esta tarea — solo `recordAuditEvent` debe
escribir en ella. El enforcement duro a nivel de base de datos (grant de rol que rechaza UPDATE/DELETE
directo) se aplica y se verifica en `E3-T5`, no aquí.

**Verify**

```bash
pnpm test tests/unit/audit.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: audit log written in the same transaction"
git tag step-06-audit
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** un usuario nuevo se registra, inicia sesión, y un segundo usuario de otra organización
   intenta acceder a un recurso del primero por ID directo **THE SYSTEM SHALL** completar el
   registro con éxito y responder 404 al segundo usuario en cada endpoint probado.
2. **WHEN** cualquier mutación bajo `src/server/**` escribe un `audit_event` **THE SYSTEM SHALL**
   hacerlo dentro de la misma transacción que la mutación, verificable porque un rollback deja cero
   filas huérfanas en `audit_event`.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/tenant-isolation.spec.ts tests/e2e/app-shell.spec.ts
```

Run from the project root. Ambos criterios son decidibles por estos comandos.

## Pitfalls

- **Migración editada a mano.** `drizzle-kit generate` decide el nombre del archivo — nunca lo
  inventes ni lo edites después de aplicarlo. Corrige con una migración nueva.
- **`requirePermission` traduciendo a 403 en vez de 404.** Es una decisión de seguridad deliberada
  (§8 de `blueprint.md`) — un 403 revela que el recurso existe en otra organización.
- **Escribir el audit log fuera de la transacción de la mutación.** Si el cambio hace rollback y el
  audit ya se persistió, el log miente sobre lo que realmente pasó.
- **`src/proxy.ts` como única capa de protección.** El proxy protege por conveniencia de UX; cada
  Server Function y cada route handler debe volver a verificar con `requirePermission` — el proxy no
  cubre Server Functions.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** — `step-01-scaffold`
      through `step-06-audit`, one per task. `git tag -l 'step-0[1-6]-*'` lists them.
- [ ] Gate command passes clean, run from the project root.
- [ ] Every "Produced" contract above exists with the stated signature.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` updated if this epic added a variable — `DATABASE_URL`, `TEST_DATABASE_URL`,
      `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` are already there from `workspace/`.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
