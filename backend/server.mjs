import http from "node:http";
import { createPrivateKey, sign } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const API_KEY = process.env.BINANCE_API_KEY;
const PRIVATE_KEY_PEM = process.env.BINANCE_ED25519_PRIVATE_KEY;
const PROXY_TOKEN = process.env.BINANCE_PROXY_TOKEN;
const FUTURES_BASE_URL = process.env.BINANCE_FUTURES_BASE_URL ?? "https://fapi.binance.com";
const GENERAL_BASE_URL = "https://api.binance.com";

if (!API_KEY || !PRIVATE_KEY_PEM || !PROXY_TOKEN) {
  throw new Error("BINANCE_API_KEY, BINANCE_ED25519_PRIVATE_KEY, and BINANCE_PROXY_TOKEN are required.");
}

const privateKey = createPrivateKey(PRIVATE_KEY_PEM.trim());

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function authenticate(req) {
  return req.headers.authorization === `Bearer ${PROXY_TOKEN}`;
}

function signPayload(payload) {
  return sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
}

async function signedGet(baseUrl, path, params = {}) {
  const query = new URLSearchParams({
    ...params,
    recvWindow: "10000",
    timestamp: Date.now().toString(),
  });
  const payload = query.toString();
  query.set("signature", signPayload(payload));

  const response = await fetch(`${baseUrl}${path}?${query.toString()}`, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": API_KEY,
      Accept: "application/json",
      "User-Agent": "my-binance-dashboard-backend/1.0",
    },
  });

  const contentType = response.headers.get("content-type") ?? "unknown";
  const rawBody = await response.text();
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `Binance returned non-JSON from ${path}: HTTP ${response.status}, content-type ${contentType}, body starts with ${JSON.stringify(rawBody.replace(/\s+/g, " ").slice(0, 500))}`,
    );
  }

  if (!response.ok) {
    const message = body && typeof body === "object" && typeof body.msg === "string" ? body.msg : undefined;
    throw new Error(message || `Binance API request failed (${response.status}).`);
  }

  return body;
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getAccess() {
  const [permissions, accountInfo, accountStatus] = await Promise.all([
    signedGet(GENERAL_BASE_URL, "/sapi/v1/account/apiRestrictions"),
    signedGet(GENERAL_BASE_URL, "/sapi/v1/account/info"),
    signedGet(GENERAL_BASE_URL, "/sapi/v1/account/status"),
  ]);

  return {
    api: "Binance General REST API",
    permissions: {
      ipRestrict: Boolean(permissions.ipRestrict),
      enableReading: Boolean(permissions.enableReading),
      enableFutures: Boolean(permissions.enableFutures),
      enableSpotAndMarginTrading: Boolean(permissions.enableSpotAndMarginTrading),
      enableWithdrawals: Boolean(permissions.enableWithdrawals),
      enableInternalTransfer: Boolean(permissions.enableInternalTransfer),
      permitsUniversalTransfer: Boolean(permissions.permitsUniversalTransfer),
      enableMargin: Boolean(permissions.enableMargin),
      enableVanillaOptions: Boolean(permissions.enableVanillaOptions),
      enableFixApiTrade: Boolean(permissions.enableFixApiTrade),
      enableFixReadOnly: Boolean(permissions.enableFixReadOnly),
      enablePortfolioMarginTrading: Boolean(permissions.enablePortfolioMarginTrading),
    },
    account: {
      status: accountStatus.data ?? "unknown",
      vipLevel: number(accountInfo.vipLevel),
      marginEnabled: Boolean(accountInfo.isMarginEnabled),
      futuresEnabledOnAccount: Boolean(accountInfo.isFutureEnabled),
      optionsEnabled: Boolean(accountInfo.isOptionsEnabled),
      portfolioMarginEnabled: Boolean(accountInfo.isPortfolioMarginRetailEnabled),
    },
    fetchedAt: new Date().toISOString(),
  };
}

async function getFutures() {
  const [account, positions, openOrders] = await Promise.all([
    signedGet(FUTURES_BASE_URL, "/fapi/v2/account"),
    signedGet(FUTURES_BASE_URL, "/fapi/v2/positionRisk"),
    signedGet(FUTURES_BASE_URL, "/fapi/v1/openOrders"),
  ]);

  return {
    account: {
      walletBalance: number(account.totalWalletBalance),
      availableBalance: number(account.availableBalance),
      marginBalance: number(account.totalMarginBalance),
      unrealizedPnl: number(account.totalUnrealizedProfit),
      totalInitialMargin: number(account.totalInitialMargin),
    },
    positions: positions
      .map((position) => {
        const quantity = number(position.positionAmt);
        const side = quantity > 0 ? "LONG" : quantity < 0 ? "SHORT" : "FLAT";
        return {
          symbol: position.symbol,
          side,
          quantity: Math.abs(quantity),
          entryPrice: number(position.entryPrice),
          markPrice: number(position.markPrice),
          unrealizedPnl: number(position.unRealizedProfit),
          leverage: number(position.leverage),
          liquidationPrice: number(position.liquidationPrice) || null,
        };
      })
      .filter((position) => position.side !== "FLAT"),
    openOrders: openOrders.map((order) => ({
      orderId: String(order.orderId),
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: number(order.origQty),
      price: number(order.price),
      status: order.status,
    })),
    serverTime: Date.now(),
    fetchedAt: new Date().toISOString(),
    mode: "live",
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, service: "binance-dashboard-backend", timestamp: new Date().toISOString() });
    }

    if (!authenticate(req)) {
      return sendJson(res, 401, { error: "Unauthorized." });
    }

    if (req.method === "GET" && req.url === "/binance/access") {
      return sendJson(res, 200, await getAccess());
    }

    if (req.method === "GET" && req.url === "/binance/futures") {
      return sendJson(res, 200, await getFutures());
    }

    return sendJson(res, 404, { error: "Route not found." });
  } catch (error) {
    return sendJson(res, 502, { error: error instanceof Error ? error.message : "Unexpected backend error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Binance backend listening on ${HOST}:${PORT}`);
});
