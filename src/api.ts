import type { FuturesSnapshot } from "./types";

export async function fetchFuturesSnapshot(signal?: AbortSignal): Promise<FuturesSnapshot> {
  const response = await fetch("/api/binance/futures", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const payload = (await response.json()) as FuturesSnapshot | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Unable to load Binance data");
  }

  return payload as FuturesSnapshot;
}
