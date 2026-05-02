const axios = require("axios");

let _token = null;
let _exp = 0;

/** Hash estable (FNV-1a) para offsets / tie-breaks por cadena. */
function stableStringHash32(input) {
  const s = String(input ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function getIgdbAccessToken() {
  const now = Date.now();
  if (_token && now < _exp - 60000) return _token;
  const cid = (process.env.IGDB_CLIENT_ID || "").trim();
  const csec = (process.env.IGDB_CLIENT_SECRET || "").trim();
  if (!cid || !csec) return null;
  try {
    const { data } = await axios.post(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: cid,
          client_secret: csec,
          grant_type: "client_credentials",
        },
        timeout: 15000,
      }
    );
    _token = data.access_token;
    _exp = now + (data.expires_in || 3600) * 1000;
    return _token;
  } catch (_) {
    return null;
  }
}

const IGDB_FIELDS = `fields name, cover.url, rating, summary, first_release_date, total_rating_count, hypes, genres.name, platforms.name, platforms.abbreviation, game_modes.name, involved_companies.company.name;`;

/**
 * @param {string} query
 * @param {number} [limit]
 * @param {{ offset?: number }} [options]
 * @returns {Promise<object[]>}
 */
async function searchIgdbGames(query, limit = 15, options = {}) {
  const token = await getIgdbAccessToken();
  const cid = (process.env.IGDB_CLIENT_ID || "").trim();
  if (!token || !cid) return [];
  const q = (query || "").trim().replace(/"/g, " ").replace(/\n/g, " ").slice(0, 120) || "game";
  const lim = Math.max(1, Math.min(50, Number(limit) || 15));
  const offset = Math.max(0, Math.min(80, Number(options.offset) || 0));
  const body = `
${IGDB_FIELDS}
search "${q}";
limit ${lim};
offset ${offset};
`;
  try {
    const { data } = await axios.post("https://api.igdb.com/v4/games", body, {
      headers: {
        "Client-ID": cid,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      timeout: 20000,
    });
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

async function searchIgdbGameFirst(query) {
  const games = await searchIgdbGames(query, 8);
  return games[0] || null;
}

module.exports = {
  getIgdbAccessToken,
  searchIgdbGames,
  searchIgdbGameFirst,
  stableStringHash32,
};
