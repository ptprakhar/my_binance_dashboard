# Binance Risk Guard Chrome Extension

This folder contains the Chrome Manifest V3 extension for the Binance Futures risk-control layer.

## Current V0

- Reads risk state from the dashboard Worker API.
- Shows daily P&L, daily loss usage, and trades/day in the popup.
- Provides a cooldown duration selector.
- Stores the cooldown locally in `chrome.storage.local`.
- Does **not** contain Binance API keys or private keys.
- Does **not** intercept or modify Binance order submission yet.

## Local installation

1. Run the dashboard locally with `npm run dev:local`.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select this `chrome-extension` folder.
6. Pin **Binance Risk Guard**.
7. Open the extension popup.

The current manifest points at `http://localhost:8787` through the service worker code. Before production use, replace `YOUR-DASHBOARD-DOMAIN` in `manifest.json` with the deployed dashboard origin and update the default URL in `service-worker.js`.

## Next implementation step

Connect the extension cooldown to the authoritative Cloudflare Worker risk-state endpoint, then add carefully tested Binance UI order-submit interception. The extension must fail closed when risk state cannot be verified before allowing a new order.
