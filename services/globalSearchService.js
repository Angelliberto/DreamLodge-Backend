/**
 * Búsqueda global unificada (TMDB cine+TV, IGDB, Spotify, Google Books, Met/CMA).
 * Adicionalmente soporta filtros comunes para todas las fuentes en una sola API.
 */
const {
  getTmdbGenreMap,
  searchTmdbMovies,
  searchTmdbTv,
  discoverPopularMovies,
} = require("./tmdbShared");
const {
  adaptIGDB,
  adaptTMDBMovie,
  adaptTMDBTv,
  adaptSpotifyAlbum,
  adaptBook,
  adaptMet,
  adaptCmaArt,
} = require("./culturalItemAdapters");
const { searchSpotifyAlbums } = require("./spotifyClient");
const { searchIgdbGames, stableStringHash32 } = require("./igdbClient");
const { fetchGoogleBooksVolumesMerged } = require("./googleBooksClient");
const { searchMetArtworkRows } = require("./metMuseumClient");
const { fetchCmaRandomArtworkRows } = require("./cmaArtClient");

async function searchBooksMerged(titleQuery) {
  const raw = await fetchGoogleBooksVolumesMerged(
    [`intitle:${titleQuery}`, `inauthor:${titleQuery}`],
    { maxPerQuery: 12, maxTotal: 20 }
  );
  return raw.map(adaptBook);
}

const ALLOWED_CATEGORIES = new Set(["cine", "musica", "literatura", "arte-visual", "videojuegos"]);

function normalizeText(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeFilters(raw) {
  const categories = [...new Set(toArray(raw?.categories).map(normalizeText))].filter((c) =>
    ALLOWED_CATEGORIES.has(c)
  );
  const cinemaType = normalizeText(raw?.cinemaType);
  const emotions = [...new Set(toArray(raw?.emotions).map(normalizeText))];
  const genres = [...new Set(toArray(raw?.genres).map(normalizeText))];
  const author = normalizeText(raw?.author);
  const yearFrom = Number.parseInt(String(raw?.yearFrom || ""), 10);
  const yearTo = Number.parseInt(String(raw?.yearTo || ""), 10);
  return {
    categories,
    cinemaType: cinemaType === "movie" || cinemaType === "series" ? cinemaType : "all",
    emotions,
    genres,
    author: author === "all" ? "" : author,
    yearFrom: Number.isFinite(yearFrom) ? yearFrom : null,
    yearTo: Number.isFinite(yearTo) ? yearTo : null,
  };
}

function getCinemaMediaType(item) {
  const m = item?.metadata?.mediaType;
  if (m === "movie" || m === "series") return m;
  if (String(item?.id || "").startsWith("movie-")) return "movie";
  if (String(item?.id || "").startsWith("tv-")) return "series";
  return "unknown";
}

function applyGlobalFilters(items, filters) {
  if (!Array.isArray(items) || !items.length) return [];
  const hasCategory = filters.categories.length > 0;
  const hasEmotions = filters.emotions.length > 0;
  const hasGenres = filters.genres.length > 0;
  const hasAuthor = Boolean(filters.author);
  const hasYearFrom = Number.isFinite(filters.yearFrom);
  const hasYearTo = Number.isFinite(filters.yearTo);

  return items.filter((item) => {
    const category = normalizeText(item?.category);
    if (hasCategory && !filters.categories.includes(category)) return false;

    if (
      filters.cinemaType !== "all" &&
      category === "cine" &&
      getCinemaMediaType(item) !== filters.cinemaType
    ) {
      return false;
    }

    if (hasAuthor) {
      const creator = normalizeText(item?.creator);
      if (!creator.includes(filters.author)) return false;
    }

    if (hasYearFrom || hasYearTo) {
      const y = Number.parseInt(String(item?.year || ""), 10);
      if (Number.isFinite(y)) {
        if (hasYearFrom && y < filters.yearFrom) return false;
        if (hasYearTo && y > filters.yearTo) return false;
      }
    }

    if (hasGenres) {
      const itemGenres = (item?.metadata?.genres || []).map(normalizeText);
      if (!filters.genres.some((g) => itemGenres.includes(g))) return false;
    }

    if (hasEmotions) {
      const itemTags = (item?.metadata?.tags || []).map(normalizeText);
      if (!filters.emotions.some((e) => itemTags.includes(e))) return false;
    }

    return true;
  });
}

function shuffleSeeded(results, query) {
  const out = [...results];
  const seed = query.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seededRandom = (s) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };
  let currentSeed = seed;
  for (let i = out.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    const j = Math.floor(seededRandom(currentSeed) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const _cache = new Map();

function cacheGet(key) {
  const row = _cache.get(key);
  if (!row) return null;
  if (Date.now() > row.exp) {
    _cache.delete(key);
    return null;
  }
  return row.items;
}

function cacheSet(key, items, ttlMs) {
  _cache.set(key, { items, exp: Date.now() + ttlMs });
}

const MET_GLOBAL_MAX_IDS = 5;

/**
 * @param {string} query
 * @param {object} rawFilters
 * @returns {Promise<object[]>}
 */
async function runGlobalSearch(query, rawFilters = {}) {
  const q = typeof query === "string" ? query : "";
  const qt = q.trim();
  const filters = normalizeFilters(rawFilters);
  const cacheKey = `gs:v2:${qt || "empty"}:${JSON.stringify(filters)}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const genrePromise = getTmdbGenreMap();
  const promises = [];

  promises.push(
    (qt
      ? Promise.all([searchTmdbMovies(qt), searchTmdbTv(qt)])
      : Promise.all([discoverPopularMovies(), Promise.resolve([])])
    )
      .then(async ([movies, shows]) => {
        try {
          const genreMap = await genrePromise;
          return [
            ...movies.map((m) => adaptTMDBMovie(m, genreMap)),
            ...shows.map((s) => adaptTMDBTv(s, genreMap)),
          ];
        } catch (_) {
          return [];
        }
      })
      .catch(() => [])
  );

  if (qt.length > 1) {
    promises.push(
      searchIgdbGames(qt, 18, { offset: stableStringHash32(qt) % 22 })
        .then((games) => games.map(adaptIGDB))
        .catch(() => [])
    );
    promises.push(
      searchSpotifyAlbums(qt, { enrichCount: 3 })
        .then((albums) => albums.map(adaptSpotifyAlbum))
        .catch(() => [])
    );
    promises.push(searchBooksMerged(qt).catch(() => []));
    promises.push(
      searchMetArtworkRows(qt, MET_GLOBAL_MAX_IDS)
        .then((rows) => rows.map(adaptMet))
        .catch(() => [])
    );
  }

  if (qt.length === 0) {
    promises.push(
      fetchCmaRandomArtworkRows(8)
        .then((rows) => rows.map(adaptCmaArt))
        .catch(() => [])
    );
  }

  const allResults = await Promise.all(promises);
  const flat = [];
  allResults.forEach((group) => {
    if (Array.isArray(group)) flat.push(...group);
  });

  const shuffled = shuffleSeeded(flat, qt);
  const filtered = applyGlobalFilters(shuffled, filters);
  const ttl = qt ? 2 * 60 * 1000 : 5 * 60 * 1000;
  cacheSet(cacheKey, filtered, ttl);
  return filtered;
}

module.exports = { runGlobalSearch };
