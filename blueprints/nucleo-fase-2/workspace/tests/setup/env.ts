// Intenta cargar .env.test antes de que cualquier módulo importe src/lib/env.ts.
// Vitest evalúa setupFiles antes de los archivos de test. Ningún step de este
// blueprint crea .env.test, así que esta llamada es un no-op silencioso por
// diseño — el mecanismo real son los `??=` de abajo.
//
// Este archivo reemplaza por completo al de Fase 1 (mismo contenido + defaults
// de S3/MinIO). Bootstrap de Fase 2 lo sobrescribe deliberadamente (cp -f).

import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../.env.test") });

// Valores mínimos garantizados para que el validador de env no falle el boot
// en la suite unitaria, que no toca servicios reales.
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  "postgres://nucleo:nucleo_dev_password@localhost:5432/nucleo_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET ??=
  "test-secret-not-for-production-0000000000000000";
process.env.COPILOT_MODEL_ID ??= "claude-sonnet-5";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";

// Fase 2 — MinIO/S3
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_REGION ??= "us-east-1";
process.env.S3_ACCESS_KEY_ID ??= "nucleo";
process.env.S3_SECRET_ACCESS_KEY ??= "nucleo_dev_password";
process.env.S3_BUCKET ??= "nucleo-media-test";
process.env.S3_FORCE_PATH_STYLE ??= "true";
