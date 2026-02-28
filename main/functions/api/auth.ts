interface Env {
  USAGE_DATA: KVNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

// Same hash function used client-side
function hashPassword(pw: string): string {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = pw.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — Login: verify credentials server-side
// Body: { email, passwordHash }
// Returns: { success, account: { email, displayName, activationKey, role, createdAt } }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    let email = "";
    let passwordHash = "";

    try {
      const body = (await context.request.json()) as {
        email: string;
        passwordHash: string;
      };
      email = (body.email || "").trim().toLowerCase();
      passwordHash = (body.passwordHash || "").trim();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email || !passwordHash) {
      return errorResponse("Email and password are required", 400);
    }

    // Look up server-side account
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({ success: false, error: "No account found with that email." }, 404);
    }

    const account = JSON.parse(accountRaw);

    // Check for temp credentials first (admin/mod reset)
    const credRaw = await context.env.USAGE_DATA.get(`reset:credentials:${email}`);
    if (credRaw) {
      const cred = JSON.parse(credRaw);
      if (passwordHash === cred.hashedPassword) {
        // Temp password matches — update account password and set forceChange
        account.passwordHash = cred.hashedPassword;
        account.forcePasswordChange = true;
        await context.env.USAGE_DATA.put(`account:${email}`, JSON.stringify(account));
        // Delete temp credentials
        await context.env.USAGE_DATA.delete(`reset:credentials:${email}`);

        return jsonResponse({
          success: true,
          forcePasswordChange: true,
          account: {
            email: account.email,
            displayName: account.displayName,
            activationKey: account.activationKey,
            role: account.role || "user",
            createdAt: account.createdAt,
            svartId: account.activationKey,
          },
        });
      }
    }

    // Normal password check
    if (account.passwordHash !== passwordHash) {
      return jsonResponse({ success: false, error: "Incorrect password." }, 401);
    }

    // Check if account still has a forced password change pending
    const forceChange = account.forcePasswordChange === true;

    return jsonResponse({
      success: true,
      forcePasswordChange: forceChange,
      account: {
        email: account.email,
        displayName: account.displayName,
        activationKey: account.activationKey,
        role: account.role || "user",
        createdAt: account.createdAt,
        svartId: account.activationKey,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Login failed: ${message}`, 500);
  }
};

// GET — Verify session / check if account exists
// ?email=<email> — returns { success, exists, account } (no auth needed, minimal info)
// ?email=<email>&key=<activationKey> — returns full account if key matches
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const url = new URL(context.request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const key = (url.searchParams.get("key") || "").trim();

    if (!email) {
      return errorResponse("Email parameter is required", 400);
    }

    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({ success: true, exists: false });
    }

    const account = JSON.parse(accountRaw);

    // If secret key provided, return full account details (for session restore)
    if (key && account.activationKey === key) {
      return jsonResponse({
        success: true,
        exists: true,
        account: {
          email: account.email,
          displayName: account.displayName,
          activationKey: account.activationKey,
          role: account.role || "user",
          createdAt: account.createdAt,
          svartId: account.activationKey,
        },
      });
    }

    // Without key, just confirm existence
    return jsonResponse({ success: true, exists: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};

// PUT — Update account (change password, update profile)
// Body: { email, activationKey, updates: { passwordHash?, displayName?, role? } }
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    let email = "";
    let activationKey = "";
    let updates: { passwordHash?: string; displayName?: string; forcePasswordChange?: boolean; role?: string } = {};
    let adminSecret = "";

    try {
      const body = (await context.request.json()) as {
        email: string;
        activationKey?: string;
        adminSecret?: string;
        updates: { passwordHash?: string; displayName?: string; forcePasswordChange?: boolean; role?: string };
      };
      email = (body.email || "").trim().toLowerCase();
      activationKey = (body.activationKey || "").trim();
      adminSecret = (body.adminSecret || "").trim();
      updates = body.updates || {};
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email) {
      return errorResponse("Email is required", 400);
    }

    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({ success: false, error: "Account not found." }, 404);
    }

    const account = JSON.parse(accountRaw);

    // Admin role management: admin can update any account's role via adminSecret
    const ADMIN_API_SECRET = "svart-admin-2026";
    if (adminSecret === ADMIN_API_SECRET) {
      // Admin-only: allow role changes
      if (updates.role && ['user', 'mod', 'admin'].includes(updates.role)) {
        account.role = updates.role;
      }
      if (updates.displayName !== undefined) {
        account.displayName = updates.displayName;
      }
      account.updatedAt = new Date().toISOString();
      await context.env.USAGE_DATA.put(`account:${email}`, JSON.stringify(account));
      return jsonResponse({ success: true, message: "Account updated by admin", role: account.role });
    }

    // Normal user self-update: requires secret key
    if (!activationKey) {
      return errorResponse("Secret key is required", 400);
    }

    // Verify ownership via secret key
    if (account.activationKey !== activationKey) {
      return errorResponse("Invalid secret key", 403);
    }

    // Apply updates (users cannot change their own role)
    if (updates.passwordHash) {
      account.passwordHash = updates.passwordHash;
    }
    if (updates.displayName !== undefined) {
      account.displayName = updates.displayName;
    }
    if (updates.forcePasswordChange !== undefined) {
      account.forcePasswordChange = updates.forcePasswordChange;
    }

    account.updatedAt = new Date().toISOString();
    await context.env.USAGE_DATA.put(`account:${email}`, JSON.stringify(account));

    return jsonResponse({ success: true, message: "Account updated" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Update failed: ${message}`, 500);
  }
};

// DELETE — User self-deletes their account
// Body: { email, activationKey }
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
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
      return errorResponse("Email and secret key are required", 400);
    }

    // Verify the account exists and key matches
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return jsonResponse({ success: true, message: "Account not found (already deleted)" });
    }

    const account = JSON.parse(accountRaw);
    if (account.activationKey !== activationKey) {
      return errorResponse("Invalid secret key", 403);
    }

    // Delete the server-side account
    await context.env.USAGE_DATA.delete(`account:${email}`);

    // Also clean up registration records
    const keysRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
    if (keysRaw) {
      const keys: string[] = JSON.parse(keysRaw);
      for (const key of keys) {
        await context.env.USAGE_DATA.delete(`reg:key:${key}`);
      }
      await context.env.USAGE_DATA.delete(`reg:email:${email}`);
    }

    // Remove from master reg log
    const logRaw = await context.env.USAGE_DATA.get("reg:log");
    if (logRaw) {
      try {
        let log: Array<{ email: string; key: string; date: string }> = JSON.parse(logRaw);
        log = log.filter((r) => r.email.toLowerCase() !== email);
        await context.env.USAGE_DATA.put("reg:log", JSON.stringify(log));
      } catch {
        // Log parse error, ignore
      }
    }

    // Clean up temp credentials
    await context.env.USAGE_DATA.delete(`reset:credentials:${email}`);

    return jsonResponse({ success: true, message: "Account deleted from server" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Delete failed: ${message}`, 500);
  }
};
