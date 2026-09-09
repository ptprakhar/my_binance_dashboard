import { getFuturesSnapshot, type Env } from "./binance";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "binance-risk-dashboard", timestamp: new Date().toISOString() });
    }

    if (url.pathname === "/api/binance/futures" && request.method === "GET") {
      try {
        if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
          return json({
            error: "Binance is not configured yet. Add BINANCE_API_KEY and BINANCE_API_SECRET as Worker secrets.",
            mode: "not_configured",
          }, 503);
        }

        return json(await getFuturesSnapshot(env));
      } catch (error) {
        return json({ error: errorMessage(error) }, 502);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API route not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
