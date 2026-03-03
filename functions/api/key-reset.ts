interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "hTBtS8xGAazH878gDLQDVWY7Xt0WsbqrNQN__FQ0cnzl_obEySzvACHcMI0v-3PR";
const MOD_SECRET = "4Vw15CeU_bal14uMBHkEZjE1KhoXr5TbMSP9CBqmTAD6PBRMfUDF-mx-qeAR9ErH";
const ADMIN_EMAIL = "admin@svartsecurity.org";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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

function isAuthorized(request: Request): { authorized: boolean; role: string } {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token === ADMIN_SECRET) return { authorized: true, role: "admin" };
  if (token === MOD_SECRET) return { authorized: true, role: "mod" };
  return { authorized: false, role: "" };
}

// Same hash function used client-side (must match login.html / signup.html)
function hashPassword(pw: string): string {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = pw.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return "h" + Math.abs(hash).toString(36);
}

// Generate a 64-character AES-256-GCM secret key with special characters
function generateSecretKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_+=";
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  let key = "";
  for (let i = 0; i < 64; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}

// Generate a reset code from password hash + secret key (first 8 chars of combined hash)
function generateResetCode(passwordHash: string, secretKey: string): string {
  const combined = passwordHash + ":" + secretKey;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const c = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return "RC-" + Math.abs(hash).toString(36).toUpperCase().padStart(8, "0");
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — User submits a key reset request
// Body: { email, passwordHash, currentKey }
// The server generates a reset code from the password + key combo that the admin can verify
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    let email = "";
    let passwordHash = "";
    let currentKey = "";
    let reason = "";

    try {
      const body = (await context.request.json()) as {
        email: string;
        passwordHash: string;
        currentKey: string;
        reason?: string;
      };
      email = (body.email || "").trim().toLowerCase();
      passwordHash = (body.passwordHash || "").trim();
      currentKey = (body.currentKey || "").trim();
      reason = (body.reason || "").trim();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email || !passwordHash || !currentKey) {
      return errorResponse("Email, password, and current secret key are required", 400);
    }

    // Verify the account exists
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      // Don't reveal whether the account exists
      return jsonResponse({
        success: true,
        message: "If this account exists and the credentials match, your request has been submitted for admin review.",
      });
    }

    const account = JSON.parse(accountRaw);

    // Verify password AND secret key both match
    if (account.passwordHash !== passwordHash || account.activationKey !== currentKey) {
      // Don't reveal which one was wrong
      return jsonResponse({
        success: true,
        message: "If this account exists and the credentials match, your request has been submitted for admin review.",
      });
    }

    // Generate the reset code from the password + key combo
    const resetCode = generateResetCode(passwordHash, currentKey);

    // Create the key reset request
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const request = {
      id: requestId,
      email,
      resetCode,
      reason: reason || "User requested key regeneration",
      currentKeyLast4: currentKey.split("-").pop() || "????",
      requestedAt: new Date().toISOString(),
      status: "pending", // pending | approved | denied
      verified: true, // credentials were verified server-side
    };

    // Store individual request
    await context.env.USAGE_DATA.put(`keyreset:${requestId}`, JSON.stringify(request), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });

    // Append to key reset log
    let log: Array<{
      id: string;
      email: string;
      resetCode: string;
      date: string;
      status: string;
      currentKeyLast4: string;
    }> = [];
    try {
      const existing = await context.env.USAGE_DATA.get("keyreset:log");
      if (existing) log = JSON.parse(existing);
    } catch {}

    log.push({
      id: requestId,
      email,
      resetCode,
      date: request.requestedAt,
      status: "pending",
      currentKeyLast4: request.currentKeyLast4,
    });

    // Keep last 200
    if (log.length > 200) log = log.slice(-200);
    await context.env.USAGE_DATA.put("keyreset:log", JSON.stringify(log));

    // Reset request stored in KV — admin approves from dashboard
    // (MailChannels email removed — service discontinued 2024)

    return jsonResponse({
      success: true,
      resetCode,
      message: "Your key reset request has been submitted. An admin or moderator will review it. Your reset code is shown above — save it as confirmation.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Key reset request failed: ${message}`, 500);
  }
};

// GET — Admin/Mod: view all key reset requests
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const { authorized } = isAuthorized(context.request);
    if (!authorized) {
      return errorResponse("Unauthorized", 401);
    }

    const logRaw = await context.env.USAGE_DATA.get("keyreset:log");
    let log: Array<{
      id: string;
      email: string;
      resetCode: string;
      date: string;
      status: string;
      currentKeyLast4: string;
    }> = [];
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

// PUT — Admin approves or denies a key reset request
// Body: { requestId, action: "approve" | "deny", adminEmail }
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const { authorized, role } = isAuthorized(context.request);
    if (!authorized) {
      return errorResponse("Unauthorized", 401);
    }

    let requestId = "";
    let action = "";
    let adminEmail = "";

    try {
      const body = (await context.request.json()) as {
        requestId: string;
        action: string;
        adminEmail?: string;
      };
      requestId = (body.requestId || "").trim();
      action = (body.action || "").trim().toLowerCase();
      adminEmail = (body.adminEmail || "").trim();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!requestId || !action) {
      return errorResponse("requestId and action are required", 400);
    }

    if (action !== "approve" && action !== "deny") {
      return errorResponse("action must be 'approve' or 'deny'", 400);
    }

    // Load the individual request
    const reqRaw = await context.env.USAGE_DATA.get(`keyreset:${requestId}`);
    if (!reqRaw) {
      return errorResponse("Key reset request not found", 404);
    }

    const req = JSON.parse(reqRaw);

    if (req.status !== "pending") {
      return errorResponse("This request has already been " + req.status, 400);
    }

    // Update the log
    const logRaw = await context.env.USAGE_DATA.get("keyreset:log");
    let log: any[] = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }

    const entry = log.find((r: any) => r.id === requestId);

    if (action === "deny") {
      req.status = "denied";
      req.resolvedBy = adminEmail || role;
      req.resolvedAt = new Date().toISOString();
      await context.env.USAGE_DATA.put(`keyreset:${requestId}`, JSON.stringify(req));

      if (entry) {
        entry.status = "denied";
        await context.env.USAGE_DATA.put("keyreset:log", JSON.stringify(log));
      }

      return jsonResponse({ success: true, message: "Key reset request denied." });
    }

    // APPROVE: Generate a new secret key and update the account
    const email = req.email;
    const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
    if (!accountRaw) {
      return errorResponse("Account not found. User may have been deleted.", 404);
    }

    const account = JSON.parse(accountRaw);
    const oldKey = account.activationKey;
    const newKey = generateSecretKey();

    // Update the account with the new key
    account.activationKey = newKey;
    account.keyResetAt = new Date().toISOString();
    account.keyResetBy = adminEmail || role;
    account.updatedAt = new Date().toISOString();
    await context.env.USAGE_DATA.put(`account:${email}`, JSON.stringify(account));

    // Update the registration records
    // Remove old key mapping and add new one
    const emailKeysRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
    if (emailKeysRaw) {
      try {
        let keys: string[] = JSON.parse(emailKeysRaw);
        // Remove old key
        keys = keys.filter((k) => k !== oldKey);
        // Add new key
        keys.push(newKey);
        await context.env.USAGE_DATA.put(`reg:email:${email}`, JSON.stringify(keys));
      } catch {}
    }

    // Remove old key lookup, add new one
    await context.env.USAGE_DATA.delete(`reg:key:${oldKey}`);
    await context.env.USAGE_DATA.put(`reg:key:${newKey}`, email);

    // Update key->email direct index for key-only app login
    await context.env.USAGE_DATA.delete(`keyindex:${oldKey}`);
    await context.env.USAGE_DATA.put(`keyindex:${newKey}`, email);

    // Update request record
    req.status = "approved";
    req.newKeyPreview = newKey.substring(0, 6) + "...";
    req.resolvedBy = adminEmail || role;
    req.resolvedAt = new Date().toISOString();
    await context.env.USAGE_DATA.put(`keyreset:${requestId}`, JSON.stringify(req));

    if (entry) {
      entry.status = "approved";
      await context.env.USAGE_DATA.put("keyreset:log", JSON.stringify(log));
    }

    // Update master registration log
    try {
      const regLogRaw = await context.env.USAGE_DATA.get("reg:log");
      if (regLogRaw) {
        const regLog: Array<{ email: string; key: string; date: string }> = JSON.parse(regLogRaw);
        const regEntry = regLog.find((r) => r.email.toLowerCase() === email);
        if (regEntry) {
          regEntry.key = newKey;
          await context.env.USAGE_DATA.put("reg:log", JSON.stringify(regLog));
        }
      }
    } catch {}

    return jsonResponse({
      success: true,
      message: "Key reset approved. New 64-character secret key generated.",
      email,
      newKey,
      oldKeyPreview: oldKey.substring(0, 6) + "...",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Key reset action failed: ${message}`, 500);
  }
};
