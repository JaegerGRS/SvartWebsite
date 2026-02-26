interface Env {
  CIPHER_USAGE: KVNamespace;
}

const FREE_MONTHLY_LIMIT = 750;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const apiKey = context.request.headers.get("X-API-Key");

  if (!apiKey || apiKey.trim().length === 0) {
    return jsonResponse(
      { success: false, error: "Missing X-API-Key header" },
      401
    );
  }

  const monthKey = getCurrentMonthKey();
  const kvKey = `usage:${apiKey}:${monthKey}`;

  const currentUsageStr = await context.env.CIPHER_USAGE.get(kvKey);
  const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;
  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - currentUsage);
  const limitReached = remaining === 0;

  return jsonResponse({
    success: true,
    data: {
      period: monthKey,
      used: currentUsage,
      limit: FREE_MONTHLY_LIMIT,
      remaining,
      limitReached,
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.request.headers.get("X-API-Key");

  if (!apiKey || apiKey.trim().length === 0) {
    return jsonResponse(
      { success: false, error: "Missing X-API-Key header" },
      401
    );
  }

  const monthKey = getCurrentMonthKey();
  const kvKey = `usage:${apiKey}:${monthKey}`;

  const currentUsageStr = await context.env.CIPHER_USAGE.get(kvKey);
  const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;

  if (currentUsage >= FREE_MONTHLY_LIMIT) {
    return jsonResponse(
      {
        success: false,
        error: "Monthly free request limit reached",
        data: {
          period: monthKey,
          used: currentUsage,
          limit: FREE_MONTHLY_LIMIT,
          remaining: 0,
          limitReached: true,
        },
      },
      429
    );
  }

  const newUsage = currentUsage + 1;

  // Set expiry to ~60 days so old months auto-clean
  await context.env.CIPHER_USAGE.put(kvKey, newUsage.toString(), {
    expirationTtl: 60 * 60 * 24 * 60,
  });

  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - newUsage);

  return jsonResponse({
    success: true,
    data: {
      period: monthKey,
      used: newUsage,
      limit: FREE_MONTHLY_LIMIT,
      remaining,
      limitReached: remaining === 0,
    },
  });
};
