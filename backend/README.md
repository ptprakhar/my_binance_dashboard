# Fixed-IP Binance backend

This service keeps Binance credentials off the Cloudflare Worker and makes signed Binance API requests from a VPS with a stable public IP.

## Environment

Set these variables on the VPS only:

- `BINANCE_API_KEY` — Binance Ed25519 API key
- `BINANCE_ED25519_PRIVATE_KEY` — the complete **unencrypted** PKCS#8 private key PEM
- `BINANCE_PROXY_TOKEN` — a long random bearer token shared only with the Cloudflare Worker
- `BINANCE_FUTURES_BASE_URL` — optional; defaults to `https://fapi.binance.com`
- `PORT` — optional; defaults to `8787`
- `HOST` — optional; defaults to `127.0.0.1`

Do not commit any of these values to Git.

## Run

Requires Node.js 22+.

```bash
cd backend
npm start
```

The backend exposes:

- `GET /health` — unauthenticated health check
- `GET /binance/access` — requires `Authorization: Bearer <BINANCE_PROXY_TOKEN>`
- `GET /binance/futures` — requires `Authorization: Bearer <BINANCE_PROXY_TOKEN>`

The Binance API key is used only for signed read requests. This service does not expose an order-placement route.

## Production layout

Run this Node service on `127.0.0.1:8787` and put a TLS reverse proxy such as Caddy in front of it. The Cloudflare Worker should call the public HTTPS URL of that reverse proxy.

Example Caddyfile:

```text
api.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Point `api.example.com` to the VPS public IP and keep ports 80/443 open for Caddy. Caddy will provision and renew the public TLS certificate.

## Cloudflare Worker secrets

After the backend is reachable over HTTPS, set these Worker secrets:

- `BINANCE_PROXY_URL=https://api.example.com`
- `BINANCE_PROXY_TOKEN=<same random token used by the VPS>`

The Worker no longer needs Binance private-key material for the proxy architecture. Remove the old Binance secrets from the Worker after the proxy is confirmed working.

## Binance API-key hardening

After confirming the backend's public IPv4, enable Binance API-key IP restriction and allow only that VPS IP. Keep the key read-only; do not enable withdrawals, transfers, or trading for this dashboard.
