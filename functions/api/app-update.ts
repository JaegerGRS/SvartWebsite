/**
 * /api/app-update — Tauri v2 auto-updater endpoint
 *
 * Called by the SvartAI desktop app to check for updates.
 * Returns Tauri-compatible update manifest or 204 (no update).
 *
 * Query params:
 *   target          — e.g. "windows" or "linux"
 *   arch            — e.g. "x86_64"
 *   current_version — e.g. "2.0.0"
 *
 * KV key: "app:latest-release" stores the release manifest JSON:
 *   {
 *     version: "2.0.1",
 *     notes: "Changelog...",
 *     pub_date: "2026-03-03T00:00:00Z",
 *     platforms: {
 *       "windows-x86_64": { url: "https://...", signature: "..." },
 *       "linux-x86_64":   { url: "https://...", signature: "..." }
 *     }
 *   }
 *
 * Returns:
 *   200 + JSON if update is available (newer version)
 *   204 No Content if already on latest or no release published
 */

interface Env {
  USAGE_DATA: KVNamespace;
}

interface PlatformEntry {
  url: string;
  signature: string;
}

interface ReleaseManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, PlatformEntry>;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Svart-Key",
  "Cache-Control": "no-cache, no-store, must-revalidate",
};

/**
 * Validate the activation key from the X-Svart-Key header.
 * Checks key indexes in KV to confirm it belongs to a real account.
 * Returns the email if valid, or null if unauthorized.
 */
async function validateKey(
  kv: KVNamespace,
  key: string
): Promise<string | null> {
  if (!key || key.length < 16) return null;

  // Check reg:key:<key> index (written by signup, key-reset, rekey)
  const regLookup = await kv.get(`reg:key:${key}`);
  if (regLookup) {
    try {
      const parsed = JSON.parse(regLookup);
      if (parsed.email) return parsed.email;
    } catch {
      // Plain string — treat as email
      if (regLookup.includes("@")) return regLookup.trim().toLowerCase();
    }
  }

  // Check keyindex:<key> (written on activation)
  const directIndex = await kv.get(`keyindex:${key}`);
  if (directIndex) return directIndex.trim().toLowerCase();

  return null;
}

/** Compare semver strings: returns >0 if a > b, 0 if equal, <0 if a < b */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const target = url.searchParams.get("target") || "windows";
  const arch = url.searchParams.get("arch") || "x86_64";
  const currentVersion = url.searchParams.get("current_version") || "0.0.0";

  // ── Key Authentication ──────────────────────────────────────
  const svartKey = context.request.headers.get("X-Svart-Key") || "";
  const owner = await validateKey(context.env.USAGE_DATA, svartKey);
  if (!owner) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — valid activation key required" }),
      {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Read latest release manifest from KV
    const raw = await context.env.USAGE_DATA.get("app:latest-release");
    if (!raw) {
      // No release published yet — no update available
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const manifest: ReleaseManifest = JSON.parse(raw);

    // Check if the published version is newer than the current version
    if (compareSemver(manifest.version, currentVersion) <= 0) {
      // Already on latest or newer — no update
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Build platform key (e.g. "windows-x86_64")
    const platformKey = `${target}-${arch}`;
    const platform = manifest.platforms[platformKey];
    if (!platform) {
      // No build available for this platform — no update
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Return Tauri v2 update response
    const response = {
      version: manifest.version,
      notes: manifest.notes || "",
      pub_date: manifest.pub_date || new Date().toISOString(),
      platforms: {
        [platformKey]: {
          url: platform.url,
          signature: platform.signature,
        },
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Failed to check for updates" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * POST /api/app-update — Publish a new release (admin only)
 *
 * Body: {
 *   admin_key: "...",
 *   version: "2.0.1",
 *   notes: "What changed...",
 *   pub_date: "2026-03-03T00:00:00Z",
 *   platforms: {
 *     "windows-x86_64": {
 *       url: "https://github.com/.../SvartAI_2.0.1_x64-setup.nsis.zip",
 *       signature: "dW50cnVz..."
 *     }
 *   }
 * }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, unknown>;

    // Simple admin auth — check against KV-stored admin key
    const adminKey = await context.env.USAGE_DATA.get("config:admin-key");
    if (!adminKey || body.admin_key !== adminKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const version = body.version as string;
    const notes = (body.notes as string) || "";
    const pub_date =
      (body.pub_date as string) || new Date().toISOString();
    const platforms = body.platforms as Record<string, PlatformEntry>;

    if (!version || !platforms) {
      return new Response(
        JSON.stringify({ error: "Missing version or platforms" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    const manifest: ReleaseManifest = {
      version,
      notes,
      pub_date,
      platforms,
    };

    await context.env.USAGE_DATA.put(
      "app:latest-release",
      JSON.stringify(manifest)
    );

    // Also log the release
    await context.env.USAGE_DATA.put(
      `app:release:${version}`,
      JSON.stringify({ ...manifest, published_at: new Date().toISOString() })
    );

    return new Response(
      JSON.stringify({ success: true, version, message: "Release published" }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Failed to publish release" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
};
