# Epic 03: Copiloto y hardening

> Al terminar esta epic existe: el gateway de IA que envuelve el SDK de Anthropic, el copiloto
> contextual con el patrón runs/steps/tool_calls/approvals y aprobación en el primer uso, la
> eliminación de cuenta con exportación de datos, hardening (rate limiting, logging estructurado,
> error boundaries), el pipeline de deploy en VPS propio, y la verificación E2E completa que cierra
> la Fase 1.

| | |
|---|---|
| **Epic id** | `03-copiloto-y-hardening` |
| **Tasks** | `E3-T1` … `E3-T6` |
| **Depends on** | `02-canales-y-bandeja` |
| **Unlocks** | nada — es la última epic de Fase 1 |
| **Parallel with** | nothing — cada tarea depende de la anterior |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Next.js 16 (App Router, `output: "standalone"`) · TypeScript 6.0.3 · `@anthropic-ai/sdk` (ver
Environment abajo — el model ID se obtiene del skill `claude-api`, nunca de memoria) · pino 10.3.1 ·
Docker Compose + Caddy en VPS propio. Package manager: `pnpm`. Runtime pinned in `.nvmrc`.
Dependency versions are in `pnpm-lock.yaml` — read it, never guess one.

| Task | Command |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {path}` |
| E2E (un archivo) | `pnpm test:e2e {path}` |
| Servicios locales | `docker compose up -d postgres redis` / `docker compose down` |
| Smoke test post-deploy | `bash scripts/smoke-test.sh` (lo crea `E3-T5`) |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` passes before any task here is marked done.

El gateway de IA (`E3-T1`) y el copiloto (`E3-T2`) se prueban con el cliente de Anthropic
**mockeado** — ninguna llamada real de red en el gate automatizado. `COPILOT_MODEL_ID` nunca se
hardcodea en el código; siempre `env.COPILOT_MODEL_ID`.

## Directory subtree

Solo las partes que esta epic toca:

```
src/
  lib/
    ai/
      gateway.ts                    # NEW en E3-T1 — único módulo que importa @anthropic-ai/sdk
    logger.ts                       # NEW en E3-T4
  server/
    copilot/
      tools.ts                      # NEW en E3-T2
      runs.ts                       # NEW en E3-T2
  app/
    api/
      copilot/
        route.ts                    # NEW en E3-T2
        tool-calls/[id]/approve/route.ts  # NEW en E3-T2
      v1/account/route.ts           # NEW en E3-T3
    (app)/
      settings/profile/page.tsx     # NEW en E3-T3
      error.tsx                     # NEW en E3-T4
    (auth)/
      error.tsx                     # NEW en E3-T4
  components/
    copilot/
      copilot-panel.tsx             # NEW en E3-T2
next.config.ts                        # edit en E3-T4 — headers() (CSP, HSTS, X-Content-Type-Options, Referrer-Policy)
Dockerfile                            # NEW en E3-T5
docker-compose.prod.yml              # NEW en E3-T5
Caddyfile                            # NEW en E3-T5
scripts/
  smoke-test.sh                     # NEW en E3-T5
tests/
  unit/
    gateway.test.ts                 # NEW en E3-T1
  e2e/
    copilot.spec.ts                 # NEW en E3-T2
    a11y.spec.ts                    # NEW en E3-T4
  integration/
    account-deletion.test.ts        # NEW en E3-T3
    rate-limit.test.ts              # NEW en E3-T4
.github/workflows/ci.yml             # edit en E3-T6 — gate final consolidado
```

Everything outside this subtree is out of scope. Si una tarea parece requerir editar un archivo no
listado aquí, detente y repórtalo.

## Data model touched here

| Entity | Fields this epic adds or reads | Notes |
|---|---|---|
| `llm_calls`, `prompts` | todos | poblados por el gateway (`E3-T1`) |
| `runs`, `steps`, `tool_calls`, `approvals` | todos | patrón completo, poblado por `E3-T2` |

Ninguna tabla nueva — todas ya existen desde `01-fundacion-y-datos` `E1-T3`.

## Contracts

**Consumed** — ya existe, no lo reconstruyas:

| From | Interface | Guarantee |
|---|---|---|
| `01-fundacion-y-datos` | `src/server/tenancy.ts` → `requirePermission` | lanza si falla; el handler traduce a 404 |
| `01-fundacion-y-datos` | `src/lib/audit.ts` → `recordAuditEvent` | misma transacción que la mutación |
| `02-canales-y-bandeja` | `src/server/conversations.ts` → lectura de conversación | el copiloto lee el contexto de la conversación abierta (últimos N mensajes) |
| `02-canales-y-bandeja` | `src/lib/realtime/server.ts` → `emitConversationUpdate` | el copiloto emite cuando ejecuta una acción visible en la bandeja |

**Produced** — nada consume esto después; es la última epic de Fase 1. El único contrato hacia
afuera es hacia el propio equipo de operación: `bash scripts/smoke-test.sh` como el comando post-
deploy estándar (documentado en `CLAUDE.md`).

## Conventions that bite in this area

- `src/lib/ai/gateway.ts` es el **único** módulo que importa `@anthropic-ai/sdk`. Ningún otro
  archivo lo importa directamente — todo pasa por `streamCopilotTurn`.
- El model ID nunca se hardcodea — siempre `env.COPILOT_MODEL_ID`. Antes de escribir cualquier ID de
  modelo, precio o parámetro de API, invoca el skill `claude-api` y copia de ahí — nunca de memoria.
- Cada tool call marcada `requiresApprovalFirstUse: true` cuyo `tool_name` la organización nunca ha
  aprobado antes se detiene en estado `pending` con una fila en `approvals` sin decisión — nunca se
  ejecuta antes de la aprobación. Una vez aprobado un tipo de tool call, las siguientes ejecuciones
  no vuelven a pedir aprobación.
- Cada `tool_calls` lleva un `idempotency_key` único que previene doble ejecución en reintentos.
- El catálogo de tools de Fase 1 nunca incluye una acción que envíe contenido a un canal externo —
  eso requiere rediseñar el flujo de aprobación, fuera de alcance.
- Las migraciones corren como paso explícito de deploy (`E3-T5`), nunca en el boot del contenedor de
  la app — instancias concurrentes correrían la migración en carrera.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/copilot.md`,
`.claude/rules/tenancy.md`. Both sit in the project root — the builder copied them there from the
bundle's `workspace/` before task one.

---

## Tasks

Listed in the same order as `tasks.json`. That order is the build order — work top to bottom.

### `E3-T1` — AI gateway over the Anthropic SDK

**Depends on:** E2-T6 · **Priority:** p0

Instala `pnpm add @anthropic-ai/sdk@0.117.1` (versión pineada en `blueprint.md` §11 — este task es
el único punto de instalación). Escribe `src/lib/ai/gateway.ts` — único módulo que envuelve
`@anthropic-ai/sdk`. Expone `streamCopilotTurn({ systemPrompt, messages, tools })` usando
`client.messages.stream(...)`. El model ID se lee de `env.COPILOT_MODEL_ID` (nunca hardcodeado — el
valor por defecto vive en `.env.example`; confirma el ID actual con el skill `claude-api` antes de
escribirlo). Maneja `stop_reason: "refusal"` retornando un resultado tipado en vez de lanzar.
Timeout de 30s con reintento único con backoff.

**Files**
- `package.json` — edit: agrega `@anthropic-ai/sdk@0.117.1`
- `src/lib/ai/gateway.ts` — new
- `tests/unit/gateway.test.ts` — new

**Acceptance**

1. **WHEN** `streamCopilotTurn` recibe una conversación válida **THE SYSTEM SHALL** transmitir los
   deltas de texto vía el iterador retornado hasta `stop_reason: "end_turn"` o `"tool_use"`.
2. **WHEN** la API responde `stop_reason: "refusal"` **THE SYSTEM SHALL** retornar un resultado
   tipado `{ type: "refusal" }` sin lanzar una excepción no controlada.
3. **WHEN** `COPILOT_MODEL_ID` no está definido en el entorno al importar el módulo **THE SYSTEM
   SHALL** fallar al boot con un error nombrado.
4. **WHEN** la llamada a la API excede 30 segundos sin respuesta **THE SYSTEM SHALL** abortar y
   reintentar exactamente una vez antes de propagar el error al llamador.

**Verify**

```bash
pnpm test tests/unit/gateway.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: ai gateway over the anthropic sdk"
git tag step-13-ai-gateway
```

### `E3-T2` — Contextual copilot with first-use approval

**Depends on:** E3-T1 · **Priority:** p0

Escribe `src/server/copilot/tools.ts` — catálogo de tool calls de bajo riesgo de esta fase:
`tag_conversation(conversationId, tagName)` y `assign_conversation(conversationId, userId)`, cada
una con su `permission_key` y marcada `requiresApprovalFirstUse: true`. Escribe
`src/server/copilot/runs.ts` — orquesta runs/steps/tool_calls/approvals: crea el `runs`, llama
`streamCopilotTurn` con el contexto de la conversación abierta, persiste cada `steps`/`tool_calls`,
y antes de ejecutar una `tool_call` marcada para aprobación cuya organización nunca la ha aprobado
antes, la deja en `pending` y crea una fila en `approvals` sin decisión. Crea
`src/app/api/copilot/route.ts` (POST, streaming SSE) y
`src/app/api/copilot/tool-calls/[id]/approve/route.ts`. Crea
`src/components/copilot/copilot-panel.tsx` (chat lateral con streaming, diálogo de aprobación
inline).

**Files**
- `src/server/copilot/tools.ts` — new
- `src/server/copilot/runs.ts` — new
- `src/app/api/copilot/**` — new: `route.ts`, `tool-calls/[id]/approve/route.ts`
- `src/components/copilot/copilot-panel.tsx` — new
- `tests/e2e/copilot.spec.ts` — new

**Acceptance**

1. **WHEN** el usuario pregunta algo sobre la conversación abierta **THE SYSTEM SHALL** responder
   con contexto de los mensajes de esa conversación, transmitido vía streaming al panel.
2. **WHEN** el copiloto invoca `tag_conversation` por primera vez en una organización **THE SYSTEM
   SHALL** crear una fila en `approvals` sin decisión y detener el run en estado `pending`, sin
   ejecutar la mutación.
3. **WHEN** un usuario con permiso aprueba esa `tool_call` pendiente **THE SYSTEM SHALL** ejecutar
   la mutación, registrar el `audit_event` correspondiente, y continuar el run.
4. **WHEN** la misma organización invoca `tag_conversation` una segunda vez tras la primera
   aprobación **THE SYSTEM SHALL** ejecutarla directamente sin volver a pedir aprobación.
5. **WHEN** el copiloto intenta invocar una acción de envío a un canal externo **THE SYSTEM SHALL**
   rechazarla — el catálogo de tools de Fase 1 no incluye ninguna acción de canal externo.

**Verify**

```bash
pnpm test:e2e tests/e2e/copilot.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: contextual copilot with first-use approval"
git tag step-14-copilot
```

### `E3-T3` — Account deletion with data export

**Depends on:** E3-T2 · **Priority:** p1

Crea `src/app/(app)/settings/profile/page.tsx` (edición de nombre/avatar, más el flujo de
eliminación). Crea `src/app/api/v1/account/route.ts` (GET exporta un JSON con las conversaciones
asignadas y mensajes enviados por el usuario; DELETE ejecuta el borrado — bloquea si el usuario es
el único `owner` de alguna organización).

**Files**
- `src/app/(app)/settings/profile/page.tsx` — new
- `src/app/api/v1/account/route.ts` — new
- `tests/integration/account-deletion.test.ts` — new

**Acceptance**

1. **WHEN** un usuario solicita exportar sus datos **THE SYSTEM SHALL** retornar un JSON con sus
   conversaciones asignadas y mensajes marcados `sender_type='agent'` que él envió.
2. **WHEN** un usuario que es el único owner de una organización solicita eliminar su cuenta **THE
   SYSTEM SHALL** rechazar con un mensaje indicando que debe transferir la propiedad primero, sin
   borrar nada.
3. **WHEN** un usuario que no es único owner de ninguna organización confirma la eliminación **THE
   SYSTEM SHALL** borrar su `user` row y sus `membership`, dejando sus mensajes históricos intactos.

**Verify**

```bash
pnpm test tests/integration/account-deletion.test.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: account deletion with data export"
git tag step-15-account-deletion
```

### `E3-T4` — Hardening: rate limiting, logging, error boundaries

**Depends on:** E3-T3 · **Priority:** p0

Escribe `src/lib/logger.ts` (pino, salida JSON estructurada a stdout, cada línea con `actorId`,
`orgId`, `requestId` cuando aplican). Reemplaza `console.log` residual de tareas anteriores por el
logger. Rate limiting sobre `/api/auth/*` y `/api/webhooks/*` usando el mismo Redis (contador simple
con TTL, sin dependencia nueva). Error boundaries en `src/app/(app)/error.tsx` y
`src/app/(auth)/error.tsx`. Edita `next.config.ts` (creado en `E1-T1`) agregando `headers()` con CSP,
HSTS, X-Content-Type-Options y Referrer-Policy. Instala `@axe-core/playwright@4.13.0` y escribe
`tests/e2e/a11y.spec.ts` (corre axe sobre `/login`, `/app/inbox`, `/app/settings/members`).

**Files**
- `src/lib/logger.ts` — new
- `src/app/**/error.tsx` — new (`(app)/error.tsx` y `(auth)/error.tsx`)
- `next.config.ts` — edit: `headers()`
- `tests/integration/rate-limit.test.ts` — new
- `tests/e2e/a11y.spec.ts` — new

**Acceptance**

1. **WHEN** se hacen 6 intentos de login fallidos desde la misma IP en menos de un minuto **THE
   SYSTEM SHALL** rechazar el sexto con 429 antes de evaluar las credenciales.
2. **WHEN** cualquier ruta de API loggea una línea **THE SYSTEM SHALL** emitirla como JSON válido en
   stdout con al menos los campos `level`, `msg`, `time`.
3. **WHEN** un Server Component de `(app)` lanza una excepción no controlada **THE SYSTEM SHALL**
   renderizar el `error.tsx` de ese segmento en vez de una página en blanco.
4. **WHEN** `pnpm test:e2e tests/e2e/a11y.spec.ts` corre contra `/login`, `/app/inbox` y
   `/app/settings/members` **THE SYSTEM SHALL** reportar 0 violaciones de axe.

**Verify**

```bash
pnpm test tests/integration/rate-limit.test.ts
pnpm test:e2e tests/e2e/a11y.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: hardening — rate limiting, logging, error boundaries"
git tag step-16-hardening
```

### `E3-T5` — Deploy pipeline: Docker Compose + Caddy

**Depends on:** E3-T4 · **Priority:** p0

Escribe `Dockerfile` (multi-stage: build con pnpm, runtime Node 24 slim copiando
`.next/standalone/`, `.next/static/` y `public/` — ver `blueprint.md` §9 Step 17 para el contenido
completo). Escribe `docker-compose.prod.yml` (app + postgres + redis + worker + Caddy — el servicio
`app` construye desde ese `Dockerfile`). Escribe `Caddyfile` con TLS automático configurado pero
**sin dominio público asignado** — Caddy sirve sobre la IP/puerto del VPS en esta fase. Escribe
`scripts/smoke-test.sh` que, tras un deploy, verifica `/api/health` y que las migraciones están al
día. Migraciones como paso de deploy explícito y gateado (nunca en el boot del contenedor de la
app). Aplica el grant de BD que restringe UPDATE/DELETE directo sobre `audit_event` a nivel de rol
de aplicación (diseñado en `E1-T6`, enforced aquí).

**Files**
- `Dockerfile` — new
- `docker-compose.prod.yml` — new
- `Caddyfile` — new
- `scripts/smoke-test.sh` — new

**Acceptance**

1. **WHEN** `docker compose -f docker-compose.prod.yml up -d` corre en el VPS **THE SYSTEM SHALL**
   levantar los 5 servicios (app, worker, postgres, redis, caddy) con la app healthy en menos de 60
   segundos.
2. **WHEN** el paso de deploy ejecuta las migraciones **THE SYSTEM SHALL** aplicarlas antes de que
   el contenedor de la app empiece a aceptar tráfico — nunca en paralelo.
3. **WHEN** `scripts/smoke-test.sh` corre tras un deploy exitoso **THE SYSTEM SHALL** salir con 0
   tras verificar `GET /api/health` retorna `{ data: { ok: true, migrationsUpToDate: true } }`.
4. **WHEN** se intenta un UPDATE o DELETE directo sobre `audit_event` con el rol de aplicación de
   producción **THE SYSTEM SHALL** ser rechazado por el grant de BD aplicado en esta tarea (diseñado
   en `E1-T6`).

**Verify**

```bash
bash scripts/smoke-test.sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U nucleo_app -d nucleo -c "UPDATE audit_event SET action = action WHERE false;" 2>/dev/null; test $? -ne 0
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T5: deploy pipeline — docker compose + caddy"
git tag step-17-deploy
```

### `E3-T6` — Full local end-to-end verification

**Depends on:** E3-T5 · **Priority:** p0

Consolida el gate completo de CI: lint + typecheck + unit + integration + los tres E2E críticos
(aislamiento de tenant, auth, bandeja en vivo). Esta tarea no crea funcionalidad nueva — cierra la
fase verificando que el conjunto completo de gates de las 17 tareas anteriores sigue pasando junto,
en una corrida limpia.

**Files**
- `.github/workflows/ci.yml` — edit: gate final consolidado

**Acceptance**

1. **WHEN** el gate completo de CI corre sobre un checkout limpio **THE SYSTEM SHALL** reportar 0
   fallos en lint, typecheck, tests unitarios, tests de integración, y los 3 suites E2E.
2. **WHEN** se re-ejecuta el bloque de Bootstrap sobre un árbol ya bootstrapeado **THE SYSTEM
   SHALL** salir con 0 sin revertir `package.json` ni ningún archivo emitido bajo `workspace/`.

El conteo de 18 tags de checkpoint se verifica en §20.1 del blueprint, después del tag de esta misma
tarea — no aquí, porque en este punto el tag 18 todavía no existe.

**Verify**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T6: full local end-to-end verification — fase 1 cerrada"
git tag step-18-verification
```

---

## Epic acceptance

The epic is done when every task is `done` **and**:

1. **WHEN** un usuario ejecuta una acción del copiloto de bajo riesgo por primera vez en su
   organización, la aprueba, y la ejecuta una segunda vez **THE SYSTEM SHALL** pedir aprobación solo
   la primera vez y ejecutar directamente la segunda, con un `audit_event` registrado en ambos casos
   de ejecución real.
2. **WHEN** el checkout limpio completo corre el gate de CI **THE SYSTEM SHALL** reportar 0 fallos y
   exactamente 18 tags de checkpoint en git, cerrando la Fase 1.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
test "$(git tag -l 'step-*' | wc -l)" -eq 18
```

Run from the project root. Ambos criterios son decidibles por estos comandos.

## Pitfalls

- **Importar `@anthropic-ai/sdk` fuera de `src/lib/ai/gateway.ts`.** Rompe el punto único de
  control sobre streaming, timeouts y manejo de refusal.
- **Hardcodear un model ID.** Siempre `env.COPILOT_MODEL_ID` — un ID hardcodeado sobrevive a un
  cambio de configuración y produce llamadas al modelo equivocado en silencio.
- **Saltarse la aprobación en el primer uso de una tool call.** Es la salvaguarda central del
  copiloto acotado de Fase 1 — nunca se ejecuta una acción marcada `requiresApprovalFirstUse` sin
  una fila `approvals` decidida primero.
- **Correr migraciones en el boot del contenedor de la app.** Con múltiples instancias, correrían en
  carrera — el deploy las ejecuta como paso explícito y gateado antes de aceptar tráfico.
- **Asignar un dominio público en `Caddyfile`.** Fuera de alcance de Fase 1 (ver Non-Goals de
  `blueprint.md` §1) — Caddy sirve sobre la IP/puerto del VPS hasta Fase 2.

## Before moving on

- [ ] Every task in this epic is `done` in `tasks.json` — no task left `in_progress`.
- [ ] Every `verify` command of every task in this epic passed, not just the first one.
- [ ] No `verify` command was edited, and none was skipped because a file it names did not exist.
- [ ] **Every task in this epic has its `checkpoint` tag in version control** —
      `step-13-ai-gateway` through `step-18-verification`. `git tag -l 'step-1[3-8]-*'` lists them.
- [ ] Gate command passes clean, run from the project root.
- [ ] No file outside the subtree was modified.
- [ ] `.env.example` updated if this epic added a variable — `ANTHROPIC_API_KEY`,
      `COPILOT_MODEL_ID` are already there from `workspace/`.
- [ ] One commit per task, each prefixed with its task id, each followed by its checkpoint tag.
- [ ] `git tag -l 'step-*'` en todo el repositorio lista exactamente 18 tags — la Fase 1 está
      cerrada.
