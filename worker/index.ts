import { getBinanceConnectivity, getBinanceReadAccess, getFuturesSnapshot, type Env } from "./binance";

const DEPLOY_MARKER = "cloudflare-direct-binance-v2";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}

function hasBinanceCredentials(env: Env): boolean {
  return Boolean(env.BINANCE_API_KEY && (env.BINANCE_ED25519_PRIVATE_KEY || env.BINANCE_API_SECRET));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "binance-risk-dashboard",
        deployment: DEPLOY_MARKER,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/binance/connectivity" && request.method === "GET") {
      try {
        if (!hasBinanceCredentials(env)) {
          return json({
            error: "Binance credentials are not configured on this Worker.",
            deployment: DEPLOY_MARKER,
          }, 503);
        }
        return json(await getBinanceConnectivity(env));
      } catch (error) {
        return json({ deployment: DEPLOY_MARKER, error: errorMessage(error) }, 502);
      }
    }

    if (url.pathname === "/api/binance/access" && request.method === "GET") {
      try {
        if (!hasBinanceCredentials(env)) {
          return json({ error: "Binance credentials are not configured on this Worker.", deployment: DEPLOY_MARKER }, 503);
        }
        return json({ deployment: DEPLOY_MARKER, ...(await getBinanceReadAccess(env)) });
      } catch (error) {
        return json({ deployment: DEPLOY_MARKER, error: errorMessage(error) }, 502);
      }
    }

    if (url.pathname === "/api/binance/futures" && request.method === "GET") {
      try {
        if (!hasBinanceCredentials(env)) {
          return json({
            error: "Binance is not configured yet. Add BINANCE_API_KEY and BINANCE_ED25519_PRIVATE_KEY as Worker secrets.",
            mode: "not_configured",
            deployment: DEPLOY_MARKER,
          }, 503);
        }

        return json({ deployment: DEPLOY_MARKER, ...(await getFuturesSnapshot(env)) });
      } catch (error) {
        return json({ error: errorMessage(error), deployment: DEPLOY_MARKER }, 502);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API route not found.", deployment: DEPLOY_MARKER }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
