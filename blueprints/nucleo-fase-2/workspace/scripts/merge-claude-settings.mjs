// Fusiona .claude/settings.fase2.json (copiado a la raíz del proyecto por el
// rsync guardado de Bootstrap) dentro de .claude/settings.json existente,
// sumando los permisos de Fase 2 sin duplicar ninguno ya presente.
//
// Idempotente por diseño: usa un Set para deduplicar antes de escribir, así
// que correr este script dos veces produce exactamente el mismo archivo la
// segunda vez, y siempre sale con código 0 si ambos JSON son válidos.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const targetPath = path.join(root, ".claude", "settings.json");
const sourcePath = path.join(root, ".claude", "settings.fase2.json");

if (!existsSync(sourcePath)) {
  console.error(`No se encontró ${sourcePath} — ¿corriste la copia de workspace/ primero?`);
  process.exit(1);
}
if (!existsSync(targetPath)) {
  console.error(`No se encontró ${targetPath} — Fase 1 debería haberlo creado.`);
  process.exit(1);
}

const target = JSON.parse(readFileSync(targetPath, "utf8"));
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

target.permissions ??= { allow: [], deny: [] };
target.permissions.allow ??= [];
target.permissions.deny ??= [];

const allowSet = new Set(target.permissions.allow);
for (const entry of source.permissions?.allow ?? []) allowSet.add(entry);
target.permissions.allow = [...allowSet].sort();

const denySet = new Set(target.permissions.deny);
for (const entry of source.permissions?.deny ?? []) denySet.add(entry);
target.permissions.deny = [...denySet].sort();

writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`);
console.log(`Fusionado: ${target.permissions.allow.length} entradas allow, ${target.permissions.deny.length} deny.`);
