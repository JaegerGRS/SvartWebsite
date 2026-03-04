/**
 * /api/app-status — Desktop app status endpoint (read-only, no KV writes)
 *
 * Cloudflare Free Tier friendly: KV reads only, zero writes.
 * Desktop apps manage their own service status locally.
 * This endpoint just validates the key and returns account info.
 *
 * POST /api/app-status  — Validate key & return account status (0 writes)
 *   Body: { activationKey, app?, version? }
 *
 * GET /api/app-status?key=<key>  — Check if key is valid (0 writes)
 */

import { type Env, makeCors, makeJsonResponse, makeErrorResponse, optionsResponse } from "./_shared";

const CORS_HEADERS = makeCors("GET, POST, OPTIONS");
const jsonResponse = makeJsonResponse(CORS_HEADERS);
const errorResponse = makeErrorResponse(jsonResponse);

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse(CORS_HEADERS);

// POST — Validate key and return account status (read-only, 0 KV writes)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env?.USAGE_DATA) {
      return errorResponse("Server storage not configured.", 503);
    }

    let activationKey = "";
    let app = "";
    let version = "";

    try {
      const body = (await context.request.json()) as {
        activationKey?: string;
        key?: string;
        app?: string;
        version?: string;
      };
      activationKey = (body.activationKey || body.key || "").trim();
      app = (body.app || "unknown").trim();
      version = (body.version || "0.0.0").trim();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!activationKey) {
      return errorResponse("Activation key is required", 400);
    }

    // Resolve key → email via index (read-only, no KV scan)
    let email = "";
    const regKey = await context.env.USAGE_DATA.get(`reg:key:${activationKey}`);
    if (regKey) {
      try {
        const parsed = JSON.parse(regKey);
        email = (parsed.email || "").trim().toLowerCase();
      } catch {
        email = regKey.trim().toLowerCase();
      }
    }
    if (!email) {
      const idx = await context.env.USAGE_DATA.get(`keyindex:${activationKey}`);
      if (idx) email = idx.trim().toLowerCase();
    }
    if (!email) {
      return errorResponse("Invalid key — no account found", 404);
    }

    // Get account data (read-only)
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return errorResponse("Account not found", 404);
    }

    const account = JSON.parse(accountRaw);
    if (account.activationKey !== activationKey) {
      return errorResponse("Key mismatch", 403);
    }

    return jsonResponse({
      success: true,
      valid: true,
      account: {
        email: account.email,
        displayName: account.displayName || "",
        role: account.role || "user",
      },
      serverTime: new Date().toISOString(),
      app,
      version,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Status check failed: ${message}`, 500);
  }
};

// GET — Simple key validation or health check (read-only, 0 KV writes)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env?.USAGE_DATA) {
      return errorResponse("Server storage not configured.", 503);
    }

    const url = new URL(context.request.url);
    const key = (url.searchParams.get("key") || "").trim();

    if (!key) {
      return jsonResponse({ ok: true, service: "app-status", message: "Provide ?key= to check status" });
    }

    // Read-only key lookup
    let email = "";
    const regKey = await context.env.USAGE_DATA.get(`reg:key:${key}`);
    if (regKey) {
      try { email = JSON.parse(regKey).email || regKey; } catch { email = regKey; }
    }
    if (!email) {
      const idx = await context.env.USAGE_DATA.get(`keyindex:${key}`);
      if (idx) email = idx;
    }
    email = (email || "").trim().toLowerCase();

    if (!email) {
      return jsonResponse({ success: false, valid: false, error: "Key not found" }, 404);
    }

    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({ success: false, valid: false, error: "Account not found" }, 404);
    }

    const account = JSON.parse(accountRaw);
    return jsonResponse({
      success: true,
      valid: account.activationKey === key,
      account: {
        email: account.email,
        displayName: account.displayName || "",
        role: account.role || "user",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Query failed: ${message}`, 500);
  }
};
