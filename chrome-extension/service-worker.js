const DEFAULT_DASHBOARD_URL = "http://localhost:8787";

async function getSettings() {
  return chrome.storage.local.get({ dashboardUrl: DEFAULT_DASHBOARD_URL });
}

async function fetchRiskState() {
  const { dashboardUrl } = await getSettings();
  const response = await fetch(`${dashboardUrl.replace(/\/$/, "")}/api/risk-state`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dashboard returned HTTP ${response.status}`);
  return response.json();
}

async function getCooldown() {
  const { cooldownUntil = null } = await chrome.storage.local.get({ cooldownUntil: null });
  return cooldownUntil && cooldownUntil > Date.now() ? cooldownUntil : null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get-state") {
    Promise.all([fetchRiskState(), getCooldown()])
      .then(([risk, cooldownUntil]) => sendResponse({ ok: true, risk, cooldownUntil }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to read risk state." }));
    return true;
  }

  if (message?.type === "activate-cooldown") {
    const seconds = Number(message.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      sendResponse({ ok: false, error: "Invalid cooldown duration." });
      return false;
    }
    const cooldownUntil = Date.now() + seconds * 1000;
    chrome.storage.local.set({ cooldownUntil }).then(() => sendResponse({ ok: true, cooldownUntil }));
    return true;
  }

  if (message?.type === "clear-cooldown") {
    chrome.storage.local.remove("cooldownUntil").then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "risk-cooldown") return;
  await chrome.storage.local.remove("cooldownUntil");
});
