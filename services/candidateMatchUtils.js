/**
 * Valida que un resultado de API externa corresponda a la obra recomendada (título/creador).
 * Usa **fuzzball** (ratio tipo fuzzywuzzy: WRatio, token_sort_ratio) sobre texto normalizado.
 */
const fuzz = require("fuzzball");

/** Umbral por defecto (0–1). Más alto = más estricto. */
function defaultMinScore() {
  const raw = process.env.CANDIDATE_MATCH_MIN_SCORE;
  if (raw == null || raw === "") return 0.7;
  const n = parseFloat(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.7;
}

function normalizeForMatch(s) {
  if (s == null) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convierte puntuación fuzzball 0–100 a 0–1 */
function toUnit(score) {
  return Math.min(1, Math.max(0, Number(score) / 100));
}

/**
 * Similitud 0–1 entre dos títulos. WRatio combina varias métricas (incl. orden de palabras y subcadenas).
 */
function titleSimilarity(a, b) {
  const x = normalizeForMatch(a);
  const y = normalizeForMatch(b);
  if (!x || !y) return 0;
  const w = toUnit(fuzz.WRatio(x, y));
  if (w >= 0.92) return w;
  const partial = toUnit(fuzz.partial_ratio(x, y));
  return Math.max(w, partial * 0.97);
}

/**
 * Mejor puntuación entre `wanted` y cualquiera de las variantes de título del API.
 */
function bestVariantScore(wanted, variants) {
  let best = 0;
  for (const v of variants) {
    if (!v) continue;
    const s = titleSimilarity(wanted, v);
    if (s > best) best = s;
  }
  return best;
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string[]} getTitleVariants
 * @param {string} wantedTitle
 * @param {{ minScore?: number, maxScan?: number }} [opts]
 * @returns {{ item: T, score: number } | null}
 */
function pickBestTitleMatch(items, getTitleVariants, wantedTitle, opts = {}) {
  const minScore = opts.minScore ?? defaultMinScore();
  const maxScan = opts.maxScan ?? 15;
  const list = (items || []).slice(0, maxScan);
  let best = null;
  let bestScore = 0;
  for (const item of list) {
    const variants = getTitleVariants(item) || [];
    const score = bestVariantScore(wantedTitle, variants);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  if (!best || bestScore < minScore) return null;
  return { item: best, score: bestScore };
}

/**
 * Similitud 0–1 para nombres de persona (director, artista, autor).
 * token_sort_ratio ignora el orden de palabras ("Villeneuve Denis" vs "Denis Villeneuve").
 */
function personNameSimilarity(expected, actual) {
  const a = normalizeForMatch(expected);
  const b = normalizeForMatch(actual);
  if (!a || !b) return 0;
  const ts = toUnit(fuzz.token_sort_ratio(a, b));
  const pr = toUnit(fuzz.partial_ratio(a, b));
  return Math.max(ts, pr * 0.95);
}

module.exports = {
  defaultMinScore,
  normalizeForMatch,
  titleSimilarity,
  bestVariantScore,
  pickBestTitleMatch,
  personNameSimilarity,
};
