const $ = (id) => document.getElementById(id);

function formatPnl(value) {
  if (typeof value !== "number") return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({ dashboardUrl: "http://localhost:8787" });
  $("dashboardUrl").value = settings.dashboardUrl;
}

function render(state) {
  const { risk, cooldownUntil, verified } = state;
  $("pnl").textContent = typeof risk?.dailyPnlPercent === "number" ? formatPnl(risk.dailyPnlPercent) : "—";
  $("loss").textContent = typeof risk?.dailyLossPercent === "number" ? `${risk.dailyLossPercent.toFixed(2)}% / ${Number(risk.maxDailyLossPercent ?? 4.5).toFixed(2)}%` : "—";
  $("trades").textContent = typeof risk?.tradesToday === "number" ? `${risk.tradesToday} / ${risk.maxTrades ?? 5}` : "—";
  $("maxRisk").textContent = typeof risk?.maxLossPerTradeAmount === "number" ? `$${risk.maxLossPerTradeAmount.toFixed(2)}` : "—";

  if (!verified) {
    $("status").className = "status locked";
    $("status").textContent = "🔴 RISK STATE UNVERIFIED";
  } else if (cooldownUntil) {
    $("status").className = "status locked";
    $("status").textContent = `🔴 LOCKED · ${new Date(cooldownUntil).toLocaleTimeString()}`;
    $("activate").textContent = "EXTEND KILL SWITCH";
  } else if (risk?.status === "DAILY_LOSS_LIMIT_EXCEEDED") {
    $("status").className = "status locked";
    $("status").textContent = "🔴 DAILY LOSS LIMIT EXCEEDED";
  } else if (risk?.status === "TRADE_LIMIT_REACHED") {
    $("status").className = "status locked";
    $("status").textContent = "🔴 TRADE LIMIT REACHED";
  } else {
    $("status").className = "status";
    $("status").textContent = "🟢 RISK WITHIN LIMITS";
    $("activate").textContent = "ENABLE KILL SWITCH";
  }
}

async function load() {
  $("message").textContent = "Refreshing…";
  chrome.runtime.sendMessage({ type: "get-state" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      $("message").textContent = response?.error || chrome.runtime.lastError?.message || "Unable to read dashboard.";
      render({ risk: null, cooldownUntil: response?.cooldownUntil || null, verified: false });
      return;
    }
    render(response);
    $("message").textContent = "";
  });
}

$("saveDashboard").addEventListener("click", async () => {
  const raw = $("dashboardUrl").value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(raw)) {
    $("message").textContent = "Enter a full dashboard URL starting with https://";
    return;
  }

  try {
    const url = new URL(raw);
    const originPattern = `${url.protocol}//${url.host}/*`;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      $("message").textContent = "Dashboard permission was not granted.";
      return;
    }
    chrome.runtime.sendMessage({ type: "save-settings", dashboardUrl: raw }, (response) => {
      if (!response?.ok) {
        $("message").textContent = response?.error || "Unable to save dashboard URL.";
        return;
      }
      $("message").textContent = "Dashboard saved. Refreshing risk state…";
      load();
    });
  } catch {
    $("message").textContent = "Invalid dashboard URL.";
  }
});

$("activate").addEventListener("click", () => {
  const seconds = Number($("duration").value);
  const minutes = Math.round(seconds / 60);
  if (!confirm(`Enable new-order protection for ${minutes} minutes?`)) return;
  chrome.runtime.sendMessage({ type: "activate-cooldown", seconds }, (response) => {
    if (!response?.ok) {
      $("message").textContent = response?.error || "Unable to enable cooldown.";
      return;
    }
    $("message").textContent = `New-order protection active until ${new Date(response.cooldownUntil).toLocaleTimeString()}.`;
    load();
  });
});

loadSettings();
load();
