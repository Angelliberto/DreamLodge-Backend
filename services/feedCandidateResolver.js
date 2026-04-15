/**
 * Resuelve candidatos { category, title, creator? } (IA / feed) contra TMDB, Spotify,
 * Google Books, IGDB y Met. Solo acepta resultados cuya ficha en API coincide con el título
 * (umbral configurable) y, si hay creador, valida autor/artista cuando aplica.
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
const { searchSpotifyAlbums } = require("./spotifyClient");
const { fetchGoogleBooksVolumesMerged } = require("./googleBooksClient");
const { searchIgdbGames } = require("./igdbClient");
const { searchMetArtworkRows } = require("./metMuseumClient");
const {
  pickBestTitleMatch,
  defaultMinScore,
  personNameSimilarity,
  normalizeForMatch,
} = require("./candidateMatchUtils");

const ALLOWED = new Set(["cine", "musica", "literatura", "videojuegos", "arte-visual"]);

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

function minScoreForCategory(cat) {
  const base = defaultMinScore();
  if (cat === "literatura") return Math.max(0.58, base - 0.06);
  if (cat === "arte-visual") return Math.max(0.58, base - 0.05);
  return base;
}

function hasExactTitleVariant(wantedTitle, variants) {
  const wanted = normalizeForMatch(wantedTitle);
  if (!wanted) return false;
  return (variants || []).some((v) => normalizeForMatch(v) === wanted);
}

function bestVariantTokenDiff(wantedTitle, variants) {
  const wanted = normalizeForMatch(wantedTitle);
  if (!wanted) return Number.POSITIVE_INFINITY;
  const wantedTokens = wanted.split(" ").filter(Boolean).length;
  let best = Number.POSITIVE_INFINITY;
  for (const variant of variants || []) {
    const n = normalizeForMatch(variant);
    if (!n) continue;
    const tokens = n.split(" ").filter(Boolean).length;
    const diff = Math.abs(tokens - wantedTokens);
    if (diff < best) best = diff;
  }
  return best;
}

/**
 * Si hay creador y la similitud de título no es muy alta, exige que coincida con artista/autor/director razonablemente.
 */
function passesCreatorGate(category, creator, titleScore, checkCreatorFn) {
  const hint = (creator || "").trim();
  if (hint.length < 2) return true;
  if (titleScore >= 0.88) return true;
  return checkCreatorFn(hint);
}

async function resolveOne(c, genreMap) {
  const title = (c.title || "").trim();
  if (title.length < 2) return null;
  const creator = (c.creator || "").trim();
  const q = [title, creator].filter(Boolean).join(" ");
  let minScore = minScoreForCategory(c.category);

  switch (c.category) {
    case "cine": {
      const normalizedTitle = normalizeForMatch(title);
      const tokenCount = normalizedTitle ? normalizedTitle.split(" ").filter(Boolean).length : 0;
      // Títulos cortos (ej. "Amelie", "Sicario") son ambiguos: exigir mayor similitud.
      if (tokenCount > 0 && tokenCount <= 2) {
        minScore = Math.max(minScore, 0.82);
      }

      const [movies, tvshows] = await Promise.all([
        searchTmdbMovies(q),
        searchTmdbTv(title),
      ]);
      const moviePick = pickBestTitleMatch(
        movies,
        (m) => [m.title, m.original_title].filter(Boolean),
        title,
        { minScore, maxScan: 12 }
      );
      const tvPick = pickBestTitleMatch(
        tvshows,
        (t) => [t.name, t.original_name].filter(Boolean),
        title,
        { minScore, maxScan: 12 }
      );
      if (moviePick && tvPick) {
        const movieVariants = [moviePick.item.title, moviePick.item.original_title].filter(Boolean);
        const tvVariants = [tvPick.item.name, tvPick.item.original_name].filter(Boolean);
        const movieExact = hasExactTitleVariant(title, movieVariants);
        const tvExact = hasExactTitleVariant(title, tvVariants);
        if (movieExact !== tvExact) {
          return movieExact
            ? adaptTMDBMovie(moviePick.item, genreMap)
            : adaptTMDBTv(tvPick.item, genreMap);
        }

        // Si ambas puntuaciones son similares, preferir la que más se parezca en longitud de título.
        if (Math.abs(moviePick.score - tvPick.score) <= 0.06) {
          const movieTokenDiff = bestVariantTokenDiff(title, movieVariants);
          const tvTokenDiff = bestVariantTokenDiff(title, tvVariants);
          if (movieTokenDiff !== tvTokenDiff) {
            return movieTokenDiff < tvTokenDiff
              ? adaptTMDBMovie(moviePick.item, genreMap)
              : adaptTMDBTv(tvPick.item, genreMap);
          }
        }

        if (moviePick.score >= tvPick.score) {
          return adaptTMDBMovie(moviePick.item, genreMap);
        }
        return adaptTMDBTv(tvPick.item, genreMap);
      }
      if (moviePick) return adaptTMDBMovie(moviePick.item, genreMap);
      if (tvPick) return adaptTMDBTv(tvPick.item, genreMap);
      return null;
    }
    case "musica": {
      const query = q.length > 2 ? q : title;
      const albums = await searchSpotifyAlbums(query, { limit: 10, enrichCount: 2 });
      const albumPick = pickBestTitleMatch(
        albums,
        (a) => [a.name].filter(Boolean),
        title,
        { minScore, maxScan: 10 }
      );
      if (!albumPick) return null;
      const okCreator = passesCreatorGate(
        "musica",
        creator,
        albumPick.score,
        (hint) => {
          const names = (albumPick.item.artists || []).map((x) => x.name);
          if (!names.length) return true;
          return names.some((n) => personNameSimilarity(hint, n) >= 0.42);
        }
      );
      if (!okCreator) return null;
      return adaptSpotifyAlbum(albumPick.item);
    }
    case "literatura": {
      const tasks = [`intitle:${title}`];
      if (creator.length >= 2) tasks.push(`inauthor:${creator}`);
      const merged = await fetchGoogleBooksVolumesMerged(tasks, {
        maxPerQuery: 12,
        maxTotal: 12,
        shortCircuitAfterQueryIfAtLeast: 6,
      });
      const bookPick = pickBestTitleMatch(
        merged,
        (item) => {
          const v = item.volumeInfo || {};
          const parts = [v.title, v.subtitle].filter(Boolean);
          const joined = parts.join(" ").trim();
          return [v.title, joined].filter(Boolean);
        },
        title,
        { minScore, maxScan: 12 }
      );
      if (!bookPick) return null;
      const okCreator = passesCreatorGate(
        "literatura",
        creator,
        bookPick.score,
        (hint) => {
          const authors = bookPick.item.volumeInfo?.authors || [];
          if (!authors.length) return true;
          return authors.some((n) => personNameSimilarity(hint, n) >= 0.42);
        }
      );
      if (!okCreator) return null;
      return adaptBook(bookPick.item);
    }
    case "videojuegos": {
      const gq = title.length >= 2 ? title : `${title} game`;
      const games = await searchIgdbGames(gq, 12);
      const gamePick = pickBestTitleMatch(
        games,
        (g) => [g.name].filter(Boolean),
        title,
        { minScore, maxScan: 12 }
      );
      return gamePick ? adaptIGDB(gamePick.item) : null;
    }
    case "arte-visual": {
      const rows = await searchMetArtworkRows(q, 12);
      const artPick = pickBestTitleMatch(
        rows,
        (r) => [r.title].filter(Boolean),
        title,
        { minScore, maxScan: 12 }
      );
      if (!artPick) return null;
      const okCreator = passesCreatorGate(
        "arte-visual",
        creator,
        artPick.score,
        (hint) => {
          const a = String(artPick.item.artist || "").trim();
          if (!a || /^unknown$/i.test(a)) return true;
          return personNameSimilarity(hint, a) >= 0.38;
        }
      );
      if (!okCreator) return null;
      return adaptMet(artPick.item);
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
