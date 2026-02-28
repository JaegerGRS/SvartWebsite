interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "svart-admin-2026";
const MOD_SECRET = "svart-mod-2026";
const APP_SECRET = "svart-app-verify-2026";
const GUARDIAN_SECRET = "svart-guardian-2026";
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
  if (token === GUARDIAN_SECRET) return { authorized: true, role: "guardian" };
  if (token === APP_SECRET) return { authorized: true, role: "app" };
  return { authorized: false, role: "" };
}

// ============================
// LAW VIOLATION CATEGORIES
// Mirror of guardian.ts — used to resolve law references in reports and escalation emails.
// NOTE: General piracy (media, music, film) is NOT included —
//       only commercial software distribution/sharing is covered.
// ============================
const LAW_CATEGORIES: Record<string, {
  id: string; name: string; jurisdiction: string; statute: string;
  description: string; evidenceNote: string;
}> = {
  "CMA_1990":          { id: "CMA_1990",          name: "Unauthorized Access to Computer Material",  jurisdiction: "UK",  statute: "Computer Misuse Act 1990, Section 1",                    description: "Unauthorized access to computer material.",                                                                                                  evidenceNote: "Registration network hash, account creation timestamp." },
  "CMA_1990_S2":       { id: "CMA_1990_S2",       name: "Unauthorized Access with Intent",            jurisdiction: "UK",  statute: "Computer Misuse Act 1990, Section 2",                    description: "Unauthorized access with intent to commit further offences.",                                                                                evidenceNote: "Registration network hash, account creation timestamp." },
  "CMA_1990_S3":       { id: "CMA_1990_S3",       name: "Unauthorized Modification",                  jurisdiction: "UK",  statute: "Computer Misuse Act 1990, Section 3",                    description: "Unauthorized acts impairing computer operation.",                                                                                            evidenceNote: "Registration network hash, account creation timestamp." },
  "CMA_1990_S3A":      { id: "CMA_1990_S3A",      name: "Making/Supplying Articles for Misuse",       jurisdiction: "UK",  statute: "Computer Misuse Act 1990, Section 3A",                   description: "Making or supplying articles for computer misuse.",                                                                                          evidenceNote: "Registration network hash, account creation timestamp." },
  "CFAA":              { id: "CFAA",              name: "Computer Fraud and Abuse",                   jurisdiction: "US",  statute: "18 U.S.C. § 1030",                                      description: "Unauthorized access to protected computers.",                                                                                                evidenceNote: "Registration network hash, account creation timestamp." },
  "FRAUD_ACT_2006":    { id: "FRAUD_ACT_2006",    name: "Fraud (False Representation)",               jurisdiction: "UK",  statute: "Fraud Act 2006, Section 2",                              description: "Fraud by false representation.",                                                                                                            evidenceNote: "Registration network hash, account creation timestamp." },
  "FRAUD_ACT_2006_S6": { id: "FRAUD_ACT_2006_S6", name: "Possession of Articles for Fraud",           jurisdiction: "UK",  statute: "Fraud Act 2006, Section 6",                              description: "Possession of articles for use in fraud.",                                                                                                  evidenceNote: "Registration network hash, account creation timestamp." },
  "WIRE_FRAUD":        { id: "WIRE_FRAUD",        name: "Wire Fraud",                                 jurisdiction: "US",  statute: "18 U.S.C. § 1343",                                      description: "Using wire communications to execute a scheme to defraud.",                                                                                 evidenceNote: "Registration network hash, account creation timestamp." },
  "IDENTITY_THEFT_UK": { id: "IDENTITY_THEFT_UK", name: "Identity Fraud / Impersonation",             jurisdiction: "UK",  statute: "Fraud Act 2006, Section 2; Identity Documents Act 2010", description: "Using another person's identity for fraudulent purposes.",                                                                                   evidenceNote: "Registration network hash, account creation timestamp." },
  "IDENTITY_THEFT_US": { id: "IDENTITY_THEFT_US", name: "Identity Theft",                              jurisdiction: "US",  statute: "18 U.S.C. § 1028",                                      description: "Using another person's identification for unlawful activity.",                                                                              evidenceNote: "Registration network hash, account creation timestamp." },
  "GDPR":              { id: "GDPR",              name: "GDPR Violation",                             jurisdiction: "EU/UK", statute: "GDPR (EU) 2016/679",                                   description: "Violations of data protection principles.",                                                                                                 evidenceNote: "Registration network hash, account creation timestamp." },
  "DPA_2018":          { id: "DPA_2018",          name: "Data Protection Violation",                  jurisdiction: "UK",  statute: "Data Protection Act 2018",                               description: "Offences relating to personal data.",                                                                                                       evidenceNote: "Registration network hash, account creation timestamp." },
  "CSAM_UK":           { id: "CSAM_UK",           name: "Indecent Images of Children",                jurisdiction: "UK",  statute: "Protection of Children Act 1978; CJA 1988 s.160",        description: "Distribution or possession of indecent images of children.",                                                                                evidenceNote: "Registration network hash, account creation timestamp. Immediate referral required." },
  "CSAM_US":           { id: "CSAM_US",           name: "Child Sexual Abuse Material",                jurisdiction: "US",  statute: "18 U.S.C. §§ 2251–2260A",                               description: "Production, distribution, or possession of CSAM.",                                                                                         evidenceNote: "Registration network hash, account creation timestamp. NCMEC reporting required." },
  "HARASSMENT_UK":     { id: "HARASSMENT_UK",     name: "Harassment / Cyberstalking",                 jurisdiction: "UK",  statute: "Protection from Harassment Act 1997; Malicious Communications Act 1988", description: "Online harassment or stalking.",                                                                              evidenceNote: "Registration network hash, account creation timestamp." },
  "CYBERSTALKING_US":  { id: "CYBERSTALKING_US",  name: "Cyberstalking",                              jurisdiction: "US",  statute: "18 U.S.C. § 2261A",                                     description: "Electronic stalking or harassment.",                                                                                                        evidenceNote: "Registration network hash, account creation timestamp." },
  "TERRORISM_UK":      { id: "TERRORISM_UK",      name: "Terrorism-Related Offences",                 jurisdiction: "UK",  statute: "Terrorism Act 2000; Terrorism Act 2006",                 description: "Encouragement, preparation, or support of terrorism.",                                                                                      evidenceNote: "Registration network hash, account creation timestamp. Immediate referral required." },
  "TERRORISM_US":      { id: "TERRORISM_US",      name: "Material Support for Terrorism",             jurisdiction: "US",  statute: "18 U.S.C. § 2339A/B",                                   description: "Providing material support to terrorist organisations.",                                                                                    evidenceNote: "Registration network hash, account creation timestamp. Immediate referral required." },
  "MONEY_LAUNDERING_UK": { id: "MONEY_LAUNDERING_UK", name: "Money Laundering",                       jurisdiction: "UK",  statute: "Proceeds of Crime Act 2002, ss.327–329",                 description: "Concealing, converting, or transferring criminal property.",                                                                                evidenceNote: "Registration network hash, account creation timestamp." },
  "MONEY_LAUNDERING_US": { id: "MONEY_LAUNDERING_US", name: "Money Laundering",                       jurisdiction: "US",  statute: "18 U.S.C. §§ 1956–1957",                                description: "Financial transactions involving proceeds of unlawful activity.",                                                                           evidenceNote: "Registration network hash, account creation timestamp." },
  "SOFTWARE_PIRACY_UK": { id: "SOFTWARE_PIRACY_UK", name: "Commercial Software Piracy (Distribution)", jurisdiction: "UK",  statute: "Copyright, Designs and Patents Act 1988, ss.107–110",    description: "Distributing or sharing commercial software without authorization. Software distribution ONLY — not media/music/film.",                      evidenceNote: "Registration network hash, account creation timestamp." },
  "SOFTWARE_PIRACY_US": { id: "SOFTWARE_PIRACY_US", name: "Commercial Software Piracy (Distribution)", jurisdiction: "US",  statute: "NET Act 17 U.S.C. § 506; 18 U.S.C. § 2319",             description: "Willful distribution of copyrighted commercial software. Software distribution ONLY — not media/music/film.",                                evidenceNote: "Registration network hash, account creation timestamp." },
  "MALWARE_UK":        { id: "MALWARE_UK",        name: "Malware Distribution",                       jurisdiction: "UK",  statute: "Computer Misuse Act 1990, Section 3/3A",                 description: "Creating or distributing malware, ransomware, or spyware.",                                                                                 evidenceNote: "Registration network hash, account creation timestamp." },
  "MALWARE_US":        { id: "MALWARE_US",        name: "Malware Distribution",                       jurisdiction: "US",  statute: "18 U.S.C. § 1030(a)(5)",                                description: "Transmitting malicious code to damage protected computers.",                                                                                evidenceNote: "Registration network hash, account creation timestamp." },
  "DDOS_UK":           { id: "DDOS_UK",           name: "DDoS Attack",                                jurisdiction: "UK",  statute: "Computer Misuse Act 1990, Section 3",                    description: "Denial-of-service attacks impairing computer operation.",                                                                                    evidenceNote: "Registration network hash, account creation timestamp." },
  "DDOS_US":           { id: "DDOS_US",           name: "DDoS Attack",                                jurisdiction: "US",  statute: "18 U.S.C. § 1030(a)(5)",                                description: "DDoS attacks against protected computers.",                                                                                                 evidenceNote: "Registration network hash, account creation timestamp." },
  "PHISHING_UK":       { id: "PHISHING_UK",       name: "Phishing",                                   jurisdiction: "UK",  statute: "Fraud Act 2006, Section 2; CMA 1990",                    description: "Phishing to obtain personal information or credentials.",                                                                                   evidenceNote: "Registration network hash, account creation timestamp." },
  "PHISHING_US":       { id: "PHISHING_US",       name: "Phishing",                                   jurisdiction: "US",  statute: "CAN-SPAM Act; 18 U.S.C. § 1030; 18 U.S.C. § 1343",      description: "Deceptive communications to obtain personal/financial data.",                                                                               evidenceNote: "Registration network hash, account creation timestamp." },
  "THREATS_UK":        { id: "THREATS_UK",        name: "Threats to Kill / Criminal Threats",          jurisdiction: "UK",  statute: "OAPA 1861 s.16; Communications Act 2003 s.127",          description: "Threats of violence or grossly offensive communications.",                                                                                  evidenceNote: "Registration network hash, account creation timestamp." },
  "EXTORTION_UK":      { id: "EXTORTION_UK",      name: "Blackmail / Extortion",                      jurisdiction: "UK",  statute: "Theft Act 1968, Section 21",                             description: "Unwarranted demands with menaces including ransomware/sextortion.",                                                                         evidenceNote: "Registration network hash, account creation timestamp." },
  "EXTORTION_US":      { id: "EXTORTION_US",      name: "Extortion / Cyber Extortion",                jurisdiction: "US",  statute: "18 U.S.C. § 873; 18 U.S.C. § 1030",                     description: "Threats or unauthorized access to extort money, data, or services.",                                                                        evidenceNote: "Registration network hash, account creation timestamp." },
  "HATE_CRIME_UK":     { id: "HATE_CRIME_UK",     name: "Online Hate Crime / Incitement",             jurisdiction: "UK",  statute: "Public Order Act 1986; Racial and Religious Hatred Act 2006", description: "Stirring up racial, religious, or sexual orientation hatred.",                                                                          evidenceNote: "Registration network hash, account creation timestamp." },
  "OBSCENE_PUB_UK":    { id: "OBSCENE_PUB_UK",    name: "Obscene Publications",                       jurisdiction: "UK",  statute: "Obscene Publications Act 1959/1964",                     description: "Distributing or transmitting obscene material.",                                                                                            evidenceNote: "Registration network hash, account creation timestamp." },
  "TRADE_SECRETS_UK":  { id: "TRADE_SECRETS_UK",  name: "Trade Secret Theft",                         jurisdiction: "UK",  statute: "Trade Secrets Regulations 2018; Fraud Act 2006",          description: "Unlawful acquisition or disclosure of trade secrets.",                                                                                      evidenceNote: "Registration network hash, account creation timestamp." },
  "TRADE_SECRETS_US":  { id: "TRADE_SECRETS_US",  name: "Economic Espionage / Trade Secret Theft",    jurisdiction: "US",  statute: "18 U.S.C. §§ 1831–1839; DTSA 2016",                     description: "Theft or misappropriation of trade secrets.",                                                                                               evidenceNote: "Registration network hash, account creation timestamp." },
  "TOS_VIOLATION":     { id: "TOS_VIOLATION",     name: "Terms of Service Violation",                 jurisdiction: "Internal", statute: "Svart Security Terms of Service",                    description: "Violation of Svart Security ToS or EULA.",                                                                                                  evidenceNote: "Registration network hash, account creation timestamp." },
  "OTHER":             { id: "OTHER",             name: "Other Violation",                            jurisdiction: "Various",  statute: "To be determined upon review",                        description: "A violation not covered by other categories.",                                                                                              evidenceNote: "Registration network hash, account creation timestamp." }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// POST — Submit a new guardian report (from Svart apps or NetworkGuardian)
// Requires valid app, guardian, admin, or mod token
// Body: { app, userId, violationType, description, details?, submitterEmail? }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    // Require a valid token to submit reports
    const { authorized, role } = isAuthorized(context.request);
    if (!authorized) {
      return errorResponse("Unauthorized. Valid app or guardian token required.", 401);
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
    const lawCategoryIds: string[] = Array.isArray(body.lawCategoryIds) ? body.lawCategoryIds.filter((id: string) => typeof id === "string" && LAW_CATEGORIES[id]) : [];

    // Resolve law references from category IDs
    const lawReferences = lawCategoryIds.map((id: string) => {
      const cat = LAW_CATEGORIES[id];
      return { id: cat.id, name: cat.name, jurisdiction: cat.jurisdiction, statute: cat.statute, evidenceNote: cat.evidenceNote };
    });

    if (!description) {
      return errorResponse("Description is required", 400);
    }

    const reportId = `guardian:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const report = {
      id: reportId,
      app: app || "Unknown",
      userId,
      submitterEmail,
      submitterRole: role, // app | guardian | admin | mod — identifies who submitted
      violationType,
      lawCategoryIds,
      lawReferences,
      description,
      details,
      date: new Date().toISOString(),
      status: "pending", // pending | reviewed | escalated | dismissed
      reviewedBy: null as string | null,
      reviewedAt: null as string | null,
      notes: "" as string,
      escalatedAt: null as string | null,
      availableEvidence: "Registration network hash (SHA-256, irreversible) and account creation date/time only. No IP addresses, browsing history, or other tracking data is available.",
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
                "",
                lawReferences.length > 0 ? "Law Categories:\n" + lawReferences.map((l: any) => `  - ${l.name} (${l.jurisdiction}) — ${l.statute}`).join("\n") + "\n" : "",
                "Description:",
                "------------",
                description,
                "",
                details ? `Additional Details: ${JSON.stringify(details)}` : "",
                "",
                "Available Evidence: Registration network hash + account creation date/time only.",
                "",
                "---",
                "Review this report in the Admin Panel → Guardian Reports tab.",
                "NetworkGuardian — Svart Security",
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

    const { authorized, role } = isAuthorized(context.request);
    if (!authorized || (role !== "admin" && role !== "mod")) {
      return errorResponse("Unauthorized. Admin or Mod access only.", 401);
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
    if (!authorized || (role !== "admin" && role !== "mod")) {
      return errorResponse("Unauthorized. Admin or Mod access only.", 401);
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

      // Resolve law references from the report
      const reportLawRefs = (report.lawReferences || []) as Array<{id: string; name: string; jurisdiction: string; statute: string; evidenceNote: string}>;
      const lawSection = reportLawRefs.length > 0
        ? ["--- APPLICABLE LAWS ---", "", ...reportLawRefs.map((l: any, i: number) => `  ${i + 1}. ${l.name} (${l.jurisdiction})\n     Statute: ${l.statute}\n     Evidence: ${l.evidenceNote}`), ""].join("\n")
        : "";
      const lawHtmlSection = reportLawRefs.length > 0
        ? `<h3 style="color:#ef4444;">Applicable Laws</h3><table style="width:100%;border-collapse:collapse;margin:16px 0;">${reportLawRefs.map((l: any) => `<tr><td style="padding:8px 12px;color:#f59e0b;font-weight:600;border-bottom:1px solid #222;">${l.name}</td><td style="padding:8px 12px;color:#ddd;border-bottom:1px solid #222;">${l.jurisdiction}</td></tr><tr><td colspan="2" style="padding:4px 12px 12px;color:#aaa;font-size:0.85em;"><strong>Statute:</strong> ${l.statute}<br><strong>Evidence:</strong> ${l.evidenceNote}</td></tr>`).join("")}</table>`
        : "";

      const emailBody = [
        "FORMAL INCIDENT REPORT — FOR LAW ENFORCEMENT FORWARDING",
        "=========================================================",
        "",
        `Prepared by:     ${ADMIN_FULL_NAME}`,
        `Organisation:    Svart Security`,
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
        "",
        lawSection,
        "--- AVAILABLE EVIDENCE ---",
        "",
        report.availableEvidence || "Registration network hash (SHA-256, irreversible) and account creation date/time only.",
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
        "Svart Security — Administrator",
        `${ADMIN_EMAIL}`,
      ].join("\n");

      const htmlBody = `
        <div style="font-family:monospace;background:#0a0a0f;color:#e0e0e0;padding:32px;border-radius:12px;max-width:700px;">
          <h2 style="color:#ef4444;margin-top:0;">⚠️ FORMAL INCIDENT REPORT</h2>
          <p style="color:#f59e0b;font-size:0.9em;">For Law Enforcement Forwarding</p>
          <hr style="border:none;border-top:1px solid #333;">
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px 12px;color:#888;width:180px;">Prepared by</td><td style="padding:6px 12px;color:#fff;font-weight:bold;">${ADMIN_FULL_NAME}</td></tr>
            <tr><td style="padding:6px 12px;color:#888;">Organisation</td><td style="padding:6px 12px;color:#fff;">Svart Security</td></tr>
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
          </table>
          ${lawHtmlSection}
          <h3 style="color:#7c6aef;">Available Evidence</h3>
          <div style="background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0;color:#f59e0b;font-size:0.9em;">${report.availableEvidence || "Registration network hash (SHA-256, irreversible) and account creation date/time only. No IP addresses, browsing history, or other tracking data is available."}</div>
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
          <p style="color:#888;margin-top:24px;font-size:0.85em;">${ADMIN_FULL_NAME}<br>Svart Security — Administrator<br>${ADMIN_EMAIL}</p>
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
