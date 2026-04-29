const { buildCuratorContextFromSerper } = require("./webSearch");
const {
  formatExceptionForClient,
  traitTotal,
  buildProfileDrivenCurationRules,
  buildOceanFingerprint,
  normalizeSuggestedWorksByGenre,
  normalizeWorkCandidateRows,
  normalizeTitleForCompare,
  countDefaultCanonOverlap,
  countGlobalCanonOverlap,
  GENRE_REC_KEYS,
} = require("./agentUtils");

const RECENT_FEED_TITLES = new Map();
const RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_KEEP = 40;

function getRecentTitlesForUser(userId) {
  const key = String(userId || "").trim();
  if (!key) return new Set();
  const row = RECENT_FEED_TITLES.get(key);
  if (!row || Date.now() - row.ts > RECENT_TTL_MS) {
    RECENT_FEED_TITLES.delete(key);
    return new Set();
  }
  return new Set(Array.isArray(row.titles) ? row.titles : []);
}

function saveRecentTitlesForUser(userId, works) {
  const key = String(userId || "").trim();
  if (!key) return;
  const prev = getRecentTitlesForUser(key);
  const next = [];
  for (const w of works || []) {
    const t = normalizeTitleForCompare(w?.title || "");
    if (t) next.push(t);
  }
  const merged = [...new Set([...next, ...Array.from(prev)])].slice(0, RECENT_KEEP);
  RECENT_FEED_TITLES.set(key, { ts: Date.now(), titles: merged });
}

function reorderByNovelty(candidates, recentTitles) {
  if (!Array.isArray(candidates) || !candidates.length || !recentTitles?.size) return candidates || [];
  return [...candidates].sort((a, b) => {
    const aSeen = recentTitles.has(normalizeTitleForCompare(a?.title || "")) ? 1 : 0;
    const bSeen = recentTitles.has(normalizeTitleForCompare(b?.title || "")) ? 1 : 0;
    return aSeen - bSeen;
  });
}

async function curatePersonalizedFeed(agent, oceanResult, artisticProfile, deps = {}) {
  const logger = deps.logger || console;
  const logIaRecommendedWorks = deps.logIaRecommendedWorks || (() => {});

  const scores = oceanResult.scores;
  if (!scores || typeof scores !== "object") {
    return { candidates: [], webSearchUsed: false, reason: "no_ocean_scores" };
  }
  if (!agent.configured()) {
    return { candidates: [], webSearchUsed: false, reason: "no_gemini" };
  }

  const o = traitTotal(scores, "openness");
  const c = traitTotal(scores, "conscientiousness");
  const e = traitTotal(scores, "extraversion");
  const a = traitTotal(scores, "agreeableness");
  const n = traitTotal(scores, "neuroticism");
  const oceanFingerprint = buildOceanFingerprint(scores);
  const profileDrivenRules = buildProfileDrivenCurationRules({ o, c, e, a, n, fingerprint: oceanFingerprint });

  const personalityLine = `openness ${o.toFixed(1)} conscientiousness ${c.toFixed(1)} extraversion ${e.toFixed(1)} agreeableness ${a.toFixed(1)} neuroticism ${n.toFixed(1)}`;
  const [webBlock, webUsed] = await buildCuratorContextFromSerper(personalityLine);

  let artExtra = "";
  if (artisticProfile && typeof artisticProfile === "object") {
    const prof = String(artisticProfile.profile || "").trim();
    const desc = String(artisticProfile.description || "").trim().slice(0, 500);
    const gr = artisticProfile.genreRecommendations;
    let genreLine = "";
    if (gr && typeof gr === "object") {
      genreLine = GENRE_REC_KEYS.map((k) => {
        const arr = gr[k];
        if (!Array.isArray(arr) || !arr.length) return null;
        return `${k}: ${arr.filter(Boolean).map(String).join(", ")}`;
      }).filter(Boolean).join(" | ");
    }
    artExtra = `\nPerfil artístico existente: ${prof}\n${desc}\n${genreLine ? `${genreLine}\n` : ""}`;
  }

  const prompt = `Eres curador cultural para una app de descubrimiento.
Perfil OCEAN: Apertura ${o.toFixed(2)}, Responsabilidad ${c.toFixed(2)}, Extraversión ${e.toFixed(2)}, Amabilidad ${a.toFixed(2)}, Neuroticismo ${n.toFixed(2)}
Huella del perfil: ${oceanFingerprint}
${artExtra}
Reglas de diferenciación:
- ${profileDrivenRules.rulesText}
Fragmentos web:
${webBlock || "(Sin resultados web: NO te limites a clásicos obvios; prioriza ajuste fino por subgénero, tono y rasgos OCEAN del usuario.)"}
Devuelve entre 14 y 20 candidatos mezclando categorías.
Haz recomendaciones más arriesgadas (menos obvias/mainstream) SIEMPRE que mantengan fidelidad al perfil OCEAN y a genreRecommendations.
Evita converger en títulos repetidos entre usuarios salvo encaje excepcional.
Devuelve SOLO JSON: {"candidates":[{"category":"cine","title":"...","creator":"...","genreHint":"..."}]}
`;

  let text;
  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "curación feed personalizado",
      timeoutMs: 55000,
      generationConfig: { temperature: 1.1, topP: 0.95, topK: 40 },
    });
  } catch (ex) {
    logger.error("curate_feed: fallo Gemini", ex);
    const detail = formatExceptionForClient(ex);
    const err = new Error(`No se pudo curar el feed con el modelo. ${detail}`);
    err.statusCode = 503;
    throw err;
  }

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

  let cleaned = normalizeWorkCandidateRows(rawList, 24);
  const genreRecs = artisticProfile?.genreRecommendations;
  if (genreRecs && typeof genreRecs === "object") {
    const aligned = normalizeSuggestedWorksByGenre(rawList, genreRecs, 24);
    logger.info(
      "[dreamlodge][feed] genre_alignment raw=%s aligned=%s usingAligned=%s",
      Array.isArray(rawList) ? rawList.length : 0,
      aligned.length,
      aligned.length >= 10
    );
    if (aligned.length >= 10) cleaned = aligned;
  }

  const feedEntityId = oceanResult.entityId != null ? oceanResult.entityId : oceanResult.entity_id;
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
  return { candidates: cleaned, webSearchUsed: webUsed };
}

module.exports = { curatePersonalizedFeed };
