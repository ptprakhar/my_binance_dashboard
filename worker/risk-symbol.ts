type Env = {
  BINANCE_FUTURES_BASE_URL?: string;
};

type ExchangeInfo = {
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
      minNotional?: string;
    }>;
  }>;
};

type MarkPrice = {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  time?: number;
};

const DEFAULT_BASE_URL = "https://fapi.binance.com";
const SUPPORTED_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "BTCUSDC", "ETHUSDC"]);

function num(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function publicJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Binance public market data failed (${response.status}).`);
  return JSON.parse(await response.text()) as T;
}

export async function getMarketRiskSymbol(env: Env, rawSymbol: string) {
  const symbol = rawSymbol.toUpperCase();
  if (!SUPPORTED_SYMBOLS.has(symbol)) {
    throw new Error(`Unsupported risk-guard symbol: ${symbol}.`);
  }

  const baseUrl = env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_BASE_URL;
  const [mark, info] = await Promise.all([
    publicJson<MarkPrice>(baseUrl, `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`),
    publicJson<ExchangeInfo>(baseUrl, `/fapi/v1/exchangeInfo?symbol=${encodeURIComponent(symbol)}`),
  ]);

  const symbolInfo = info.symbols?.find((entry) => entry.symbol === symbol);
  const filters = symbolInfo?.filters ?? [];
  const marketLot = filters.find((filter) => filter.filterType === "MARKET_LOT_SIZE");
  const lot = filters.find((filter) => filter.filterType === "LOT_SIZE");
  const quantityRule = marketLot?.stepSize ? marketLot : lot;
  const priceFilter = filters.find((filter) => filter.filterType === "PRICE_FILTER");
  const minNotional = filters.find((filter) => filter.filterType === "MIN_NOTIONAL");

  if (!symbolInfo || !quantityRule?.stepSize) {
    throw new Error(`Binance market trading rules are unavailable for ${symbol}.`);
  }

  return {
    symbol,
    status: symbolInfo.status ?? "UNKNOWN",
    baseAsset: symbolInfo.baseAsset ?? null,
    quoteAsset: symbolInfo.quoteAsset ?? null,
    markPrice: num(mark.markPrice),
    indexPrice: num(mark.indexPrice),
    stepSize: num(quantityRule.stepSize),
    minQty: num(quantityRule.minQty),
    maxQty: num(quantityRule.maxQty),
    tickSize: num(priceFilter?.tickSize),
    minNotional: num(minNotional?.minNotional),
    quantityRule: marketLot?.stepSize ? "MARKET_LOT_SIZE" : "LOT_SIZE",
    fetchedAt: new Date().toISOString(),
  };
}
