# Binance Futures Risk Dashboard

A personal Binance Futures risk-monitoring dashboard. V1 is intentionally **read-only**: it monitors the account and never places, cancels, or closes orders.

## V1 features

- Current USDⓈ-M Futures wallet balance
- Available and margin balance
- Unrealized P&L
- Open positions and leverage
- Open orders
- Manual refresh
- Server-side Binance signing (Ed25519 preferred, HMAC fallback)
- Cloudflare Workers + React/Vite deployment
- API credentials kept out of the browser and repository
- Visible risk guardrails: 4.5% daily loss, 1.5% max loss/trade, 5 trades/day, 10% capital/day

The daily rule cards are currently **display-only**. The next milestone will persist a fresh trading-day state and calculate those limits from actual account/trade data.

## Local full-stack development

The repository can run the **entire dashboard locally**, including the Worker API gateway. This is the recommended way to test Binance connectivity before paying for a VPS.

The local architecture is:

```text
Browser
   |
   | http://localhost:8787
   v
Local Cloudflare Worker (Wrangler)
   |
   | signed Binance REST requests
   v
Binance USDⓈ-M Futures API
```

The Binance private key stays in the local Wrangler runtime and never enters the React/browser code.

### 1. Clone and install

```bash
git clone https://github.com/ptprakhar/my_binance_dashboard.git
cd my_binance_dashboard
npm install
```

### 2. Create local credentials

Copy the template:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and put in your **new, unencrypted Ed25519 private key** and Binance API key:

```text
BINANCE_API_KEY="your-key"
BINANCE_ED25519_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
your-key-material
-----END PRIVATE KEY-----"
BINANCE_FUTURES_BASE_URL="https://fapi.binance.com"
```

`.dev.vars` is gitignored. Never commit it and never put the private key in the React app or browser storage.

### 3. Run the full stack locally

```bash
npm run dev:local
```

Wrangler will print the local URL, normally:

```text
http://localhost:8787
```

Open that URL in your browser. The same `/api/binance/*` routes used in production are handled by the local Worker.

### 4. Test Binance connectivity

With the local server running, open:

```text
http://localhost:8787/api/binance/connectivity
```

This tests public and signed Binance endpoints from your **normal local internet connection**, independently of Cloudflare production egress.

Also test the actual dashboard API:

```text
http://localhost:8787/api/binance/futures
```

### 5. Useful development commands

```bash
npm run typecheck
npm run build
npm run dev:local
```

`npm run dev` remains available for frontend-only Vite development. Use `npm run dev:local` when you want the complete Worker + dashboard + Binance path.

## Binance credentials

Create a Binance API key with the minimum permissions needed for account data. **Do not enable withdrawals. Do not enable trading for this V1.**

For deployed Cloudflare Workers, store credentials as Worker secrets:

```bash
npx wrangler secret put BINANCE_API_KEY
npx wrangler secret put BINANCE_ED25519_PRIVATE_KEY
```

Optional endpoint override:

```bash
npx wrangler secret put BINANCE_FUTURES_BASE_URL
```

For normal Binance USDⓈ-M Futures this is left unset and the app uses `https://fapi.binance.com`.

## Build and deploy

```bash
npm run typecheck
npm run build
npm run deploy
```

## Architecture

Production:

```text
React/Vite dashboard
        |
        | GET /api/binance/futures
        v
Cloudflare Worker
        |
        | signed requests
        v
Binance USDⓈ-M Futures API
```

Local development uses the same Worker as the gateway, but Wrangler runs it on your computer:

```text
React/Vite dashboard
        |
        | GET /api/binance/futures
        v
Local Wrangler Worker
        |
        | signed requests
        v
Binance USDⓈ-M Futures API
```

The Binance secret never crosses into the browser. The Worker is the only component that signs authenticated Binance requests.

## Important V1 boundary

This dashboard does **not** physically prevent manual trading in the Binance UI. The future kill switch must be implemented only after the exact Binance account-control mechanism is verified. Cancelling open orders is not the same thing as disabling new manual orders.
