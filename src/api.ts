import type { FuturesSnapshot } from "./types";

export async function fetchFuturesSnapshot(signal?: AbortSignal): Promise<FuturesSnapshot> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endTime = now.getTime();
  const params = new URLSearchParams({
    startTime: String(startOfDay),
    endTime: String(endTime),
  });

  const response = await fetch(`/api/binance/futures?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = raw.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`API returned ${response.status} ${response.statusText || "response"} instead of JSON (${contentType || "unknown content type"}). ${preview}`);
  }

  let payload: FuturesSnapshot | { error?: string };
  try {
    payload = JSON.parse(raw) as FuturesSnapshot | { error?: string };
  } catch {
    throw new Error(`API returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Unable to load Binance data");
  }

  return payload as FuturesSnapshot;
}
