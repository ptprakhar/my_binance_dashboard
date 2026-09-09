export type Env = {
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  BINANCE_ED25519_PRIVATE_KEY?: string;
  BINANCE_FUTURES_BASE_URL?: string;
  ASSETS: Fetcher;
};

type BinanceAccount = {
  totalWalletBalance?: string;
  availableBalance?: string;
  totalMarginBalance?: string;
  totalUnrealizedProfit?: string;
  totalInitialMargin?: string;
};

type BinancePosition = {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  liquidationPrice: string;
};

type BinanceOrder = {
  orderId: number;
  symbol: string;
  side: string;
  type: string;
  origQty: string;
  price: string;
  status: string;
};

type BinanceIncome = {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  time: number;
  info?: string;
};

type BinanceApiRestrictions = {
  ipRestrict?: boolean;
  enableReading?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  enableMargin?: boolean;
  enableFutures?: boolean;
  permitsUniversalTransfer?: boolean;
  enableVanillaOptions?: boolean;
  enableFixApiTrade?: boolean;
  enableFixReadOnly?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enablePortfolioMarginTrading?: boolean;
};

type BinanceAccountInfo = {
  vipLevel?: number;
  isMarginEnabled?: boolean;
  isFutureEnabled?: boolean;
  isOptionsEnabled?: boolean;
  isPortfolioMarginRetailEnabled?: boolean;
};

type BinanceAccountStatus = {
  data?: string;
};

const DEFAULT_BASE_URL = "https://fapi.binance.com";
const BINANCE_GENERAL_BASE_URL = "https://api.binance.com";
const RISK_GUARD_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "BTCUSDC", "ETHUSDC"]);

function number(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePem(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n");
}

function pemToDer(pem: string): ArrayBuffer {
  const normalized = normalizePem(pem);
  const match = normalized.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);

  if (!match) {
    throw new Error(
      "BINANCE_ED25519_PRIVATE_KEY is not a PEM private key. Expected a PKCS#8 key beginning with -----BEGIN PRIVATE KEY-----.",
    );
  }

  const base64 = match[2].replace(/[\s\uFEFF]/g, "");

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error(
      "BINANCE_ED25519_PRIVATE_KEY contains invalid PEM base64 data. Check that the complete private-key block was pasted into the Worker secret, including BEGIN/END lines, with no extra characters.",
    );
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret);
  const messageData = new TextEncoder().encode(message);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ed25519Sign(privateKeyPem: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(message));

  let binary = "";
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function signedRequest<T>(
  env: Env,
  baseUrl: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  if (!env.BINANCE_API_KEY) {
    throw new Error("BINANCE_API_KEY is not configured on this Worker.");
  }
  if (!env.BINANCE_ED25519_PRIVATE_KEY && !env.BINANCE_API_SECRET) {
    throw new Error("Configure BINANCE_ED25519_PRIVATE_KEY on this Worker.");
  }

  const timestamp = Date.now().toString();
  const query = new URLSearchParams({ ...params, recvWindow: "10000", timestamp });
  const payload = query.toString();
  const signature = env.BINANCE_ED25519_PRIVATE_KEY
    ? await ed25519Sign(env.BINANCE_ED25519_PRIVATE_KEY, payload)
    : await hmacSha256(env.BINANCE_API_SECRET!, payload);
  query.set("signature", signature);

  const response = await fetch(`${baseUrl}${path}?${query.toString()}`, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": env.BINANCE_API_KEY,
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "unknown";
  const rawBody = await response.text();
  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    const preview = rawBody.replace(/\s+/g, " ").slice(0, 500);
    throw new Error(
      `Binance returned non-JSON from ${path}: HTTP ${response.status}, content-type ${contentType}, body starts with ${JSON.stringify(preview)}`,
    );
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "msg" in body && typeof body.msg === "string"
      ? body.msg
      : undefined;
    throw new Error(message || `Binance API request failed (${response.status}).`);
  }

  return body as T;
}

async function publicRequest(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "unknown";
  const rawBody = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = rawBody.replace(/\s+/g, " ").slice(0, 500);
  }
  return {
    ok: response.ok,
    status: response.status,
    contentType,
    body: response.ok ? body : typeof body === "string" ? body : body,
  };
}

async function publicJsonRequest<T>(baseUrl: string, path: string): Promise<T> {
  const result = await publicRequest(baseUrl, path);
  if (!result.ok) {
    throw new Error(`Binance public market data failed (${result.status}).`);
  }
  return result.body as T;
}

async function probeSigned(env: Env, baseUrl: string, path: string) {
  try {
    const body = await signedRequest<unknown>(env, baseUrl, path);
    return { ok: true, status: 200, body };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unexpected error." };
  }
}

export async function getBinanceConnectivity(env: Env) {
  const futuresBaseUrl = env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_BASE_URL;
  const futuresPublicTime = await publicRequest(futuresBaseUrl, "/fapi/v1/time");
  const generalPublicTime = await publicRequest(BINANCE_GENERAL_BASE_URL, "/api/v3/time");
  const generalSigned = await probeSigned(env, BINANCE_GENERAL_BASE_URL, "/sapi/v1/account/apiRestrictions");
  const futuresSignedAccount = await probeSigned(env, futuresBaseUrl, "/fapi/v2/account");
  const futuresSignedPositions = await probeSigned(env, futuresBaseUrl, "/fapi/v2/positionRisk");

  return {
    deployment: "connectivity-diagnostic-v1",
    tests: {
      futuresPublicTime,
      generalPublicTime,
      generalSigned,
      futuresSignedAccount,
      futuresSignedPositions,
    },
    interpretation: {
      "futuresPublicTime 200 + futures signed 403": "Futures edge is reachable, but the signed Futures request is being rejected; focus on authentication/signature/request handling or Futures-specific WAF policy.",
      "futuresPublicTime 403": "The Worker-to-Futures Binance edge is blocked before a normal API response; this points toward upstream WAF/egress treatment rather than account permissions alone.",
      "generalSigned 200 + futuresSignedAccount 403": "General Binance signed authentication works from the Worker, while the Futures edge/path rejects the signed request.",
      "generalSigned 403": "General Binance signed requests are also being rejected from the Worker; this points toward a broader egress/WAF or signed-request issue.",
    },
    fetchedAt: new Date().toISOString(),
  };
}

export async function getBinanceReadAccess(env: Env) {
  const [permissions, accountInfo, accountStatus] = await Promise.all([
    signedRequest<BinanceApiRestrictions>(env, BINANCE_GENERAL_BASE_URL, "/sapi/v1/account/apiRestrictions"),
    signedRequest<BinanceAccountInfo>(env, BINANCE_GENERAL_BASE_URL, "/sapi/v1/account/info"),
    signedRequest<BinanceAccountStatus>(env, BINANCE_GENERAL_BASE_URL, "/sapi/v1/account/status"),
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

export async function getFuturesSnapshot(env: Env, startTime?: number, endTime?: number) {
  const baseUrl = env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_BASE_URL;
  const [account, positions, openOrders, income] = await Promise.all([
    signedRequest<BinanceAccount>(env, baseUrl, "/fapi/v2/account"),
    signedRequest<BinancePosition[]>(env, baseUrl, "/fapi/v2/positionRisk"),
    signedRequest<BinanceOrder[]>(env, baseUrl, "/fapi/v1/openOrders"),
    startTime !== undefined
      ? signedRequest<BinanceIncome[]>(env, baseUrl, "/fapi/v1/income", {
          startTime: String(startTime),
          ...(endTime !== undefined ? { endTime: String(endTime) } : {}),
          limit: "1000",
        })
      : Promise.resolve([] as BinanceIncome[]),
  ]);

  const realizedPnl = income
    .filter((entry) => entry.incomeType === "REALIZED_PNL")
    .reduce((sum, entry) => sum + number(entry.income), 0);
  const commissions = income
    .filter((entry) => entry.incomeType === "COMMISSION")
    .reduce((sum, entry) => sum + number(entry.income), 0);
  const fundingFees = income
    .filter((entry) => entry.incomeType === "FUNDING_FEE")
    .reduce((sum, entry) => sum + number(entry.income), 0);
  const dailyPnl = realizedPnl + commissions + fundingFees;

  return {
    account: {
      walletBalance: number(account.totalWalletBalance),
      availableBalance: number(account.availableBalance),
      marginBalance: number(account.totalMarginBalance),
      unrealizedPnl: number(account.totalUnrealizedProfit),
      totalInitialMargin: number(account.totalInitialMargin),
    },
    dailyPnl: {
      net: dailyPnl,
      realizedPnl,
      commissions,
      fundingFees,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
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
    mode: "live" as const,
  };
}

type BinanceUserTrade = {
  orderId: number;
  time: number;
};

type BinanceExchangeInfo = {
  symbols?: Array<{
    symbol?: string;
    status?: string;
    baseAsset?: string;
    quoteAsset?: string;
    filters?: Array<{
      filterType?: string;
      minQty?: string;
      maxQty?: string;
      stepSize?: string;
      tickSize?: string;
      minPrice?: string;
      maxPrice?: string;
      minNotional?: string;
    }>;
  }>;
};

type BinanceMarkPrice = {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  time?: number;
};

export async function getRiskState(env: Env, startTime?: number, endTime?: number) {
  const end = endTime ?? Date.now();
  const start = startTime ?? new Date(new Date(end).setHours(0, 0, 0, 0)).getTime();
  const snapshot = await getFuturesSnapshot(env, start, end);
  const baseUrl = env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_BASE_URL;
  const symbols = [...RISK_GUARD_SYMBOLS];
  const tradesBySymbol = await Promise.all(
    symbols.map((symbol) => signedRequest<BinanceUserTrade[]>(env, baseUrl, "/fapi/v1/userTrades", {
      symbol,
      startTime: String(start),
      endTime: String(end),
      limit: "1000",
    })),
  );
  const orderIds = new Set<number>();
  tradesBySymbol.flat().forEach((trade) => orderIds.add(trade.orderId));

  const walletBalance = snapshot.account.walletBalance;
  const dailyPnlPercent = walletBalance > 0 ? (snapshot.dailyPnl.net / walletBalance) * 100 : 0;
  const dailyLossPercent = Math.max(0, -dailyPnlPercent);
  const maxLossPerTradePercent = 1.5;
  const maxLossPerTradeAmount = walletBalance * (maxLossPerTradePercent / 100);

  return {
    walletBalance,
    availableBalance: snapshot.account.availableBalance,
    dailyPnl: snapshot.dailyPnl.net,
    dailyPnlPercent,
    dailyLossPercent,
    maxDailyLossPercent: 4.5,
    maxLossPerTradePercent,
    maxLossPerTradeAmount,
    tradesToday: orderIds.size,
    maxTrades: 5,
    status: dailyLossPercent >= 4.5 ? "DAILY_LOSS_LIMIT_EXCEEDED" : orderIds.size >= 5 ? "TRADE_LIMIT_REACHED" : "OK",
    startTime: start,
    endTime: end,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getRiskSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (!RISK_GUARD_SYMBOLS.has(normalized)) {
    throw new Error(`Unsupported risk-guard symbol: ${normalized}.`);
  }

  const [markPrice, exchangeInfo] = await Promise.all([
    publicJsonRequest<BinanceMarkPrice>(DEFAULT_BASE_URL, `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(normalized)}`),
    publicJsonRequest<BinanceExchangeInfo>(DEFAULT_BASE_URL, `/fapi/v1/exchangeInfo?symbol=${encodeURIComponent(normalized)}`),
  ]);
  const symbolInfo = exchangeInfo.symbols?.find((entry) => entry.symbol === normalized);
  const lotSize = symbolInfo?.filters?.find((filter) => filter.filterType === "LOT_SIZE");
  const priceFilter = symbolInfo?.filters?.find((filter) => filter.filterType === "PRICE_FILTER");
  const minNotional = symbolInfo?.filters?.find((filter) => filter.filterType === "MIN_NOTIONAL");

  if (!symbolInfo || !lotSize?.stepSize) {
    throw new Error(`Binance trading rules are unavailable for ${normalized}.`);
  }

  return {
    symbol: normalized,
    status: symbolInfo.status ?? "UNKNOWN",
    baseAsset: symbolInfo.baseAsset ?? null,
    quoteAsset: symbolInfo.quoteAsset ?? null,
    markPrice: number(markPrice.markPrice),
    indexPrice: number(markPrice.indexPrice),
    stepSize: number(lotSize.stepSize),
    minQty: number(lotSize.minQty),
    maxQty: number(lotSize.maxQty),
    tickSize: number(priceFilter?.tickSize),
    minNotional: number(minNotional?.minNotional),
    fetchedAt: new Date().toISOString(),
  };
}
