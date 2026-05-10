const axios = require("axios");

const MET_SEARCH = "https://collectionapi.metmuseum.org/public/collection/v1";

/**
 * @param {string} query
 * @param {number} maxObjectIds máximo de IDs de búsqueda a resolver (cada uno = GET object).
 * @returns {Promise<Array<{ id: number, title: string, artist: string, imageUrl: string, source: string, full: object }>>}
 */
async function searchMetArtworkRows(query, maxObjectIds) {
  const q = (query || "").trim();
  if (q.length < 2) return [];
  try {
    const { data: s } = await axios.get(`${MET_SEARCH}/search`, {
      params: { hasImages: true, q },
      timeout: 15000,
    });
    const ids = (s.objectIDs || []).slice(0, maxObjectIds);
    const out = [];
    for (const id of ids) {
      try {
        const { data: d } = await axios.get(`${MET_SEARCH}/objects/${id}`, { timeout: 12000 });
        const img = d.primaryImageSmall || d.primaryImage;
        if (!img) continue;
        out.push({
          id: d.objectID,
          title: d.title,
          artist: d.artistDisplayName || "Unknown",
          imageUrl: img,
          source: "MET",
          full: d,
        });
      } catch (_) {
        /* siguiente id */
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

async function searchMetArtworkFirst(query) {
  const rows = await searchMetArtworkRows(query, 3);
  return rows[0] || null;
}

module.exports = {
  MET_SEARCH,
  searchMetArtworkRows,
  searchMetArtworkFirst,
};
