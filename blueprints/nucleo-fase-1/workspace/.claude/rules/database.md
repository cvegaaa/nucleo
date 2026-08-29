---
description: Convenciones de schema de base de datos y migraciones
paths:
  - "src/lib/db/**"
  - "drizzle/**"
---

- Toda tabla tenant-owned lleva `org_id` con índice y not-null.
- Toda tabla lleva `id uuid default gen_random_uuid()` y `created_at timestamptz`.
- Soft-delete (`deleted_at`) solo en `contact`, `conversation`, `channel_connection` — nunca en
  `audit_event`, `message`, `jobs` (son append-only/event-like).
- Nunca edites un archivo bajo `drizzle/` que ya se generó y aplicó — genera una migración nueva con
  `pnpm db:generate`.
- El nombre del archivo de migración lo decide `drizzle-kit` — nunca lo inventes en código ni
  documentación.
- Toda relación usa `references()` de Drizzle, nunca una FK sin declarar en el schema.
