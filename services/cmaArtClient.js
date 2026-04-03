const axios = require("axios");

const CMA_URL = "https://openaccess-api.clevelandart.org/api/artworks";

/**
 * @param {number} [limit]
 * @returns {Promise<Array<{ id: *, title: string, artist: string, imageUrl: string }>>}
 */
async function fetchCmaRandomArtworkRows(limit = 8) {
  try {
    const { data } = await axios.get(CMA_URL, {
      params: { has_image: 1, limit, sort: "random" },
      timeout: 15000,
    });
    return (data.data || [])
      .map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.creators?.[0]?.description || "Unknown",
        imageUrl: item.images?.web?.url,
      }))
      .filter((i) => i.imageUrl);
  } catch (_) {
    return [];
  }
}

module.exports = { CMA_URL, fetchCmaRandomArtworkRows };
