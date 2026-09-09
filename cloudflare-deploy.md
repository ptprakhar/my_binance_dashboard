# Cloudflare deployment

This repository deploys as a Cloudflare Worker with Vite-generated assets.

Use these settings when connecting the Git repository:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node.js: 22 or newer
- Root directory: `/`

The Vite build creates the `dist` directory. Wrangler reads that directory through `wrangler.jsonc`.

If Cloudflare's UI uses a Workers Builds workflow that runs `npx wrangler versions upload`, make sure the deployment configuration points Wrangler at the Worker entry point and generated assets. The checked-in `wrangler.jsonc` is the source of truth.

## Secrets

Add these as Worker secrets/bindings, never to GitHub:

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`

Do not enable withdrawal permissions on the Binance API key. V1 does not need trading permissions.
