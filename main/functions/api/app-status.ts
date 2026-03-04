/**
 * /api/app-status — Desktop app status endpoint
 *
 * POST /api/app-status  — Validate key, store heartbeat, return account status
 *   Body: { activationKey, email?, app?, version?, services? }
 *
 * GET /api/app-status?key=<key>&email=<email>  — Check key & return connected apps
 */

import { type Env, makeCors, makeJsonResponse, makeErrorResponse, optionsResponse } from "./_shared";

const CORS_HEADERS = makeCors("GET, POST, OPTIONS");
const jsonResponse = makeJsonResponse(CORS_HEADERS);
const errorResponse = makeErrorResponse(jsonResponse);

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse(CORS_HEADERS);

// POST — Validate key, store heartbeat, return account status
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env?.USAGE_DATA) {
      return errorResponse("Server storage not configured.", 503);
    }

    let activationKey = "";
    let emailHint = "";
    let app = "";
    let version = "";
    let services: Record<string, unknown> = {};

    try {
      const body = (await context.request.json()) as {
        activationKey?: string;
        key?: string;
        email?: string;
        app?: string;
        version?: string;
        services?: Record<string, unknown>;
      };
      activationKey = (body.activationKey || body.key || "").trim();
      emailHint = (body.email || "").trim().toLowerCase();
      app = (body.app || "unknown").trim();
      version = (body.version || "0.0.0").trim();
      services = body.services || {};
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
    // Fallback: use email hint from client (for accounts created before key indexing)
    if (!email && emailHint) {
      email = emailHint;
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

    // Backfill key indexes for accounts created before key indexing
    if (!regKey) {
      context.waitUntil(
        context.env.USAGE_DATA.put(`reg:key:${activationKey}`, JSON.stringify({ email, activationKey })).catch(() => {})
      );
    }
    const existingIdx = await context.env.USAGE_DATA.get(`keyindex:${activationKey}`);
    if (!existingIdx) {
      context.waitUntil(
        context.env.USAGE_DATA.put(`keyindex:${activationKey}`, email).catch(() => {})
      );
    }

    // Store connected-app heartbeat (non-blocking write)
    if (app && app !== "unknown") {
      const heartbeatEntry = {
        app,
        version,
        lastSeen: new Date().toISOString(),
        services,
      };
      context.waitUntil(
        (async () => {
          try {
            const existing = await context.env.USAGE_DATA.get(`connected-apps:${email}`);
            const apps: Record<string, unknown> = existing ? JSON.parse(existing) : {};
            apps[app] = heartbeatEntry;
            await context.env.USAGE_DATA.put(`connected-apps:${email}`, JSON.stringify(apps));
          } catch { /* ignore write failures */ }
        })()
      );
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

// GET — Key validation + connected apps lookup
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!context.env?.USAGE_DATA) {
      return errorResponse("Server storage not configured.", 503);
    }

    const url = new URL(context.request.url);
    const key = (url.searchParams.get("key") || "").trim();
    const emailHint = (url.searchParams.get("email") || "").trim().toLowerCase();

    if (!key) {
      return jsonResponse({ ok: true, service: "app-status", message: "Provide ?key= to check status" });
    }

    // Resolve key → email
    let email = "";
    const regKey = await context.env.USAGE_DATA.get(`reg:key:${key}`);
    if (regKey) {
      try { email = JSON.parse(regKey).email || regKey; } catch { email = regKey; }
    }
    if (!email) {
      const idx = await context.env.USAGE_DATA.get(`keyindex:${key}`);
      if (idx) email = idx;
    }
    // Fallback: use email hint from query (for accounts created before key indexing)
    if (!email && emailHint) {
      email = emailHint;
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
    const valid = account.activationKey === key;

    // Read connected apps
    let connectedApps: unknown[] = [];
    if (valid) {
      try {
        const appsRaw = await context.env.USAGE_DATA.get(`connected-apps:${email}`);
        if (appsRaw) {
          const appsMap = JSON.parse(appsRaw) as Record<string, unknown>;
          connectedApps = Object.values(appsMap);
        }
      } catch { /* ignore parse errors */ }
    }

    return jsonResponse({
      success: true,
      valid,
      account: {
        email: account.email,
        displayName: account.displayName || "",
        role: account.role || "user",
      },
      connectedApps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Query failed: ${message}`, 500);
  }
};
