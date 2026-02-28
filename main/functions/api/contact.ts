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

    // Send via MailChannels
    try {
      await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [
            { to: [{ email: CONTACT_EMAIL, name: "Svart Security Contact" }] },
          ],
          from: {
            email: "noreply@svartsecurity.org",
            name: "Svart Security Contact Form",
          },
          reply_to: { email: email },
          subject: `[Contact Form] Message from ${email}`,
          content: [
            {
              type: "text/plain",
              value: [
                "New Contact Form Submission",
                "===========================",
                "",
                `From:        ${email}`,
                `Secret Key:  ${secretKey || "Not provided"}`,
                `Date:        ${date}`,
                "",
                "Message:",
                "--------",
                message,
                "",
                "---",
                "Svart Security Contact Form",
              ].join("\n"),
            },
            {
              type: "text/html",
              value: `
                <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:24px;border-radius:12px;max-width:600px;">
                  <h2 style="color:#7c6aef;margin-top:0;">New Contact Form Message</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 12px;color:#888;width:120px;">From</td><td style="padding:6px 12px;color:#fff;">${email}</td></tr>
                    <tr><td style="padding:6px 12px;color:#888;">Secret Key</td><td style="padding:6px 12px;color:#7c6aef;font-weight:bold;">${secretKey || "Not provided"}</td></tr>
                    <tr><td style="padding:6px 12px;color:#888;">Date</td><td style="padding:6px 12px;color:#fff;">${date}</td></tr>
                  </table>
                  <hr style="border:none;border-top:1px solid #333;margin:16px 0;">
                  <h3 style="color:#7c6aef;">Message</h3>
                  <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0;white-space:pre-wrap;color:#ddd;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
                  <hr style="border:none;border-top:1px solid #333;margin:16px 0;">
                  <p style="color:#666;font-size:0.85em;margin:0;">Svart Security Contact Form</p>
                </div>
              `,
            },
          ],
        }),
      });
    } catch {
      // Non-blocking — message is saved to KV
    }

    return jsonResponse({ success: true, message: "Message sent. We'll get back to you soon." });
  } catch (err: any) {
    return errorResponse("Server error: " + (err.message || "unknown"), 500);
  }
};
