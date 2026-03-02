/**
 * /api/app-activate — Desktop App Activation Endpoint
 *
 * Purpose-built for SvartAI and other desktop apps to verify email + secret key.
 * Uses POST to avoid URL-encoding issues with special characters in keys.
 *
 * POST Body: { email: string, key: string }
 * Returns:
 *   Success: { success: true, account: { email, displayName, activationKey, role, createdAt, svartId } }
 *   Wrong key: { success: false, error: "...", exists: true }
 *   No account: { success: false, error: "...", exists: false }
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — Verify email + secret key for desktop app activation
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env?.USAGE_DATA) {
      return jsonResponse({ success: false, error: "Server storage not configured" }, 503);
    }

    let email = "";
    let key = "";

    try {
      const body = (await context.request.json()) as { email?: string; key?: string };
      email = (body.email || "").trim().toLowerCase();
      key = (body.key || "").trim();
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body — expected JSON with email and key" }, 400);
    }

    if (!email) {
      return jsonResponse({ success: false, error: "Email is required" }, 400);
    }
    if (!key) {
      return jsonResponse({ success: false, error: "Secret key is required" }, 400);
    }
    if (key.length < 16) {
      return jsonResponse({ success: false, error: "Secret key is too short — paste the full 64-character key from your account" }, 400);
    }

    // Look up account by email
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({
        success: false,
        exists: false,
        error: "No account found with that email. Sign up at svartsecurity.org first.",
      });
    }

    let account: {
      email: string;
      displayName?: string;
      activationKey: string;
      role?: string;
      createdAt?: string;
    };

    try {
      account = JSON.parse(accountRaw);
    } catch {
      return jsonResponse({ success: false, error: "Server error reading account data" }, 500);
    }

    // Verify secret key matches
    if (account.activationKey !== key) {
      return jsonResponse({
        success: false,
        exists: true,
        error: "Invalid secret key. Make sure you copied the full 64-character key from your account dashboard.",
      });
    }

    // Key matches — return full account for activation
    return jsonResponse({
      success: true,
      account: {
        email: account.email,
        displayName: account.displayName || "",
        activationKey: account.activationKey,
        role: account.role || "user",
        createdAt: account.createdAt || "",
        svartId: account.activationKey,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonResponse({ success: false, error: `Activation check failed: ${message}` }, 500);
  }
};

// GET — Simple health check / verify endpoint is reachable
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const hasKV = !!(context.env?.USAGE_DATA);
  return jsonResponse({
    ok: true,
    service: "app-activate",
    storage: hasKV ? "connected" : "unavailable",
  });
};
