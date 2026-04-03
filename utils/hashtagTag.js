/**
 * Normaliza entradas tipo #Drama o "Ciencia ficción" a slug estable (como géneros en obras / DeviantArt).
 */
function normalizeHashtagSlug(input) {
  let t = String(input ?? "").trim();
  if (t.startsWith("#")) t = t.slice(1).trim();
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return t.slice(0, 32);
}

module.exports = { normalizeHashtagSlug };
