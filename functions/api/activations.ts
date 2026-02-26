interface Env {
  CIPHER_ACTIVATIONS: KVNamespace;
}

// Same HMAC secret as the Rust backend - used to generate valid CB-XXXX-XXXX-XXXX numbers
// In production, this should be an environment variable
const ACTIVATION_SECRET = "CipherBaseAI-Activation-v1-Secret";

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

// HMAC-SHA256 using Web Crypto
async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate a valid activation number: CB-XXXX-XXXX-XXXX
async function generateNumber(): Promise<string> {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const seg1 = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => chars[b % 36])
    .join("");
  const seg2 = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => chars[b % 36])
    .join("");

  const payload = seg1 + seg2;
  const hash = await hmacSha256(ACTIVATION_SECRET, payload);
  const check = hash.slice(0, 4).toUpperCase();

  return `CB-${seg1}-${seg2}-${check}`;
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// GET - List all activation numbers (admin only)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = context.request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  // List all activation keys from KV
  const list = await context.env.CIPHER_ACTIVATIONS.list({ prefix: "act:" });
  const numbers: Array<{
    number: string;
    issued: string;
    claimed: boolean;
    claimedBy: string;
  }> = [];

  for (const key of list.keys) {
    const val = await context.env.CIPHER_ACTIVATIONS.get(key.name);
    if (val) {
      try {
        numbers.push(JSON.parse(val));
      } catch {
        // skip malformed
      }
    }
  }

  return jsonResponse({
    success: true,
    total: numbers.length,
    numbers,
  });
};

// POST - Generate new activation numbers
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = context.request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  let count = 1;
  try {
    const body = (await context.request.json()) as { count?: number };
    if (body.count && body.count > 0 && body.count <= 50) {
      count = body.count;
    }
  } catch {
    // default to 1
  }

  const generated: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = await generateNumber();
    // Store in KV vault
    const record = {
      number: num,
      issued: new Date().toISOString(),
      claimed: false,
      claimedBy: "",
    };
    await context.env.CIPHER_ACTIVATIONS.put(
      `act:${num}`,
      JSON.stringify(record),
      { expirationTtl: 60 * 60 * 24 * 365 } // 1 year expiry
    );
    generated.push(num);
  }

  return jsonResponse({
    success: true,
    generated,
    count: generated.length,
  });
};

// PUT - Mark a number as claimed (called when app activates)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  let number = "";
  let machineId = "";
  try {
    const body = (await context.request.json()) as {
      number: string;
      machine_id?: string;
    };
    number = (body.number || "").trim().toUpperCase();
    machineId = body.machine_id || "";
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid request body" },
      400
    );
  }

  if (!number) {
    return jsonResponse({ success: false, error: "Missing number" }, 400);
  }

  const val = await context.env.CIPHER_ACTIVATIONS.get(`act:${number}`);
  if (!val) {
    return jsonResponse(
      { success: false, error: "Activation number not found" },
      404
    );
  }

  const record = JSON.parse(val);
  if (record.claimed) {
    return jsonResponse(
      { success: false, error: "Number already claimed" },
      409
    );
  }

  record.claimed = true;
  record.claimedBy = machineId;
  record.claimedAt = new Date().toISOString();

  await context.env.CIPHER_ACTIVATIONS.put(
    `act:${number}`,
    JSON.stringify(record),
    { expirationTtl: 60 * 60 * 24 * 365 }
  );

  return jsonResponse({ success: true, message: "Activation recorded" });
};
