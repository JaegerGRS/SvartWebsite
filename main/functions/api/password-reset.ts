interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "svart-admin-2026";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(error: string, status = 500): Response {
  return jsonResponse({ success: false, error }, status);
}

function checkKV(env: Env): boolean {
  return !!(env && env.USAGE_DATA);
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — User submits a password reset request (email only)
// This logs the request so the admin can help recover the account
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured. Please contact admin.", 503);
    }

    let email = "";

    try {
      const body = (await context.request.json()) as { email: string };
      email = (body.email || "").trim().toLowerCase();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email) {
      return errorResponse("Email is required", 400);
    }

    // Check if the email is actually registered
    const keysRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
    const registered = !!keysRaw;

    // Log the reset request regardless (admin sees all attempts)
    const request = {
      email,
      registered,
      requestedAt: new Date().toISOString(),
      ip: context.request.headers.get("CF-Connecting-IP") || "unknown",
      country: context.request.headers.get("CF-IPCountry") || "unknown",
      status: "pending", // pending | resolved
    };

    // Store by timestamp for ordering
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await context.env.USAGE_DATA.put(
      `reset:${requestId}`,
      JSON.stringify(request)
    );

    // Append to the reset request log
    const logRaw = await context.env.USAGE_DATA.get("reset:log");
    let log: Array<{ id: string; email: string; date: string; registered: boolean; status: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }
    log.push({
      id: requestId,
      email,
      date: request.requestedAt,
      registered,
      status: "pending",
    });
    await context.env.USAGE_DATA.put("reset:log", JSON.stringify(log));

    // Always return the same message (don't reveal if email exists)
    return jsonResponse({
      success: true,
      message: "If this email is registered, an admin will be able to assist you. You can also reset your password immediately using your activation key (secret key).",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Password reset request failed: ${message}`, 500);
  }
};

// GET — Admin: view all password reset requests
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const auth = context.request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
      return errorResponse("Unauthorized", 401);
    }

    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured. Add KV namespace binding 'USAGE_DATA' in Cloudflare Pages → Settings → Functions.", 503);
    }

    const url = new URL(context.request.url);
    const resolveId = url.searchParams.get("resolve");

    // Mark a request as resolved
    if (resolveId) {
      const logRaw = await context.env.USAGE_DATA.get("reset:log");
      let log: Array<{ id: string; email: string; date: string; registered: boolean; status: string }> = [];
      if (logRaw) {
        try {
          log = JSON.parse(logRaw);
        } catch {
          log = [];
        }
      }
      const entry = log.find((r) => r.id === resolveId);
      if (entry) {
        entry.status = "resolved";
        await context.env.USAGE_DATA.put("reset:log", JSON.stringify(log));

        // Also update the individual record
        const recRaw = await context.env.USAGE_DATA.get(`reset:${resolveId}`);
        if (recRaw) {
          const rec = JSON.parse(recRaw);
          rec.status = "resolved";
          await context.env.USAGE_DATA.put(
            `reset:${resolveId}`,
            JSON.stringify(rec)
          );
        }
      }

      return jsonResponse({ success: true, message: "Marked as resolved" });
    }

    // Return full reset request log
    const logRaw = await context.env.USAGE_DATA.get("reset:log");
    let log: Array<{ id: string; email: string; date: string; registered: boolean; status: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }

    const pending = log.filter((r) => r.status === "pending").length;

    return jsonResponse({
      success: true,
      total: log.length,
      pending,
      requests: log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};
