interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "svart-admin-2026";
const MOD_SECRET = "svart-mod-2026";
const ADMIN_EMAIL = "admin@svartsecurity.org";
const SECURITY_EMAIL = "security@svartsecurity.org";
const ADMIN_FULL_NAME = "Jaeger George Richard Stratton";

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

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — Submit a new guardian report (from Svart apps or manual submission)
// No auth required for app submissions (uses activation key for identity)
// Body: { app, userId, violationType, description, details?, submitterEmail? }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    let body: any;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    const app = (body.app || "").trim();
    const userId = (body.userId || "").trim();
    const violationType = (body.violationType || "Other").trim();
    const description = (body.description || "").trim();
    const details = body.details || null;
    const submitterEmail = (body.submitterEmail || "").trim().toLowerCase();

    if (!description) {
      return errorResponse("Description is required", 400);
    }

    const reportId = `guardian:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
    const country = context.request.headers.get("CF-IPCountry") || "unknown";

    const report = {
      id: reportId,
      app: app || "Unknown",
      userId,
      submitterEmail,
      violationType,
      description,
      details,
      ip,
      country,
      date: new Date().toISOString(),
      status: "pending", // pending | reviewed | escalated | dismissed
      reviewedBy: null as string | null,
      reviewedAt: null as string | null,
      notes: "" as string,
      escalatedAt: null as string | null,
    };

    // Store the report
    await context.env.USAGE_DATA.put(reportId, JSON.stringify(report), {
      expirationTtl: 60 * 60 * 24 * 365, // 1 year
    });

    // Append to guardian report log
    let log: string[] = [];
    try {
      const existing = await context.env.USAGE_DATA.get("guardian:log");
      if (existing) log = JSON.parse(existing);
    } catch {}
    log.push(reportId);
    if (log.length > 2000) log = log.slice(-2000);
    await context.env.USAGE_DATA.put("guardian:log", JSON.stringify(log));

    // Email admin about new report
    try {
      await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [
            { to: [{ email: ADMIN_EMAIL, name: "Svart Admin" }] },
          ],
          from: {
            email: "noreply@svartsecurity.org",
            name: "NetworkGuardian Alert",
          },
          subject: `[GUARDIAN] New ${violationType} Report — ${app || "Unknown App"}`,
          content: [
            {
              type: "text/plain",
              value: [
                "NetworkGuardian Violation Report",
                "================================",
                "",
                `Report ID:      ${reportId}`,
                `App:            ${app || "Unknown"}`,
                `Type:           ${violationType}`,
                `Submitter:      ${submitterEmail || userId || "Anonymous"}`,
                `Date:           ${report.date}`,
                `Country:        ${country}`,
                `IP:             ${ip}`,
                "",
                "Description:",
                "------------",
                description,
                "",
                details ? `Additional Details: ${JSON.stringify(details)}` : "",
                "",
                "---",
                "Review this report in the Admin or Mod Panel → Guardian Reports tab.",
                "NetworkGuardian — Svart Suite",
              ].join("\n"),
            },
          ],
        }),
      });
    } catch {
      // Non-blocking
    }

    return jsonResponse({ success: true, id: reportId, message: "Report submitted successfully." });
  } catch (err: any) {
    return errorResponse("Report submission failed: " + (err.message || "unknown"), 500);
  }
};

// GET — Admin/Mod retrieves guardian reports
// ?status=pending|reviewed|escalated|dismissed (optional filter)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const { authorized } = isAuthorized(context.request);
    if (!authorized) {
      return errorResponse("Unauthorized", 401);
    }

    const url = new URL(context.request.url);
    const statusFilter = url.searchParams.get("status") || "";

    let log: string[] = [];
    try {
      const existing = await context.env.USAGE_DATA.get("guardian:log");
      if (existing) log = JSON.parse(existing);
    } catch {}

    const reports: any[] = [];
    for (const id of log) {
      try {
        const raw = await context.env.USAGE_DATA.get(id);
        if (raw) reports.push(JSON.parse(raw));
      } catch {}
    }

    const filtered = statusFilter
      ? reports.filter((r) => r.status === statusFilter)
      : reports;

    const pending = reports.filter((r) => r.status === "pending").length;
    const escalated = reports.filter((r) => r.status === "escalated").length;

    return jsonResponse({
      success: true,
      reports: filtered.reverse(), // newest first
      total: filtered.length,
      pending,
      escalated,
    });
  } catch (err: any) {
    return errorResponse("Internal error: " + (err.message || "unknown"), 500);
  }
};

// PUT — Admin/Mod updates a report (review, add notes, change status, escalate)
// Body: { reportId, status?, notes?, reviewerEmail? }
// If status=escalated, also emails security@svartsecurity.org with full report
export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const { authorized, role } = isAuthorized(context.request);
    if (!authorized) {
      return errorResponse("Unauthorized", 401);
    }

    let body: any;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    const reportId = (body.reportId || "").trim();
    const newStatus = (body.status || "").trim();
    const notes = (body.notes || "").trim();
    const reviewerEmail = (body.reviewerEmail || "").trim();

    if (!reportId) {
      return errorResponse("reportId is required", 400);
    }

    const raw = await context.env.USAGE_DATA.get(reportId);
    if (!raw) {
      return errorResponse("Report not found", 404);
    }

    const report = JSON.parse(raw);

    // Update fields
    if (newStatus && ["pending", "reviewed", "escalated", "dismissed"].includes(newStatus)) {
      report.status = newStatus;
    }
    if (notes) {
      report.notes = notes;
    }
    if (reviewerEmail) {
      report.reviewedBy = reviewerEmail;
      report.reviewedAt = new Date().toISOString();
    }

    // Save updated report
    await context.env.USAGE_DATA.put(reportId, JSON.stringify(report), {
      expirationTtl: 60 * 60 * 24 * 365,
    });

    // If escalated — send formal email to security@ for law enforcement forwarding
    if (newStatus === "escalated") {
      report.escalatedAt = new Date().toISOString();
      await context.env.USAGE_DATA.put(reportId, JSON.stringify(report), {
        expirationTtl: 60 * 60 * 24 * 365,
      });

      const escalationDate = new Date().toISOString();
      const emailBody = [
        "FORMAL INCIDENT REPORT — FOR LAW ENFORCEMENT FORWARDING",
        "=========================================================",
        "",
        `Prepared by:     ${ADMIN_FULL_NAME}`,
        `Organisation:    Svart Suite / Svart Security`,
        `Contact:         ${ADMIN_EMAIL}`,
        `Security Email:  ${SECURITY_EMAIL}`,
        `Date Prepared:   ${escalationDate}`,
        "",
        "--- REPORT DETAILS ---",
        "",
        `Report ID:       ${report.id}`,
        `Date Filed:      ${report.date}`,
        `Source App:       ${report.app}`,
        `Violation Type:   ${report.violationType}`,
        `Submitter:        ${report.submitterEmail || report.userId || "Anonymous"}`,
        `Origin Country:   ${report.country || "Unknown"}`,
        `Origin IP:        ${report.ip || "Unknown"}`,
        "",
        "--- DESCRIPTION ---",
        "",
        report.description,
        "",
        report.details ? `--- ADDITIONAL DETAILS ---\n\n${JSON.stringify(report.details, null, 2)}` : "",
        "",
        "--- REVIEW NOTES ---",
        "",
        report.notes || "(No notes added)",
        "",
        `Reviewed by:     ${report.reviewedBy || reviewerEmail || "Admin"}`,
        `Reviewed at:     ${report.reviewedAt || escalationDate}`,
        `Escalated at:    ${escalationDate}`,
        "",
        "--- CHAIN OF CUSTODY ---",
        "",
        `1. Report received: ${report.date}`,
        `2. Reviewed by ${report.reviewedBy || reviewerEmail || "Admin"}: ${report.reviewedAt || escalationDate}`,
        `3. Escalated for law enforcement: ${escalationDate}`,
        "",
        "This report has been reviewed and is being forwarded to the",
        "appropriate authorities. A PDF copy of this report should be",
        "attached when submitting to any tip line or law enforcement portal.",
        "",
        "---",
        `${ADMIN_FULL_NAME}`,
        "Svart Suite — Administrator",
        `${ADMIN_EMAIL}`,
      ].join("\n");

      const htmlBody = `
        <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:32px;border-radius:12px;max-width:700px;">
          <h2 style="color:#ef4444;margin-top:0;">⚠️ FORMAL INCIDENT REPORT</h2>
          <p style="color:#f59e0b;font-size:0.9em;">For Law Enforcement Forwarding</p>
          <hr style="border:none;border-top:1px solid #333;">
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px 12px;color:#888;width:180px;">Prepared by</td><td style="padding:6px 12px;color:#fff;font-weight:bold;">${ADMIN_FULL_NAME}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Organisation</td><td style="padding:6px 12px;color:#fff;">Svart Suite / Svart Security</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Contact</td><td style="padding:6px 12px;color:#7c6aef;">${ADMIN_EMAIL}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Security Email</td><td style="padding:6px 12px;color:#7c6aef;">${SECURITY_EMAIL}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Date Prepared</td><td style="padding:6px 12px;color:#fff;">${escalationDate}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #333;">
          <h3 style="color:#7c6aef;">Report Details</h3>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px 12px;color:#888;width:180px;">Report ID</td><td style="padding:6px 12px;color:#fff;">${report.id}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Date Filed</td><td style="padding:6px 12px;color:#fff;">${report.date}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Source App</td><td style="padding:6px 12px;color:#fff;">${report.app}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Violation Type</td><td style="padding:6px 12px;color:#ef4444;font-weight:bold;">${report.violationType}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Submitter</td><td style="padding:6px 12px;color:#fff;">${report.submitterEmail || report.userId || "Anonymous"}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Origin Country</td><td style="padding:6px 12px;color:#fff;">${report.country || "Unknown"}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Origin IP</td><td style="padding:6px 12px;color:#fff;">${report.ip || "Unknown"}</td></tr>
          </table>
          <h3 style="color:#7c6aef;">Description</h3>
          <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0;white-space:pre-wrap;color:#ddd;">${report.description}</div>
          ${report.details ? `<h3 style="color:#7c6aef;">Additional Details</h3><pre style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0;color:#ddd;overflow-x:auto;">${JSON.stringify(report.details, null, 2)}</pre>` : ""}
          <h3 style="color:#7c6aef;">Review Notes</h3>
          <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0;white-space:pre-wrap;color:#ddd;">${report.notes || "(No notes added)"}</div>
          <hr style="border:none;border-top:1px solid #333;margin:24px 0;">
          <h3 style="color:#7c6aef;">Chain of Custody</h3>
          <ol style="color:#ddd;line-height:1.8;">
            <li>Report received: <strong>${report.date}</strong></li>
            <li>Reviewed by <strong>${report.reviewedBy || reviewerEmail || "Admin"}</strong>: ${report.reviewedAt || escalationDate}</li>
            <li>Escalated for law enforcement: <strong>${escalationDate}</strong></li>
          </ol>
          <hr style="border:none;border-top:1px solid #333;margin:24px 0;">
          <p style="color:#f59e0b;font-size:0.85em;">This report has been reviewed and is being forwarded to the appropriate authorities. A PDF copy should be attached when submitting to any tip line or law enforcement portal.</p>
          <p style="color:#888;margin-top:24px;font-size:0.85em;">${ADMIN_FULL_NAME}<br>Svart Suite — Administrator<br>${ADMIN_EMAIL}</p>
        </div>
      `;

      // Send to both admin and security email
      try {
        await fetch("https://api.mailchannels.net/tx/v1/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personalizations: [
              {
                to: [
                  { email: SECURITY_EMAIL, name: "Svart Security" },
                  { email: ADMIN_EMAIL, name: ADMIN_FULL_NAME },
                ],
              },
            ],
            from: {
              email: SECURITY_EMAIL,
              name: `${ADMIN_FULL_NAME} — Svart Security`,
            },
            subject: `[ESCALATED] Incident Report ${report.id} — ${report.violationType} — For Law Enforcement`,
            content: [
              { type: "text/plain", value: emailBody },
              { type: "text/html", value: htmlBody },
            ],
          }),
        });
      } catch {
        // Non-blocking
      }

      return jsonResponse({
        success: true,
        message: "Report escalated. Email sent to " + SECURITY_EMAIL + " and " + ADMIN_EMAIL,
        escalatedAt: escalationDate,
      });
    }

    return jsonResponse({ success: true, message: "Report updated." });
  } catch (err: any) {
    return errorResponse("Update failed: " + (err.message || "unknown"), 500);
  }
};
