---
paths:
  - "src/lib/push/**"
  - "src/server/push/**"
  - "src/components/push/**"
  - "public/sw.js"
---

# Convenciones del dominio de notificaciones push

- `sendPushNotification(userId, payload)` en `src/lib/push/send.ts` es el **único** punto que importa
  el SDK `web-push`. Ningún gancho (mensaje, aprobación de copiloto, canal desconectado, aprobación de
  contenido, automatización fallida) llama `webpush.sendNotification` directo — todos importan
  `sendPushNotification`.
- `sendPushNotification` nunca lanza. El envío a cada suscripción va en su propio `try/catch` interno
  — un fallo en una suscripción nunca impide el envío a las demás del mismo usuario.
- Un error con `statusCode` `404` o `410` borra la fila `push_subscription` correspondiente
  (suscripción inválida/expirada). Cualquier otro error se registra con `logger.warn` y la fila
  permanece.
- `last_used_at` se actualiza en cada envío exitoso, nunca en un envío fallido.
- `src/server/push/subscriptions.ts` es el único módulo que escribe en `push_subscription` — ningún
  otro módulo hace `INSERT`/`UPDATE`/`DELETE` directo sobre esa tabla, ni siquiera `send.ts` (que solo
  hace `DELETE` en la rama 404/410, reutilizando el mismo módulo si es necesario factorizarlo).
- `org_id`/`user_id` de toda escritura en `push_subscription` vienen siempre de la sesión resuelta por
  `requirePermission()`, nunca del body de la request.
- En los tests, mockear `src/lib/push/send.ts`, nunca el SDK `web-push` directo — es el contrato real
  que consume el resto del código.
- `public/sw.js` es JavaScript plano sin build step — el navegador lo sirve tal cual. No introducir un
  bundler ni una librería de Service Worker (`next-pwa`, Workbox) para este archivo — decisión
  documentada en blueprint.md §11 *Deliberately not used*.
- `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` se leen únicamente dentro de `src/lib/push/send.ts`.
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` se lee únicamente dentro de `src/components/push/push-opt-in.tsx`.
  Los tres deben coincidir con el mismo par de claves — si `NEXT_PUBLIC_VAPID_PUBLIC_KEY` difiere de
  `VAPID_PUBLIC_KEY`, `PushManager.subscribe()` falla en el navegador con `InvalidAccessError`.
