/**
 * Resuelve candidatos { category, title, creator? } (IA / feed) contra TMDB, Spotify,
 * Google Books, IGDB y Met. Solo acepta resultados cuya ficha en API coincide con el título
 * (umbral configurable) y, si hay creador, valida autor/artista cuando aplica.
 */
const {
  getTmdbGenreMap,
  searchTmdbMovies,
  searchTmdbTv,
  getTmdbMovieDirectors,
  getTmdbTvCreators,
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
const { searchIgdbGames, stableStringHash32 } = require("./igdbClient");
const { searchMetArtworkRows } = require("./metMuseumClient");
const {
  pickBestTitleMatch,
  defaultMinScore,
  personNameSimilarity,
  normalizeForMatch,
  bestVariantScore,
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

function passesStrictCineTitleGate(wantedTitle, tokenCount, pick, variants) {
  if (!pick || !variants?.length) return false;
  if (tokenCount <= 0) return true;
  const exact = hasExactTitleVariant(wantedTitle, variants);
  if (exact) return true;
  if (tokenCount <= 3) {
    const tokenDiff = bestVariantTokenDiff(wantedTitle, variants);
    return pick.score >= 0.93 && tokenDiff <= 1;
  }
  return true;
}

function bestCreatorSimilarity(hint, names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (!list.length) return 0;
  return list.reduce(
    (best, name) => Math.max(best, personNameSimilarity(hint, name)),
    0
  );
}

/** Nombres de compañías en IGDB (involved_companies). */
function igdbCompanyNames(game) {
  const names = [];
  for (const ic of game?.involved_companies || []) {
    if (ic?.company?.name) names.push(ic.company.name);
  }
  return names;
}

/**
 * Títulos de una palabra (p. ej. "Journey") suelen chocar con DLC/expansiones que solo contienen la palabra.
 * Prioriza coincidencia exacta (normalizada) y, si hay creador, alinea con el estudio en involved_companies.
 */
function pickBestIgdbGameMatch(games, wantedTitle, creatorHint, minTitleScore, diversitySeed) {
  const wanted = (wantedTitle || "").trim();
  const nw = normalizeForMatch(wanted);
  const wantedTokens = nw ? nw.split(" ").filter(Boolean).length : 0;
  const creator = (creatorHint || "").trim();
  const list = Array.isArray(games) ? games : [];
  const seed = diversitySeed ? String(diversitySeed) : "";

  const scored = [];
  for (const g of list) {
    const name = g?.name;
    if (!name) continue;
    const titleSc = bestVariantScore(wanted, [name]);
    if (titleSc < minTitleScore) continue;

    const ng = normalizeForMatch(name);
    const gameTokens = ng ? ng.split(" ").filter(Boolean).length : 0;
    const companies = igdbCompanyNames(g);
    const devSc =
      creator.length >= 2 ? bestCreatorSimilarity(creator, companies) : 0;

    const exact = nw.length >= 2 && ng === nw;
    let combined = titleSc;
    if (exact) combined += 0.22;
    if (creator.length >= 2) combined += 0.32 * devSc;

    if (wantedTokens <= 2 && nw.length >= 3) {
      if (!exact && gameTokens >= 4) {
        combined -= 0.18;
        if (ng.includes(nw) && ng !== nw) combined -= 0.12;
      }
      if (!exact && gameTokens >= 6) combined -= 0.1;
    }

    if (creator.length >= 2 && !exact && titleSc < 0.9 && devSc < 0.32) {
      combined -= 0.15;
    }

    scored.push({ g, combined, titleSc, devSc, exact });
  }

  if (!scored.length) return null;

  const passesFinalGate = (row) => {
    if (creator.length >= 2 && row.titleSc < 0.93 && row.devSc < 0.28 && !row.exact) {
      return false;
    }
    return true;
  };
  const gated = scored.filter(passesFinalGate);
  if (!gated.length) return null;

  let bestCombined = gated.reduce((m, r) => Math.max(m, r.combined), -1);
  const epsilon = seed ? 0.048 : 1e-9;
  const pool = gated.filter((r) => r.combined >= bestCombined - epsilon);
  pool.sort((a, b) => {
    if (Math.abs(b.combined - a.combined) > 1e-6) return b.combined - a.combined;
    if (!seed) return 0;
    const ha = stableStringHash32(`${seed}:${a.g?.id}`);
    const hb = stableStringHash32(`${seed}:${b.g?.id}`);
    return hb - ha;
  });
  const best = pool[0];
  return { item: best.g, titleSc: best.titleSc, devSc: best.devSc, exact: best.exact };
}

/** Sinopsis mínima en resultados de búsqueda TMDB (si falta, exigimos director/creador). */
function tmdbSearchHasOverview(entity) {
  return String(entity?.overview || "").trim().length >= 12;
}

/**
 * Adapta película/serie TMDB o devuelve null si no hay ni descripción ni director/creador
 * (ficha demasiado vacía para confiar en el match).
 * @param {'movie'|'tv'} kind
 * @param {object} entity resultado de search/movie o search/tv
 * @param {string[]|undefined} preloadedPeople si ya se cargó crew/creadores (evita doble petición)
 */
async function adaptTmdbCineOrNull(entity, kind, genreMap, preloadedPeople) {
  const people =
    preloadedPeople !== undefined
      ? preloadedPeople
      : kind === "movie"
        ? await getTmdbMovieDirectors(entity?.id)
        : await getTmdbTvCreators(entity?.id);
  const names = Array.isArray(people) ? people.filter(Boolean) : [];
  const hasPeople = names.length > 0;
  const hasOverview = tmdbSearchHasOverview(entity);
  if (!hasOverview && !hasPeople) return null;
  const item =
    kind === "movie"
      ? adaptTMDBMovie(entity, genreMap)
      : adaptTMDBTv(entity, genreMap);
  if (hasPeople) {
    item.creator = names.slice(0, 4).join(", ");
  }
  return item;
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

async function resolveOne(c, genreMap, ctx = {}) {
  const diversitySeed = ctx.diversitySeed ? String(ctx.diversitySeed) : "";
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
      const primaryQuery = q.length > 2 ? q : title;
      const [moviesPrimary, tvshowsPrimary] = await Promise.all([
        searchTmdbMovies(primaryQuery),
        searchTmdbTv(primaryQuery),
      ]);
      const needsTitleFallback =
        creator.length >= 2 &&
        (!Array.isArray(moviesPrimary) || moviesPrimary.length === 0) &&
        (!Array.isArray(tvshowsPrimary) || tvshowsPrimary.length === 0);
      const [moviesFallback, tvshowsFallback] = needsTitleFallback
        ? await Promise.all([searchTmdbMovies(title), searchTmdbTv(title)])
        : [[], []];
      const movies = [...(moviesPrimary || []), ...(moviesFallback || [])];
      const tvshows = [...(tvshowsPrimary || []), ...(tvshowsFallback || [])];
      const rawMoviePick = pickBestTitleMatch(
        movies,
        (m) => [m.title, m.original_title].filter(Boolean),
        title,
        { minScore, maxScan: 12 }
      );
      const rawTvPick = pickBestTitleMatch(
        tvshows,
        (t) => [t.name, t.original_name].filter(Boolean),
        title,
        { minScore, maxScan: 12 }
      );
      const movieVariants = rawMoviePick
        ? [rawMoviePick.item.title, rawMoviePick.item.original_title].filter(Boolean)
        : [];
      const tvVariants = rawTvPick
        ? [rawTvPick.item.name, rawTvPick.item.original_name].filter(Boolean)
        : [];
      const moviePick = passesStrictCineTitleGate(title, tokenCount, rawMoviePick, movieVariants)
        ? rawMoviePick
        : null;
      const tvPick = passesStrictCineTitleGate(title, tokenCount, rawTvPick, tvVariants)
        ? rawTvPick
        : null;
      const relaxedMoviePick =
        !moviePick && rawMoviePick && rawMoviePick.score >= Math.max(0.76, minScore - 0.06)
          ? rawMoviePick
          : null;
      const relaxedTvPick =
        !tvPick && rawTvPick && rawTvPick.score >= Math.max(0.76, minScore - 0.06)
          ? rawTvPick
          : null;
      const movieBest = moviePick || relaxedMoviePick;
      const tvBest = tvPick || relaxedTvPick;
      if (movieBest && tvBest) {
        let movieDirectors;
        let tvCreators;
        if (creator.length >= 2) {
          const loaded = await Promise.all([
            getTmdbMovieDirectors(movieBest.item?.id),
            getTmdbTvCreators(tvBest.item?.id),
          ]);
          movieDirectors = loaded[0];
          tvCreators = loaded[1];
          const movieCreatorScore = bestCreatorSimilarity(creator, movieDirectors);
          const tvCreatorScore = bestCreatorSimilarity(creator, tvCreators);
          const movieCreatorStrong = movieCreatorScore >= 0.42;
          const tvCreatorStrong = tvCreatorScore >= 0.42;
          if (movieCreatorStrong !== tvCreatorStrong) {
            return movieCreatorStrong
              ? await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors)
              : await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
          }
          if (Math.abs(movieCreatorScore - tvCreatorScore) >= 0.1) {
            return movieCreatorScore > tvCreatorScore
              ? await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors)
              : await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
          }
        }

        const movieExact = hasExactTitleVariant(title, movieVariants);
        const tvExact = hasExactTitleVariant(title, tvVariants);
        if (movieExact !== tvExact) {
          return movieExact
            ? await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors)
            : await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
        }

        // Si ambas puntuaciones son similares, preferir la que más se parezca en longitud de título.
        if (Math.abs(movieBest.score - tvBest.score) <= 0.06) {
          const movieTokenDiff = bestVariantTokenDiff(title, movieVariants);
          const tvTokenDiff = bestVariantTokenDiff(title, tvVariants);
          if (movieTokenDiff !== tvTokenDiff) {
            return movieTokenDiff < tvTokenDiff
              ? await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors)
              : await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
          }
        }

        if (movieBest.score >= tvBest.score) {
          return await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors);
        }
        return await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
      }
      if (movieBest) {
        let movieDirectors;
        if (creator.length >= 2 && movieBest.score < 0.95) {
          movieDirectors = await getTmdbMovieDirectors(movieBest.item?.id);
          const movieCreatorScore = bestCreatorSimilarity(creator, movieDirectors);
          // Avoid dropping good title matches due to noisy creator hints from IA.
          if (movieDirectors.length && movieCreatorScore < 0.25 && movieBest.score < 0.82) return null;
          return await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors);
        }
        return await adaptTmdbCineOrNull(movieBest.item, "movie", genreMap, movieDirectors);
      }
      if (tvBest) {
        let tvCreators;
        if (creator.length >= 2 && tvBest.score < 0.95) {
          tvCreators = await getTmdbTvCreators(tvBest.item?.id);
          const tvCreatorScore = bestCreatorSimilarity(creator, tvCreators);
          // Avoid dropping good title matches due to noisy creator hints from IA.
          if (tvCreators.length && tvCreatorScore < 0.25 && tvBest.score < 0.82) return null;
          return await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
        }
        return await adaptTmdbCineOrNull(tvBest.item, "tv", genreMap, tvCreators);
      }
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
          return authors.some((n) => personNameSimilarity(hint, n) >= 0.32);
        }
      );
      if (!okCreator) return null;
      return adaptBook(bookPick.item);
    }
    case "videojuegos": {
      const normalizedTitle = normalizeForMatch(title);
      const titleTokens = normalizedTitle
        ? normalizedTitle.split(" ").filter(Boolean).length
        : 0;
      let minGameScore = minScore;
      if (titleTokens > 0 && titleTokens <= 2) {
        minGameScore = Math.max(minGameScore, 0.8);
      }

      const gq = title.length >= 2 ? title : `${title} game`;
      const seen = new Set();
      const merged = [];
      const pushGames = (arr) => {
        for (const g of arr || []) {
          if (!g || g.id == null) continue;
          if (seen.has(g.id)) continue;
          seen.add(g.id);
          merged.push(g);
        }
      };
      const igdbOffset =
        diversitySeed.length >= 2
          ? stableStringHash32(`${diversitySeed}:${normalizedTitle || gq}`) % 26
          : 0;
      const primaryLimit = 32;
      pushGames(await searchIgdbGames(gq, primaryLimit, { offset: igdbOffset }));
      if (creator.length >= 3) {
        const off2 = (igdbOffset + 11) % 26;
        pushGames(
          await searchIgdbGames(`${title} ${creator}`, primaryLimit, { offset: off2 })
        );
      }
      if (merged.length < 10 && igdbOffset > 0) {
        pushGames(await searchIgdbGames(gq, 22, { offset: 0 }));
      }

      const gamePick = pickBestIgdbGameMatch(
        merged,
        title,
        creator,
        minGameScore,
        diversitySeed || undefined
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
 * @param {{ diversitySeed?: string }} [opts]
 * @returns {Promise<object[]>}
 */
async function resolveCuratedFeedCandidates(candidates, opts = {}) {
  if (!candidates?.length) return [];
  const baseSeed = opts.diversitySeed ? String(opts.diversitySeed) : "";
  const normalized = [];
  const seen = new Set();
  for (const row of candidates.slice(0, 80)) {
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
  const chunk = 8;
  for (let i = 0; i < normalized.length; i += chunk) {
    const slice = normalized.slice(i, i + chunk);
    const batch = await Promise.all(
      slice.map((c, j) =>
        resolveOne(c, genreMap, {
          diversitySeed: baseSeed ? `${baseSeed}:${i + j}:${c.category}` : "",
        })
      )
    );
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
