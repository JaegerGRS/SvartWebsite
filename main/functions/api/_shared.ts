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
// Note: Origin is "*" because the Svart desktop apps (Tauri) call these APIs
// from tauri:// origins. Rate limiting and auth tokens protect against abuse.

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

// ── Email Validation ──

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false; // RFC 5321 max
  return EMAIL_REGEX.test(email);
}

// ── Email Domain Classification ──
// Legitimate forwarding/alias services — ALLOWED, but rate-limited to prevent abuse.
// These protect user privacy and we actively encourage their use.
const FORWARDING_DOMAINS = new Set([
  // Addy.io (formerly AnonAddy)
  "addy.io", "anonaddy.me", "anonaddy.com",
  // SimpleLogin (Proton)
  "simplelogin.co", "simplelogin.com", "aleeas.com", "slmails.com",
  // Firefox Relay
  "relay.firefox.com", "mozmail.com",
  // Apple Hide My Email / iCloud+
  "privaterelay.appleid.com", "icloud.com",
  // DuckDuckGo Email Protection
  "duck.com",
  // Fastmail masked email
  "fastmail.com",
  // StartMail
  "startmail.com",
  // Proton Mail (not forwarding, but privacy-focused — allow)
  "proton.me", "protonmail.com", "pm.me",
  // Tutanota / Tuta
  "tutanota.com", "tuta.io", "tutamail.com", "tuta.com",
  // Mailbox.org
  "mailbox.org",
  // Posteo
  "posteo.net", "posteo.de",
]);

// Disposable/throwaway email services — BLOCKED. These are used for spam/abuse only.
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "temp-mail.org", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.de", "guerrillamail.biz",
  "mailinator.com", "maildrop.cc", "dispostable.com", "throwaway.email",
  "yopmail.com", "yopmail.fr", "sharklasers.com", "guerrillamailblock.com",
  "grr.la", "10minutemail.com", "10minutemail.net", "minutemail.com",
  "tempail.com", "tempr.email", "temp-mail.io", "fakeinbox.com",
  "mailnesia.com", "trashmail.com", "trashmail.org", "trashmail.me",
  "trashmail.net", "getnada.com", "emailondeck.com", "mohmal.com",
  "burnermail.io", "inboxkitten.com", "mytemp.email", "tempinbox.com",
  "harakirimail.com", "mailcatch.com", "tmail.ws", "boun.cr",
  "discard.email", "discardmail.com", "discardmail.de", "droptmail.com",
  "crazymailing.com", "mailexpire.com", "mailforspam.com", "safetymail.info",
  "spam4.me", "spamgourmet.com", "trashymail.com", "wegwerfmail.de",
  "wegwerfmail.net", "wh4f.org", "trash-mail.com", "mintemail.com",
]);

export type EmailDomainType = "forwarding" | "disposable" | "standard";

// Known forwarding services that use subdomains (e.g., alias@username.addy.io)
const FORWARDING_PARENT_DOMAINS = ["addy.io", "anonaddy.me", "anonaddy.com", "simplelogin.co"];

export function classifyEmailDomain(email: string): { domain: string; type: EmailDomainType } {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (DISPOSABLE_DOMAINS.has(domain)) return { domain, type: "disposable" };
  if (FORWARDING_DOMAINS.has(domain)) return { domain, type: "forwarding" };
  // Check if this is a subdomain of a known forwarding service (e.g., alias@myname.addy.io)
  for (const parent of FORWARDING_PARENT_DOMAINS) {
    if (domain.endsWith("." + parent)) return { domain: parent, type: "forwarding" };
  }
  return { domain, type: "standard" };
}

// ── Input Sanitization ──

export function sanitizeString(input: string, maxLength = 500): string {
  if (!input || typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

// ── Password Hashing (SHA-256 via Web Crypto API) ──

export async function hashPassword(pw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
