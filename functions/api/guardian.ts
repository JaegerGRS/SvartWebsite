/**
 * NetworkGuardian Enforcement API
 * ================================
 * This is the autonomous protection layer for Svart Security.
 * 
 * CORE PRINCIPLE: No human — not even the admin — ever sees an IP address.
 * The Guardian uses SHA-256 hashed network fingerprints internally.
 * 
 * LEGAL SCOPE — The Guardian is ONLY permitted to track IP addresses for:
 *   1. Registration enforcement — one account per network (duplicate prevention)
 *   2. Illegal activity reports — when a user is reported for illegal activities,
 *      the Guardian may include the network hash in the formal incident report
 * 
 * The Guardian does NOT track IPs for logins, browsing, or any other purpose.
 * 
 * All enforcement decisions are automated. Admin can only see:
 *   - Network hash identifiers (irreversible, e.g. "net_a3f8b2...")
 *   - Block/unblock actions
 *   - Abuse statistics (counts, not raw data)
 * 
 * KV Keys used:
 *   guardian:nethash:{hash}         → { accounts: [email], firstSeen }
 *   guardian:blocked:net:{hash}     → { reason, blockedAt, blockedBy }
 *   guardian:blocked:url:{urlhash}  → { url, reason, blockedAt, blockedBy }
 *   guardian:blocked:list           → [{ type: 'net'|'url', hash, reason, blockedAt }]
 *   guardian:stats                  → { totalBlocked, totalFlagged, totalRegistrations }
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "svart-admin-2026";
const MOD_SECRET = "svart-mod-2026";
const GUARDIAN_SECRET = "svart-guardian-2026";

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

function isAuthorized(request: Request): { authorized: boolean; role: string } {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token === ADMIN_SECRET) return { authorized: true, role: "admin" };
  if (token === MOD_SECRET) return { authorized: true, role: "mod" };
  if (token === GUARDIAN_SECRET) return { authorized: true, role: "guardian" };
  return { authorized: false, role: "" };
}

/**
 * SHA-256 hash an IP address into an irreversible network fingerprint.
 * Prefixed with "net_" so it's clearly a Guardian identifier, not a real IP.
 * Uses a salt to prevent rainbow table attacks.
 */
async function hashNetwork(ip: string): Promise<string> {
  const salt = "svart-guardian-net-2026";
  const data = new TextEncoder().encode(salt + ip);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return "net_" + hex.substring(0, 24); // First 24 hex chars = 96 bits of entropy, plenty
}

/**
 * SHA-256 hash a URL for the block list.
 */
async function hashUrl(url: string): Promise<string> {
  const data = new TextEncoder().encode(url.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return "url_" + hex.substring(0, 24);
}

// ============================
// CORS preflight
// ============================
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// ============================
// POST — Internal enforcement checks (called by auth.ts and registrations.ts)
// ============================
// Actions:
//   check-registration  — Can this network register? Returns { allowed, reason, networkId }
//   record-registration — Record that a registration happened from this network
//   block-network       — Admin blocks a network hash
//   unblock-network     — Admin unblocks a network hash
//   block-url           — Admin blocks a URL
//   unblock-url         — Admin unblocks a URL
//   check-url           — Check if a URL is blocked
//
// NOTE: Login IP tracking is NOT permitted. The Guardian only tracks IPs at registration.
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

    const action = (body.action || "").trim();

    // ───────────────────────────────────────────
    // INTERNAL: check-registration
    // Called internally by registrations.ts before creating an account
    // Receives the raw IP from CF-Connecting-IP, hashes it, checks if blocked or duplicate
    // ───────────────────────────────────────────
    if (action === "check-registration") {
      const ip = (body.ip || "").trim();
      if (!ip) return jsonResponse({ allowed: true, networkId: "unknown" }); // No IP available, allow

      const netHash = await hashNetwork(ip);

      // Check if this network is blocked
      const blockedRaw = await context.env.USAGE_DATA.get(`guardian:blocked:net:${netHash}`);
      if (blockedRaw) {
        return jsonResponse({
          allowed: false,
          reason: "This network has been blocked by NetworkGuardian for policy violations.",
          networkId: netHash,
        });
      }

      // Check if this network already has an account registered
      const netRaw = await context.env.USAGE_DATA.get(`guardian:nethash:${netHash}`);
      if (netRaw) {
        const netData = JSON.parse(netRaw);
        if (netData.accounts && netData.accounts.length > 0) {
          return jsonResponse({
            allowed: false,
            reason: "An account has already been registered from this network. Only one account per network is allowed.",
            networkId: netHash,
          });
        }
      }

      return jsonResponse({ allowed: true, networkId: netHash });
    }

    // ───────────────────────────────────────────
    // INTERNAL: record-registration
    // Called after successful registration to track the network → email mapping
    // ───────────────────────────────────────────
    if (action === "record-registration") {
      const ip = (body.ip || "").trim();
      const email = (body.email || "").trim().toLowerCase();
      if (!ip || !email) return jsonResponse({ success: true });

      const netHash = await hashNetwork(ip);
      const now = new Date().toISOString();

      let netData: any = { accounts: [], firstSeen: now };
      const existingRaw = await context.env.USAGE_DATA.get(`guardian:nethash:${netHash}`);
      if (existingRaw) {
        try { netData = JSON.parse(existingRaw); } catch {}
      }

      if (!netData.accounts) netData.accounts = [];
      if (!netData.accounts.includes(email)) {
        netData.accounts.push(email);
      }
      if (!netData.firstSeen) netData.firstSeen = now;

      await context.env.USAGE_DATA.put(`guardian:nethash:${netHash}`, JSON.stringify(netData));

      // Update stats
      await updateStats(context.env, "registration");

      return jsonResponse({ success: true, networkId: netHash });
    }

    // ───────────────────────────────────────────
    // ADMIN: block-network
    // Admin/Mod blocks a network hash (they only see the hash, never the IP)
    // ───────────────────────────────────────────
    if (action === "block-network") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || (role !== "admin" && role !== "mod")) {
        return errorResponse("Unauthorized", 401);
      }

      const networkId = (body.networkId || "").trim();
      const reason = (body.reason || "Policy violation").trim();
      if (!networkId || !networkId.startsWith("net_")) {
        return errorResponse("Invalid network ID. Must start with net_", 400);
      }

      const blockEntry = {
        reason,
        blockedAt: new Date().toISOString(),
        blockedBy: role,
      };
      await context.env.USAGE_DATA.put(`guardian:blocked:net:${networkId}`, JSON.stringify(blockEntry));

      // Add to block list
      await addToBlockList(context.env, "net", networkId, reason);

      return jsonResponse({ success: true, message: `Network ${networkId} has been blocked.` });
    }

    // ───────────────────────────────────────────
    // ADMIN: unblock-network
    // ───────────────────────────────────────────
    if (action === "unblock-network") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
      }

      const networkId = (body.networkId || "").trim();
      if (!networkId) return errorResponse("networkId is required", 400);

      await context.env.USAGE_DATA.delete(`guardian:blocked:net:${networkId}`);
      await removeFromBlockList(context.env, "net", networkId);

      return jsonResponse({ success: true, message: `Network ${networkId} has been unblocked.` });
    }

    // ───────────────────────────────────────────
    // ADMIN: block-url
    // ───────────────────────────────────────────
    if (action === "block-url") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || (role !== "admin" && role !== "mod")) {
        return errorResponse("Unauthorized", 401);
      }

      const url = (body.url || "").trim();
      const reason = (body.reason || "Policy violation").trim();
      if (!url) return errorResponse("URL is required", 400);

      const urlHash = await hashUrl(url);
      const blockEntry = {
        url, // Store the actual URL so admin can see what's blocked
        reason,
        blockedAt: new Date().toISOString(),
        blockedBy: role,
      };
      await context.env.USAGE_DATA.put(`guardian:blocked:url:${urlHash}`, JSON.stringify(blockEntry));
      await addToBlockList(context.env, "url", urlHash, reason, url);

      return jsonResponse({ success: true, message: `URL blocked: ${url}`, urlHash });
    }

    // ───────────────────────────────────────────
    // ADMIN: unblock-url
    // ───────────────────────────────────────────
    if (action === "unblock-url") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
      }

      const urlHash = (body.urlHash || "").trim();
      if (!urlHash) return errorResponse("urlHash is required", 400);

      await context.env.USAGE_DATA.delete(`guardian:blocked:url:${urlHash}`);
      await removeFromBlockList(context.env, "url", urlHash);

      return jsonResponse({ success: true, message: `URL unblocked.` });
    }

    // ───────────────────────────────────────────
    // ADMIN: check-url
    // Check if a URL is in the block list
    // ───────────────────────────────────────────
    if (action === "check-url") {
      const url = (body.url || "").trim();
      if (!url) return jsonResponse({ blocked: false });

      const urlHash = await hashUrl(url);
      const blockedRaw = await context.env.USAGE_DATA.get(`guardian:blocked:url:${urlHash}`);
      if (blockedRaw) {
        const blocked = JSON.parse(blockedRaw);
        return jsonResponse({ blocked: true, reason: blocked.reason, blockedAt: blocked.blockedAt });
      }
      return jsonResponse({ blocked: false });
    }

    return errorResponse("Unknown action: " + action, 400);
  } catch (err: any) {
    return errorResponse("Guardian error: " + (err.message || "unknown"), 500);
  }
};

// ============================
// GET — Admin/Mod: View Guardian enforcement data
// ?view=blocklist     → All blocked networks and URLs
// ?view=stats         → Enforcement statistics
// ?view=flagged       → Networks flagged for suspicious activity
// ?view=network&id=X  → Details of a specific network hash (accounts linked, attempt counts)
// ============================
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
    const view = url.searchParams.get("view") || "stats";

    // ─── Block List ───
    if (view === "blocklist") {
      const listRaw = await context.env.USAGE_DATA.get("guardian:blocked:list");
      let list: any[] = [];
      if (listRaw) {
        try { list = JSON.parse(listRaw); } catch {}
      }
      return jsonResponse({ success: true, blocklist: list, total: list.length });
    }

    // ─── Stats ───
    if (view === "stats") {
      const statsRaw = await context.env.USAGE_DATA.get("guardian:stats");
      let stats: any = { totalBlocked: 0, totalFlagged: 0, totalRegistrations: 0 };
      if (statsRaw) {
        try { stats = JSON.parse(statsRaw); } catch {}
      }

      // Count blocked items
      const listRaw = await context.env.USAGE_DATA.get("guardian:blocked:list");
      let blockedCount = 0;
      if (listRaw) {
        try { blockedCount = JSON.parse(listRaw).length; } catch {}
      }
      stats.activeBlocks = blockedCount;

      return jsonResponse({ success: true, stats });
    }

    // ─── Flagged Networks ───
    if (view === "flagged") {
      // This scans for networks with high failure counts
      // In production, you'd maintain a separate flagged list; for now we return from stats
      const statsRaw = await context.env.USAGE_DATA.get("guardian:stats");
      let stats: any = {};
      if (statsRaw) {
        try { stats = JSON.parse(statsRaw); } catch {}
      }
      const flagged = stats.flaggedNetworks || [];
      return jsonResponse({ success: true, flagged, total: flagged.length });
    }

    // ─── Network Detail ───
    if (view === "network") {
      const netId = url.searchParams.get("id") || "";
      if (!netId) return errorResponse("Network ID is required", 400);

      const netRaw = await context.env.USAGE_DATA.get(`guardian:nethash:${netId}`);
      if (!netRaw) {
        return jsonResponse({ success: true, found: false, networkId: netId });
      }

      const netData = JSON.parse(netRaw);
      // Check if blocked
      const blockedRaw = await context.env.USAGE_DATA.get(`guardian:blocked:net:${netId}`);
      const isBlocked = !!blockedRaw;
      let blockInfo = null;
      if (blockedRaw) {
        try { blockInfo = JSON.parse(blockedRaw); } catch {}
      }

      return jsonResponse({
        success: true,
        found: true,
        networkId: netId,
        accounts: netData.accounts || [],
        firstSeen: netData.firstSeen,
        blocked: isBlocked,
        blockInfo,
      });
    }

    return errorResponse("Unknown view: " + view, 400);
  } catch (err: any) {
    return errorResponse("Guardian error: " + (err.message || "unknown"), 500);
  }
};

// ============================
// Helper: Add to block list
// ============================
async function addToBlockList(env: Env, type: string, hash: string, reason: string, displayUrl?: string): Promise<void> {
  let list: any[] = [];
  const raw = await env.USAGE_DATA.get("guardian:blocked:list");
  if (raw) {
    try { list = JSON.parse(raw); } catch {}
  }
  // Don't duplicate
  if (list.some((item: any) => item.hash === hash)) return;
  list.push({
    type,
    hash,
    reason,
    displayUrl: displayUrl || null,
    blockedAt: new Date().toISOString(),
  });
  await env.USAGE_DATA.put("guardian:blocked:list", JSON.stringify(list));
}

// ============================
// Helper: Remove from block list
// ============================
async function removeFromBlockList(env: Env, type: string, hash: string): Promise<void> {
  let list: any[] = [];
  const raw = await env.USAGE_DATA.get("guardian:blocked:list");
  if (raw) {
    try { list = JSON.parse(raw); } catch {}
  }
  list = list.filter((item: any) => !(item.type === type && item.hash === hash));
  await env.USAGE_DATA.put("guardian:blocked:list", JSON.stringify(list));
}

// ============================
// Helper: Update guardian stats
// ============================
async function updateStats(env: Env, eventType: string): Promise<void> {
  let stats: any = { totalBlocked: 0, totalFlagged: 0, totalRegistrations: 0, flaggedNetworks: [] };
  const raw = await env.USAGE_DATA.get("guardian:stats");
  if (raw) {
    try { stats = JSON.parse(raw); } catch {}
  }
  if (eventType === "registration") {
    stats.totalRegistrations = (stats.totalRegistrations || 0) + 1;
  } else if (eventType === "block") {
    stats.totalBlocked = (stats.totalBlocked || 0) + 1;
  } else if (eventType === "flag") {
    stats.totalFlagged = (stats.totalFlagged || 0) + 1;
  }
  stats.lastUpdated = new Date().toISOString();
  await env.USAGE_DATA.put("guardian:stats", JSON.stringify(stats));
}
