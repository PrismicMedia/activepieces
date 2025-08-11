# Deploying Activepieces on Vercel

This repository contains configuration to deploy:
- React UI (packages/react-ui) as a static site built with Vite
- Fastify API (packages/server/api) using a Vercel Serverless Function adapter at `api/[...path].ts`

Note: Long-lived workers and WebSockets have limitations on serverless platforms. See sections below for recommended approaches.

## Prerequisites
- Vercel account and project created from this repo
- Vercel Postgres provisioned
- Optional: Redis provider (Vercel KV/Upstash recommended)

## Monorepo settings
Root `vercel.json`:
- Installs dependencies and builds UI with Nx/Vite
- Serves static output from `dist/packages/react-ui`
- Provides function settings for `/api/**`

UI build output is configured by `packages/react-ui/vite.config.ts` to `dist/packages/react-ui`.

## Function adapter (API)
- `api/[...path].ts` bootstraps the existing Fastify server:
  - Sets timezone to UTC
  - Runs database migrations on cold start
  - Initializes lock
  - Creates the Fastify app via `setupServer()`
  - Delegates each incoming request to the Fastify Node server using `app.server.emit('request', req, res)`

All API routes are served under `/api/*`.

## Environment variables

Configure these in your Vercel project Settings -> Environment Variables.

Database (Vercel Postgres):
- Preferred single URL (if supported by code):
  - `POSTGRES_URL` = Connection string from Vercel Postgres
- Or split fields:
  - `AP_POSTGRES_HOST`
  - `AP_POSTGRES_PORT`
  - `AP_POSTGRES_DATABASE`
  - `AP_POSTGRES_USERNAME`
  - `AP_POSTGRES_PASSWORD`
- SSL:
  - `AP_POSTGRES_USE_SSL` = `true`

Redis / Queues:
- Recommended: Vercel KV (Upstash)
  - `AP_REDIS_URL` = `rediss://...`
- Alternatively, provide individual settings:
  - `AP_REDIS_HOST`, `AP_REDIS_PORT`, `AP_REDIS_USER`, `AP_REDIS_PASSWORD`

Core application secrets:
- `AP_JWT_SECRET` = strong random string
- `AP_ENCRYPTION_KEY` = 32+ character secret used to encrypt credentials
- `AP_FRONTEND_URL` = UI URL (e.g., `https://your-ui.vercel.app`)

Email (if using invites/password reset):
- `AP_SMTP_HOST`
- `AP_SMTP_PORT`
- `AP_SMTP_USER`
- `AP_SMTP_PASSWORD`
- `AP_SMTP_FROM`

UI configuration:
- `VITE_API_BASE_URL` = API base (e.g., `https://your-ui.vercel.app` or a separate API domain). The UI will call `${VITE_API_BASE_URL}/api/...`.

## Build and deploy

Local verification:
- Build UI: `npm ci && npx nx build react-ui`
- Verify static output exists at `dist/packages/react-ui`

Deploy on Vercel:
- Import the repo into Vercel
- Set Environment Variables as listed
- Deploy

## WebSockets

The UI uses Socket.IO at `/api/socket.io`. Standard Vercel Serverless Functions do not support persistent WebSocket connections. Options:
- Allow polling fallback on the client and accept limitations
- Host a small Node server externally to handle WebSockets and point `VITE_API_BASE_URL` to that host
- Explore Vercel Edge WebSockets (beta) with additional adaptation; not guaranteed compatible with existing Fastify/Socket.IO setup

## Workers and background jobs

Activepieces includes worker functionality. Serverless environments are not well-suited for long-running workers. Options:
- Use Vercel Cron Jobs to trigger specific API endpoints to process queued work periodically
- Host the worker process externally (container/VM) using the same Postgres and Redis; replicate the required environment variables

## Domains

If using custom domains:
- UI domain -> set `AP_FRONTEND_URL` and `VITE_API_BASE_URL`
- If hosting API on a separate domain/subdomain, use that in `VITE_API_BASE_URL`

## Troubleshooting

- Migrations fail on cold start:
  - Verify `POSTGRES_URL` or `AP_POSTGRES_*` values, and `AP_POSTGRES_USE_SSL=true`
- UI cannot reach API:
  - Ensure `VITE_API_BASE_URL` is set and matches deployed API hostname
- Socket.IO not connecting:
  - Expect fallback to polling, or consider an external WebSocket host
- Timeouts:
  - Increase `functions.api/**.maxDuration` in `vercel.json` if needed (up to Vercel limits)
- Nx project graph errors on Vercel:
  - The build runs `nx repair` and `nx reset`, disables the Nx daemon and cache via `NX_DAEMON=false` and `NX_SKIP_NX_CACHE=1`, and builds with `--verbose`.
  - If Nx still fails to generate the project graph in CI, the build falls back to Vite: `npx vite build --config packages/react-ui/vite.config.ts --outDir dist/packages/react-ui`.

## Runtime requirements on Vercel

- Use Node.js 20.x for builds (set via package.json `"engines.node": "20.x"`).
- The install step uses `npm ci --omit=optional --ignore-scripts` to avoid compiling optional native addons (e.g., isolated-vm) that are not required for the static UI build and serverless adapter. If you later need those native modules at build time, remove the omit flag and ensure a compatible Node/toolchain.
