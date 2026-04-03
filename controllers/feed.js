const { handleHTTPError } = require("../utils/handleHTTPError");
const { OceanModel } = require("../models");
const mcpAi = require("../utils/mcpAiClient");
const {
  resolveCuratedFeedCandidates,
  mergeCulturalFeedDedupe,
  extractSuggestedWorksFromArtisticJson,
} = require("../services/feedCandidateResolver");

/** Caché en memoria por usuario (TTL corto; el cliente puede forzar refresh). */
const FEED_CACHE = new Map();
const FEED_TTL_MS = 45 * 60 * 1000;

/**
 * GET|POST /api/feed/personalized
 * Query: force=1, anchorsOnly=1 (solo obras del perfil artístico, sin MCP de curación)
 *
 * Devuelve `items` ya resueltos (TMDB, Spotify, Books, IGDB, Met) — la lógica pesada vive en el backend.
 */
const getPersonalizedFeedCurated = async (req, res) => {
  try {
    const userId = req.user._id;
    const force =
      req.query.force === "1" ||
      req.query.force === "true" ||
      (req.body && req.body.force === true);
    const anchorsOnly =
      req.query.anchorsOnly === "1" || req.query.anchorsOnly === "true";

    const key = String(userId);

    if (anchorsOnly) {
      const oceanResult = await OceanModel.findOne({
        entityType: "user",
        entityId: userId,
        deleted: false,
      })
        .sort({ updatedAt: -1 })
        .lean();

      if (!oceanResult?.artisticDescription) {
        return res.status(200).json({
          message: "ok",
          data: {
            items: [],
            webSearchUsed: false,
            reason: "no_artistic_profile",
            cached: false,
          },
        });
      }

      const rawWorks = extractSuggestedWorksFromArtisticJson(
        oceanResult.artisticDescription
      );
      const items = await resolveCuratedFeedCandidates(rawWorks);
      return res.status(200).json({
        message: "ok",
        data: {
          items: items.slice(0, 200),
          webSearchUsed: false,
          reason: items.length ? "ok" : "no_resolved_works",
          cached: false,
        },
      });
    }

    if (!force) {
      const hit = FEED_CACHE.get(key);
      if (hit && Date.now() - hit.ts < FEED_TTL_MS) {
        if (Array.isArray(hit.data?.items)) {
          return res.status(200).json({
            message: "ok",
            data: { ...hit.data, cached: true },
          });
        }
        FEED_CACHE.delete(key);
      }
    }

    const oceanResult = await OceanModel.findOne({
      entityType: "user",
      entityId: userId,
      deleted: false,
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!oceanResult) {
      return res.status(200).json({
        message: "ok",
        data: {
          items: [],
          webSearchUsed: false,
          reason: "no_ocean",
          cached: false,
        },
      });
    }

    const oceanPlain = JSON.parse(JSON.stringify(oceanResult));

    const suggestedWorksRaw = extractSuggestedWorksFromArtisticJson(
      oceanResult.artisticDescription || ""
    );

    let artisticProfile = null;
    if (oceanResult.artisticDescription) {
      try {
        const parsed = JSON.parse(oceanResult.artisticDescription);
        if (parsed && typeof parsed === "object") {
          artisticProfile = {
            profile: parsed.profile,
            description: parsed.description,
            recommendations: parsed.recommendations,
            suggestedWorks: Array.isArray(parsed.suggestedWorks)
              ? parsed.suggestedWorks
              : [],
          };
        }
      } catch (_) {
        artisticProfile = null;
      }
    }

    const payload = {
      oceanResult: oceanPlain,
      artisticProfile,
    };

    let data;
    try {
      data = await mcpAi.postMcpAi(
        "/ai/v1/feed/personalized-curate",
        payload,
        { timeoutMs: 120000 }
      );
    } catch (mcpErr) {
      console.error("[feed/personalized] MCP curate failed:", mcpErr?.message || mcpErr);
      const resolvedAnchors = await resolveCuratedFeedCandidates(suggestedWorksRaw);
      const fallback = {
        items: resolvedAnchors.slice(0, 200),
        webSearchUsed: false,
        reason: "mcp_unavailable_anchors_only",
        cached: false,
      };
      FEED_CACHE.set(key, { ts: Date.now(), data: fallback });
      return res.status(200).json({
        message: "ok",
        data: fallback,
      });
    }

    const curated = data.candidates || [];
    const [resolvedAnchors, resolvedCurated] = await Promise.all([
      resolveCuratedFeedCandidates(suggestedWorksRaw),
      resolveCuratedFeedCandidates(curated),
    ]);
    const items = mergeCulturalFeedDedupe(
      resolvedAnchors,
      resolvedCurated
    ).slice(0, 200);

    const responseData = {
      items,
      webSearchUsed: Boolean(data.webSearchUsed),
      reason: data.reason,
      cached: false,
    };

    FEED_CACHE.set(key, { ts: Date.now(), data: responseData });
    return res.status(200).json({
      message: "ok",
      data: responseData,
    });
  } catch (error) {
    console.error("[feed/personalized] error:", error);
    return handleHTTPError(
      res,
      error.message ||
        "No se pudo obtener el feed personalizado desde el MCP",
      error.statusCode || 502
    );
  }
};

function clearPersonalizedFeedCacheForUser(userId) {
  if (userId == null) return;
  FEED_CACHE.delete(String(userId));
}

module.exports = {
  getPersonalizedFeedCurated,
  clearPersonalizedFeedCacheForUser,
};
