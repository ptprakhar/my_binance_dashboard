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

const DEFAULT_BASE_URL = "https://fapi.binance.com";

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

async function signedRequest<T>(env: Env, path: string, params: Record<string, string> = {}): Promise<T> {
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    throw new Error("Binance API credentials are not configured on this Worker.");
  }

  const timestamp = Date.now().toString();
  const query = new URLSearchParams({ ...params, recvWindow: "10000", timestamp });
  const signature = await hmacSha256(env.BINANCE_API_SECRET, query.toString());
  query.set("signature", signature);

  const response = await fetch(`${env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": env.BINANCE_API_KEY, Accept: "application/json" },
  });

  const body = (await response.json()) as T | { code?: number; msg?: string };
  if (!response.ok) {
    const message = typeof body === "object" && body && "msg" in body ? body.msg : undefined;
    throw new Error(message || `Binance API request failed (${response.status}).`);
  }
  return body as T;
}

export async function getFuturesSnapshot(env: Env) {
  const [account, positions, openOrders] = await Promise.all([
    signedRequest<BinanceAccount>(env, "/fapi/v2/account"),
    signedRequest<BinancePosition[]>(env, "/fapi/v2/positionRisk"),
    signedRequest<BinanceOrder[]>(env, "/fapi/v1/openOrders"),
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
