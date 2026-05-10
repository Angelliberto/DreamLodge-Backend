const { buildUserProfileText, rerankByEmbeddingSimilarity } = require("../embeddings/vectorRetriever");

const FEED_EMBED_CONCURRENCY = Math.max(1, Number(process.env.FEED_EMBED_CONCURRENCY) || 6);
const SKIP_FEED_EMBED_RERANK = /^(1|true|yes)$/i.test(String(process.env.FEED_SKIP_EMBED_RERANK || ""));

async function maybeRerankFeedCandidates({
  agent,
  candidates,
  ocean,
  feedEntityId,
  logger,
}) {
  if (SKIP_FEED_EMBED_RERANK) return candidates;

  try {
    const userProfileText = buildUserProfileText({
      o: ocean.o,
      c: ocean.c,
      e: ocean.e,
      a: ocean.a,
      n: ocean.n,
    });
    const vectorReranked = await rerankByEmbeddingSimilarity({
      agent,
      userProfileText,
      candidates,
      maxScan: 90,
      embedConcurrency: FEED_EMBED_CONCURRENCY,
      logger,
      userId: String(feedEntityId || ""),
    });
    if (Array.isArray(vectorReranked) && vectorReranked.length) {
      return vectorReranked;
    }
  } catch (_) {
    // Fallback silencioso: si embeddings falla, se conserva flujo actual.
  }

  return candidates;
}

module.exports = { maybeRerankFeedCandidates };

