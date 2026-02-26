interface Env {
  CIPHER_KV: KVNamespace;
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

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const counts: Record<string, number> = {};

  for (const platform of VALID_PLATFORMS) {
    const value = await context.env.CIPHER_KV.get(`downloads:${platform}`);
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
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: { platform?: string };

  try {
    body = await context.request.json();
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid JSON body" },
      400
    );
  }

  const platform = body.platform?.toLowerCase();

  if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
    return jsonResponse(
      {
        success: false,
        error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}`,
      },
      400
    );
  }

  const key = `downloads:${platform}`;
  const current = await context.env.CIPHER_KV.get(key);
  const newCount = (current ? parseInt(current, 10) : 0) + 1;

  await context.env.CIPHER_KV.put(key, newCount.toString());

  return jsonResponse({
    success: true,
    data: {
      platform,
      count: newCount,
    },
  });
};
