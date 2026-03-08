// ══════════════════════════════════════════════════════════════
// Global Middleware — runs on EVERY request (pages + API)
// ══════════════════════════════════════════════════════════════
// Cloudflare Pages Functions middleware.
// File at functions/_middleware.ts → applies to all routes.

interface Env {
  USAGE_DATA: KVNamespace;
}

// ── Security Headers applied to every response ──
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Expect-CT": "max-age=86400, enforce",
};

// ── Rate limiter (simple in-memory per-worker, resets on deploy) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// ── Cleanup stale entries periodically ──
let lastCleanup = Date.now();
function cleanupRateLimit() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}

export const onRequest: PagesFunction<Env>[] = [
  async (context) => {
    const { request } = context;
    const url = new URL(request.url);

    // ── 1. Force HTTPS ──
    // If somehow accessed over HTTP (shouldn't happen on CF, but belt-and-braces)
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    // ── 2. Rate limit API endpoints ──
    if (url.pathname.startsWith("/api/")) {
      cleanupRateLimit();
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";

      if (isRateLimited(ip)) {
        return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            ...SECURITY_HEADERS,
          },
        });
      }
    }

    // ── 3. Block sensitive paths from being accessed directly ──
    const blocked = ["/admin.html", "/mod-panel.html", "/registration-log.html", "/role-management.html"];
    // These pages require JS client-side auth, but we can add a warning header
    // (actual blocking is client-side since these are static pages)

    // ── 4. Continue to the next handler (actual page/API function) ──
    const response = await context.next();

    // ── 5. Clone response and inject security headers ──
    const newResponse = new Response(response.body, response);

    // FORCE-set all security headers — override any Cloudflare dashboard defaults
    // that may ship incorrect values (e.g. HSTS max-age=0).
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      newResponse.headers.set(key, value);
    }

    // ── 6. Add CSP for HTML pages (API responses don't need CSP) ──
    const contentType = newResponse.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      newResponse.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.shields.io; font-src 'self'; connect-src 'self' https://api.github.com https://*.svartsecurity.org; frame-ancestors 'none'; form-action 'self' https://www.paypal.com; upgrade-insecure-requests; block-all-mixed-content"
      );
    }

    // ── 7. Prevent caching of sensitive pages ──
    const sensitivePages = ["/checkout.html", "/topup.html", "/login.html", "/signup.html", "/account.html", "/account-settings.html", "/forgot-password.html", "/key-reset.html"];
    if (sensitivePages.some(p => url.pathname === p || url.pathname === "/" + p)) {
      newResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      newResponse.headers.set("Pragma", "no-cache");
    }

    return newResponse;
  },
];
