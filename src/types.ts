export type Position = {
  symbol: string;
  side: "LONG" | "SHORT" | "FLAT";
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number | null;
};

export type OpenOrder = {
  orderId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  status: string;
};

export type FuturesSnapshot = {
  account: {
    walletBalance: number;
    availableBalance: number;
    marginBalance: number;
    unrealizedPnl: number;
    totalInitialMargin: number;
  };
  positions: Position[];
  openOrders: OpenOrder[];
  serverTime: number;
  fetchedAt: string;
  mode: "live" | "not_configured";
};
