# Núcleo

Plataforma modular para atención al cliente multicanal (WhatsApp, Instagram, Telegram, Facebook) con un copiloto de IA integrado.

## Qué resuelve

Centraliza la conversación con clientes que llega por distintos canales en un solo panel, con colas, notificaciones en tiempo real y un asistente de IA que apoya la respuesta.

## Cómo está organizado

El proyecto se construye por fases incrementales, cada una en su propia carpeta bajo `blueprints/`:

- `nucleo-fase-1` — base: autenticación, canales, base de datos.
- `nucleo-fase-2`, `nucleo-fase-3`, `nucleo-fase-4` — funcionalidades incrementales.
- `nucleo-notificaciones-dashboard` — panel de notificaciones en tiempo real.

Cada fase tiene su propio `workspace/` con el código de esa etapa.

## Stack técnico

- PostgreSQL + Redis (colas, rate limiting, realtime)
- better-auth
- Integraciones: WhatsApp, Instagram, Facebook, TikTok (apps de cada plataforma)
- Copiloto con la API de Anthropic (Claude)

## Estado

En desarrollo — proyecto por fases, aún no listo para producción.
