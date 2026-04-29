const { handleHTTPError } = require("../utils/handleHTTPError");
const { OceanModel } = require("../models");
const ai = require("../services/ai");
const {
  resolveCuratedFeedCandidates,
  mergeCulturalFeedDedupe,
  extractSuggestedWorksFromArtisticJson,
} = require("../services/feedCandidateResolver");

/** Caché en memoria por usuario (TTL corto; el cliente puede forzar refresh). */
const FEED_CACHE = new Map();
const FEED_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * GET|POST /api/feed/personalized
 * Query: force=1, anchorsOnly=1 (solo obras del perfil artístico, sin curación Gemini)
 *
 * Devuelve `items` ya resueltos (TMDB, Spotify, Books, IGDB, Met).
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
    const oceanResult = await OceanModel.findOne({
      entityType: "user",
      entityId: userId,
      deleted: false,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const oceanUpdatedAt = oceanResult?.updatedAt
      ? new Date(oceanResult.updatedAt).getTime()
      : null;

    if (anchorsOnly) {
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
        const sameOceanVersion =
          Number(hit.oceanUpdatedAt || 0) === Number(oceanUpdatedAt || 0);
        console.log(
          "[feed/personalized] cache_check userId=%s sameOcean=%s cacheAgeMs=%s",
          key,
          Boolean(sameOceanVersion),
          Date.now() - hit.ts
        );
        if (Array.isArray(hit.data?.items) && sameOceanVersion) {
          console.log(
            "[feed/personalized] cache_hit userId=%s items=%s reason=%s",
            key,
            hit.data.items.length,
            hit.data.reason || "cached"
          );
          return res.status(200).json({
            message: "ok",
            data: { ...hit.data, cached: true },
          });
        }
        FEED_CACHE.delete(key);
      }
    }

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
            genreRecommendations:
              parsed.genreRecommendations && typeof parsed.genreRecommendations === "object"
                ? parsed.genreRecommendations
                : undefined,
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
      data = await ai.curatePersonalizedFeed(payload);
      console.log(
        "[feed/personalized] ai_curate userId=%s candidates=%s reason=%s webSearchUsed=%s",
        key,
        Array.isArray(data?.candidates) ? data.candidates.length : 0,
        data?.reason || "ok",
        Boolean(data?.webSearchUsed)
      );
    } catch (curateErr) {
      console.error("[feed/personalized] curación IA falló:", curateErr?.message || curateErr);
      const resolvedAnchors = await resolveCuratedFeedCandidates(suggestedWorksRaw);
      const fallback = {
        items: resolvedAnchors.slice(0, 200),
        webSearchUsed: false,
        reason: "ai_unavailable_anchors_only",
        cached: false,
      };
      FEED_CACHE.set(key, {
        ts: Date.now(),
        data: fallback,
        oceanUpdatedAt,
      });
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
    console.log(
      "[feed/personalized] merge userId=%s anchors=%s curated=%s final=%s",
      key,
      resolvedAnchors.length,
      resolvedCurated.length,
      items.length
    );

    const responseData = {
      items,
      webSearchUsed: Boolean(data.webSearchUsed),
      reason: data.reason,
      cached: false,
    };

    FEED_CACHE.set(key, {
      ts: Date.now(),
      data: responseData,
      oceanUpdatedAt,
    });
    return res.status(200).json({
      message: "ok",
      data: responseData,
    });
  } catch (error) {
    console.error("[feed/personalized] error:", error);
    return handleHTTPError(
      res,
      error.message ||
        "No se pudo obtener el feed personalizado",
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
