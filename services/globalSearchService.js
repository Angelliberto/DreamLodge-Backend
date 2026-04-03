/**
 * Búsqueda global (TMDB cine+TV, IGDB, Spotify, Google Books condicional, CMA / Met).
 * Misma semántica que el antiguo UnifiedService del cliente; claves y tokens solo en servidor.
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
const { searchIgdbGames } = require("./igdbClient");
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

function querySuggestsArtVisual(raw) {
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\barte\b/.test(n)) return true;
  const hints = [
    "pintur",
    "cuadro",
    "museo",
    "escultur",
    "monet",
    "picasso",
    "gogh",
    "impresion",
    "renacent",
    "barroc",
    "metropolitan",
    "met museum",
    "fotograf",
    "fine art",
    "oil paint",
    "acuarel",
    "dibujo",
    "artist",
    "obras de",
    "galeria",
    "galería",
    "louvre",
    "prado",
    "cleveland museum",
  ];
  return hints.some((h) => n.includes(h));
}

function querySuggestsBooks(raw) {
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\blibro(s)?\b/.test(n)) return true;
  if (/\bnovela(s)?\b/.test(n)) return true;
  if (/\bcuento(s)?\b/.test(n)) return true;
  if (/\bensayo\b/.test(n)) return true;
  if (/\bpoesia\b/.test(n)) return true;
  if (/\bpoema(s)?\b/.test(n)) return true;
  if (/\bleer\b/.test(n)) return true;
  if (/\blectura\b/.test(n)) return true;
  if (/\bliteratura\b/.test(n)) return true;
  if (/\bautor(a)?\b/.test(n)) return true;
  if (/\bescritor(a)?\b/.test(n)) return true;
  if (/\beditorial\b/.test(n)) return true;
  if (/\bisbn\b/.test(n)) return true;
  if (/\bsaga\b/.test(n)) return true;
  if (/\btrilogia\b/.test(n)) return true;
  if (/\bbiografia\b/.test(n)) return true;
  if (/\bkindle\b/.test(n)) return true;
  if (/\bmanga\b/.test(n)) return true;
  const hints = [
    "fiction",
    "nonfiction",
    "fantasy book",
    "sci-fi book",
    "science fiction book",
    "graphic novel",
    "comic book",
    "hardcover",
    "paperback",
    "bestseller",
    "chapter",
    "audiobook",
  ];
  return hints.some((h) => n.includes(h));
}

function stripBookSearchPrefix(raw) {
  return raw
    .replace(
      /^\s*(libro|libros|novela|novelas|cuento|cuentos|ensayo|poema|poesia|autor|autora)\s+/i,
      ""
    )
    .trim();
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
 * @returns {Promise<object[]>}
 */
async function runGlobalSearch(query) {
  const q = typeof query === "string" ? query : "";
  const cacheKey = `gs:v1:${q || "empty"}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const genrePromise = getTmdbGenreMap();
  const promises = [];

  promises.push(
    (q
      ? Promise.all([searchTmdbMovies(q), searchTmdbTv(q)])
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

  if (q.length > 1) {
    promises.push(
      searchIgdbGames(q, 15)
        .then((games) => games.map(adaptIGDB))
        .catch(() => [])
    );
    promises.push(
      searchSpotifyAlbums(q, { enrichCount: 3 })
        .then((albums) => albums.map(adaptSpotifyAlbum))
        .catch(() => [])
    );
  }

  const qBooks = q.trim();
  if (qBooks.length > 1 && querySuggestsBooks(qBooks)) {
    const titleQuery = stripBookSearchPrefix(qBooks);
    if (titleQuery.length >= 2) {
      promises.push(searchBooksMerged(titleQuery).catch(() => []));
    }
  }

  const qt = q.trim();
  if (qt.length === 0) {
    promises.push(
      fetchCmaRandomArtworkRows(8)
        .then((rows) => rows.map(adaptCmaArt))
        .catch(() => [])
    );
  } else if (qt.length > 1 && querySuggestsArtVisual(qt)) {
    promises.push(
      searchMetArtworkRows(qt, MET_GLOBAL_MAX_IDS)
        .then((rows) => rows.map(adaptMet))
        .catch(() => [])
    );
  }

  const allResults = await Promise.all(promises);
  const flat = [];
  allResults.forEach((group) => {
    if (Array.isArray(group)) flat.push(...group);
  });

  const shuffled = shuffleSeeded(flat, q);
  const ttl = q ? 2 * 60 * 1000 : 5 * 60 * 1000;
  cacheSet(cacheKey, shuffled, ttl);
  return shuffled;
}

module.exports = { runGlobalSearch };
