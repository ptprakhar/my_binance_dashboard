const SUPPORTED_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "BTCUSDC", "ETHUSDC"]);
const RISK_REFRESH_MS = 10000;
const SIZE_REFRESH_MS = 1800;
const state = {
  risk: null,
  cooldownUntil: null,
  verified: false,
  symbol: null,
  market: null,
  lastAutoQuantity: null,
  lastMarketFetch: 0,
};

function textOf(element) {
  if (!element) return "";
  return [
    element.getAttribute?.("placeholder"),
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("name"),
    element.getAttribute?.("data-testid"),
    element.getAttribute?.("title"),
    element.parentElement?.innerText,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

function inputCandidates() {
  return [...document.querySelectorAll("input:not([type='hidden']), textarea")]
    .filter((input) => input.offsetParent !== null && !input.disabled && !input.readOnly);
}

function findInput(kind) {
  const inputs = inputCandidates();
  const patterns = kind === "sl"
    ? [/stop\s*loss/, /stop\s*price/, /stoploss/, /\bsl\b/]
    : [/quantity/, /order\s*quantity/, /amount/, /position\s*size/, /size/];

  for (const input of inputs) {
    const meta = textOf(input);
    if (patterns.some((pattern) => pattern.test(meta))) return input;
  }
  return null;
}

function findSelectedMarketTab() {
  const nodes = [...document.querySelectorAll("button,[role='tab'],div[role='button']")];
  return nodes.find((node) => {
    const label = (node.innerText || node.textContent || "").trim().toLowerCase();
    if (label !== "market") return false;
    const selected = node.getAttribute("aria-selected") === "true" || node.getAttribute("data-state") === "active";
    const classes = String(node.className || "").toLowerCase();
    return selected || /active|selected/.test(classes);
  }) || null;
}

function isMarketOrder() {
  return Boolean(findSelectedMarketTab());
}

function detectSymbol() {
  const haystack = `${location.pathname} ${location.href}`.toUpperCase();
  for (const symbol of SUPPORTED_SYMBOLS) {
    if (haystack.includes(symbol)) return symbol;
  }
  const body = document.body?.innerText?.toUpperCase() || "";
  for (const symbol of SUPPORTED_SYMBOLS) {
    if (body.includes(symbol)) return symbol;
  }
  return null;
}

function precisionFromStep(step) {
  const text = String(step);
  if (!text.includes(".")) return 0;
  return text.split(".")[1].replace(/0+$/, "").length;
}

function floorToStep(value, step) {
  if (!(value > 0) || !(step > 0)) return 0;
  const units = Math.floor((value + 1e-12) / step);
  const result = units * step;
  return Number(result.toFixed(Math.min(12, precisionFromStep(step) + 2)));
}

function setNativeInputValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getSide() {
  const buttons = [...document.querySelectorAll("button")];
  const buy = buttons.find((button) => /buy\s*\/\s*long|buy|long/i.test(button.innerText || "") && button.offsetParent !== null);
  const sell = buttons.find((button) => /sell\s*\/\s*short|sell|short/i.test(button.innerText || "") && button.offsetParent !== null);
  const buySelected = buy && /active|selected/.test(String(buy.className || "").toLowerCase());
  const sellSelected = sell && /active|selected/.test(String(sell.className || "").toLowerCase());
  return sellSelected && !buySelected ? "SHORT" : "LONG";
}

function ensurePanel() {
  let panel = document.getElementById("binance-risk-guard-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "binance-risk-guard-panel";
  panel.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:18px",
    "z-index:2147483647",
    "min-width:250px",
    "max-width:320px",
    "padding:12px 14px",
    "border-radius:10px",
    "font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "background:#111827",
    "color:#f9fafb",
    "box-shadow:0 8px 28px rgba(0,0,0,.35)",
    "border:1px solid #374151",
  ].join(";");
  document.documentElement.appendChild(panel);
  return panel;
}

function renderPanel(message, ok = true) {
  const panel = ensurePanel();
  panel.style.borderColor = ok ? "#374151" : "#ef4444";
  panel.innerHTML = message;
}

function request(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function refreshRisk() {
  const response = await request({ type: "get-state" });
  state.verified = Boolean(response?.ok && response?.verified);
  state.risk = response?.risk || null;
  state.cooldownUntil = response?.cooldownUntil || null;
  document.documentElement.dataset.binanceRiskLock = state.verified && !state.cooldownUntil && state.risk?.status === "OK" ? "open" : "locked";
  return response;
}

async function refreshMarket(symbol) {
  if (!symbol) return null;
  if (state.symbol === symbol && state.market && Date.now() - state.lastMarketFetch < 1200) return state.market;
  const response = await request({ type: "get-symbol-market", symbol });
  if (!response?.ok) throw new Error(response?.error || "Unable to read symbol market data.");
  state.symbol = symbol;
  state.market = response.market;
  state.lastMarketFetch = Date.now();
  return state.market;
}

async function updateSizing() {
  const symbol = detectSymbol();
  if (!symbol || !SUPPORTED_SYMBOLS.has(symbol)) {
    renderPanel("Risk Guard: supported symbols are BTCUSDT, ETHUSDT, BTCUSDC and ETHUSDC.", false);
    return;
  }

  const slInput = findInput("sl");
  const quantityInput = findInput("quantity");
  if (!slInput || !quantityInput || !isMarketOrder()) {
    if (!isMarketOrder()) {
      renderPanel(`<strong>Risk Guard</strong><br>${symbol} · Market sizing ready<br><span style="color:#9ca3af">Select Market and enter your SL.</span>`);
    }
    return;
  }

  if (!state.verified) {
    renderPanel("🔴 <strong>Risk Guard BLOCKED</strong><br>Risk state could not be verified. Do not place a new order.", false);
    return;
  }

  const sl = Number(String(slInput.value).replace(/,/g, ""));
  if (!(sl > 0)) {
    renderPanel(`<strong>Risk Guard</strong><br>${symbol} · Enter SL to calculate safe size.`);
    return;
  }

  try {
    const market = await refreshMarket(symbol);
    const entry = Number(market.markPrice);
    const distance = Math.abs(entry - sl);
    const maxRisk = Number(state.risk?.maxLossPerTradeAmount || 0);
    if (!(entry > 0) || !(distance > 0) || !(maxRisk > 0)) {
      renderPanel("🔴 <strong>Risk Guard</strong><br>Unable to calculate a valid risk size.", false);
      return;
    }

    const rawSafeQty = maxRisk / distance;
    const step = Number(market.stepSize || 0);
    const safeQty = floorToStep(rawSafeQty, step);
    const riskAtSafeQty = distance * safeQty;
    const currentQty = Number(String(quantityInput.value).replace(/,/g, ""));
    const tooLarge = currentQty > 0 && currentQty > safeQty + step / 2;
    const currentIsAuto = state.lastAutoQuantity !== null && Math.abs(currentQty - state.lastAutoQuantity) < Math.max(step / 2, 1e-12);

    if (safeQty > 0 && safeQty <= Number(market.maxQty || Infinity)) {
      if (!currentQty || currentIsAuto) {
        setNativeInputValue(quantityInput, String(safeQty));
        state.lastAutoQuantity = safeQty;
      }
    }

    const displayQty = safeQty > 0 ? safeQty : 0;
    const precision = Math.min(12, Math.max(0, precisionFromStep(step)));
    const sizeText = displayQty.toFixed(precision).replace(/\.?0+$/, "");
    const status = tooLarge ? "⚠️ SIZE TOO LARGE" : "🟢 SIZE WITHIN RISK";
    const color = tooLarge ? "#fbbf24" : "#5de0ac";
    const side = getSide();
    const sideRule = side === "LONG" ? sl < entry : sl > entry;

    renderPanel(
      `<strong>Risk Guard · ${symbol}</strong><br>` +
      `Market/Mark: <b>${entry.toFixed(Math.min(8, Math.max(2, precisionFromStep(market.tickSize || 0.01))))}</b><br>` +
      `SL: <b>${sl}</b> · Distance: <b>${distance.toFixed(4)}</b><br>` +
      `Max risk: <b>$${maxRisk.toFixed(2)}</b><br>` +
      `Safe size: <b>${sizeText}</b> ${market.baseAsset || ""}<br>` +
      `Risk at safe size: <b>$${riskAtSafeQty.toFixed(2)}</b><br>` +
      `<span style="color:${sideRule ? color : "#ef4444"}">${sideRule ? status : "🔴 SL IS ON THE WRONG SIDE"}</span>`,
      sideRule && !tooLarge,
    );
  } catch (error) {
    renderPanel(`🔴 <strong>Risk Guard</strong><br>${error instanceof Error ? error.message : "Sizing failed."}`, false);
  }
}

async function initialLoad() {
  try {
    await refreshRisk();
    await updateSizing();
  } catch (error) {
    state.verified = false;
    document.documentElement.dataset.binanceRiskLock = "locked";
    renderPanel(`🔴 <strong>Risk Guard BLOCKED</strong><br>${error instanceof Error ? error.message : "Unable to verify risk state."}`, false);
  }
}

const observer = new MutationObserver(() => {
  clearTimeout(observer.timer);
  observer.timer = setTimeout(() => updateSizing(), 250);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("input", () => updateSizing(), true);
document.addEventListener("change", () => updateSizing(), true);

initialLoad();
setInterval(() => refreshRisk().catch(() => {
  state.verified = false;
  document.documentElement.dataset.binanceRiskLock = "locked";
}), RISK_REFRESH_MS);
setInterval(() => updateSizing(), SIZE_REFRESH_MS);

// V1 sizing is advisory + quantity autofill. Buy/Sell click interception remains disabled until live DOM testing.
