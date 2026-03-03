/**
 * /api/app-activate — Desktop App Activation Endpoint
 *
 * Purpose-built for SvartAI and other desktop apps to verify a secret key.
 * Supports key-only login (looks up account via key index) or email+key.
 * Uses POST to avoid URL-encoding issues with special characters in keys.
 *
 * POST Body: { key: string, email?: string }
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

// POST — Verify secret key for desktop app activation
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
      return jsonResponse({ success: false, error: "Invalid request body — expected JSON with key" }, 400);
    }

    if (!key) {
      return jsonResponse({ success: false, error: "Secret key is required" }, 400);
    }
    if (key.length < 16) {
      return jsonResponse({ success: false, error: "Secret key is too short — paste the full 64-character key from your account" }, 400);
    }

    // If no email provided, resolve it from the key index
    if (!email) {
      // Try reg:key:<key> — written by registrations, key-reset, and rekey endpoints
      const keyLookup = await context.env.USAGE_DATA.get(`reg:key:${key}`);
      if (keyLookup) {
        try {
          // Could be JSON {email:...} or plain email string
          const parsed = JSON.parse(keyLookup);
          email = (parsed.email || "").trim().toLowerCase();
        } catch {
          // Plain string — treat as email directly
          email = keyLookup.trim().toLowerCase();
        }
      }

      // If still no email, try the key->email index we write on activation
      if (!email) {
        const directIndex = await context.env.USAGE_DATA.get(`keyindex:${key}`);
        if (directIndex) {
          email = directIndex.trim().toLowerCase();
        }
      }

      // Last resort: scan all accounts to find which one owns this key.
      // This handles accounts created before key indexing was added.
      // Slow but reliable — after first success, indexes are written for future fast lookups.
      if (!email) {
        let cursor: string | undefined;
        let found = false;
        scanLoop: while (true) {
          const list = await context.env.USAGE_DATA.list({
            prefix: "account:",
            limit: 100,
            ...(cursor ? { cursor } : {}),
          });
          for (const k of list.keys) {
            try {
              const raw = await context.env.USAGE_DATA.get(k.name);
              if (!raw) continue;
              const acct = JSON.parse(raw);
              if (acct.activationKey === key) {
                email = (acct.email || k.name.replace("account:", "")).trim().toLowerCase();
                found = true;
                break scanLoop;
              }
            } catch { /* skip malformed */ }
          }
          if (list.list_complete) break;
          cursor = list.cursor;
        }
        if (!found) {
          return jsonResponse({
            success: false,
            exists: false,
            error: "No account found for this key. Make sure you copied the correct key from your account dashboard.",
          });
        }
      }
    }

    // Look up account by email
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({
        success: false,
        exists: false,
        error: "No account found. Sign up at svartsecurity.org first.",
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

    // Write/update the key->email index for faster future lookups
    context.waitUntil(
      context.env.USAGE_DATA.put(`keyindex:${key}`, email).catch(() => {})
    );

    // Also ensure reg:key index exists
    context.waitUntil(
      context.env.USAGE_DATA.put(`reg:key:${key}`, JSON.stringify({ email, activationKey: key })).catch(() => {})
    );

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
