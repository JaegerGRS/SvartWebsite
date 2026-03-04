// ══════════════════════════════════════════════════════════════
// Shared API Helpers — imported by all Cloudflare Pages Functions
// ══════════════════════════════════════════════════════════════
// File prefixed with _ → Cloudflare Pages does NOT create a route for it.

// ── Environment ──
// Secrets are read from Cloudflare environment variables at runtime.
// Set them in the Cloudflare Dashboard: Pages → Settings → Environment variables

export interface Env {
  USAGE_DATA: KVNamespace;
  ADMIN_SECRET: string;
  MOD_SECRET: string;
  GUARDIAN_SECRET: string;
  APP_SECRET: string;
  ADMIN_EMAIL: string;
  LEA_KEY_HEX: string;
}

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

export function getCallerRole(request: Request, env: Env): CallerRole {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_SECRET && token === env.ADMIN_SECRET) return "admin";
  if (env.MOD_SECRET && token === env.MOD_SECRET) return "mod";
  if (env.GUARDIAN_SECRET && token === env.GUARDIAN_SECRET) return "guardian";
  if (env.APP_SECRET && token === env.APP_SECRET) return "app";
  return "none";
}

export function isAuthorized(request: Request, env: Env, allowedRoles: CallerRole[] = ["admin", "mod"]): { authorized: boolean; role: CallerRole } {
  const role = getCallerRole(request, env);
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
