---
description: Convenciones del worker de publicación programada multicanal
paths:
  - "src/server/publishing/**"
  - "scripts/worker-publish.ts"
---

- El worker de publicación (`scripts/worker-publish.ts`) es un proceso BullMQ separado del worker
  de eventos entrantes (`scripts/worker.ts` de Fase 1) — colas distintas, procesos distintos,
  nunca se fusionan.
- Cada `content_channel_target` con `scheduled_at` en el pasado y `status='scheduled'` produce
  exactamente un job encolado con `jobId` derivado determinísticamente de
  `content_channel_target.id` — esto es lo que hace el encolado idempotente ante reintentos del
  poller (BullMQ deduplica por `jobId`).
- `src/server/publishing/adapters/<canal>.ts` — un adaptador por canal, mismo shape de entrada
  `{ channelConnectionId, contentItem, media }` y de salida `{ externalPostId } | { error }`.
  Ningún adaptador llama a la API del proveedor sin haber confirmado primero, en un comentario al
  inicio del archivo, la versión vigente de esa API de publicación saliente — **no es la misma
  superficie que los webhooks entrantes de Fase 1** (ver blueprint §9 step 26, nota VERIFY).
- Todo intento de publicación fallido escribe `content_channel_target.status='failed'` y
  `content_channel_target.error` con el mensaje del proveedor — nunca deja el target en
  `publishing` indefinidamente.
- Reintentos y dead-letter reutilizan el mismo patrón de backoff exponencial y `job_dead_letters`
  del worker de Fase 1 (`scripts/worker.ts`) — no se reinventa un mecanismo nuevo.
