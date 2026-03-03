// functions/api/contact.ts — Contact form handler (sends via MailChannels)

interface Env {
  USAGE_DATA: KVNamespace;
}

const CONTACT_EMAIL = "contact@svartsecurity.org";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(msg: string, status = 400) {
  return jsonResponse({ success: false, error: msg }, status);
}

// Rate limiting: max 3 messages per email per hour
async function checkRateLimit(env: Env, email: string): Promise<boolean> {
  const key = `contact:rate:${email.toLowerCase()}`;
  const data = await env.USAGE_DATA.get(key);
  const now = Date.now();
  let timestamps: number[] = data ? JSON.parse(data) : [];
  // Keep only timestamps from last hour
  timestamps = timestamps.filter((t) => now - t < 3600000);
  if (timestamps.length >= 3) return false;
  timestamps.push(now);
  await env.USAGE_DATA.put(key, JSON.stringify(timestamps), {
    expirationTtl: 3600,
  });
  return true;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as any;
    const email = (body.email || "").trim();
    const message = (body.message || "").trim();
    const secretKey = (body.secretKey || "").trim();

    if (!email || !message) {
      return errorResponse("Email and message are required.");
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse("Invalid email address.");
    }

    if (message.length < 10) {
      return errorResponse("Message must be at least 10 characters.");
    }

    if (message.length > 5000) {
      return errorResponse("Message too long (max 5000 characters).");
    }

    // Rate limit
    const allowed = await checkRateLimit(context.env, email);
    if (!allowed) {
      return errorResponse("Too many messages. Please wait before sending again.", 429);
    }

    const date = new Date().toISOString();

    // Save to KV for record-keeping
    const msgId = `contact:msg:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await context.env.USAGE_DATA.put(
      msgId,
      JSON.stringify({ email, secretKey, message, date }),
      { expirationTtl: 60 * 60 * 24 * 90 } // 90 days
    );

    // Message is stored in KV — admin can view from dashboard
    // (MailChannels email removed — service discontinued 2024)

    return jsonResponse({ success: true, message: "Message sent. We'll get back to you soon." });
  } catch (err: any) {
    return errorResponse("Server error: " + (err.message || "unknown"), 500);
  }
};
