const { normalizeTitleForCompare } = require("../../../utils/ai/agentUtils");

const RECENT_FEED_TITLES = new Map();
const RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_KEEP = 40;

function getRecentTitlesForUser(userId) {
  const key = String(userId || "").trim();
  if (!key) return new Set();
  const row = RECENT_FEED_TITLES.get(key);
  if (!row || Date.now() - row.ts > RECENT_TTL_MS) {
    RECENT_FEED_TITLES.delete(key);
    return new Set();
  }
  return new Set(Array.isArray(row.titles) ? row.titles : []);
}

function saveRecentTitlesForUser(userId, works) {
  const key = String(userId || "").trim();
  if (!key) return;
  const prev = getRecentTitlesForUser(key);
  const next = [];
  for (const w of works || []) {
    const t = normalizeTitleForCompare(w?.title || "");
    if (t) next.push(t);
  }
  const merged = [...new Set([...next, ...Array.from(prev)])].slice(0, RECENT_KEEP);
  RECENT_FEED_TITLES.set(key, { ts: Date.now(), titles: merged });
}

function reorderByNovelty(candidates, recentTitles) {
  if (!Array.isArray(candidates) || !candidates.length || !recentTitles?.size) return candidates || [];
  return [...candidates].sort((a, b) => {
    const aSeen = recentTitles.has(normalizeTitleForCompare(a?.title || "")) ? 1 : 0;
    const bSeen = recentTitles.has(normalizeTitleForCompare(b?.title || "")) ? 1 : 0;
    return aSeen - bSeen;
  });
}

module.exports = {
  getRecentTitlesForUser,
  saveRecentTitlesForUser,
  reorderByNovelty,
};

