// Inserta el servicio `minio` y su volumen en docker-compose.prod.yml
// (autorado por el step 17 de Fase 1) de forma idempotente. Guardado por un
// marcador literal: si el marcador ya está presente, no hace nada y sale 0 —
// correr este script dos veces produce el mismo archivo la segunda vez.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const composePath = path.join(root, "docker-compose.prod.yml");
const MARKER = "# --- nucleo-fase-2: minio service ---";

if (!existsSync(composePath)) {
  console.error(`No se encontró ${composePath} — el step 17 de Fase 1 debería haberlo creado.`);
  process.exit(1);
}

let content = readFileSync(composePath, "utf8");

if (content.includes(MARKER)) {
  console.log("minio ya está declarado en docker-compose.prod.yml — nada que hacer.");
  process.exit(0);
}

const minioService = `  ${MARKER}
  minio:
    image: minio/minio:RELEASE.2025-10-15T17-29-55Z
    command: server /data --console-address ":9001"
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: \${S3_ACCESS_KEY_ID}
      MINIO_ROOT_PASSWORD: \${S3_SECRET_ACCESS_KEY}
    volumes:
      - nucleo_minio_prod_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 20
`;

if (!/^services:\s*$/m.test(content)) {
  console.error("docker-compose.prod.yml no tiene una clave `services:` de nivel superior — formato inesperado.");
  process.exit(1);
}
content = content.replace(/^services:\s*$/m, `services:\n${minioService}`);

if (/^volumes:\s*$/m.test(content)) {
  content = content.replace(/^volumes:\s*$/m, "volumes:\n  nucleo_minio_prod_data:");
} else {
  content += "\nvolumes:\n  nucleo_minio_prod_data:\n";
}

writeFileSync(composePath, content);
console.log("minio insertado en docker-compose.prod.yml.");
