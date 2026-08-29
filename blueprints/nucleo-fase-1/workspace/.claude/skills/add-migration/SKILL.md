---
name: add-migration
description: Genera y aplica una migración de Drizzle de forma segura después de editar el schema en
  src/lib/db/schema.ts. Usar cada vez que se agregue, elimine o modifique una tabla o columna.
---

# Add Migration

## When to use
Después de cualquier cambio en `src/lib/db/schema.ts` — nueva tabla, nueva columna, cambio de
constraint.

## Steps
1. Edita `src/lib/db/schema.ts` con el cambio deseado, siguiendo el patrón de las tablas existentes
   (id uuid, org_id con índice si es tenant-owned, created_at/updated_at donde aplique).
2. Corre `pnpm db:generate` — esto crea el archivo de migración con el nombre que la herramienta
   decide. Nunca inventes el nombre del archivo antes de correr el comando.
3. Revisa el SQL generado en `drizzle/<archivo-generado>.sql` antes de aplicarlo.
4. Corre `pnpm db:migrate` contra tu base de datos local.
5. Si la migración es destructiva (drop column, not-null sin default), verifica que no vaya en el
   mismo deploy que el código que aún depende del shape viejo — expand-then-contract.

## Verify
```bash
pnpm db:migrate   # expect: exit 0
pnpm test tests/unit/schema.test.ts   # expect: exit 0 — confirma que las tablas esperadas existen
```

## Do not
- No edites un archivo de migración ya generado y aplicado — genera una nueva migración.
- No nombres el archivo de migración a mano en ningún comentario o documentación — su nombre lo decide
  `drizzle-kit generate`.
