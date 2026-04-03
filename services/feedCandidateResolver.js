/**
 * Resuelve candidatos { category, title, creator? } del MCP contra TMDB, Spotify,
 * Google Books, IGDB y Met — misma semántica que el antiguo resolvePersonalizedFeed del cliente.
 */
const {
  getTmdbGenreMap,
  searchTmdbMovies,
  searchTmdbTv,
} = require("./tmdbShared");
const {
  adaptIGDB,
  adaptTMDBMovie,
  adaptTMDBTv,
  adaptSpotifyAlbum,
  adaptBook,
  adaptMet,
} = require("./culturalItemAdapters");
const { searchSpotifyFirstAlbum } = require("./spotifyClient");
const { fetchGoogleBooksVolumesMerged } = require("./googleBooksClient");
const { searchIgdbGameFirst } = require("./igdbClient");
const { searchMetArtworkFirst } = require("./metMuseumClient");

const ALLOWED = new Set(["cine", "musica", "literatura", "videojuegos", "arte-visual"]);

async function searchBooksIntitle(title, author) {
  const tasks = [`intitle:${title}`];
  if (author && author.length >= 2) tasks.push(`inauthor:${author}`);
  const merged = await fetchGoogleBooksVolumesMerged(tasks, {
    maxPerQuery: 12,
    maxTotal: 8,
    shortCircuitAfterQueryIfAtLeast: 4,
  });
  return merged[0] || null;
}

function normalizeCandidate(row) {
  if (!row || typeof row !== "object") return null;
  let cat = String(row.category || "")
    .trim()
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/_/g, "-");
  const alias = {
    pelicula: "cine",
    "películas": "cine",
    series: "cine",
    serie: "cine",
    tv: "cine",
    film: "cine",
    movie: "cine",
    música: "musica",
    music: "musica",
    album: "musica",
    libro: "literatura",
    libros: "literatura",
    book: "literatura",
    juego: "videojuegos",
    juegos: "videojuegos",
    game: "videojuegos",
    games: "videojuegos",
    arte: "arte-visual",
    art: "arte-visual",
    pintura: "arte-visual",
  };
  if (alias[cat]) cat = alias[cat];
  if (!ALLOWED.has(cat)) return null;
  const title = String(row.title || "").trim();
  if (title.length < 2) return null;
  const creator = String(row.creator || "").trim();
  return { category: cat, title: title.slice(0, 200), creator: creator ? creator.slice(0, 120) : undefined };
}

async function resolveOne(c, genreMap) {
  const title = (c.title || "").trim();
  if (title.length < 2) return null;
  const q = [title, (c.creator || "").trim()].filter(Boolean).join(" ");

  switch (c.category) {
    case "cine": {
      const [movies, tvshows] = await Promise.all([
        searchTmdbMovies(q),
        searchTmdbTv(title),
      ]);
      if (movies[0]) return adaptTMDBMovie(movies[0], genreMap);
      if (tvshows[0]) return adaptTMDBTv(tvshows[0], genreMap);
      return null;
    }
    case "musica": {
      const album = await searchSpotifyFirstAlbum(q.length > 2 ? q : title);
      return album ? adaptSpotifyAlbum(album) : null;
    }
    case "literatura": {
      const vol = await searchBooksIntitle(title, (c.creator || "").trim());
      return vol ? adaptBook(vol) : null;
    }
    case "videojuegos": {
      const gq = title.length >= 2 ? title : `${title} game`;
      const game = await searchIgdbGameFirst(gq);
      return game ? adaptIGDB(game) : null;
    }
    case "arte-visual": {
      const art = await searchMetArtworkFirst(q);
      return art ? adaptMet(art) : null;
    }
    default:
      return null;
  }
}

function mergeCulturalFeedDedupe(primary, more) {
  const seen = new Set();
  const out = [];
  for (const item of primary || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  for (const item of more || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * @param {Array<{category:string,title:string,creator?:string}>} candidates
 * @returns {Promise<object[]>}
 */
async function resolveCuratedFeedCandidates(candidates) {
  if (!candidates?.length) return [];
  const normalized = [];
  const seen = new Set();
  for (const row of candidates.slice(0, 40)) {
    const n = normalizeCandidate(row);
    if (!n) continue;
    const k = `${n.category}:${n.title.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    normalized.push(n);
  }
  if (!normalized.length) return [];

  const genreMap = await getTmdbGenreMap();
  const resolved = [];
  const idSeen = new Set();
  const chunk = 4;
  for (let i = 0; i < normalized.length; i += chunk) {
    const slice = normalized.slice(i, i + chunk);
    const batch = await Promise.all(slice.map((c) => resolveOne(c, genreMap)));
    for (const item of batch) {
      if (item && !idSeen.has(item.id)) {
        idSeen.add(item.id);
        resolved.push(item);
      }
    }
  }
  return resolved;
}

function extractSuggestedWorksFromArtisticJson(raw) {
  if (!raw || typeof raw !== "string") return [];
  try {
    const p = JSON.parse(raw);
    const w = p.suggestedWorks;
    if (!Array.isArray(w)) return [];
    return w;
  } catch (_) {
    return [];
  }
}

module.exports = {
  resolveCuratedFeedCandidates,
  mergeCulturalFeedDedupe,
  extractSuggestedWorksFromArtisticJson,
};
