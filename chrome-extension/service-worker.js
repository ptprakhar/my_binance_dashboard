const DEFAULT_DASHBOARD_URL = "http://localhost:8787";

async function getSettings() {
  return chrome.storage.local.get({ dashboardUrl: DEFAULT_DASHBOARD_URL });
}

function localDayStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

async function fetchRiskState() {
  const { dashboardUrl } = await getSettings();
  const base = dashboardUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ startTime: String(localDayStart()), endTime: String(Date.now()) });
  const response = await fetch(`${base}/api/risk-state?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dashboard returned HTTP ${response.status}`);
  return response.json();
}

async function fetchRiskSymbol(symbol) {
  const { dashboardUrl } = await getSettings();
  const base = dashboardUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/api/risk-symbol?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dashboard market data returned HTTP ${response.status}`);
  return response.json();
}

async function getCooldown() {
  const { cooldownUntil = null } = await chrome.storage.local.get({ cooldownUntil: null });
  return cooldownUntil && cooldownUntil > Date.now() ? cooldownUntil : null;
}

async function getCombinedState() {
  try {
    const [risk, cooldownUntil] = await Promise.all([fetchRiskState(), getCooldown()]);
    return { ok: true, risk, cooldownUntil, verified: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to verify risk state.",
      cooldownUntil: await getCooldown(),
      verified: false,
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get-state") {
    getCombinedState().then(sendResponse);
    return true;
  }

  if (message?.type === "get-symbol-market") {
    const symbol = String(message.symbol || "").toUpperCase();
    fetchRiskSymbol(symbol)
      .then((market) => sendResponse({ ok: true, market }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to read market data." }));
    return true;
  }

  if (message?.type === "activate-cooldown") {
    const seconds = Number(message.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      sendResponse({ ok: false, error: "Invalid cooldown duration." });
      return false;
    }
    const cooldownUntil = Date.now() + seconds * 1000;
    chrome.storage.local.set({ cooldownUntil }).then(async () => {
      await chrome.alarms.create("risk-cooldown", { when: cooldownUntil });
      sendResponse({ ok: true, cooldownUntil });
    });
    return true;
  }

  if (message?.type === "clear-cooldown") {
    chrome.alarms.clear("risk-cooldown");
    chrome.storage.local.remove("cooldownUntil").then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "save-settings") {
    const dashboardUrl = String(message.dashboardUrl || "").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(dashboardUrl)) {
      sendResponse({ ok: false, error: "Dashboard URL must start with http:// or https://" });
      return false;
    }
    chrome.storage.local.set({ dashboardUrl }).then(() => sendResponse({ ok: true, dashboardUrl }));
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "risk-cooldown") return;
  await chrome.storage.local.remove("cooldownUntil");
});
