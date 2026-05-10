const {
  formatExceptionForClient,
  traitTotal,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeWorkCandidateRows,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  oceanScoresToCanonicalLikert,
  DEFAULT_OCEAN_SCORE_METRIC,
} = require("../../../utils/ai/agentUtils");
const {
  buildOceanFacetInterpretation,
  buildPersonalizedFeedCuratorPrompt,
  feedEntityIdFromOceanResult,
} = require("./feedPromptBuilder");
const {
  getRecentTitlesForUser,
  saveRecentTitlesForUser,
  reorderByNovelty,
} = require("./feedPostProcessing");
const { maybeRerankFeedCandidates } = require("./feedReranker");

const TARGET_CANDIDATES = Math.max(24, Number(process.env.FEED_TARGET_CANDIDATES) || 60);

async function curatePersonalizedFeed(agent, oceanResult, artisticProfile, deps = {}) {
  const logger = deps.logger || console;
  const logIaRecommendedWorks = deps.logIaRecommendedWorks || (() => {});
  const aiStartAt = Date.now();

  const rawScores = oceanResult.scores;
  if (!rawScores || typeof rawScores !== "object") {
    return { candidates: [], webSearchUsed: false, reason: "no_ocean_scores" };
  }
  if (!agent.configured()) {
    return { candidates: [], webSearchUsed: false, reason: "no_gemini" };
  }

  const scoreMetric =
    oceanResult.scoreMetric === "ipip_mean_1_5"
      ? "ipip_mean_1_5"
      : DEFAULT_OCEAN_SCORE_METRIC;
  const scores = oceanScoresToCanonicalLikert(rawScores, scoreMetric);

  const o = traitTotal(scores, "openness");
  const c = traitTotal(scores, "conscientiousness");
  const e = traitTotal(scores, "extraversion");
  const a = traitTotal(scores, "agreeableness");
  const n = traitTotal(scores, "neuroticism");
  const oceanFingerprint = buildOceanFingerprint(scores);
  const promptExampleSalt = `${oceanFingerprint}|${Math.random().toString(36).slice(2, 10)}`;
  const profileDrivenRules = buildProfileDrivenCurationRules({ o, c, e, a, n, fingerprint: oceanFingerprint });
  const { compactRules: facetInterpretation, keySubfacets } = buildOceanFacetInterpretation(
    scores,
    {
      o,
      c,
      e,
      a,
      n,
    },
    promptExampleSalt
  );

  const webUsed = false;
  const promptBuildStartAt = Date.now();
  const prompt = buildPersonalizedFeedCuratorPrompt({
    o,
    c,
    e,
    a,
    n,
    oceanFingerprint,
    rulesText: profileDrivenRules.rulesText,
    facetInterpretation,
    keySubfacets,
  });
  const promptBuildMs = Date.now() - promptBuildStartAt;

  console.log(
    `[dreamlodge] PROMPT FEED PERSONALIZADO (OCEAN) → IA | fingerprint=${oceanFingerprint} | ${prompt.length} chars | ts=${new Date().toISOString()}\n${prompt}`
  );

  let text;
  const modelStartAt = Date.now();
  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "curación feed personalizado",
      timeoutMs: 55000,
      generationConfig: { temperature: 0.95, topP: 0.92, topK: 32 },
    });
  } catch (ex) {
    logger.error("curate_feed: fallo Gemini", ex);
    const detail = formatExceptionForClient(ex);
    const err = new Error(`No se pudo curar el feed con el modelo. ${detail}`);
    err.statusCode = 503;
    throw err;
  }
  const modelGenerateMs = Date.now() - modelStartAt;

  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) return { candidates: [], webSearchUsed: webUsed, reason: "bad_model_json" };

  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return { candidates: [], webSearchUsed: webUsed, reason: "json_error" };
  }

  const rawList = parsed.candidates;
  if (!Array.isArray(rawList)) return { candidates: [], webSearchUsed: webUsed, reason: "no_candidates" };

  const postProcessStartAt = Date.now();
  let cleaned = normalizeWorkCandidateRows(rawList, TARGET_CANDIDATES);
  const feedEntityId = feedEntityIdFromOceanResult(oceanResult);
  cleaned = await maybeRerankFeedCandidates({
    agent,
    candidates: cleaned,
    ocean: { o, c, e, a, n },
    artisticProfile,
    oceanFingerprint,
    feedEntityId,
    logger,
  });

  const recentTitles = getRecentTitlesForUser(feedEntityId);
  const reordered = reorderByNovelty(cleaned, recentTitles);
  if (recentTitles.size) {
    logger.info(
      "[dreamlodge][feed] novelty_reorder fingerprint=%s before=%s after=%s recent=%s",
      oceanFingerprint,
      cleaned.length,
      reordered.length,
      recentTitles.size
    );
  }
  cleaned = reordered;

  const overlapAvoid = countDefaultCanonOverlap(cleaned, profileDrivenRules.avoidTitles);
  const overlapGlobal = countGlobalCanonOverlap(cleaned);
  logger.info(
    "[dreamlodge][feed] overlap_checks fingerprint=%s avoidOverlap=%s globalOverlap=%s candidates=%s",
    oceanFingerprint,
    overlapAvoid,
    overlapGlobal,
    cleaned.length
  );

  logIaRecommendedWorks("feed_personalized", {
    id: feedEntityId != null ? String(feedEntityId) : undefined,
    works: cleaned,
  });
  saveRecentTitlesForUser(feedEntityId, cleaned);
  const postProcessMs = Date.now() - postProcessStartAt;
  const totalAiMs = Date.now() - aiStartAt;
  logger.info(
    "[feed/personalized][ai_timing] prompt_build_ms=%s model_generate_ms=%s post_process_ms=%s total_ai_ms=%s",
    promptBuildMs,
    modelGenerateMs,
    postProcessMs,
    totalAiMs
  );
  return {
    candidates: cleaned,
    webSearchUsed: webUsed,
    timing: {
      promptBuildMs,
      modelGenerateMs,
      postProcessMs,
      totalAiMs,
    },
  };
}

module.exports = { curatePersonalizedFeed };
