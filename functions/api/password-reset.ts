interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "svart-admin-2026";
const MOD_SECRET = "svart-mod-2026";

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

// Generate a random temporary password (12 chars, alphanumeric + special)
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += chars[bytes[i] % chars.length];
  }
  return pw;
}

// Same hash function used client-side (must match login.html / signup.html)
function hashPassword(pw: string): string {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = pw.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — User submits a password reset request (email only)
// This logs the request so the admin can help recover the account
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured. Please contact admin.", 503);
    }

    let email = "";

    try {
      const body = (await context.request.json()) as { email: string };
      email = (body.email || "").trim().toLowerCase();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email) {
      return errorResponse("Email is required", 400);
    }

    // Check if the email is actually registered
    const keysRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
    const registered = !!keysRaw;

    // Log the reset request regardless (admin sees all attempts)
    const request = {
      email,
      registered,
      requestedAt: new Date().toISOString(),
      ip: context.request.headers.get("CF-Connecting-IP") || "unknown",
      country: context.request.headers.get("CF-IPCountry") || "unknown",
      status: "pending", // pending | resolved
    };

    // Store by timestamp for ordering
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await context.env.USAGE_DATA.put(
      `reset:${requestId}`,
      JSON.stringify(request)
    );

    // Append to the reset request log
    const logRaw = await context.env.USAGE_DATA.get("reset:log");
    let log: Array<{ id: string; email: string; date: string; registered: boolean; status: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }
    log.push({
      id: requestId,
      email,
      date: request.requestedAt,
      registered,
      status: "pending",
    });
    await context.env.USAGE_DATA.put("reset:log", JSON.stringify(log));

    // Always return the same message (don't reveal if email exists)
    return jsonResponse({
      success: true,
      message: "If this email is registered, an admin or moderator will review your request. This is a free service. You can also reset your password instantly at forgot-password.html using your secret key.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Password reset request failed: ${message}`, 500);
  }
};

// GET — Admin/Mod: view all password reset requests
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const url = new URL(context.request.url);

    // Public endpoint: check if temp credentials exist for a user (used by login page)
    const checkEmail = url.searchParams.get("checkCredentials");
    if (checkEmail) {
      const email = checkEmail.trim().toLowerCase();
      const credRaw = await context.env.USAGE_DATA.get(`reset:credentials:${email}`);
      if (!credRaw) {
        return jsonResponse({ success: true, hasCredentials: false });
      }
      const cred = JSON.parse(credRaw);
      return jsonResponse({
        success: true,
        hasCredentials: true,
        hashedPassword: cred.hashedPassword,
        forcePasswordChange: cred.forcePasswordChange,
      });
    }

    // All other GET operations require admin or mod auth
    const auth = context.request.headers.get("Authorization");
    const token = auth ? auth.replace("Bearer ", "") : "";
    if (token !== ADMIN_SECRET && token !== MOD_SECRET) {
      return errorResponse("Unauthorized", 401);
    }

    const resolveId = url.searchParams.get("resolve");

    // Mark a request as resolved
    if (resolveId) {
      const logRaw = await context.env.USAGE_DATA.get("reset:log");
      let log: Array<{ id: string; email: string; date: string; registered: boolean; status: string }> = [];
      if (logRaw) {
        try {
          log = JSON.parse(logRaw);
        } catch {
          log = [];
        }
      }
      const entry = log.find((r) => r.id === resolveId);
      if (entry) {
        // Generate a random temporary password for this user
        const tempPassword = generateTempPassword();
        const hashedTempPassword = hashPassword(tempPassword);

        entry.status = "resolved";
        entry.tempPassword = tempPassword; // Store plain text so mod can share it
        entry.resolvedAt = new Date().toISOString();
        await context.env.USAGE_DATA.put("reset:log", JSON.stringify(log));

        // Also update the individual record
        const recRaw = await context.env.USAGE_DATA.get(`reset:${resolveId}`);
        if (recRaw) {
          const rec = JSON.parse(recRaw);
          rec.status = "resolved";
          rec.tempPassword = tempPassword;
          rec.hashedTempPassword = hashedTempPassword;
          rec.resolvedAt = entry.resolvedAt;
          await context.env.USAGE_DATA.put(
            `reset:${resolveId}`,
            JSON.stringify(rec)
          );
        }

        // Store the hashed temp password + forceChange flag by email so login can pick it up
        // Key: reset:credentials:<email>
        if (entry.email) {
          const emailLower = entry.email.toLowerCase();
          await context.env.USAGE_DATA.put(
            `reset:credentials:${emailLower}`,
            JSON.stringify({
              hashedPassword: hashedTempPassword,
              forcePasswordChange: true,
              generatedAt: entry.resolvedAt,
            }),
            { expirationTtl: 60 * 60 * 24 * 7 } // Expires in 7 days
          );

          // Also update the server-side account password directly
          const accountRaw = await context.env.USAGE_DATA.get(`account:${emailLower}`);
          if (accountRaw) {
            const account = JSON.parse(accountRaw);
            account.passwordHash = hashedTempPassword;
            account.forcePasswordChange = true;
            account.updatedAt = entry.resolvedAt;
            await context.env.USAGE_DATA.put(`account:${emailLower}`, JSON.stringify(account));
          }
        }

        return jsonResponse({
          success: true,
          message: "Marked as resolved. Temporary password generated.",
          tempPassword: tempPassword,
          email: entry.email,
        });
      }

      return jsonResponse({ success: true, message: "Marked as resolved" });
    }

    // Return full reset request log
    const logRaw = await context.env.USAGE_DATA.get("reset:log");
    let log: Array<{ id: string; email: string; date: string; registered: boolean; status: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }

    const pending = log.filter((r) => r.status === "pending").length;

    return jsonResponse({
      success: true,
      total: log.length,
      pending,
      requests: log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};
