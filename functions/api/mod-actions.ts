import { type Env, makeCors, makeJsonResponse, makeErrorResponse, optionsResponse, checkKV, ADMIN_EMAIL, isAuthorized } from "./_shared";

const CORS_HEADERS = makeCors("GET, POST, OPTIONS");
const jsonResponse = makeJsonResponse(CORS_HEADERS);
const errorResponse = makeErrorResponse(jsonResponse);

export const onRequestOptions: PagesFunction<Env> = async () => optionsResponse(CORS_HEADERS);

// POST — Mod submits a notification/report to admin, or logs an action
export const onRequestPost: PagesFunction<Env> = async (context) => {
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

    const action = (body.action || "").trim();

    // ======== Push notification/report to admin ========
    if (action === "notify") {
      const modEmail = (body.modEmail || "").trim();
      const subject = (body.subject || "").trim();
      const message = (body.message || "").trim();

      if (!modEmail || !subject || !message) {
        return errorResponse("modEmail, subject, and message are required", 400);
      }

      const notifId = `notif:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const notification = {
        id: notifId,
        modEmail,
        subject,
        message,
        role,
        date: new Date().toISOString(),
        read: false,
      };

      // Store individual notification
      await context.env.USAGE_DATA.put(notifId, JSON.stringify(notification), {
        expirationTtl: 60 * 60 * 24 * 90, // 90 days
      });

      // Append to notification log
      let log: string[] = [];
      try {
        const existing = await context.env.USAGE_DATA.get("notif:log");
        if (existing) log = JSON.parse(existing);
      } catch {}
      log.push(notifId);
      // Keep last 500
      if (log.length > 500) log = log.slice(-500);
      await context.env.USAGE_DATA.put("notif:log", JSON.stringify(log));

      // Notification stored in KV — admin views from mod panel
      // (MailChannels email removed — service discontinued 2024)

      return jsonResponse({ success: true, id: notifId, message: "Notification sent to admin." });
    }

    // ======== Log a mod action ========
    if (action === "log") {
      const modEmail = (body.modEmail || "").trim();
      const actionType = (body.actionType || "").trim();
      const details = (body.details || "").trim();
      const targetEmail = (body.targetEmail || "").trim();

      if (!modEmail || !actionType) {
        return errorResponse("modEmail and actionType are required", 400);
      }

      const logId = `modlog:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const logEntry = {
        id: logId,
        modEmail,
        role,
        actionType,
        details,
        targetEmail,
        date: new Date().toISOString(),
      };

      await context.env.USAGE_DATA.put(logId, JSON.stringify(logEntry), {
        expirationTtl: 60 * 60 * 24 * 180, // 180 days
      });

      // Append to mod action log
      let actionLog: string[] = [];
      try {
        const existing = await context.env.USAGE_DATA.get("modlog:log");
        if (existing) actionLog = JSON.parse(existing);
      } catch {}
      actionLog.push(logId);
      if (actionLog.length > 1000) actionLog = actionLog.slice(-1000);
      await context.env.USAGE_DATA.put("modlog:log", JSON.stringify(actionLog));

      return jsonResponse({ success: true, id: logId });
    }

    return errorResponse("Unknown action. Use 'notify' or 'log'.", 400);
  } catch (err: any) {
    return errorResponse("Internal error: " + (err.message || "unknown"), 500);
  }
};

// GET — Admin retrieves notifications and mod action logs
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    if (!checkKV(context.env)) {
      return errorResponse("Server storage not configured.", 503);
    }

    const { authorized, role } = isAuthorized(context.request);
    if (!authorized) {
      return errorResponse("Unauthorized", 401);
    }

    const url = new URL(context.request.url);
    const type = url.searchParams.get("type") || "notifications";

    // ======== Get notifications (for admin) ========
    if (type === "notifications") {
      let log: string[] = [];
      try {
        const existing = await context.env.USAGE_DATA.get("notif:log");
        if (existing) log = JSON.parse(existing);
      } catch {}

      const notifications: any[] = [];
      for (const id of log) {
        try {
          const raw = await context.env.USAGE_DATA.get(id);
          if (raw) notifications.push(JSON.parse(raw));
        } catch {}
      }

      // Mark as read if admin requests
      const markRead = url.searchParams.get("markRead");
      if (markRead && role === "admin") {
        try {
          const raw = await context.env.USAGE_DATA.get(markRead);
          if (raw) {
            const notif = JSON.parse(raw);
            notif.read = true;
            await context.env.USAGE_DATA.put(markRead, JSON.stringify(notif));
          }
        } catch {}
      }

      const unread = notifications.filter((n) => !n.read).length;
      return jsonResponse({
        success: true,
        notifications: notifications.reverse(), // newest first
        total: notifications.length,
        unread,
      });
    }

    // ======== Get mod action logs (for admin) ========
    if (type === "modlogs") {
      let log: string[] = [];
      try {
        const existing = await context.env.USAGE_DATA.get("modlog:log");
        if (existing) log = JSON.parse(existing);
      } catch {}

      const entries: any[] = [];
      for (const id of log) {
        try {
          const raw = await context.env.USAGE_DATA.get(id);
          if (raw) entries.push(JSON.parse(raw));
        } catch {}
      }

      // Filter by mod email if requested
      const filterMod = url.searchParams.get("mod");
      const filtered = filterMod
        ? entries.filter((e) => e.modEmail === filterMod)
        : entries;

      return jsonResponse({
        success: true,
        logs: filtered.reverse(), // newest first
        total: filtered.length,
      });
    }

    return errorResponse("Unknown type. Use 'notifications' or 'modlogs'.", 400);
  } catch (err: any) {
    return errorResponse("Internal error: " + (err.message || "unknown"), 500);
  }
};
