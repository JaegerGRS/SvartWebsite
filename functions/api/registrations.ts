interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "svart-admin-2026";

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

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST - Log a new registration (called by signup page)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let email = "";
  let activationKey = "";
  let displayName = "";

  try {
    const body = (await context.request.json()) as {
      email: string;
      activationKey: string;
      displayName?: string;
    };
    email = (body.email || "").trim().toLowerCase();
    activationKey = (body.activationKey || "").trim();
    displayName = (body.displayName || "").trim();
  } catch {
    return jsonResponse({ success: false, error: "Invalid request body" }, 400);
  }

  if (!email || !activationKey) {
    return jsonResponse(
      { success: false, error: "Missing email or activationKey" },
      400
    );
  }

  const record = {
    email,
    activationKey,
    displayName,
    registeredAt: new Date().toISOString(),
    ip: context.request.headers.get("CF-Connecting-IP") || "unknown",
    country: context.request.headers.get("CF-IPCountry") || "unknown",
  };

  // Store by activation key (primary lookup)
  await context.env.USAGE_DATA.put(
    `reg:key:${activationKey}`,
    JSON.stringify(record)
  );

  // Store by email (for reverse lookup: email → key)
  // An email might have multiple keys, so append to a list
  const existingRaw = await context.env.USAGE_DATA.get(`reg:email:${email}`);
  let emailKeys: string[] = [];
  if (existingRaw) {
    try {
      emailKeys = JSON.parse(existingRaw);
    } catch {
      emailKeys = [];
    }
  }
  if (!emailKeys.includes(activationKey)) {
    emailKeys.push(activationKey);
  }
  await context.env.USAGE_DATA.put(
    `reg:email:${email}`,
    JSON.stringify(emailKeys)
  );

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

  return jsonResponse({ success: true, message: "Registration logged" });
};

// GET - Admin: list all registrations or search by email
// Requires Authorization: Bearer <ADMIN_SECRET>
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = context.request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const url = new URL(context.request.url);
  const searchEmail = url.searchParams.get("email");

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
        records.push(JSON.parse(recRaw));
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

  return jsonResponse({
    success: true,
    total: log.length,
    registrations: log,
  });
};
