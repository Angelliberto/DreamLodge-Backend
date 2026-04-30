const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
const EMBEDDING_CACHE = new Map();
const EMBEDDING_CACHE_MAX = 3000;

function normalizeText(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cacheGet(key) {
  const row = EMBEDDING_CACHE.get(key);
  if (!row) return null;
  row.ts = Date.now();
  return row.vec;
}

function cacheSet(key, vec) {
  EMBEDDING_CACHE.set(key, { vec, ts: Date.now() });
  if (EMBEDDING_CACHE.size <= EMBEDDING_CACHE_MAX) return;
  const oldest = [...EMBEDDING_CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(
    0,
    EMBEDDING_CACHE.size - EMBEDDING_CACHE_MAX
  );
  for (const [k] of oldest) EMBEDDING_CACHE.delete(k);
}

async function embedText(agent, text) {
  const clean = normalizeText(text);
  if (!clean || !agent?._genAI) return null;
  const key = `${EMBEDDING_MODEL}|${clean.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const model = agent._genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const res = await model.embedContent(clean);
    const vec = Array.isArray(res?.embedding?.values) ? res.embedding.values : null;
    if (!vec || !vec.length) return null;
    cacheSet(key, vec);
    return vec;
  } catch (_) {
    return null;
  }
}

function buildArtworkEmbeddingText(item) {
  const genres = Array.isArray(item?.metadata?.genres) ? item.metadata.genres.join(", ") : "";
  return normalizeText(
    [
      `category: ${item?.category || ""}`,
      `title: ${item?.title || ""}`,
      `creator: ${item?.creator || ""}`,
      `genres: ${genres}`,
      `description: ${item?.description || ""}`,
    ].join(" | ")
  );
}

module.exports = {
  EMBEDDING_MODEL,
  embedText,
  buildArtworkEmbeddingText,
};
