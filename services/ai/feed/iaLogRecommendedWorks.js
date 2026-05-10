/**
 * Log legible de obras que propone la IA (una línea numerada por obra).
 * Buscar en consola / logs: [dreamlodge][ia_obras]
 *
 * @param {string} tag - p.ej. artistic_description | feed_personalized | recommend_similar
 * @param {{ id?: string, works?: Array<{ category?: string, title?: string, creator?: string }> }} opts
 */
const logger = console;

function logIaRecommendedWorks(tag, opts = {}) {
  const safeId =
    opts.id != null && String(opts.id).trim() ? String(opts.id).trim() : "(sin id)";
  const list = Array.isArray(opts.works) ? opts.works : [];
  if (!list.length) {
    logger.info("[dreamlodge][ia_obras] %s id=%s count=0", tag, safeId);
    return;
  }
  const lines = list.map((w, i) => {
    if (!w || typeof w !== "object") {
      return `  ${i + 1}. (entrada inválida)`;
    }
    const cat = w.category || "?";
    const title = w.title || "(sin título)";
    const c = w.creator ? ` — ${w.creator}` : "";
    return `  ${i + 1}. [${cat}] ${title}${c}`;
  });
  logger.info(
    "[dreamlodge][ia_obras] %s id=%s count=%s\n%s",
    tag,
    safeId,
    list.length,
    lines.join("\n")
  );
}

module.exports = { logIaRecommendedWorks };
