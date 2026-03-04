import { type Env, makeCors, makeJsonResponse, makeErrorResponse, optionsResponse } from "./_shared";

const CORS_HEADERS = makeCors("PUT, OPTIONS");
const jsonResponse = makeJsonResponse(CORS_HEADERS);
const errorResponse = makeErrorResponse(jsonResponse);

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

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse(CORS_HEADERS);

// PUT — Admin-only: batch re-key ALL accounts to new 64-character keys
// Requires Authorization: Bearer <ADMIN_SECRET>
// Iterates reg:log, generates a new 64-char key for every account,
// and updates account:<email>, reg:key:<old> → reg:key:<new>, reg:email:<email>, and reg:log
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const auth = context.request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${context.env.ADMIN_SECRET}`) {
      return errorResponse("Unauthorized — admin only", 401);
    }

    if (!context.env?.USAGE_DATA) {
      return errorResponse("Server storage not configured.", 503);
    }

    // Load the master registration log
    const logRaw = await context.env.USAGE_DATA.get("reg:log");
    let log: Array<{ email: string; key: string; date: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }

    if (log.length === 0) {
      return jsonResponse({ success: true, message: "No accounts to re-key.", migrated: 0, skipped: 0 });
    }

    let migrated = 0;
    let skipped = 0;
    const results: Array<{ email: string; oldKeyPreview: string; newKeyPreview: string }> = [];

    for (const entry of log) {
      const email = (entry.email || "").toLowerCase();
      if (!email) { skipped++; continue; }

      // Load account
      const accountRaw = await context.env.USAGE_DATA.get(`account:${email}`);
      if (!accountRaw) { skipped++; continue; }

      let account: any;
      try {
        account = JSON.parse(accountRaw);
      } catch {
        skipped++;
        continue;
      }

      const oldKey = account.activationKey || entry.key;
      if (!oldKey) { skipped++; continue; }

      // Generate new 64-char key (always re-key, regardless of current format)
      const newKey = generateSecretKey();

      // Update account
      account.activationKey = newKey;
      account.keyMigratedAt = new Date().toISOString();
      account.updatedAt = new Date().toISOString();
      await context.env.USAGE_DATA.put(`account:${email}`, JSON.stringify(account));

      // Update reg:email:<email> — replace old key with new key
      const emailKeysRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
      if (emailKeysRaw) {
        try {
          let keys: string[] = JSON.parse(emailKeysRaw);
          keys = keys.filter((k) => k !== oldKey);
          keys.push(newKey);
          await context.env.USAGE_DATA.put(`reg:email:${email}`, JSON.stringify(keys));
        } catch {}
      } else {
        // Create it if missing
        await context.env.USAGE_DATA.put(`reg:email:${email}`, JSON.stringify([newKey]));
      }

      // Remove old reg:key:<old>, add new reg:key:<new>
      await context.env.USAGE_DATA.delete(`reg:key:${oldKey}`);
      await context.env.USAGE_DATA.put(`reg:key:${newKey}`, JSON.stringify({
        email,
        activationKey: newKey,
        displayName: account.displayName || "",
        registeredAt: account.createdAt || entry.date || new Date().toISOString(),
      }));

      // Update key->email direct index for key-only app login
      await context.env.USAGE_DATA.delete(`keyindex:${oldKey}`);
      await context.env.USAGE_DATA.put(`keyindex:${newKey}`, email);

      // Update the log entry
      entry.key = newKey;

      migrated++;
      results.push({
        email,
        oldKeyPreview: oldKey.substring(0, 6) + "...",
        newKeyPreview: newKey.substring(0, 6) + "...",
      });
    }

    // Save updated reg:log
    await context.env.USAGE_DATA.put("reg:log", JSON.stringify(log));

    return jsonResponse({
      success: true,
      message: `Batch re-key complete. ${migrated} account(s) migrated to 64-character AES-256-GCM keys.`,
      migrated,
      skipped,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Batch re-key failed: ${message}`, 500);
  }
};
