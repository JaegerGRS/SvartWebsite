/**
 * /api/health — Service health check endpoint
 *
 * Returns server status, available services, and KV connectivity.
 * Used by desktop apps to verify end-to-end connectivity.
 *
 * GET /api/health
 *   Returns: { status, timestamp, version, services, kv }
 *
 * GET /api/health?deep=1
 *   Also checks KV reads + available API endpoints
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const deep = url.searchParams.get("deep") === "1";

  const result: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    server: "cloudflare-pages",
    endpoints: [
      "/api/health",
      "/api/auth",
      "/api/verify",
      "/api/app-status",
      "/api/usage",
    ],
  };

  // Deep check: verify KV is available
  if (deep) {
    try {
      if (context.env && context.env.USAGE_DATA) {
        // Write + read a test key
        const testKey = `health-check:${Date.now()}`;
        await context.env.USAGE_DATA.put(testKey, "ok", { expirationTtl: 60 });
        const val = await context.env.USAGE_DATA.get(testKey);
        result.kv = { connected: val === "ok", latency: "ok" };
        // Clean up
        await context.env.USAGE_DATA.delete(testKey);
      } else {
        result.kv = { connected: false, error: "KV namespace not bound" };
      }
    } catch (e) {
      result.kv = { connected: false, error: e instanceof Error ? e.message : "KV error" };
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-cache",
    },
  });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
