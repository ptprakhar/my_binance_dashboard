import type { Env as BinanceEnv } from "./binance";

type Env = BinanceEnv & {
  BINANCE_PROXY_URL?: string;
  BINANCE_PROXY_TOKEN?: string;
};

const DEPLOY_MARKER = "fixed-ip-backend-v1";

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

function hasProxyConfig(env: Env): boolean {
  return Boolean(env.BINANCE_PROXY_URL && env.BINANCE_PROXY_TOKEN);
}

async function proxyGet(env: Env, path: string): Promise<Response> {
  if (!hasProxyConfig(env)) {
    return json({
      error: "Binance backend is not configured. Add BINANCE_PROXY_URL and BINANCE_PROXY_TOKEN as Worker secrets.",
      mode: "not_configured",
      deployment: DEPLOY_MARKER,
    }, 503);
  }

  const baseUrl = env.BINANCE_PROXY_URL!.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.BINANCE_PROXY_TOKEN}`,
      Accept: "application/json",
    },
  });

  const contentType = response.headers.get("content-type") ?? "application/json";
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "binance-risk-dashboard",
        deployment: DEPLOY_MARKER,
        backendConfigured: hasProxyConfig(env),
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/binance/access" && request.method === "GET") {
      try {
        const response = await proxyGet(env, "/binance/access");
        const body = await response.json().catch(() => ({ error: "Backend returned invalid JSON." }));
        return json({ deployment: DEPLOY_MARKER, ...(body as object) }, response.status);
      } catch (error) {
        return json({ deployment: DEPLOY_MARKER, error: errorMessage(error) }, 502);
      }
    }

    if (url.pathname === "/api/binance/futures" && request.method === "GET") {
      try {
        const response = await proxyGet(env, "/binance/futures");
        const body = await response.json().catch(() => ({ error: "Backend returned invalid JSON." }));
        return json({ deployment: DEPLOY_MARKER, ...(body as object) }, response.status);
      } catch (error) {
        return json({ deployment: DEPLOY_MARKER, error: errorMessage(error) }, 502);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API route not found.", deployment: DEPLOY_MARKER }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
