const {
  embedText,
  buildArtworkEmbeddingText,
  EMBEDDING_MODEL,
} = require("./embeddingService");

function dot(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

function norm(a) {
  if (!Array.isArray(a) || !a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * a[i];
  return Math.sqrt(s);
}

function cosine(a, b) {
  const den = norm(a) * norm(b);
  if (!den) return 0;
  return dot(a, b) / den;
}

function persistArtworkEmbeddingInBackground(item, vec) {
  if (!item || typeof item !== "object") return;
  if (typeof item.save !== "function") return;
  if (!Array.isArray(vec) || !vec.length) return;
  try {
    item.embedding = vec;
    item.embeddingModel = EMBEDDING_MODEL;
    item.embeddingUpdatedAt = new Date();
    Promise.resolve(item.save()).catch(() => {
      // noop: no bloquear el feed por un fallo de persistencia
    });
  } catch (_) {
    // noop
  }
}

function buildUserProfileText({ o, c, e, a, n, artisticProfile, oceanFingerprint }) {
  const genreLine =
    artisticProfile?.genreRecommendations && typeof artisticProfile.genreRecommendations === "object"
      ? Object.entries(artisticProfile.genreRecommendations)
          .map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : []).join(", ")}`)
          .join(" | ")
      : "";
  return [
    `fingerprint: ${oceanFingerprint || "na"}`,
    `ocean: openness ${Number(o || 0).toFixed(2)}, conscientiousness ${Number(c || 0).toFixed(2)}, extraversion ${Number(e || 0).toFixed(2)}, agreeableness ${Number(a || 0).toFixed(2)}, neuroticism ${Number(n || 0).toFixed(2)}`,
    `profile: ${artisticProfile?.profile || ""}`,
    `description: ${artisticProfile?.description || ""}`,
    genreLine ? `genres: ${genreLine}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function rerankByEmbeddingSimilarity({
  agent,
  userProfileText,
  candidates,
  maxScan = 90,
  maxOnTheFlyEmbeddings = 24,
  logger = null,
  userId = "",
}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!agent?.configured?.() || !list.length) return list;
  const userVec = await embedText(agent, userProfileText);
  if (!userVec) return list;

  const head = list.slice(0, maxScan);
  const tail = list.slice(maxScan);
  const scored = [];
  let onTheFlyCount = 0;
  let storedCount = 0;
  for (const item of head) {
    const hasStored =
      Array.isArray(item?.embedding) &&
      item.embedding.length > 0 &&
      (!item?.embeddingModel || item.embeddingModel === EMBEDDING_MODEL);
    if (hasStored) storedCount += 1;
    let itemVec = hasStored ? item.embedding : null;
    if (!itemVec && onTheFlyCount < maxOnTheFlyEmbeddings) {
      itemVec = await embedText(agent, buildArtworkEmbeddingText(item));
      if (itemVec) {
        onTheFlyCount += 1;
        persistArtworkEmbeddingInBackground(item, itemVec);
      }
    }
    const sim = itemVec ? cosine(userVec, itemVec) : -1;
    scored.push({ item, sim });
  }
  scored.sort((x, y) => y.sim - x.sim);
  if (logger && typeof logger.info === "function") {
    const top = scored
      .slice(0, 5)
      .map((x) => `${x.item?.category || "?"}:${x.item?.title || "?"}(${x.sim.toFixed(3)})`)
      .join(" | ");
    logger.info(
      "[dreamlodge][embeddings] rerank userId=%s scanned=%s stored=%s onTheFly=%s top5=%s",
      userId || "(anon)",
      head.length,
      storedCount,
      onTheFlyCount,
      top || "-"
    );
  }
  return [...scored.map((x) => x.item), ...tail];
}

module.exports = {
  buildUserProfileText,
  rerankByEmbeddingSimilarity,
};
