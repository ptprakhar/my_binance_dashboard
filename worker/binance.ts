export type Env = {
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
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

function number(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret);
  const messageData = new TextEncoder().encode(message);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedRequest<T>(
  env: Env,
  baseUrl: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    throw new Error("Binance API credentials are not configured on this Worker.");
  }

  const timestamp = Date.now().toString();
  const query = new URLSearchParams({ ...params, recvWindow: "10000", timestamp });
  const signature = await hmacSha256(env.BINANCE_API_SECRET, query.toString());
  query.set("signature", signature);

  const response = await fetch(`${baseUrl}${path}?${query.toString()}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": env.BINANCE_API_KEY, Accept: "application/json" },
  });

  const contentType = response.headers.get("content-type") ?? "unknown";
  const rawBody = await response.text();
  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    const preview = rawBody.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`Binance returned non-JSON from ${path}: HTTP ${response.status}, content-type ${contentType}, body starts with ${JSON.stringify(preview)}`);
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "msg" in body && typeof body.msg === "string"
      ? body.msg
      : undefined;
    throw new Error(message || `Binance API request failed (${response.status}).`);
  }

  return body as T;
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

export async function getFuturesSnapshot(env: Env) {
  const baseUrl = env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_BASE_URL;
  const [account, positions, openOrders] = await Promise.all([
    signedRequest<BinanceAccount>(env, baseUrl, "/fapi/v2/account"),
    signedRequest<BinancePosition[]>(env, baseUrl, "/fapi/v2/positionRisk"),
    signedRequest<BinanceOrder[]>(env, baseUrl, "/fapi/v1/openOrders"),
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
    mode: "live" as const,
  };
}
