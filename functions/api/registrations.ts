import { type Env, makeCors, makeJsonResponse, makeErrorResponse, optionsResponse, checkKV, ADMIN_SECRET, MOD_SECRET, ADMIN_EMAIL } from "./_shared";

const CORS_HEADERS = makeCors("GET, POST, DELETE, OPTIONS");
const jsonResponse = makeJsonResponse(CORS_HEADERS);
const errorResponse = makeErrorResponse(jsonResponse);

// Admin notification stub (MailChannels discontinued 2024)
// New signups are stored in reg:log — admin views from dashboard
async function notifyAdmin(_record: {
  email: string;
  activationKey: string;
  displayName: string;
  registeredAt: string;
}): Promise<void> {
  // No-op — all registrations are logged to KV reg:log for admin panel
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse(CORS_HEADERS);

// POST - Log a new registration (called by signup page)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured. Please contact admin.", 503);
    }

    let email = "";
    let activationKey = "";
    let displayName = "";
    let passwordHash = "";
    let role = "user";

    try {
      const body = (await context.request.json()) as {
        email: string;
        activationKey: string;
        displayName?: string;
        passwordHash?: string;
        role?: string;
      };
      email = (body.email || "").trim().toLowerCase();
      activationKey = (body.activationKey || "").trim();
      displayName = (body.displayName || "").trim();
      passwordHash = (body.passwordHash || "").trim();
      role = (body.role || "user").trim();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    if (!email || !activationKey) {
      return errorResponse("Missing email or activationKey", 400);
    }

    // Enforce unique email — each email can only register once
    const existingEmail = await context.env.USAGE_DATA.get(`reg:email:${email}`);
    if (existingEmail) {
      return jsonResponse(
        { success: false, error: "This email is already registered. Please log in instead." },
        409
      );
    }

    // ── NetworkGuardian: Check if this network is allowed to register ──
    // The Guardian hashes the IP internally — no human ever sees it
    const clientIp = context.request.headers.get("CF-Connecting-IP") || "";
    if (clientIp) {
      try {
        const guardianResp = await fetch(new URL("/api/guardian", context.request.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ADMIN_SECRET}` },
          body: JSON.stringify({ action: "check-registration", ip: clientIp }),
        });
        const guardianData = await guardianResp.json() as { allowed?: boolean; reason?: string };
        if (guardianData && guardianData.allowed === false) {
          return jsonResponse(
            { success: false, error: guardianData.reason || "Registration blocked by NetworkGuardian." },
            403
          );
        }
      } catch {
        // Guardian check failed — allow registration (fail-open for availability)
      }
    }

    const record = {
      email,
      activationKey,
      displayName,
      registeredAt: new Date().toISOString(),
    };

    // Store by secret key (primary lookup)
    await context.env.USAGE_DATA.put(
      `reg:key:${activationKey}`,
      JSON.stringify(record)
    );

    // Store by email (single key per email since we enforce uniqueness)
    await context.env.USAGE_DATA.put(
      `reg:email:${email}`,
      JSON.stringify([activationKey])
    );

    // Store full account data server-side (source of truth for auth)
    const accountData = {
      email,
      activationKey,
      displayName,
      passwordHash,
      role,
      createdAt: record.registeredAt,
    };
    await context.env.USAGE_DATA.put(
      `account:${email}`,
      JSON.stringify(accountData)
    );

    // Write key->email direct index for key-only app login
    await context.env.USAGE_DATA.put(`keyindex:${activationKey}`, email);

    // Add to the master registration log (ordered list)
    const logRaw = await context.env.USAGE_DATA.get("reg:log");
    let log: Array<{ email: string; key: string; date: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }
    log.push({
      email,
      key: activationKey,
      date: record.registeredAt,
    });
    await context.env.USAGE_DATA.put("reg:log", JSON.stringify(log));

    // Notify admin via email (best-effort, don't block)
    context.waitUntil(notifyAdmin(record));

    // ── NetworkGuardian: Record this registration's network fingerprint ──
    if (clientIp) {
      context.waitUntil(
        fetch(new URL("/api/guardian", context.request.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ADMIN_SECRET}` },
          body: JSON.stringify({ action: "record-registration", ip: clientIp, email }),
        }).catch(() => {})
      );
    }

    return jsonResponse({ success: true, message: "Registration logged" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Registration failed: ${message}`, 500);
  }
};

// GET - Admin/Mod: list all registrations or search by email
// Requires Authorization: Bearer <ADMIN_SECRET> or <MOD_SECRET>
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const auth = context.request.headers.get("Authorization");
    const token = auth ? auth.replace("Bearer ", "") : "";
    const isAdmin = token === ADMIN_SECRET;
    const isMod = token === MOD_SECRET;
    if (!isAdmin && !isMod) {
      return errorResponse("Unauthorized", 401);
    }

    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured. Add KV namespace binding 'USAGE_DATA' in Cloudflare Pages → Settings → Functions.", 503);
    }

    const url = new URL(context.request.url);
    const searchEmail = url.searchParams.get("email");
    const sendToday = url.searchParams.get("sendToday");

    // Send today's registrations to admin email
    if (sendToday === "true") {
      const logRaw = await context.env.USAGE_DATA.get("reg:log");
      let log: Array<{ email: string; key: string; date: string }> = [];
      if (logRaw) {
        try {
          log = JSON.parse(logRaw);
        } catch {
          log = [];
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const todayRegs = log.filter((r) => r.date && r.date.startsWith(today));

      if (todayRegs.length === 0) {
        return jsonResponse({
          success: true,
          message: "No registrations today to send.",
          count: 0,
        });
      }

      // Fetch full records for today's signups
      const fullRecords = [];
      for (const reg of todayRegs) {
        const recRaw = await context.env.USAGE_DATA.get(`reg:key:${reg.key}`);
        if (recRaw) {
          fullRecords.push(JSON.parse(recRaw));
        } else {
          fullRecords.push({
            email: reg.email,
            activationKey: reg.key,
            displayName: "",
            registeredAt: reg.date,
          });
        }
      }

      const rows = fullRecords
        .map(
          (r: { email: string; activationKey: string; displayName: string; registeredAt: string }) =>
            `  ${r.email} | ${r.activationKey} | ${r.displayName || "-"} | ${r.registeredAt}`
        )
        .join("\n");
      const htmlRows = fullRecords
        .map(
          (r: { email: string; activationKey: string; displayName: string; registeredAt: string }) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #222;">${r.email}</td><td style="padding:6px 10px;border-bottom:1px solid #222;color:#7c6aef;font-weight:bold;">${r.activationKey}</td><td style="padding:6px 10px;border-bottom:1px solid #222;">${r.displayName || "-"}</td><td style="padding:6px 10px;border-bottom:1px solid #222;">${r.registeredAt}</td></tr>`
        )
        .join("");

      // MailChannels discontinued — admin views registrations from dashboard
      // Return the data directly as JSON for the admin panel to display
      return jsonResponse({
        success: true,
        message: `${todayRegs.length} registration(s) today — view in admin dashboard`,
        count: todayRegs.length,
        registrations: fullRecords,
      });
    }

    // Search by email — return all keys for that email
    if (searchEmail) {
      const email = searchEmail.trim().toLowerCase();
      const keysRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
      if (!keysRaw) {
        return jsonResponse({
          success: true,
          email,
          found: false,
          keys: [],
        });
      }

      const keys: string[] = JSON.parse(keysRaw);
      const records = [];
      for (const key of keys) {
        const recRaw = await context.env.USAGE_DATA.get(`reg:key:${key}`);
        if (recRaw) {
          const rec = JSON.parse(recRaw);
          // Enrich with role from account data
          const acctRaw = await context.env.USAGE_DATA.get(`account:${email}`);
          if (acctRaw) {
            try {
              const acct = JSON.parse(acctRaw);
              rec.role = acct.role || 'user';
            } catch {}
          }
          records.push(rec);
        }
      }

      return jsonResponse({
        success: true,
        email,
        found: true,
        count: records.length,
        records,
      });
    }

    // No search — return full log
    const logRaw = await context.env.USAGE_DATA.get("reg:log");
    let log: Array<{ email: string; key: string; date: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }

    // Enrich with displayName and role from account data
    const enriched = [];
    for (const entry of log) {
      const acctRaw = await context.env.USAGE_DATA.get(`account:${entry.email.toLowerCase()}`);
      let displayName = '';
      let role = 'user';
      if (acctRaw) {
        try {
          const acct = JSON.parse(acctRaw);
          displayName = acct.displayName || '';
          role = acct.role || 'user';
        } catch {}
      }
      enriched.push({ ...entry, displayName, role });
    }

    return jsonResponse({
      success: true,
      total: enriched.length,
      registrations: enriched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
};

// DELETE - Admin: wipe all registrations
// Requires Authorization: Bearer <ADMIN_SECRET>
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const auth = context.request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
      return errorResponse("Unauthorized", 401);
    }

    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    // Read the master log to get all keys and emails
    const logRaw = await context.env.USAGE_DATA.get("reg:log");
    let log: Array<{ email: string; key: string; date: string }> = [];
    if (logRaw) {
      try {
        log = JSON.parse(logRaw);
      } catch {
        log = [];
      }
    }

    // Collect unique emails and keys
    const emails = new Set<string>();
    const keys = new Set<string>();
    for (const entry of log) {
      if (entry.email) emails.add(entry.email.toLowerCase());
      if (entry.key) keys.add(entry.key);
    }

    // Delete all reg:key:* entries
    for (const key of keys) {
      await context.env.USAGE_DATA.delete(`reg:key:${key}`);
    }

    // Delete all reg:email:* entries and account:* entries
    for (const email of emails) {
      await context.env.USAGE_DATA.delete(`reg:email:${email}`);
      await context.env.USAGE_DATA.delete(`account:${email}`);
    }

    // Clear the master log
    await context.env.USAGE_DATA.put("reg:log", "[]");

    // Also clear any password reset requests
    await context.env.USAGE_DATA.put("reset:log", "[]");

    return jsonResponse({
      success: true,
      message: `Wiped ${keys.size} registration(s) and ${emails.size} email(s). All users must re-register.`,
      deletedKeys: keys.size,
      deletedEmails: emails.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(`Wipe failed: ${message}`, 500);
  }
};
