const axios = require("axios");
const { getGoogleBooksLangRestrict } = require("./contentLocaleConfig");

const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";

/**
 * Ejecuta varias consultas en orden, fusiona volúmenes sin duplicar por id.
 * @param {string[]} queries
 * @param {{ maxPerQuery?: number, maxTotal: number, shortCircuitAfterQueryIfAtLeast?: number }} options
 */
async function fetchGoogleBooksVolumesMerged(queries, options) {
  const maxPerQuery = options.maxPerQuery ?? 12;
  const maxTotal = options.maxTotal;
  const shortCircuit = options.shortCircuitAfterQueryIfAtLeast;
  const key = (process.env.GOOGLE_BOOKS_API_KEY || "").trim();
  const langRestrict = getGoogleBooksLangRestrict();
  const seen = new Set();
  const merged = [];

  for (const q of queries) {
    try {
      const params = { q, maxResults: maxPerQuery };
      if (key) params.key = key;
      if (langRestrict) params.langRestrict = langRestrict;
      const { data } = await axios.get(GOOGLE_BOOKS, { params, timeout: 15000 });
      for (const item of data.items || []) {
        const id = item.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(item);
        if (merged.length >= maxTotal) return merged;
      }
    } catch (_) {
      /* siguiente query */
    }
    if (shortCircuit != null && merged.length >= shortCircuit) return merged;
  }
  return merged;
}

module.exports = {
  GOOGLE_BOOKS,
  fetchGoogleBooksVolumesMerged,
};
