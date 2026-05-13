const axios = require("axios");
const { getIgdbAcceptLanguage } = require("../../config/contentLocaleConfig");

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

/** En /v4/games, external_games son IDs; uid Steam viene de /v4/external_games. */
const IGDB_FIELDS = `fields name, cover.url, rating, summary, first_release_date, total_rating_count, hypes, genres.name, platforms.name, platforms.abbreviation, game_modes.name, involved_companies.company.name;`;

/** IGDB ExternalGameCategory: steam = 1 */
const IGDB_EXTERNAL_STEAM_CATEGORY = 1;

function externalGameRowGameId(row) {
  const g = row && row.game;
  if (g == null) return null;
  if (typeof g === "object" && g.id != null) return Number(g.id);
  const n = Number(g);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mapa IGDB game id → Steam app id (uid) vía endpoint external_games.
 * @param {number[]} gameIds
 * @param {string} token
 * @param {string} cid
 * @returns {Promise<Map<number, string>>}
 */
async function fetchSteamUidsByIgdbGameIds(gameIds, token, cid) {
  const ids = [...new Set((gameIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))].slice(
    0,
    45
  );
  if (!ids.length || !token || !cid) return new Map();
  const idsList = ids.join(",");
  const body = `fields uid, game;
where category = ${IGDB_EXTERNAL_STEAM_CATEGORY} & game = (${idsList});
limit 100;
`;
  try {
    const { data } = await axios.post("https://api.igdb.com/v4/external_games", body, {
      headers: {
        "Client-ID": cid,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
        "Accept-Language": getIgdbAcceptLanguage(),
      },
      timeout: 20000,
    });
    /** @type {Map<number, string>} */
    const map = new Map();
    for (const row of Array.isArray(data) ? data : []) {
      const gid = externalGameRowGameId(row);
      const uid = row.uid != null ? String(row.uid).trim() : "";
      if (gid == null || !uid || !/^\d+$/.test(uid)) continue;
      if (!map.has(gid)) map.set(gid, uid);
    }
    return map;
  } catch (_) {
    return new Map();
  }
}

function normTitleKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Elige appid Steam a partir de la respuesta de storesearch (prioriza nombre ≈ título).
 * @param {any[]} items
 * @param {string} gameTitle
 * @returns {string}
 */
function pickSteamAppIdFromStoreSearchItems(items, gameTitle) {
  const apps = (items || []).filter((x) => x && x.type === "app" && x.id != null);
  if (!apps.length) return "";
  const t = normTitleKey(gameTitle);
  if (!t) return String(apps[0].id);
  const exact = apps.find((a) => normTitleKey(a.name) === t);
  if (exact) return String(exact.id);
  const starts = apps.find((a) => normTitleKey(a.name).startsWith(t) || t.startsWith(normTitleKey(a.name)));
  if (starts) return String(starts.id);
  return String(apps[0].id);
}

/**
 * Resuelve Steam app id por nombre (API pública storesearch).
 * @param {string} gameName
 * @returns {Promise<string>}
 */
async function fetchSteamAppIdFromStoreSearch(gameName) {
  const term = String(gameName || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
  if (!term) return "";
  try {
    const { data } = await axios.get("https://store.steampowered.com/api/storesearch/", {
      params: { term, cc: "US", l: "en" },
      timeout: 12000,
      headers: {
        Accept: "application/json",
        "User-Agent": "DreamLodge/1.0 (Steam storesearch resolver)",
      },
      validateStatus: (s) => s >= 200 && s < 500,
    });
    const items = data && Array.isArray(data.items) ? data.items : [];
    const id = pickSteamAppIdFromStoreSearchItems(items, term);
    return id && /^\d+$/.test(id) ? id : "";
  } catch (_) {
    return "";
  }
}

/**
 * Rellena `game.__steamUid` en cada juego cuando falta tras IGDB external_games.
 * @param {object[]} games
 */
async function enrichGamesWithSteamStoreSearch(games) {
  const missing = (games || []).filter((g) => !g.__steamUid && String(g.name || "").trim());
  const slice = missing.slice(0, 8);
  await Promise.all(
    slice.map(async (g) => {
      const uid = await fetchSteamAppIdFromStoreSearch(g.name);
      if (uid) g.__steamUid = uid;
    })
  );
}

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
        "Accept-Language": getIgdbAcceptLanguage(),
      },
      timeout: 20000,
    });
    const games = Array.isArray(data) ? data : [];
    if (games.length > 0) {
      const steamMap = await fetchSteamUidsByIgdbGameIds(
        games.map((g) => g.id),
        token,
        cid
      );
      for (const g of games) {
        const u = steamMap.get(Number(g.id));
        if (u) g.__steamUid = u;
      }
      await enrichGamesWithSteamStoreSearch(games);
    }
    return games;
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
