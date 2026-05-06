const axios = require("axios");
const { getOpenLibraryLanguage } = require("./contentLocaleConfig");

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";

function dedupeKeyForDoc(doc) {
  if (doc.key && String(doc.key).startsWith("/works/")) return doc.key;
  const ek = doc.edition_key?.[0];
  if (ek) return `/editions/${ek}`;
  const t = Array.isArray(doc.title) ? doc.title[0] : doc.title;
  const y = doc.first_publish_year ?? "";
  return `fallback:${y}:${String(t || "").slice(0, 120)}`;
}

/**
 * Varios filtros tipo título/autor por orden; fusiona documentos únicos sin duplicar obra/edición.
 * @param {Array<{ type: 'title' | 'author', value: string }>} searchTasks
 * @param {{ maxPerQuery?: number, maxTotal: number, shortCircuitAfterQueryIfAtLeast?: number }} options
 */
async function fetchOpenLibraryWorksMerged(searchTasks, options) {
  const maxPerQuery = options.maxPerQuery ?? 12;
  const maxTotal = options.maxTotal;
  const shortCircuit = options.shortCircuitAfterQueryIfAtLeast;
  const language = getOpenLibraryLanguage();
  const seen = new Set();
  const merged = [];

  for (const task of searchTasks) {
    const v = String(task.value || "").trim();
    if (!v) continue;
    try {
      const params = { limit: Math.min(maxPerQuery, 100) };
      if (task.type === "title") params.title = v;
      else if (task.type === "author") params.author = v;
      else continue;
      if (language) params.language = language;
      const { data } = await axios.get(OPEN_LIBRARY_SEARCH, {
        params,
        timeout: 15000,
        headers: { "User-Agent": "DreamLodge/1.0 (literatura)" },
      });
      for (const doc of data.docs || []) {
        const id = dedupeKeyForDoc(doc);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(doc);
        if (merged.length >= maxTotal) return merged;
      }
    } catch (_) {
      /* siguiente tarea */
    }
    if (shortCircuit != null && merged.length >= shortCircuit) return merged;
  }
  return merged;
}

module.exports = {
  OPEN_LIBRARY_SEARCH,
  fetchOpenLibraryWorksMerged,
};
