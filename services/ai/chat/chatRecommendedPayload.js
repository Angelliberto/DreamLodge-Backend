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

function collectRecommendedItemsFromToolResults(toolResults, maxItems = 12) {
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

module.exports = {
  collectRecommendedItemsFromToolResults,
  mapMongoArtworkToClientRecommended,
};
