export const TELEGRAM_WAITLIST_KEY_PREFIX = "telegram_waitlist:";

// The waitlist belongs to the Rollapp operator's account, even if its profile address changes.
const waitlistOwnerId = "bbd4e87d-520b-44c7-8091-d453c771bdbb";

export function canViewTelegramWaitlist(user) {
  return user?.id === waitlistOwnerId;
}

export function registerTelegramWaitlistReader(app, { requireAuth, asyncRoute, query }) {
  app.get("/api/me/telegram-waitlist", requireAuth, asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!canViewTelegramWaitlist(req.user)) {
      return res.status(403).json({ error: "Нет доступа к заявкам из Telegram" });
    }

    const { rows } = await query(
      `SELECT substr(key, length($1) + 1) AS username, value_text AS "requestedAt"
       FROM application_settings
       WHERE starts_with(key, $1)
       ORDER BY value_text DESC, key`,
      [TELEGRAM_WAITLIST_KEY_PREFIX],
    );
    res.json({ entries: rows });
  }));
}
