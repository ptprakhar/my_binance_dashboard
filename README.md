# Binance Futures Risk Dashboard

A personal, read-only Binance Futures monitoring dashboard. The first version is intentionally limited to account monitoring and manual refresh; it does not place trades or process withdrawals.

## Planned V1

- Binance Futures account balance
- Available balance
- Unrealized P&L
- Open positions
- Open orders
- Manual refresh
- Secure server-side Binance API integration
- Cloudflare Workers-compatible backend

## Security

Never commit Binance API keys or secrets to this repository. Production credentials should be stored as Cloudflare Worker secrets/bindings.

The initial dashboard should use the minimum Binance API permissions required for read-only account monitoring. Trading and withdrawal permissions should remain disabled.

## Development

The application structure will be added incrementally. Each milestone should be tested against the Binance Futures account before adding risk controls or any order-related functionality.
