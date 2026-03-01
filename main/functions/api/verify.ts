/**
 * /api/verify — App & NetworkGuardian key verification endpoint
 *
 * This is the ONLY way Svart apps and the NetworkGuardian can verify secret keys.
 * Regular users / public cannot access this endpoint.
 *
 * Auth tokens (embedded in apps):
 *   - APP_SECRET: All Svart desktop apps use this to verify a user's key on login
 *   - GUARDIAN_SECRET: NetworkGuardian uses this for verification + reporting identity
 *   - ADMIN_SECRET / MOD_SECRET: Admin/Mod tokens also work (for panel use)
 *
 * POST /api/verify
 *   Body: { email, activationKey }
 *   Headers: Authorization: Bearer <APP_SECRET|GUARDIAN_SECRET|ADMIN_SECRET|MOD_SECRET>
 *   Returns: { success, valid, role, displayName } — enough to confirm legitimacy
 *            Never returns the secret key back — just confirms it's correct
 *
 * GET /api/verify?email=<email>&key=<key>
 *   Same as POST but via query params (for simple GET requests from apps)
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "hTBtS8xGAazH878gDLQDVWY7Xt0WsbqrNQN__FQ0cnzl_obEySzvACHcMI0v-3PR";
const MOD_SECRET = "4Vw15CeU_bal14uMBHkEZjE1KhoXr5TbMSP9CBqmTAD6PBRMfUDF-mx-qeAR9ErH";
const APP_SECRET = "svart-app-verify-2026";
const GUARDIAN_SECRET = "svart-guardian-2026";

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

type CallerRole = "admin" | "mod" | "app" | "guardian" | "none";

function getCallerRole(request: Request): CallerRole {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (token === ADMIN_SECRET) return "admin";
  if (token === MOD_SECRET) return "mod";
  if (token === GUARDIAN_SECRET) return "guardian";
  if (token === APP_SECRET) return "app";
  return "none";
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — Verify a secret key
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const caller = getCallerRole(context.request);
    if (caller === "none") {
      return errorResponse("Unauthorized. Valid app or guardian token required.", 401);
    }

    let email = "";
    let activationKey = "";

    try {
      const body = (await context.request.json()) as {
        email: string;
        activationKey: string;
      };
      email = (body.email || "").trim().toLowerCase();
      activationKey = (body.activationKey || "").trim();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email || !activationKey) {
      return errorResponse("Email and activationKey are required", 400);
    }

    return await verifyKey(context.env, email, activationKey, caller);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};

// GET — Verify via query params (simpler for app GET requests)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const caller = getCallerRole(context.request);
    if (caller === "none") {
      return errorResponse("Unauthorized. Valid app or guardian token required.", 401);
    }

    const url = new URL(context.request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const activationKey = (url.searchParams.get("key") || "").trim();

    if (!email || !activationKey) {
      return errorResponse("Email and key query parameters are required", 400);
    }

    return await verifyKey(context.env, email, activationKey, caller);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};

async function verifyKey(
  env: Env,
  email: string,
  activationKey: string,
  caller: CallerRole
): Promise<Response> {
  // Look up the server-side account
  const accountRaw = await env.USAGE_DATA.get(`account:${email}`);
  if (!accountRaw) {
    return jsonResponse({
      success: true,
      valid: false,
      reason: "Account not found",
    });
  }

  const account = JSON.parse(accountRaw);

  // Check the secret key matches
  if (account.activationKey !== activationKey) {
    return jsonResponse({
      success: true,
      valid: false,
      reason: "Invalid secret key",
    });
  }

  // Key is valid — build response based on caller role
  const baseResponse = {
    success: true,
    valid: true,
    email: account.email,
    role: account.role || "user",
    displayName: account.displayName || "",
    createdAt: account.createdAt || "",
  };

  // Guardian gets extra info for verification reports
  if (caller === "guardian") {
    return jsonResponse({
      ...baseResponse,
      guardian: true,
    });
  }

  // Admin/Mod get full visibility
  if (caller === "admin" || caller === "mod") {
    return jsonResponse({
      ...baseResponse,
    });
  }

  // Regular app verification — minimal response, never returns the key back
  return jsonResponse(baseResponse);
}
