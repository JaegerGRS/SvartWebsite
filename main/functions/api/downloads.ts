interface Env {
  USAGE_DATA: KVNamespace;
}

const VALID_PLATFORMS = ["windows", "macos", "linux"] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

function errorResponse(error: string, status = 500): Response {
  return jsonResponse({ success: false, error }, status);
}

function checkKV(env: Env): boolean {
  return !!(env && env.USAGE_DATA);
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const counts: Record<string, number> = {};

    for (const platform of VALID_PLATFORMS) {
      const value = await context.env.USAGE_DATA.get(`downloads:${platform}`);
      counts[platform] = value ? parseInt(value, 10) : 0;
    }

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return jsonResponse({
      success: true,
      data: {
        platforms: counts,
        total,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    let body: { platform?: string };

    try {
      body = await context.request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const platform = body.platform?.toLowerCase();

    if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
      return errorResponse(
        `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
        400
      );
    }

    const key = `downloads:${platform}`;
    const current = await context.env.USAGE_DATA.get(key);
    const newCount = (current ? parseInt(current, 10) : 0) + 1;

    await context.env.USAGE_DATA.put(key, newCount.toString());

    return jsonResponse({
      success: true,
      data: {
        platform,
        count: newCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};
