import { useCallback, useEffect, useState } from "react";
import { fetchFuturesSnapshot } from "./api";
import type { FuturesSnapshot, Position } from "./types";

const initialRules = [
  { label: "Daily loss", value: "4.5%", detail: "Hard risk ceiling" },
  { label: "Loss / trade", value: "1.5%", detail: "Maximum planned risk" },
  { label: "Trades / day", value: "5", detail: "Maximum entries" },
  { label: "Capital / day", value: "10%", detail: "Deployment ceiling" },
];

function money(value: number): string {
  return `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)} USDT`;
}

function price(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

function pnlClass(value: number): string {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function PositionRow({ position }: { position: Position }) {
  return (
    <div className="position-row">
      <div>
        <strong>{position.symbol}</strong>
        <span className={`side ${position.side.toLowerCase()}`}>{position.side}</span>
      </div>
      <span>{price(position.quantity)}</span>
      <span>{price(position.entryPrice)}</span>
      <span>{price(position.markPrice)}</span>
      <span className={pnlClass(position.unrealizedPnl)}>{money(position.unrealizedPnl)}</span>
      <span>{position.leverage}x</span>
    </div>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<FuturesSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFuturesSnapshot();
      setSnapshot(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const positions = snapshot?.positions ?? [];
  const orders = snapshot?.openOrders ?? [];
  const account = snapshot?.account;
  const dailyPnl = snapshot?.dailyPnl;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">PERSONAL RISK CONTROL</div>
          <h1>Binance Futures Dashboard</h1>
          <p className="subtitle">Monitor the account. Trade manually. Keep the risk rules visible.</p>
        </div>
        <div className="topbar-actions">
          <div className="connection"><span className={`dot ${snapshot?.mode === "live" ? "live" : ""}`} /> {snapshot?.mode === "live" ? "Binance connected" : "Not connected"}</div>
          <button className="refresh-button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh Binance"}
          </button>
        </div>
      </header>

      {error && <div className="alert error"><strong>Refresh failed.</strong><span>{error}</span></div>}

      <section className="hero-grid">
        <article className="card balance-card">
          <div className="card-label">FUTURES WALLET BALANCE</div>
          <div className="hero-value">{account ? money(account.walletBalance) : "—"}</div>
          <div className="muted">USDT wallet balance</div>
          <div className="metric-line"><span>Available</span><strong>{account ? money(account.availableBalance) : "—"}</strong></div>
          <div className="metric-line"><span>Margin balance</span><strong>{account ? money(account.marginBalance) : "—"}</strong></div>
        </article>

        <article className="card pnl-card">
          <div className="card-label">UNREALIZED P&L</div>
          <div className={`hero-value ${pnlClass(account?.unrealizedPnl ?? 0)}`}>{account ? money(account.unrealizedPnl) : "—"}</div>
          <div className="muted">Across open Futures positions</div>
          <div className="metric-line"><span>Initial margin</span><strong>{account ? money(account.totalInitialMargin) : "—"}</strong></div>
          <div className="metric-line"><span>Open positions</span><strong>{positions.length}</strong></div>
        </article>

        <article className="card daily-pnl-card">
          <div className="card-label">TODAY'S REALIZED P&L</div>
          <div className={`hero-value ${pnlClass(dailyPnl?.net ?? 0)}`}>{dailyPnl ? money(dailyPnl.net) : "—"}</div>
          <div className="muted">Net realized result since local midnight</div>
          <div className="metric-line"><span>Realized P&L</span><strong>{dailyPnl ? money(dailyPnl.realizedPnl) : "—"}</strong></div>
          <div className="metric-line"><span>Fees + funding</span><strong>{dailyPnl ? money(dailyPnl.commissions + dailyPnl.fundingFees) : "—"}</strong></div>
        </article>

        <article className="card status-card">
          <div className="card-label">TRADING STATUS</div>
          <div className="status-pill">MONITORING</div>
          <p>V1 is read-only. No order placement or position closing is enabled.</p>
          <div className="muted small">Kill switch comes after the monitoring layer is verified.</div>
        </article>
      </section>

      <section className="section-heading">
        <div><div className="eyebrow">TODAY</div><h2>Risk guardrails</h2></div>
        <span className="date-badge">Manual refresh mode</span>
      </section>

      <section className="rules-grid">
        {initialRules.map((rule) => (
          <article className="card rule-card" key={rule.label}>
            <span className="rule-label">{rule.label}</span>
            <strong>{rule.value}</strong>
            <span className="muted">{rule.detail}</span>
          </article>
        ))}
      </section>

      <section className="section-heading positions-heading">
        <div><div className="eyebrow">LIVE ACCOUNT STATE</div><h2>Open positions</h2></div>
        <span className="count-badge">{positions.length}</span>
      </section>

      <section className="card table-card">
        <div className="position-row table-head"><span>Symbol</span><span>Qty</span><span>Entry</span><span>Mark</span><span>uP&L</span><span>Lev.</span></div>
        {positions.length ? positions.map((position) => <PositionRow key={position.symbol} position={position} />) : <div className="empty">No open Futures positions.</div>}
      </section>

      <section className="section-heading positions-heading">
        <div><div className="eyebrow">ORDERS</div><h2>Open orders</h2></div>
        <span className="count-badge">{orders.length}</span>
      </section>
      <section className="card table-card">
        {orders.length ? orders.map((order) => (
          <div className="order-row" key={order.orderId}>
            <strong>{order.symbol}</strong><span>{order.side}</span><span>{order.type}</span><span>{price(order.quantity)}</span><span>{price(order.price)}</span><span>{order.status}</span>
          </div>
        )) : <div className="empty">No open orders.</div>}
      </section>

      <footer>
        <span>Read-only V1 · Binance Futures</span>
        <span>{lastRefresh ? `Last refresh ${lastRefresh.toLocaleTimeString()}` : "Not refreshed yet"}</span>
      </footer>
    </main>
  );
}
