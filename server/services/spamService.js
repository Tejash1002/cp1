// Spam escalation (PLANNING §9, thresholds in config/constants.js).
// Each blocked submission records a "strike"; penalties escalate by count:
//   1st  → warning (no badge)
//   2nd  → ⚠️ Warning badge + 24h ban
//   5th  → 🚫 Restricted (requires approval)
//   10th → ☠️ Suspended (permanent ban)
// Higher tiers win, so a single call applies the most severe penalty reached.
import { SPAM_THRESHOLDS, NEGATIVE_BADGES, AUTO_BAN_HOURS } from '../config/constants.js';

function addBadge(user, badge, reason) {
  if (user.negative_badges.some((b) => b.key === badge.key)) return;
  user.negative_badges.push({ key: badge.key, label: badge.label, icon: badge.icon, reason });
}

/**
 * Record a spam strike against a user and apply the escalated penalty.
 * Saves the user. Returns a summary for the API response.
 * @param {import('mongoose').Document} user
 * @param {string} reason
 */
export async function recordSpamStrike(user, reason = 'Content flagged as spam/gibberish') {
  user.spam_flag_count = (user.spam_flag_count ?? 0) + 1;
  const count = user.spam_flag_count;
  let penalty = 'none';

  if (count >= SPAM_THRESHOLDS.SUSPEND_AT) {
    addBadge(user, NEGATIVE_BADGES.SUSPENDED, reason);
    user.is_banned = true;
    user.ban_expires_at = null; // permanent
    user.ban_reason = 'Account suspended for repeated spam';
    penalty = 'suspended';
  } else if (count >= SPAM_THRESHOLDS.RESTRICT_AT) {
    addBadge(user, NEGATIVE_BADGES.RESTRICTED, reason);
    user.requires_approval = true;
    penalty = 'restricted';
  } else if (count >= SPAM_THRESHOLDS.BAN_AT) {
    addBadge(user, NEGATIVE_BADGES.WARNING, reason);
    user.is_banned = true;
    user.ban_expires_at = new Date(Date.now() + AUTO_BAN_HOURS * 60 * 60 * 1000);
    user.ban_reason = `Temporary ${AUTO_BAN_HOURS}h ban for repeated spam`;
    penalty = 'banned_24h';
  } else if (count >= SPAM_THRESHOLDS.WARN_AT) {
    penalty = 'warning';
  }

  await user.save();
  return { spam_flag_count: count, penalty };
}

export default { recordSpamStrike };
