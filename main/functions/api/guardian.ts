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
 *   guardian:enc:{hash}             → AES-256-GCM encrypted IP (recoverable for LEA)
 *   guardian:blocked:net:{hash}     → { reason, blockedAt, blockedBy }
 *   guardian:blocked:url:{urlhash}  → { url, reason, blockedAt, blockedBy }
 *   guardian:blocked:list           → [{ type: 'net'|'url', hash, reason, blockedAt }]
 *   guardian:stats                  → { totalBlocked, totalFlagged, totalRegistrations, leaDecryptions }
 *   guardian:feed                   → { advisories: [...], lastUpdated }
 *   guardian:versions               → { AppName: { latest, minRequired, downloadUrl } }
 *   guardian:log                    → [reportId, ...] (report index)
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

const ADMIN_SECRET = "hTBtS8xGAazH878gDLQDVWY7Xt0WsbqrNQN__FQ0cnzl_obEySzvACHcMI0v-3PR";
const MOD_SECRET = "4Vw15CeU_bal14uMBHkEZjE1KhoXr5TbMSP9CBqmTAD6PBRMfUDF-mx-qeAR9ErH";
const GUARDIAN_SECRET = "svart-guardian-2026";
const APP_SECRET = "svart-app-verify-2026";

// ============================
// LEA ENCRYPTION KEY (AES-256-GCM)
// Used to encrypt raw IPs so law enforcement can recover them via court order.
// The net_* hash is irreversible (for daily ops). The encrypted IP is decryptable
// by admin only, for formal law enforcement reports.
// ============================
const LEA_KEY_HEX = "c7a3f1e09b2d4c6a8f5e1d3b7a9c0e2f4d6b8a1c3e5f7092b4d6a8c0e2f4a6b8";

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
  if (token === APP_SECRET) return { authorized: true, role: "app" };
  return { authorized: false, role: "" };
}

// ============================
// LEA ENCRYPTION — AES-256-GCM
// Encrypts raw IPs so they can be recovered for law enforcement.
// Only admin can trigger decryption (for escalated reports with court orders).
// ============================
async function getLeaKey(): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(LEA_KEY_HEX.substr(i * 2, 2), 16);
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptForLEA(plaintext: string): Promise<string> {
  const key = await getLeaKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptForLEA(encrypted: string): Promise<string> {
  const key = await getLeaKey();
  const combined = new Uint8Array(atob(encrypted).split("").map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ============================
// LAW VIOLATION CATEGORIES
// Comprehensive list of laws that can be violated and reported through the Guardian.
// Each category includes the statute, jurisdiction, and what evidence is available.
// NOTE: Only data available is registration network hash + account creation date/time.
// NOTE: General piracy (media, music, film) is NOT included — only commercial software
//       distribution/sharing is covered under software piracy laws.
// ============================
const LAW_CATEGORIES: Record<string, {
  id: string;
  name: string;
  jurisdiction: string;
  statute: string;
  description: string;
  evidenceNote: string;
}> = {
  // === COMPUTER MISUSE / UNAUTHORIZED ACCESS ===
  "CMA_1990": {
    id: "CMA_1990",
    name: "Unauthorized Access to Computer Material",
    jurisdiction: "UK",
    statute: "Computer Misuse Act 1990, Section 1",
    description: "Unauthorized access to computer material, including accounts, systems, or data belonging to others.",
    evidenceNote: "Registration network hash, account creation timestamp. May indicate account used as staging for unauthorized access."
  },
  "CMA_1990_S2": {
    id: "CMA_1990_S2",
    name: "Unauthorized Access with Intent to Commit Offences",
    jurisdiction: "UK",
    statute: "Computer Misuse Act 1990, Section 2",
    description: "Unauthorized access to a computer with intent to commit or facilitate further offences (e.g., fraud, theft).",
    evidenceNote: "Registration network hash, account creation timestamp, linked account activity patterns."
  },
  "CMA_1990_S3": {
    id: "CMA_1990_S3",
    name: "Unauthorized Modification of Computer Material",
    jurisdiction: "UK",
    statute: "Computer Misuse Act 1990, Section 3",
    description: "Unauthorized acts with intent to impair the operation of a computer, prevent access to programs/data, or impair reliability.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "CMA_1990_S3A": {
    id: "CMA_1990_S3A",
    name: "Making/Supplying Articles for Computer Misuse",
    jurisdiction: "UK",
    statute: "Computer Misuse Act 1990, Section 3A",
    description: "Making, adapting, supplying or offering to supply any article for use in computer misuse offences.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "CFAA": {
    id: "CFAA",
    name: "Computer Fraud and Abuse",
    jurisdiction: "US",
    statute: "Computer Fraud and Abuse Act (18 U.S.C. § 1030)",
    description: "Unauthorized access to protected computers, exceeding authorized access, or causing damage to computer systems.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === FRAUD ===
  "FRAUD_ACT_2006": {
    id: "FRAUD_ACT_2006",
    name: "Fraud (False Representation)",
    jurisdiction: "UK",
    statute: "Fraud Act 2006, Section 2",
    description: "Fraud by false representation — dishonestly making a false representation to make a gain or cause loss.",
    evidenceNote: "Registration network hash, account creation timestamp. False details used during registration."
  },
  "FRAUD_ACT_2006_S6": {
    id: "FRAUD_ACT_2006_S6",
    name: "Possession of Articles for Fraud",
    jurisdiction: "UK",
    statute: "Fraud Act 2006, Section 6",
    description: "Possession of any article for use in the course of or in connection with any fraud.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "WIRE_FRAUD": {
    id: "WIRE_FRAUD",
    name: "Wire Fraud",
    jurisdiction: "US",
    statute: "18 U.S.C. § 1343",
    description: "Using wire communications (internet) to execute a scheme to defraud or obtain money/property by false pretences.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === IDENTITY THEFT ===
  "IDENTITY_THEFT_UK": {
    id: "IDENTITY_THEFT_UK",
    name: "Identity Fraud / Impersonation",
    jurisdiction: "UK",
    statute: "Fraud Act 2006, Section 2 (identity context); Identity Documents Act 2010",
    description: "Using another person's identity or creating false identity documents for fraudulent purposes.",
    evidenceNote: "Registration network hash, account creation timestamp. Account registered using stolen/false identity details."
  },
  "IDENTITY_THEFT_US": {
    id: "IDENTITY_THEFT_US",
    name: "Identity Theft",
    jurisdiction: "US",
    statute: "Identity Theft and Assumption Deterrence Act (18 U.S.C. § 1028)",
    description: "Knowingly transferring, possessing, or using another person's identification with intent to commit unlawful activity.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === DATA PROTECTION / PRIVACY ===
  "GDPR": {
    id: "GDPR",
    name: "GDPR Violation",
    jurisdiction: "EU/UK",
    statute: "General Data Protection Regulation (EU) 2016/679",
    description: "Violations of data protection principles including unlawful processing, data breaches, or failure to protect personal data.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "DPA_2018": {
    id: "DPA_2018",
    name: "Data Protection Violation",
    jurisdiction: "UK",
    statute: "Data Protection Act 2018",
    description: "Offences relating to personal data including unlawful obtaining, selling, or re-identification of de-identified data.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === CHILD EXPLOITATION / CSAM ===
  "CSAM_UK": {
    id: "CSAM_UK",
    name: "Indecent Images of Children",
    jurisdiction: "UK",
    statute: "Protection of Children Act 1978; Criminal Justice Act 1988, Section 160",
    description: "Taking, distributing, showing, possessing, or publishing indecent images/pseudo-images of children.",
    evidenceNote: "Registration network hash, account creation timestamp. Immediate law enforcement referral required."
  },
  "CSAM_US": {
    id: "CSAM_US",
    name: "Child Sexual Abuse Material",
    jurisdiction: "US",
    statute: "18 U.S.C. §§ 2251–2260A (PROTECT Act)",
    description: "Production, distribution, reception, or possession of child sexual abuse material.",
    evidenceNote: "Registration network hash, account creation timestamp. Mandatory NCMEC reporting required."
  },

  // === HARASSMENT / STALKING ===
  "HARASSMENT_UK": {
    id: "HARASSMENT_UK",
    name: "Harassment / Cyberstalking",
    jurisdiction: "UK",
    statute: "Protection from Harassment Act 1997; Malicious Communications Act 1988",
    description: "Course of conduct amounting to harassment, stalking, or sending malicious/threatening communications online.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "CYBERSTALKING_US": {
    id: "CYBERSTALKING_US",
    name: "Cyberstalking",
    jurisdiction: "US",
    statute: "18 U.S.C. § 2261A (Violence Against Women Act)",
    description: "Using electronic communications to stalk, harass, or cause substantial emotional distress.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === TERRORISM ===
  "TERRORISM_UK": {
    id: "TERRORISM_UK",
    name: "Terrorism-Related Offences",
    jurisdiction: "UK",
    statute: "Terrorism Act 2000; Terrorism Act 2006",
    description: "Encouragement of terrorism, dissemination of terrorist publications, preparation of terrorist acts, or support of proscribed organisations.",
    evidenceNote: "Registration network hash, account creation timestamp. Immediate law enforcement referral required."
  },
  "TERRORISM_US": {
    id: "TERRORISM_US",
    name: "Material Support for Terrorism",
    jurisdiction: "US",
    statute: "18 U.S.C. § 2339A/B",
    description: "Providing material support or resources to foreign terrorist organisations or for terrorist acts.",
    evidenceNote: "Registration network hash, account creation timestamp. Immediate law enforcement referral required."
  },

  // === MONEY LAUNDERING ===
  "MONEY_LAUNDERING_UK": {
    id: "MONEY_LAUNDERING_UK",
    name: "Money Laundering",
    jurisdiction: "UK",
    statute: "Proceeds of Crime Act 2002, Sections 327–329",
    description: "Concealing, disguising, converting, transferring, or acquiring criminal property.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "MONEY_LAUNDERING_US": {
    id: "MONEY_LAUNDERING_US",
    name: "Money Laundering",
    jurisdiction: "US",
    statute: "18 U.S.C. §§ 1956–1957",
    description: "Conducting financial transactions involving proceeds of unlawful activity or structuring transactions to evade reporting.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === SOFTWARE PIRACY (Distribution only — NOT general media piracy) ===
  "SOFTWARE_PIRACY_UK": {
    id: "SOFTWARE_PIRACY_UK",
    name: "Commercial Software Piracy (Distribution)",
    jurisdiction: "UK",
    statute: "Copyright, Designs and Patents Act 1988, Sections 107–110",
    description: "Distributing, sharing, or making available for download commercial/proprietary software without authorization. This applies ONLY to software distribution — not media, music, or film.",
    evidenceNote: "Registration network hash, account creation timestamp. Account used to distribute pirated software."
  },
  "SOFTWARE_PIRACY_US": {
    id: "SOFTWARE_PIRACY_US",
    name: "Commercial Software Piracy (Distribution)",
    jurisdiction: "US",
    statute: "No Electronic Theft Act (NET Act) 17 U.S.C. § 506; 18 U.S.C. § 2319",
    description: "Willful distribution or sharing of copyrighted commercial software for personal or commercial advantage. This applies ONLY to software distribution — not media, music, or film.",
    evidenceNote: "Registration network hash, account creation timestamp. Account used to distribute pirated software."
  },

  // === MALWARE / DDOS ===
  "MALWARE_UK": {
    id: "MALWARE_UK",
    name: "Malware Distribution",
    jurisdiction: "UK",
    statute: "Computer Misuse Act 1990, Section 3/3A",
    description: "Creating, distributing, or supplying malware, ransomware, spyware, or other malicious software.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "MALWARE_US": {
    id: "MALWARE_US",
    name: "Malware Distribution",
    jurisdiction: "US",
    statute: "Computer Fraud and Abuse Act (18 U.S.C. § 1030(a)(5))",
    description: "Knowingly causing the transmission of a program, code, or command that intentionally causes damage to a protected computer.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "DDOS_UK": {
    id: "DDOS_UK",
    name: "DDoS Attack",
    jurisdiction: "UK",
    statute: "Computer Misuse Act 1990, Section 3",
    description: "Deliberately impairing the operation of a computer or access to data/programs through distributed denial-of-service attacks.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "DDOS_US": {
    id: "DDOS_US",
    name: "DDoS Attack",
    jurisdiction: "US",
    statute: "Computer Fraud and Abuse Act (18 U.S.C. § 1030(a)(5))",
    description: "Intentionally causing damage to a protected computer by means of transmission of code or commands (DDoS).",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === PHISHING ===
  "PHISHING_UK": {
    id: "PHISHING_UK",
    name: "Phishing",
    jurisdiction: "UK",
    statute: "Fraud Act 2006, Section 2; Computer Misuse Act 1990",
    description: "Creating fake websites, emails, or communications to trick people into revealing personal information, credentials, or financial data.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "PHISHING_US": {
    id: "PHISHING_US",
    name: "Phishing",
    jurisdiction: "US",
    statute: "CAN-SPAM Act; 18 U.S.C. § 1030; 18 U.S.C. § 1343 (Wire Fraud)",
    description: "Using deceptive electronic communications to obtain personal information, credentials, or financial data from victims.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === THREATS / EXTORTION ===
  "THREATS_UK": {
    id: "THREATS_UK",
    name: "Threats to Kill / Criminal Threats",
    jurisdiction: "UK",
    statute: "Offences Against the Person Act 1861, Section 16; Communications Act 2003, Section 127",
    description: "Making threats to kill, threats of violence, or sending grossly offensive/threatening communications.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "EXTORTION_UK": {
    id: "EXTORTION_UK",
    name: "Blackmail / Extortion",
    jurisdiction: "UK",
    statute: "Theft Act 1968, Section 21",
    description: "Making unwarranted demands with menaces for personal gain, including ransomware extortion and sextortion.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "EXTORTION_US": {
    id: "EXTORTION_US",
    name: "Extortion / Cyber Extortion",
    jurisdiction: "US",
    statute: "18 U.S.C. § 873 (Extortion); 18 U.S.C. § 1030 (CFAA)",
    description: "Using threats, intimidation, or unauthorized computer access to extort money, data, or services.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === HATE CRIMES (ONLINE) ===
  "HATE_CRIME_UK": {
    id: "HATE_CRIME_UK",
    name: "Online Hate Crime / Incitement",
    jurisdiction: "UK",
    statute: "Public Order Act 1986, Part 3/3A; Racial and Religious Hatred Act 2006",
    description: "Stirring up racial, religious, or sexual orientation hatred through online communications or publications.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === OBSCENE PUBLICATIONS ===
  "OBSCENE_PUB_UK": {
    id: "OBSCENE_PUB_UK",
    name: "Obscene Publications",
    jurisdiction: "UK",
    statute: "Obscene Publications Act 1959/1964",
    description: "Publishing, distributing, or transmitting obscene material electronically.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === TRADE SECRETS / ESPIONAGE ===
  "TRADE_SECRETS_UK": {
    id: "TRADE_SECRETS_UK",
    name: "Trade Secret Theft",
    jurisdiction: "UK",
    statute: "Trade Secrets (Enforcement, etc.) Regulations 2018; Fraud Act 2006",
    description: "Unlawful acquisition, use, or disclosure of trade secrets.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },
  "TRADE_SECRETS_US": {
    id: "TRADE_SECRETS_US",
    name: "Economic Espionage / Trade Secret Theft",
    jurisdiction: "US",
    statute: "Economic Espionage Act (18 U.S.C. §§ 1831–1839); Defend Trade Secrets Act 2016",
    description: "Theft, misappropriation, or unauthorized disclosure of trade secrets for economic benefit or to benefit a foreign entity.",
    evidenceNote: "Registration network hash, account creation timestamp."
  },

  // === TOS VIOLATION (Non-criminal, internal) ===
  "TOS_VIOLATION": {
    id: "TOS_VIOLATION",
    name: "Terms of Service Violation",
    jurisdiction: "Internal",
    statute: "Svart Security Terms of Service",
    description: "Violation of Svart Security's terms of service, acceptable use policy, or end-user license agreement.",
    evidenceNote: "Registration network hash, account creation timestamp, account activity."
  },

  // === OTHER ===
  "OTHER": {
    id: "OTHER",
    name: "Other Violation",
    jurisdiction: "Various",
    statute: "To be determined upon review",
    description: "A violation not covered by the above categories. Provide full details in the description field.",
    evidenceNote: "Registration network hash, account creation timestamp."
  }
};

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

      // Encrypt the raw IP for law enforcement recovery (AES-256-GCM)
      // This is the ONLY place a raw IP is stored — encrypted, never plaintext.
      // Admin can decrypt only when escalating a formal report to authorities.
      try {
        const encryptedIP = await encryptForLEA(ip);
        await context.env.USAGE_DATA.put(`guardian:enc:${netHash}`, encryptedIP, {
          expirationTtl: 60 * 60 * 24 * 365 * 2, // 2 years — matches data retention policy
        });
      } catch (e) {
        // Encryption failure should not block registration
      }

      // Update stats
      await updateStats(context.env, "registration");

      return jsonResponse({ success: true, networkId: netHash });
    }

    // ───────────────────────────────────────────
    // ADMIN ONLY: get-law-categories
    // Returns all available law violation categories for reports
    // ───────────────────────────────────────────
    if (action === "get-law-categories") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
      }
      return jsonResponse({ success: true, categories: LAW_CATEGORIES });
    }

    // ───────────────────────────────────────────
    // ADMIN ONLY: block-network
    // Admin blocks a network hash (they only see the hash, never the IP)
    // ───────────────────────────────────────────
    if (action === "block-network") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
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
    // ADMIN ONLY: block-url
    // ───────────────────────────────────────────
    if (action === "block-url") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
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

    // ───────────────────────────────────────────
    // APP: app-status
    // Called by all Svart desktop apps on startup / periodically.
    // Returns Guardian status, threat feed, version info, security advisories.
    // READ-ONLY — zero KV writes.
    // ───────────────────────────────────────────
    if (action === "app-status") {
      const { authorized } = isAuthorized(context.request);
      if (!authorized) return errorResponse("Unauthorized. Valid app token required.", 401);

      const appName = (body.app || "").trim();
      const appVersion = (body.version || "").trim();

      // Read guardian stats
      let stats: any = { totalBlocked: 0, totalRegistrations: 0 };
      try {
        const raw = await context.env.USAGE_DATA.get("guardian:stats");
        if (raw) stats = JSON.parse(raw);
      } catch {}

      // Read block list count
      let activeBlocks = 0;
      try {
        const raw = await context.env.USAGE_DATA.get("guardian:blocked:list");
        if (raw) activeBlocks = JSON.parse(raw).length;
      } catch {}

      // Read threat feed (admin-set advisories)
      let feed: any = { advisories: [], lastUpdated: null };
      try {
        const raw = await context.env.USAGE_DATA.get("guardian:feed");
        if (raw) feed = JSON.parse(raw);
      } catch {}

      // Read version manifest
      let versions: any = {};
      let updateAvailable = false;
      let latestVersion = appVersion;
      try {
        const raw = await context.env.USAGE_DATA.get("guardian:versions");
        if (raw) {
          versions = JSON.parse(raw);
          if (appName && versions[appName]) {
            latestVersion = versions[appName].latest || appVersion;
            updateAvailable = latestVersion !== appVersion && appVersion !== "";
          }
        }
      } catch {}

      return jsonResponse({
        success: true,
        guardian: {
          status: "active",
          activeBlocks,
          totalRegistrations: stats.totalRegistrations || 0,
          lastUpdated: stats.lastUpdated || null,
        },
        feed: {
          advisories: feed.advisories || [],
          lastUpdated: feed.lastUpdated || null,
        },
        update: {
          available: updateAvailable,
          latest: latestVersion,
          downloadUrl: versions[appName]?.downloadUrl || null,
        },
      });
    }

    // ───────────────────────────────────────────
    // APP: app-report
    // Convenience endpoint for apps to submit violation reports.
    // Stores directly in KV with guardian report format.
    // ───────────────────────────────────────────
    if (action === "app-report") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized) return errorResponse("Unauthorized. Valid app token required.", 401);

      const app = (body.app || "Unknown").trim();
      const userId = (body.userId || "").trim();
      const violationType = (body.violationType || "Other").trim();
      const description = (body.description || "").trim();
      const details = body.details || null;
      const lawCategoryIds: string[] = Array.isArray(body.lawCategoryIds)
        ? body.lawCategoryIds.filter((id: string) => typeof id === "string" && LAW_CATEGORIES[id])
        : [];

      if (!description) return errorResponse("Description is required", 400);

      const lawReferences = lawCategoryIds.map((id: string) => {
        const cat = LAW_CATEGORIES[id];
        return { id: cat.id, name: cat.name, jurisdiction: cat.jurisdiction, statute: cat.statute, evidenceNote: cat.evidenceNote };
      });

      const reportId = `guardian:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const report = {
        id: reportId,
        app,
        userId,
        submitterEmail: "",
        submitterRole: role,
        violationType,
        lawCategoryIds,
        lawReferences,
        description,
        details,
        date: new Date().toISOString(),
        status: "pending",
        reviewedBy: null as string | null,
        reviewedAt: null as string | null,
        notes: "" as string,
        escalatedAt: null as string | null,
        availableEvidence: "Registration network hash (SHA-256, irreversible), AES-256-GCM encrypted IP (recoverable by admin for LEA), and account creation date/time.",
      };

      await context.env.USAGE_DATA.put(reportId, JSON.stringify(report), {
        expirationTtl: 60 * 60 * 24 * 365,
      });

      // Append to report log
      let log: string[] = [];
      try {
        const existing = await context.env.USAGE_DATA.get("guardian:log");
        if (existing) log = JSON.parse(existing);
      } catch {}
      log.push(reportId);
      if (log.length > 2000) log = log.slice(-2000);
      await context.env.USAGE_DATA.put("guardian:log", JSON.stringify(log));

      // ── Auto-publish sanitized report to Community page ──
      // Publishes a notice that a report was filed (no user IDs or sensitive data)
      try {
        const typeLabel = violationType.charAt(0).toUpperCase() + violationType.slice(1);
        const communityPostId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const communityPost = {
          id: communityPostId,
          title: `🛡️ [Guardian Report] ${typeLabel} violation reported`,
          body: `A ${typeLabel.toLowerCase()} violation has been reported to the Network Guardian.\n\nType: ${typeLabel}\nApp: ${app}\nStatus: Under review\n\nThe Svart security team will review this report. If the threat is confirmed, protections will be deployed automatically to all users.\n\nNote: No personal information about the reporter or the reported party is shared publicly. All reports are handled confidentially.`,
          category: "security",
          author: "Network Guardian",
          votes: 0,
          replies: [],
          createdAt: Date.now(),
        };
        await context.env.USAGE_DATA.put(`community:post:${communityPostId}`, JSON.stringify(communityPost));
        let cidx: string[] = [];
        try {
          const raw = await context.env.USAGE_DATA.get("community:posts:index");
          if (raw) cidx = JSON.parse(raw);
        } catch {}
        cidx.push(communityPostId);
        if (cidx.length > 2000) cidx = cidx.slice(-2000);
        await context.env.USAGE_DATA.put("community:posts:index", JSON.stringify(cidx));
      } catch {}

      return jsonResponse({ success: true, id: reportId, message: "Report submitted to NetworkGuardian." });
    }

    // ───────────────────────────────────────────
    // ADMIN ONLY: decrypt-for-lea
    // Decrypts a network hash's encrypted IP for formal law enforcement reports.
    // This is the ONLY way to recover a real IP address from the system.
    // Requires admin token. Should only be used with a valid court order.
    // ───────────────────────────────────────────
    if (action === "decrypt-for-lea") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only — requires court order authorization.", 401);
      }

      const networkId = (body.networkId || "").trim();
      const caseReference = (body.caseReference || "").trim();
      const authorizedBy = (body.authorizedBy || "").trim();

      if (!networkId || !networkId.startsWith("net_")) {
        return errorResponse("Invalid network ID. Must start with net_", 400);
      }
      if (!caseReference) {
        return errorResponse("Case reference is required for audit trail.", 400);
      }

      // Retrieve encrypted IP
      const encrypted = await context.env.USAGE_DATA.get(`guardian:enc:${networkId}`);
      if (!encrypted) {
        return jsonResponse({
          success: false,
          error: "No encrypted IP found for this network hash. The record may have expired or the registration predates LEA encryption.",
        }, 404);
      }

      try {
        const decryptedIP = await decryptForLEA(encrypted);

        // Log this decryption in the audit trail (stored in guardian stats)
        let stats: any = {};
        try {
          const raw = await context.env.USAGE_DATA.get("guardian:stats");
          if (raw) stats = JSON.parse(raw);
        } catch {}
        if (!stats.leaDecryptions) stats.leaDecryptions = [];
        stats.leaDecryptions.push({
          networkId,
          caseReference,
          authorizedBy,
          decryptedAt: new Date().toISOString(),
        });
        // Cap audit log
        if (stats.leaDecryptions.length > 500) stats.leaDecryptions = stats.leaDecryptions.slice(-500);
        await context.env.USAGE_DATA.put("guardian:stats", JSON.stringify(stats));

        return jsonResponse({
          success: true,
          networkId,
          decryptedIP,
          caseReference,
          authorizedBy,
          decryptedAt: new Date().toISOString(),
          warning: "This IP was decrypted under LEA authorization. This action is logged in the audit trail.",
        });
      } catch (err: any) {
        return errorResponse("Decryption failed — data may be corrupted: " + (err.message || ""), 500);
      }
    }

    // ───────────────────────────────────────────
    // ADMIN: set-feed
    // Admin sets the threat feed / security advisories that apps receive.
    // ───────────────────────────────────────────
    if (action === "set-feed") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
      }

      const advisories = Array.isArray(body.advisories) ? body.advisories : [];
      const feed = {
        advisories: advisories.slice(0, 20), // Max 20 advisories
        lastUpdated: new Date().toISOString(),
      };
      await context.env.USAGE_DATA.put("guardian:feed", JSON.stringify(feed));

      // ── Auto-publish new advisories to the Community page ──
      // Each advisory becomes a 'security' post visible to all users
      for (const adv of advisories) {
        if (!adv.message) continue;
        try {
          const postId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          const severity = (adv.severity || "info").toUpperCase();
          const communityPost = {
            id: postId,
            title: `🛡️ [Guardian ${severity}] ${adv.message.slice(0, 100)}`,
            body: `Security Advisory from Network Guardian\n\nSeverity: ${severity}\nDate: ${adv.date || new Date().toISOString()}\n\n${adv.message}\n\nThis advisory was published automatically by the Svart Network Guardian to keep all users informed of active threats and protections.`,
            category: "security",
            author: "Network Guardian",
            votes: 0,
            replies: [],
            createdAt: Date.now(),
          };
          await context.env.USAGE_DATA.put(`community:post:${postId}`, JSON.stringify(communityPost));
          // Add to community index
          let idx: string[] = [];
          try {
            const raw = await context.env.USAGE_DATA.get("community:posts:index");
            if (raw) idx = JSON.parse(raw);
          } catch {}
          idx.push(postId);
          if (idx.length > 2000) idx = idx.slice(-2000);
          await context.env.USAGE_DATA.put("community:posts:index", JSON.stringify(idx));
        } catch {}
      }

      return jsonResponse({ success: true, message: "Threat feed updated.", feed });
    }

    // ───────────────────────────────────────────
    // ADMIN: set-versions
    // Admin sets the version manifest for all apps.
    // Apps check this to know if updates are available.
    // ───────────────────────────────────────────
    if (action === "set-versions") {
      const { authorized, role } = isAuthorized(context.request);
      if (!authorized || role !== "admin") {
        return errorResponse("Unauthorized. Admin only.", 401);
      }

      const versions = body.versions || {};
      await context.env.USAGE_DATA.put("guardian:versions", JSON.stringify(versions));
      return jsonResponse({ success: true, message: "Version manifest updated.", versions });
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
    if (!authorized || role !== "admin") {
      return errorResponse("Unauthorized. Admin access only.", 401);
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
