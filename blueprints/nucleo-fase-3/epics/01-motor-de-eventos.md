# Epic 01: Motor de eventos

> Después de este épico, Fase 1 y Fase 2 emiten eventos internos de forma segura (fire-and-forget,
> sin riesgo de romper sus flujos) y existe un catálogo de acciones base con permisos.

| | |
|---|---|
| **Epic id** | `01-motor-de-eventos` |
| **Tasks** | `E1-T1` … `E1-T5` |
| **Depends on** | nada — empieza aquí |
| **Unlocks** | `02-catalogo-y-motor-de-ejecucion` |
| **Parallel with** | ninguno dentro de este épico salvo `E1-T3`/`E1-T4` entre sí, y `E1-T5` con `E1-T3`/`E1-T4` (archivos distintos) |

No necesitas ningún otro archivo para completar este épico. Todo lo de abajo está repetido aquí a
propósito.

---

## Stack

Next.js 16 · TypeScript · Drizzle ORM · Postgres · Redis · BullMQ 6.1.1 · better-auth · Socket.IO ·
`@anthropic-ai/sdk` · `json-logic-engine@5.0.7` (nuevo). Gestor de paquetes: `pnpm`. Las versiones
están en el lockfile — nunca las adivines.

| Tarea | Comando |
|---|---|
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test {ruta}` |
| Migrar | `pnpm db:migrate` |
| Generar migración | `pnpm db:generate` |
| Aprobar builds post-install | `pnpm approve-builds --all` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea de este
épico como terminada.

Este épico no necesita ningún servicio local nuevo — Postgres y Redis ya corren desde Fase 1/2 vía el
`docker-compose.yml` de desarrollo ya existente.

## Subárbol de directorios

Solo las partes que este épico toca:

```
src/
  db/
    schema.ts                     # EDITAR — se agregan 5 tablas nuevas
  server/
    automations/
      types.ts                    # NUEVO
      events.ts                   # NUEVO
      actions/
        catalog.ts                # NUEVO
        tag-conversation.ts       # NUEVO
        assign-conversation.ts    # NUEVO
    channels/                     # EXISTENTE, Fase 1 — 4 archivos, cada uno EDITAR (1 linea, emite 'message.received')
      whatsapp.ts
      instagram.ts
      facebook.ts
      tiktok.ts
    publishing/
      publish.ts                 # EXISTENTE, Fase 2 — EDITAR, 1 linea, emite 'content.published'
tests/
  automations/
    events.test.ts
    events-emission.test.ts
    events-emission-content.test.ts
    actions-catalog.test.ts
```

`conversation.tagged` no se implementa en esta fase (ver Decisión #8 en blueprint §20.3) — Fase 1 no
expone ningún servicio de etiquetado de una sola línea que editar fuera del tool `tag_conversation` del
copiloto, así que `src/server/conversations/tags.ts` no existe y no se toca.

Todo lo que esté fuera de este subárbol queda fuera de alcance. Si una tarea parece requerir editar
un archivo no listado aquí, detente y repórtalo.

## Modelo de datos tocado aquí

| Entidad | Campos que este épico agrega o lee | Notas |
|---|---|---|
| `automation` | todos (nueva) | ver blueprint §4 para el schema completo |
| `automation_action` | todos (nueva) | referenciada por `catalog.ts` para validar `action_type` |
| `automation_run` | todos (nueva, solo el `CREATE TABLE`, sin lógica de escritura en este épico) | |
| `automation_action_log` | todos (nueva, solo el `CREATE TABLE`) | |
| `automation_action_approval` | todos (nueva, solo el `CREATE TABLE`) | tabla propia de esta fase para la aprobación en primer uso de `send_message` — nunca las tablas `runs`/`steps`/`tool_calls`/`approvals` del copiloto de Fase 1 (ver Decisión #7, blueprint §20.3); usada por `02-catalogo-y-motor-de-ejecucion` (`E2-T1`) |

## Contratos

**Consumido** — ya existe, no se reconstruye:

| De | Interfaz | Garantía |
|---|---|---|
| Fase 1 | `src/server/channels/{whatsapp,instagram,facebook,tiktok}.ts` — `normalizeInboundEvent()` en cada uno | produce el shape normalizado `{ externalAccountId, externalEventId, contactExternalId, contactName, body, mediaUrls }` antes del punto de edición de esta fase |
| Fase 2 | `src/server/publishing/publish.ts` — el orquestador que publica contenido | marca `content_channel_target.status = 'published'` antes del punto de edición |
| Fase 1 | `requirePermission(orgId, permission)` | lanza si el permiso no está presente |

**Producido** — épicos posteriores dependen exactamente de estas firmas:

| Export | Firma | Usado por |
|---|---|---|
| `src/server/automations/events.ts` → `emitAutomationEvent` | `(type: AutomationEventType, payload: object) => void`, nunca lanza | `02-catalogo-y-motor-de-ejecucion` (worker consume la cola que esto llena) |
| `src/server/automations/actions/catalog.ts` → `catalog` | registro `{ [actionType]: CatalogEntry }`, con `.get(type)` | `02-catalogo-y-motor-de-ejecucion` (`send_message`, `create_content_draft` se registran aquí) |

## Convenciones que muerden en esta área

- `emitAutomationEvent` nunca se envuelve en `try/catch` en el llamador — la garantía de no-lanzar
  vive dentro de la función. Agregar un `try/catch` redundante en el webhook handler es una señal de
  que no se confió en la garantía; no lo hagas.
- El nombre de la cola es el literal `"automation-events"`, definido una sola vez en `events.ts`.
  Nunca lo hardcodees en otro archivo — impórtalo o pásalo como constante desde ahí.

Reglas completas del proyecto: `CLAUDE.md`. Reglas de esta área: `.claude/rules/automations.md`.
Ambos ya están en la raíz del proyecto — el builder los copió ahí antes de la tarea 1.

---

## Tareas

Listadas en el mismo orden que `tasks.json`. Ese orden es el orden de construcción.

### `E1-T1` — Dependencia json-logic-engine, schema y migración

**Depends on:** nada · **Priority:** p0

Instala `json-logic-engine@5.0.7` (pin verificado, ver `CLAUDE.md`/blueprint §11 — nunca reverifiques
la versión, ya está confirmada). Corre `pnpm approve-builds --all` inmediatamente después por si el
paquete trae scripts de post-install. Agrega los 3 enums y las 5 tablas nuevas al final de
`src/db/schema.ts` sin tocar ninguna tabla existente — incluida `automation_action_approval`, la tabla
propia de esta fase que resuelve la aprobación en primer uso de `send_message` sin depender de las
tablas del copiloto (ver `02-catalogo-y-motor-de-ejecucion` `E2-T1`, y Decisión #7 en blueprint §20.3).
Genera y aplica la migración con el patrón del skill `add-migration` ya presente en el repo — nunca
nombres a mano el archivo de migración que `drizzle-kit` genera.

**Files**
- `package.json` — edit: agrega la dependencia
- `pnpm-lock.yaml` — edit: generado por `pnpm add`
- `src/db/schema.ts` — edit: 3 enums + 5 tablas nuevas
- `drizzle/**` — new: la migración que `pnpm db:generate` emite (nombre asignado por la herramienta)

**Acceptance**

1. **WHEN** `node -e "require('json-logic-engine')"` se ejecuta **THE SYSTEM SHALL** salir con código 0.
2. **WHEN** `pnpm db:migrate` corre contra la base de datos local **THE SYSTEM SHALL** crear las tablas `automation`, `automation_action`, `automation_run`, `automation_action_log`, `automation_action_approval`.
3. **WHEN** se inspecciona `automation` con `\d automation` en `psql` **THE SYSTEM SHALL** mostrar la columna `org_id` como `not null`.
4. **WHEN** se inspecciona `automation_action` con `\d automation_action` **THE SYSTEM SHALL** mostrar un índice único sobre `(automation_id, position)`.
5. **WHEN** se inspecciona `automation_action_approval` con `\d automation_action_approval` **THE SYSTEM SHALL** mostrar un índice único sobre `(org_id, action_type)`.
6. **WHEN** `pnpm approve-builds --all` corre después de la instalación **THE SYSTEM SHALL** salir con código 0.

**Verify**

```bash
pnpm add json-logic-engine@5.0.7
pnpm approve-builds --all
node -e "require('json-logic-engine'); console.log('ok')"
pnpm db:migrate
psql "$DATABASE_URL" -c "\d automation" | grep -q "org_id.*not null"
psql "$DATABASE_URL" -c "\d automation_action" | grep -q "automation_action_position_unique"
psql "$DATABASE_URL" -c "\d automation_run" | grep -q "condition_matched"
psql "$DATABASE_URL" -c "\d automation_action_log" | grep -q "attempt"
psql "$DATABASE_URL" -c "\d automation_action_approval" | grep -q "automation_action_approval_org_action_type_unique"
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: dependencia json-logic-engine + schema + migracion"
git tag step-33-json-logic-schema
```

### `E1-T2` — Motor de eventos: emisor fire-and-forget

**Depends on:** `E1-T1` · **Priority:** p0

Crea el tipo unión de eventos soportados y `emitAutomationEvent()`. Internamente crea una `Queue`
de BullMQ sobre `automation-events` y hace `.add(type, payload)` dentro de un manejo que nunca
propaga una excepción hacia el llamador — ni siquiera si Redis está caído.

**Files**
- `src/server/automations/types.ts` — new
- `src/server/automations/events.ts` — new
- `tests/automations/events.test.ts` — new

**Acceptance**

1. **WHEN** `emitAutomationEvent("message.received", payload)` se llama con Redis disponible **THE SYSTEM SHALL** encolar exactamente 1 job en la cola `automation-events`.
2. **WHEN** `emitAutomationEvent(...)` se llama y la conexión a Redis está caída (mock que rechaza) **THE SYSTEM SHALL** no lanzar ninguna excepción hacia el llamador.
3. **WHEN** `emitAutomationEvent(...)` falla internamente **THE SYSTEM SHALL** registrar el error con `logger.error` incluyendo el `type` del evento.
4. **WHEN** el test suite de este paso corre **THE SYSTEM SHALL** reportar 0 fallidos y 0 omitidos.

**Verify**

```bash
pnpm test tests/automations/events.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: emisor de eventos fire-and-forget"
git tag step-34-event-emitter
```

### `E1-T3` — Emisión desde los 4 canales de Fase 1 (edición mínima)

**Depends on:** `E1-T2` · **Priority:** p0

Fase 1 no tiene un `webhook-handler.ts` único — son **4 archivos**:
`src/server/channels/{whatsapp,instagram,facebook,tiktok}.ts`, cada uno con su propia función
`normalizeInboundEvent`. Grep de respaldo si el nombre real difiere:
`grep -rl "normalizeInboundEvent" src/server/channels/*.ts` — se esperan **4 matches**, edita los 4,
no asumas uno solo. En cada archivo, agrega **una línea** que llama
`emitAutomationEvent("message.received", { externalAccountId, externalEventId, channel,
contactExternalId, body })` inmediatamente después de que `normalizeInboundEvent` produce el evento
normalizado. No agregues ningún `try/catch` extra. `conversation.tagged` no se implementa en esta
tarea (ver Decisión #8 del blueprint) — Fase 1 no tiene `src/server/conversations/tags.ts`.

**VERIFY:** en Fase 1 `org_id` se resuelve más adelante (en la ruta de webhook) y
`conversationId`/`messageId` se crean de forma asíncrona en `scripts/worker.ts` — ninguno de los tres
existe todavía en `normalizeInboundEvent`. No los incluyas en el payload; el worker de automatizaciones
(`E2-T6`) resuelve `org_id` desde `externalAccountId` vía `channel_connection`.

**Files**
- `src/server/channels/whatsapp.ts` — edit: 1 línea
- `src/server/channels/instagram.ts` — edit: 1 línea
- `src/server/channels/facebook.ts` — edit: 1 línea
- `src/server/channels/tiktok.ts` — edit: 1 línea
- `tests/automations/events-emission.test.ts` — new

**Acceptance**

1. **WHEN** un webhook de WhatsApp con firma válida llega y la conexión a Redis está caída (mock) **THE SYSTEM SHALL** igual responder 200 (sin cambio de comportamiento observable de Fase 1).
2. **WHEN** un webhook de WhatsApp válido llega con Redis disponible **THE SYSTEM SHALL** encolar 1 evento `message.received` con el `externalAccountId` correcto.
3. **WHEN** los 4 canales reciben un evento normalizado equivalente **THE SYSTEM SHALL** encolar el mismo shape de evento `message.received` en los 4.

**Verify**

```bash
grep -rl "normalizeInboundEvent" src/server/channels/*.ts | wc -l | grep -qx 4
pnpm test tests/automations/events-emission.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: emision de eventos desde los 4 canales de Fase 1"
git tag step-35-emit-from-phase1
```

### `E1-T4` — Emisión desde publish.ts de Fase 2 (edición mínima)

**Depends on:** `E1-T2` · **Priority:** p0

Fase 2 no tiene un `publish-worker.ts` con `publishContentItem()` — el orquestador real es
`src/server/publishing/publish.ts` (consumido por el poller `scripts/worker-publish.ts`). Edita
`src/server/publishing/publish.ts`: justo después de marcar `content_channel_target.status` como
`published`, agrega **una línea** que llama `emitAutomationEvent("content.published", {...})`. Grep de
respaldo: `grep -rl "createContentItem" src/server/content` y `grep -rlE "worker-publish|export.*publish"
src/server/publishing scripts`. Nada más del orquestador cambia.

**Files**
- `src/server/publishing/publish.ts` — edit: 1 línea
- `tests/automations/events-emission-content.test.ts` — new

**Acceptance**

1. **WHEN** un job de publicación completa exitosamente **THE SYSTEM SHALL** encolar 1 evento `content.published` con el `contentItemId` correcto.
2. **WHEN** un job de publicación completa exitosamente y Redis está caído (mock) **THE SYSTEM SHALL** igual marcar el `content_item` como `published` sin lanzar excepción.
3. **WHEN** un job de publicación falla antes de llegar al punto de emisión **THE SYSTEM SHALL** no encolar ningún evento `content.published`.

**Verify**

```bash
grep -rl "createContentItem" src/server/content
grep -rlE "worker-publish|export.*publish" src/server/publishing scripts
pnpm test tests/automations/events-emission-content.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: emision de eventos desde publish.ts de Fase 2"
git tag step-36-emit-from-phase2
```

### `E1-T5` — Catálogo de acciones base (`tag_conversation`, `assign_conversation`)

**Depends on:** `E1-T1` · **Priority:** p0

Crea `catalog.ts` como un registro tipado `{ [actionType]: { configSchema, requiredPermission,
execute } }`, siguiendo el mismo patrón del catálogo de tools del copiloto de Fase 1 (el skill
`add-copilot-tool` documenta ese patrón) pero en un catálogo separado — no lo mezcles con el
copiloto. Implementa `tag_conversation` y `assign_conversation`.

**Files**
- `src/server/automations/actions/catalog.ts` — new
- `src/server/automations/actions/tag-conversation.ts` — new
- `src/server/automations/actions/assign-conversation.ts` — new
- `tests/automations/actions-catalog.test.ts` — new

**Acceptance**

1. **WHEN** `catalog.get("tag_conversation")` se llama **THE SYSTEM SHALL** retornar una entrada con `requiredPermission` definido y un `execute` invocable.
2. **WHEN** `execute()` de `tag_conversation` se llama sin el permiso requerido en el contexto **THE SYSTEM SHALL** lanzar un error tipado `PermissionDeniedError` y no escribir el tag.
3. **WHEN** `execute()` de `assign_conversation` recibe un `memberId` que no pertenece a la organización del evento **THE SYSTEM SHALL** lanzar `ValidationError` y no asignar.
4. **WHEN** `configSchema` de `assign_conversation` valida un `configJson` sin `memberId` **THE SYSTEM SHALL** rechazar con un error zod.

**Verify**

```bash
pnpm test tests/automations/actions-catalog.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: catalogo de acciones base"
git tag step-37-actions-catalog-base
```

---

## Aceptación del épico

El épico está terminado cuando cada tarea está `done` **y**:

1. **WHEN** Redis se detiene deliberadamente y se envía un webhook de WhatsApp real **THE SYSTEM SHALL** responder 200 igual (prueba manual de caos, además de las automatizadas de `E1-T3`).
2. **WHEN** se corre el gate completo **THE SYSTEM SHALL** salir en verde incluyendo los 4 archivos de test nuevos de este épico.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Corridos desde la raíz del proyecto. Ambos criterios son decidibles por estos comandos.

## Trampas

- **Editar de más el webhook handler o el publish-worker.** El único cambio permitido es la línea de
  emisión del evento. Cualquier otro cambio en esos archivos es una regresión potencial sobre Fase
  1/2 que ya está en producción.
- **Envolver `emitAutomationEvent` en un `try/catch` en el llamador.** Ya está garantizado por dentro
  — hacerlo de nuevo afuera es ruido, no seguridad adicional.

## Antes de avanzar

- [ ] Cada tarea de este épico está `done` en `tasks.json` — ninguna quedó `in_progress`.
- [ ] Cada comando `verify` de cada tarea de este épico pasó, no solo el primero.
- [ ] Ningún `verify` fue editado, y ninguno se saltó porque un archivo que nombra no existía.
- [ ] Cada tarea de este épico tiene su tag de checkpoint en control de versiones —
      `git tag -l 'step-3[3-7]-*'` lista 5.
- [ ] Comando de gate pasa limpio, corrido desde la raíz del proyecto.
- [ ] Cada contrato "Producido" arriba existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] `.env.example` no cambió — esta fase no agrega variables de entorno.
- [ ] Un commit por tarea, cada uno prefijado con su id de tarea, cada uno seguido de su tag de checkpoint.
