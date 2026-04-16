/**
 * TMDB: cabeceras, URL base, imagen w500 y mapa de géneros (película + TV) con caché compartida.
 */
const axios = require("axios");

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_W500 = "https://image.tmdb.org/t/p/w500";

function tmdbHeaders() {
  const key = (process.env.TMDB_API_KEY || "").trim();
  return {
    accept: "application/json",
    Authorization: `Bearer ${key}`,
  };
}

let _genreCache = { map: null, ts: 0 };
const GENRE_TTL_MS = 6 * 60 * 60 * 1000;
const PEOPLE_TTL_MS = 24 * 60 * 60 * 1000;
const _movieDirectorsCache = new Map();
const _tvCreatorsCache = new Map();

function getPeopleCache(cache, key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() > row.exp) {
    cache.delete(key);
    return null;
  }
  return row.data;
}

function setPeopleCache(cache, key, data) {
  cache.set(key, { data, exp: Date.now() + PEOPLE_TTL_MS });
}

async function getTmdbGenreMap() {
  const now = Date.now();
  if (_genreCache.map && now - _genreCache.ts < GENRE_TTL_MS) {
    return _genreCache.map;
  }
  const map = {};
  const settled = await Promise.allSettled([
    axios.get(`${TMDB_BASE}/genre/movie/list?language=es-ES`, {
      headers: tmdbHeaders(),
      timeout: 15000,
    }),
    axios.get(`${TMDB_BASE}/genre/tv/list?language=es-ES`, {
      headers: tmdbHeaders(),
      timeout: 15000,
    }),
  ]);
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value?.data?.genres) {
      r.value.data.genres.forEach((g) => {
        map[g.id] = g.name;
      });
    }
  }
  _genreCache = { map, ts: now };
  return map;
}

async function searchTmdbMovies(query) {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/search/movie`, {
      params: { query, include_adult: false, language: "es-ES", page: 1 },
      headers: tmdbHeaders(),
      timeout: 15000,
    });
    return data.results || [];
  } catch (_) {
    return [];
  }
}

async function searchTmdbTv(query) {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/search/tv`, {
      params: { query, include_adult: false, language: "es-ES", page: 1 },
      headers: tmdbHeaders(),
      timeout: 15000,
    });
    return data.results || [];
  } catch (_) {
    return [];
  }
}

async function discoverPopularMovies() {
  try {
    const { data } = await axios.get(`${TMDB_BASE}/discover/movie`, {
      params: { include_adult: false, language: "es-ES", sort_by: "popularity.desc" },
      headers: tmdbHeaders(),
      timeout: 15000,
    });
    return data.results || [];
  } catch (_) {
    return [];
  }
}

async function getTmdbMovieDirectors(movieId) {
  const id = Number.parseInt(String(movieId || ""), 10);
  if (!Number.isFinite(id) || id <= 0) return [];
  const key = `movie:${id}`;
  const hit = getPeopleCache(_movieDirectorsCache, key);
  if (hit) return hit;
  try {
    const { data } = await axios.get(`${TMDB_BASE}/movie/${id}/credits`, {
      params: { language: "es-ES" },
      headers: tmdbHeaders(),
      timeout: 15000,
    });
    const names = (data?.crew || [])
      .filter((x) => x && typeof x === "object" && x.job === "Director" && x.name)
      .map((x) => String(x.name).trim())
      .filter(Boolean);
    setPeopleCache(_movieDirectorsCache, key, names);
    return names;
  } catch (_) {
    return [];
  }
}

async function getTmdbTvCreators(tvId) {
  const id = Number.parseInt(String(tvId || ""), 10);
  if (!Number.isFinite(id) || id <= 0) return [];
  const key = `tv:${id}`;
  const hit = getPeopleCache(_tvCreatorsCache, key);
  if (hit) return hit;
  try {
    const { data } = await axios.get(`${TMDB_BASE}/tv/${id}`, {
      params: { language: "es-ES" },
      headers: tmdbHeaders(),
      timeout: 15000,
    });
    const names = (data?.created_by || [])
      .map((x) => String(x?.name || "").trim())
      .filter(Boolean);
    setPeopleCache(_tvCreatorsCache, key, names);
    return names;
  } catch (_) {
    return [];
  }
}

module.exports = {
  TMDB_BASE,
  TMDB_IMG_W500,
  tmdbHeaders,
  getTmdbGenreMap,
  searchTmdbMovies,
  searchTmdbTv,
  discoverPopularMovies,
  getTmdbMovieDirectors,
  getTmdbTvCreators,
};
