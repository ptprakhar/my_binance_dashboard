const $ = (id) => document.getElementById(id);

function formatPnl(value) {
  if (typeof value !== "number") return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function render(state) {
  const { risk, cooldownUntil } = state;
  $("pnl").textContent = typeof risk?.dailyPnlPercent === "number" ? formatPnl(risk.dailyPnlPercent) : "—";
  $("loss").textContent = typeof risk?.dailyLossPercent === "number" ? `${risk.dailyLossPercent.toFixed(2)}% / 4.50%` : "—";
  $("trades").textContent = typeof risk?.tradesToday === "number" ? `${risk.tradesToday} / ${risk.maxTrades ?? 5}` : "—";

  if (cooldownUntil) {
    $("status").className = "status locked";
    $("status").textContent = `🔴 LOCKED · ${new Date(cooldownUntil).toLocaleTimeString()}`;
    $("activate").textContent = "EXTEND KILL SWITCH";
  } else if (risk?.status === "DAILY_LOSS_LIMIT_EXCEEDED") {
    $("status").className = "status locked";
    $("status").textContent = "🔴 DAILY LOSS LIMIT EXCEEDED";
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
      return;
    }
    render(response);
    $("message").textContent = "";
  });
}

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

load();
