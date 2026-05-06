/**
 * Locale unificado para APIs de contenido (TMDB, Spotify, Open Library, IGDB).
 *
 * Variables de entorno (opcionales):
 * - CONTENT_LOCALE: idioma TMDB (ej. es-ES, es-MX, en-US). Alternativa: TMDB_LANGUAGE.
 *   Si solo indicas "es", se normaliza a es-ES (España) para alinear títulos con el catálogo TMDB España.
 * - CONTENT_REGION o CONTENT_MARKET o SPOTIFY_MARKET: país ISO 3166-1 alpha-2 (ej. ES, MX, AR)
 *   para catálogo Spotify (parámetro `market`).
 * - CONTENT_LANG: idioma BCP-47 corto para filtros tipo libros/Open Library e IGDB `Accept-Language`
 *   (ej. es). Alternativas: IGDB_ACCEPT_LANGUAGE, OPEN_LIBRARY_LANGUAGE.
 * - OPEN_LIBRARY_LANGUAGE: código MARC de 3 letras para `language` en búsqueda Open Library (ej. spa, eng).
 *   Si es "off", no se envía filtro. Si falta, se infiere desde CONTENT_LANG (spa para es, etc.).
 * - GOOGLE_BOOKS_LANG_RESTRICT: compatibilidad; si OPEN_LIBRARY_LANGUAGE no está definida, el primer código
 *   tipo BCP se mapea a MARC antes de recurrir a CONTENT_LANG.
 */

function trim(v) {
  return String(v ?? "").trim();
}

function firstEnv(...names) {
  for (const n of names) {
    const v = trim(process.env[n]);
    if (v) return v;
  }
  return "";
}

/** Normaliza código TMDB: `es` suelto → es-ES (cartelera España). */
function normalizeTmdbLanguage(lang) {
  const s = trim(lang).replace(/_/g, "-");
  if (!s) return "es-ES";
  const lo = s.toLowerCase();
  if (lo === "es" || lo === "esp") return "es-ES";
  return s;
}

/** Idioma para parámetro `language` de TMDB (títulos, sinopsis, géneros). */
function getTmdbLanguage() {
  return normalizeTmdbLanguage(firstEnv("CONTENT_LOCALE", "TMDB_LANGUAGE") || "es-ES");
}

/** País para parámetro `market` de Spotify (catálogo disponible en esa región). */
function getSpotifyMarket() {
  const m = firstEnv("CONTENT_MARKET", "SPOTIFY_MARKET", "CONTENT_REGION").toUpperCase();
  if (/^[A-Z]{2}$/.test(m)) return m;
  return "ES";
}

/** Mapa BCP‑47 corto → código idioma Open Library (`language`). */
function mapBcpToOpenLibraryMarc(code) {
  const raw = trim(code).split(",")[0].split("-")[0].toLowerCase();
  if (!raw || raw === "off") return "";
  const table = {
    es: "spa",
    ca: "cat",
    en: "eng",
    fr: "fre",
    de: "ger",
    it: "ita",
    pt: "por",
    gl: "glg",
  };
  return table[raw] || "";
}

/**
 * Código `language` para Open Library search (3 letras MARC: spa, eng, …).
 * Vacío = no filtrar por idioma.
 */
function getOpenLibraryLanguage() {
  const explicit = trim(process.env.OPEN_LIBRARY_LANGUAGE);
  if (explicit.toLowerCase() === "off" || explicit === "0") return "";
  if (explicit && explicit.length === 3) return explicit.toLowerCase();
  if (explicit) {
    const m = mapBcpToOpenLibraryMarc(explicit);
    if (m) return m;
  }
  const gl = trim(process.env.GOOGLE_BOOKS_LANG_RESTRICT);
  if (gl && gl.toLowerCase() !== "off" && gl !== "0") {
    const m = mapBcpToOpenLibraryMarc(gl);
    if (m) return m;
  }
  const fromContent = firstEnv("CONTENT_LANG");
  return mapBcpToOpenLibraryMarc(fromContent || "es") || "spa";
}

/**
 * Restricción de idioma (histórico Google Books `langRestrict`); IGDB también lee CONTENT_LANG.
 * Vacío = no enviar restricción explícita.
 */
function getGoogleBooksLangRestrict() {
  const explicit = trim(process.env.GOOGLE_BOOKS_LANG_RESTRICT);
  if (explicit.toLowerCase() === "off" || explicit === "0") return "";
  if (explicit) return explicit;
  const fromContent = firstEnv("CONTENT_LANG");
  if (fromContent) return fromContent;
  return "es";
}

/** Cabecera Accept-Language para IGDB (textos localizados cuando existan). */
function getIgdbAcceptLanguage() {
  return firstEnv("IGDB_ACCEPT_LANGUAGE", "CONTENT_LANG") || "es";
}

module.exports = {
  getTmdbLanguage,
  normalizeTmdbLanguage,
  getSpotifyMarket,
  getGoogleBooksLangRestrict,
  getOpenLibraryLanguage,
  getIgdbAcceptLanguage,
};
