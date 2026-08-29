---
name: add-channel-webhook
description: Plantilla para agregar soporte de webhook a un canal nuevo, siguiendo el patrón de
  verificación de firma + normalización usado por whatsapp/instagram/facebook/tiktok. Usar cuando se
  pida soportar un canal adicional (email, telegram, u otro).
---

# Add Channel Webhook

## When to use
Al agregar un canal nuevo más allá de los 4 de Fase 1 — email, telegram, o cualquier otro.

## Steps
1. Crea `src/server/channels/<canal>.ts` con `verifySignature(rawBody, signature, secret)` y
   `normalizeInboundEvent(payload)` que retorna el shape común `{ externalAccountId, externalEventId,
   contactExternalId, contactName, body, mediaUrls }` — mismo shape que los 4 canales existentes.
2. VERIFY: confirma la versión vigente de la API del proveedor y el formato exacto de su payload de
   webhook contra la documentación oficial antes de escribir el parseo — nunca de memoria.
3. Crea `src/app/api/webhooks/<canal>/route.ts` siguiendo exactamente el mismo patrón de las 4 rutas
   existentes: verificar firma → chequear idempotencia → encolar job → responder 200.
4. Agrega el nuevo valor al enum-como-texto `channel` en `src/lib/db/schema.ts` si aún no está (email
   y telegram ya están preparados como valores del enum desde Fase 1).
5. Escribe `tests/integration/webhooks-<canal>.test.ts` con fixtures grabados, sin llamadas reales al
   proveedor.

## Verify
```bash
pnpm test tests/integration/webhooks-<canal>.test.ts   # expect: exit 0
```

## Do not
- No agregues un canal sin verificar la versión de API vigente primero.
- No dupliques la lógica de idempotencia — reutiliza el mismo patrón de `idempotency_keys`.
