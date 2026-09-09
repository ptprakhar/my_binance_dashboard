// V0: observe Binance pages and expose the local cooldown state to the page guard.
// Order-button interception is intentionally not enabled yet; we will add it only
// after the dashboard risk-state contract and Binance order-flow selectors are tested.

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "risk-state") {
    document.documentElement.dataset.binanceRiskLock = message.locked ? "locked" : "open";
  }
});
