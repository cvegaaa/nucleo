---
description: Aislamiento de tenant y verificación de permisos
paths:
  - "src/server/**"
  - "src/app/api/**"
---

- Toda mutación o lectura sensible llama `requirePermission(session, orgId, permissionKey)` de
  `src/server/tenancy.ts` como primera línea del handler.
- Un fallo de `requirePermission` se traduce siempre a **404**, nunca a 403 — cruzar el límite de
  tenant no debe revelar que el recurso existe en otra organización.
- El `org_id` que se pasa a `requirePermission` viene del recurso que se está accediendo (resuelto
  desde la BD), nunca de un parámetro de query o body enviado por el cliente sin verificar.
- `recordAuditEvent()` de `src/lib/audit.ts` va dentro de la misma transacción Drizzle que la mutación
  que describe.
