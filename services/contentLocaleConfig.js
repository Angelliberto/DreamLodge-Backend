/**
 * Locale unificado para APIs de contenido (TMDB, Spotify, Google Books, IGDB).
 *
 * Variables de entorno (opcionales):
 * - CONTENT_LOCALE: idioma TMDB (ej. es-ES, es-MX, en-US). Alternativa: TMDB_LANGUAGE.
 * - CONTENT_REGION o CONTENT_MARKET o SPOTIFY_MARKET: país ISO 3166-1 alpha-2 (ej. ES, MX, AR)
 *   para catálogo Spotify (parámetro `market`).
 * - CONTENT_LANG: idioma BCP-47 corto para Google Books `langRestrict` e IGDB `Accept-Language`
 *   (ej. es). Alternativas: GOOGLE_BOOKS_LANG_RESTRICT, IGDB_ACCEPT_LANGUAGE.
 * - GOOGLE_BOOKS_LANG_RESTRICT: valor exacto para Books (ej. es o es,en). Si es "off", no se envía langRestrict.
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

/** Idioma para parámetro `language` de TMDB (títulos, sinopsis, géneros). */
function getTmdbLanguage() {
  return firstEnv("CONTENT_LOCALE", "TMDB_LANGUAGE") || "es-ES";
}

/** País para parámetro `market` de Spotify (catálogo disponible en esa región). */
function getSpotifyMarket() {
  const m = firstEnv("CONTENT_MARKET", "SPOTIFY_MARKET", "CONTENT_REGION").toUpperCase();
  if (/^[A-Z]{2}$/.test(m)) return m;
  return "ES";
}

/**
 * Restricción de idioma para Google Books API (`langRestrict`).
 * Vacío = no enviar parámetro (todos los idiomas).
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
  getSpotifyMarket,
  getGoogleBooksLangRestrict,
  getIgdbAcceptLanguage,
};
