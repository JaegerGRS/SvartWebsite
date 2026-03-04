// ══════════════════════════════════════════════════════════════
// Shared API Helpers — imported by all Cloudflare Pages Functions
// ══════════════════════════════════════════════════════════════
// File prefixed with _ → Cloudflare Pages does NOT create a route for it.

// ── Environment ──

export interface Env {
  USAGE_DATA: KVNamespace;
}

// ── Secrets (single source of truth) ──

export const ADMIN_SECRET = "hTBtS8xGAazH878gDLQDVWY7Xt0WsbqrNQN__FQ0cnzl_obEySzvACHcMI0v-3PR";
export const MOD_SECRET = "4Vw15CeU_bal14uMBHkEZjE1KhoXr5TbMSP9CBqmTAD6PBRMfUDF-mx-qeAR9ErH";
export const GUARDIAN_SECRET = "svart-guardian-2026";
export const APP_SECRET = "svart-app-verify-2026";
export const ADMIN_EMAIL = "admin@svartsecurity.org";
export const LEA_KEY_HEX = "c7a3f1e09b2d4c6a8f5e1d3b7a9c0e2f4d6b8a1c3e5f7092b4d6a8c0e2f4a6b8";

// ── CORS Factory ──

export function makeCors(methods: string, headers = "Content-Type, Authorization"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": headers,
  };
}

// ── Response Factories ──
// Returns functions with the SAME signatures as the old per-file helpers,
// so existing call sites (jsonResponse(data, status), errorResponse(msg, status)) don't change.

export function makeJsonResponse(cors: Record<string, string>) {
  return function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  };
}

export function makeErrorResponse(jsonFn: (data: unknown, status?: number) => Response) {
  return function errorResponse(msg: string, status = 400): Response {
    return jsonFn({ success: false, error: msg }, status);
  };
}

// ── Preflight ──

export function optionsResponse(cors: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: cors });
}

// ── KV Check ──

export function checkKV(env: Env): boolean {
  return !!(env && env.USAGE_DATA);
}

// ── Auth Helpers ──

export type CallerRole = "admin" | "mod" | "guardian" | "app" | "none";

export function getCallerRole(request: Request): CallerRole {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token === ADMIN_SECRET) return "admin";
  if (token === MOD_SECRET) return "mod";
  if (token === GUARDIAN_SECRET) return "guardian";
  if (token === APP_SECRET) return "app";
  return "none";
}

export function isAuthorized(request: Request, allowedRoles: CallerRole[] = ["admin", "mod"]): { authorized: boolean; role: CallerRole } {
  const role = getCallerRole(request);
  return { authorized: role !== "none" && allowedRoles.includes(role), role };
}

// ── Password Hashing ──

export function hashPassword(pw: string): string {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = pw.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return "h" + Math.abs(hash).toString(36);
}
