/**
 * Valores canónicos del enum `category` en Artwork (debe coincidir con el schema).
 */
const CANONICAL = ["cine", "música", "literatura", "arte-visual", "videojuegos"];

/**
 * Mapea variantes comunes (IA, feed, APIs) al valor guardado en Mongo.
 */
const ALIAS_TO_CANONICAL = {
  cine: "cine",
  musica: "música",
  literatura: "literatura",
  "arte-visual": "arte-visual",
  artevisual: "arte-visual",
  "arte_visual": "arte-visual",
  videojuegos: "videojuegos",
};

/**
 * @param {unknown} raw
 * @returns {string|undefined} Valor canónico o `undefined` si no se reconoce
 */
function normalizeArtworkCategory(raw) {
  if (raw == null || raw === "") return undefined;
  let s = String(raw).trim();
  if (CANONICAL.includes(s)) return s;
  const key = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (ALIAS_TO_CANONICAL[key] != null) return ALIAS_TO_CANONICAL[key];
  return undefined;
}

module.exports = {
  CANONICAL,
  normalizeArtworkCategory,
};
