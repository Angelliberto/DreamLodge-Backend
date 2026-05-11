/**
 * Convierte documentos de obra (Mongo / toolResults) al shape CulturalItem del cliente
 * para enviar `recommendedItems` con la respuesta del chat.
 */

function mapCategoryForClient(cat) {
  const raw = String(cat || "").trim();
  const deAcc = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (deAcc === "musica" || raw === "música") return "musica";
  if (deAcc === "cine") return "cine";
  if (deAcc === "literatura") return "literatura";
  if (deAcc === "arte-visual" || deAcc === "artevisual") return "arte-visual";
  if (deAcc === "videojuegos") return "videojuegos";
  return "cine";
}

function mapMongoArtworkToClientRecommended(doc) {
  if (!doc || typeof doc !== "object") return null;
  const id = String(doc.id || "").trim();
  if (!id) return null;
  const category = mapCategoryForClient(doc.category);
  const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
  const out = {
    id,
    originalId: doc.originalId != null ? doc.originalId : id,
    source: doc.source,
    title: String(doc.title || "").trim() || id,
    category,
    imageUrl: String(doc.imageUrl || "https://via.placeholder.com/400x600?text=Artwork"),
    creator: String(doc.creator || "—").trim() || "—",
    year: doc.year != null && doc.year !== "" ? String(doc.year) : undefined,
    description: doc.description ? String(doc.description) : undefined,
    rating: typeof doc.rating === "number" && Number.isFinite(doc.rating) ? doc.rating : undefined,
    metadata: {
      genres: Array.isArray(meta.genres) ? meta.genres : [],
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      platforms: Array.isArray(meta.platforms) ? meta.platforms : [],
      other: Array.isArray(meta.other) ? meta.other : [],
      duration: meta.duration,
      label: meta.label,
      contextLink: meta.contextLink,
      mediaType: meta.mediaType,
    },
  };
  if (doc._id != null) out._id = String(doc._id);
  return out;
}

function collectRecommendedItemsFromToolResults(toolResults, maxItems = 20) {
  const out = [];
  const seen = new Set();
  const push = (doc) => {
    const mapped = mapMongoArtworkToClientRecommended(doc);
    if (!mapped || seen.has(mapped.id)) return;
    seen.add(mapped.id);
    out.push(mapped);
  };

  const list = toolResults?.artworks?.data;
  if (Array.isArray(list)) {
    for (const doc of list) {
      push(doc);
      if (out.length >= maxItems) return out;
    }
  }
  const one = toolResults?.artwork?.data;
  if (one) push(one);
  return out.slice(0, maxItems);
}

function normalizeMatchText(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Variantes de título para buscar coincidencia en la respuesta (p. ej. sin año entre paréntesis). */
function titleSearchVariants(title) {
  const raw = String(title || "").trim();
  if (!raw) return [];
  const variants = new Set();
  variants.add(raw);
  const noYear = raw.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  if (noYear.length >= 3) variants.add(noYear);
  const beforeDash = raw.split(/\s[—\-]\s/)[0]?.trim();
  if (beforeDash && beforeDash.length >= 3 && beforeDash !== raw) variants.add(beforeDash);
  const slashParts = raw.split(/\s*\/\s*/).map((s) => s.trim()).filter((s) => s.length >= 3);
  for (const p of slashParts) variants.add(p);
  return [...variants];
}

/**
 * Solo obras cuyo título (o variante) aparece literalmente en el texto del asistente,
 * en el orden en que aparecen en la respuesta.
 */
function filterRecommendedItemsByResponseText(responseText, items) {
  if (!Array.isArray(items) || !items.length) return [];
  const body = normalizeMatchText(responseText);
  if (!body) return [];
  const scored = [];
  for (const art of items) {
    const variants = titleSearchVariants(art.title);
    let bestIdx = -1;
    for (const v of variants) {
      const t = normalizeMatchText(v);
      if (t.length < 3) continue;
      const idx = body.indexOf(t);
      if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) bestIdx = idx;
    }
    if (bestIdx >= 0) scored.push({ art, idx: bestIdx });
  }
  scored.sort((a, b) => a.idx - b.idx);
  const seen = new Set();
  const out = [];
  for (const { art } of scored) {
    const id = String(art.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(art);
  }
  return out;
}

module.exports = {
  collectRecommendedItemsFromToolResults,
  mapMongoArtworkToClientRecommended,
  filterRecommendedItemsByResponseText,
};
