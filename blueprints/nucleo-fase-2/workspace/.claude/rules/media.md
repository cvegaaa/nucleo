---
description: Convenciones de almacenamiento de medios (MinIO/S3) y generación de miniaturas
paths:
  - "src/lib/storage/**"
  - "src/server/media/**"
  - "src/app/api/media/**"
  - "src/app/api/v1/media/**"
---

- `src/lib/storage/s3-client.ts` es el único punto que instancia `S3Client` — nadie más importa
  `@aws-sdk/client-s3` directamente.
- Ningún objeto de MinIO es públicamente accesible. Toda descarga pasa por
  `GET /api/media/[key]`, que resuelve `key` → `media_asset` con `org_id` de la sesión antes de
  pedir el objeto — nunca se confía en un `storage_key` recibido del cliente sin esa resolución.
- La validación de MIME real (magic bytes, no `Content-Type` del request ni la extensión del
  archivo) vive en `src/lib/storage/validate-mime.ts` y corre antes de subir el buffer a S3.
- Las miniaturas se generan con `sharp` en el mismo request de subida, nunca en un job diferido —
  el usuario debe ver la miniatura al terminar la subida.
- `storage_key` sigue el patrón `<org_id>/<uuid>.<ext>` — nunca el nombre de archivo original del
  usuario, que puede colisionar o contener caracteres inválidos para la ruta del objeto.
- Borrar un `media_asset` es soft-delete (`deleted_at`) en la fila; el objeto en MinIO se conserva
  hasta una limpieza operativa manual — Fase 2 no implementa borrado físico automático.
