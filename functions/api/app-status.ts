/**
 * /api/app-status — Desktop app heartbeat & status endpoint
 *
 * Desktop apps (SvartAI, SvartBrowser, SvartPass, etc.) call this
 * endpoint to register their presence and report service status.
 * The website can then show which apps are connected for a given user.
 *
 * POST /api/app-status
 *   Headers: Authorization: Bearer <APP_SECRET>
 *   Body: { email, activationKey, app, version, services }
 *   Returns: { success, registered, serverTime, connectedApps[] }
 *
 * GET /api/app-status?email=<email>&key=<activationKey>
 *   Headers: Authorization: Bearer <APP_SECRET>
 *   Returns: { success, apps[] } — list of recently connected apps for this account
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

const APP_SECRET = "svart-app-verify-2026";
const ADMIN_SECRET = "hTBtS8xGAazH878gDLQDVWY7Xt0WsbqrNQN__FQ0cnzl_obEySzvACHcMI0v-3PR";

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

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  return token === APP_SECRET || token === ADMIN_SECRET;
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — App reports its status (heartbeat)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    if (!isAuthorized(context.request)) {
      return errorResponse("Unauthorized. Valid app token required.", 401);
    }

    let email = "";
    let activationKey = "";
    let app = "";
    let version = "";
    let services: Record<string, { connected: boolean; message: string }> = {};

    try {
      const body = (await context.request.json()) as {
        email: string;
        activationKey: string;
        app: string;
        version: string;
        services?: Record<string, { connected: boolean; message: string }>;
      };
      email = (body.email || "").trim().toLowerCase();
      activationKey = (body.activationKey || "").trim();
      app = (body.app || "unknown").trim();
      version = (body.version || "0.0.0").trim();
      services = body.services || {};
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email || !activationKey) {
      return errorResponse("Email and activationKey are required", 400);
    }

    // Verify the account exists and key matches
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return errorResponse("Account not found", 404);
    }

    const account = JSON.parse(accountRaw);
    if (account.activationKey !== activationKey) {
      return errorResponse("Invalid activation key", 403);
    }

    // Build the heartbeat record
    const now = new Date().toISOString();
    const heartbeat = {
      app,
      version,
      services,
      lastSeen: now,
      ip: context.request.headers.get("CF-Connecting-IP") || "unknown",
    };

    // Store per-app heartbeat with 5-minute TTL (auto-expires = auto-offline)
    const kvKey = `app-status:${email}:${app}`;
    await context.env.USAGE_DATA.put(kvKey, JSON.stringify(heartbeat), {
      expirationTtl: 300, // 5 minutes — if app doesn't heartbeat, it goes offline
    });

    // Fetch all connected apps for this account to return
    const connectedApps = await getConnectedApps(context.env, email);

    return jsonResponse({
      success: true,
      registered: true,
      serverTime: now,
      connectedApps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Status report failed: ${message}`, 500);
  }
};

// GET — Query which apps are connected for an account
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    if (!isAuthorized(context.request)) {
      return errorResponse("Unauthorized. Valid app token required.", 401);
    }

    const url = new URL(context.request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const key = (url.searchParams.get("key") || "").trim();

    if (!email || !key) {
      return errorResponse("Email and key parameters are required", 400);
    }

    // Verify account
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return errorResponse("Account not found", 404);
    }

    const account = JSON.parse(accountRaw);
    if (account.activationKey !== key) {
      return errorResponse("Invalid activation key", 403);
    }

    const connectedApps = await getConnectedApps(context.env, email);

    return jsonResponse({
      success: true,
      apps: connectedApps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Query failed: ${message}`, 500);
  }
};

// Helper: get all connected apps for an email
// We check for known app names since KV list with prefix is reliable
async function getConnectedApps(
  env: Env,
  email: string
): Promise<Array<{ app: string; version: string; services: Record<string, unknown>; lastSeen: string }>> {
  const appNames = ["SvartAI", "SvartBrowser", "SvartPass", "SvartNotes", "SvartDocs", "SvartChat"];
  const apps: Array<{ app: string; version: string; services: Record<string, unknown>; lastSeen: string }> = [];

  for (const appName of appNames) {
    const raw = await env.USAGE_DATA.get(`app-status:${email}:${appName}`);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        apps.push({
          app: data.app || appName,
          version: data.version || "unknown",
          services: data.services || {},
          lastSeen: data.lastSeen || "",
        });
      } catch {
        // skip malformed
      }
    }
  }

  return apps;
}
