# Binance Futures Risk Dashboard

A personal Binance Futures risk-monitoring dashboard. V1 is intentionally **read-only**: it monitors the account and never places, cancels, or closes orders.

## V1 features

- Current USDⓈ-M Futures wallet balance
- Available and margin balance
- Unrealized P&L
- Open positions and leverage
- Open orders
- Manual refresh
- Server-side Binance HMAC signing
- Cloudflare Workers + React/Vite deployment
- API credentials kept out of the browser and repository
- Visible risk guardrails: 4.5% daily loss, 1.5% max loss/trade, 5 trades/day, 10% capital/day

The daily rule cards are currently **display-only**. The next milestone will persist a fresh trading-day state and calculate those limits from actual account/trade data.

## Local development

```bash
npm install
npm run dev
```

## Binance credentials

Create a Binance API key with the minimum permissions needed for account data. **Do not enable withdrawals. Do not enable trading for this V1.**

Store credentials as Cloudflare Worker secrets rather than in `.env` committed to GitHub:

```bash
npx wrangler secret put BINANCE_API_KEY
npx wrangler secret put BINANCE_API_SECRET
```

Optional endpoint override:

```bash
npx wrangler secret put BINANCE_FUTURES_BASE_URL
```

For normal Binance USDⓈ-M Futures this is left unset and the app uses `https://fapi.binance.com`.

For local development, you can use a local `.dev.vars` file (already gitignored):

```text
BINANCE_API_KEY="your-key"
BINANCE_API_SECRET="your-secret"
BINANCE_FUTURES_BASE_URL="https://fapi.binance.com"
```

Never paste the secret into the React app or browser storage.

## Build and deploy

```bash
npm run typecheck
npm run build
npm run deploy
```

Cloudflare's current React/Vite Worker setup uses the Cloudflare Vite plugin, a Worker API entrypoint, and SPA asset routing.

## Architecture

```text
React/Vite dashboard
        |
        | GET /api/binance/futures
        v
Cloudflare Worker
        |
        | HMAC-SHA256 signed requests
        v
Binance USDⓈ-M Futures API
```

The Binance secret never crosses into the browser. The Worker is the only component that signs authenticated Binance requests.

## Important V1 boundary

This dashboard does **not** physically prevent manual trading in the Binance UI. The future kill switch must be implemented only after the exact Binance account-control mechanism is verified. Cancelling open orders is not the same thing as disabling new manual orders.
