/**
 * Locale unificado para APIs de contenido (TMDB, Spotify, Google Books, IGDB).
 *
 * Variables de entorno (opcionales):
 * - CONTENT_LOCALE: idioma TMDB (ej. es-ES, es-MX, en-US). Alternativa: TMDB_LANGUAGE.
 *   Si solo indicas "es", se normaliza a es-ES (España) para alinear títulos con el catálogo TMDB España.
 * - CONTENT_REGION o CONTENT_MARKET o SPOTIFY_MARKET: país ISO 3166-1 alpha-2 (ej. ES, MX, AR)
 *   para catálogo Spotify (parámetro `market`).
 * - CONTENT_LANG: idioma BCP-47 corto para Google Books `langRestrict` e IGDB `Accept-Language`
 *   (ej. es). Alternativas: GOOGLE_BOOKS_LANG_RESTRICT, IGDB_ACCEPT_LANGUAGE.
 * - GOOGLE_BOOKS_LANG_RESTRICT: valor exacto para Books (ej. es o es,en). Si es "off" o sin definir (y sin CONTENT_LANG),
 *   no se envía langRestrict (más resultados). Usa es o es,en si quieres acotar idioma.
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

/**
 * Restricción de idioma para Google Books API (`langRestrict`).
 * Vacío = no enviar parámetro (todos los idiomas).
 * Por defecto vacío: `langRestrict=es` excluía muchos volúmenes con metadatos solo en inglés.
 */
function getGoogleBooksLangRestrict() {
  const explicit = trim(process.env.GOOGLE_BOOKS_LANG_RESTRICT);
  if (explicit.toLowerCase() === "off" || explicit === "0") return "";
  if (explicit) return explicit;
  const fromContent = firstEnv("CONTENT_LANG");
  if (fromContent) return fromContent;
  return "";
}

/** Cabecera Accept-Language para IGDB (textos localizados cuando existan). */
function getIgdbAcceptLanguage() {
  const raw = firstEnv("IGDB_ACCEPT_LANGUAGE", "CONTENT_LANG");
  const normalized = String(raw || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
  if (!normalized) return "es-ES,es;q=0.9,en;q=0.5";
  // Si el usuario pasa una cabecera completa, respetarla tal cual.
  if (normalized.includes(",")) return raw;
  if (normalized === "es" || normalized === "es-es" || normalized === "es-mx") {
    return "es-ES,es;q=0.9,en;q=0.5";
  }
  return raw;
}

module.exports = {
  getTmdbLanguage,
  normalizeTmdbLanguage,
  getSpotifyMarket,
  getGoogleBooksLangRestrict,
  getIgdbAcceptLanguage,
};
