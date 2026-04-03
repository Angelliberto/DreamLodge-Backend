const { handleHTTPError } = require("../utils/handleHTTPError");
const { OceanModel, UserModel } = require("../models");
const mcpAi = require("../utils/mcpAiClient");

/** Caché en memoria por usuario (TTL corto; el cliente puede forzar refresh). */
const FEED_CACHE = new Map();
const FEED_TTL_MS = 45 * 60 * 1000;

/**
 * GET|POST /api/feed/personalized
 * Query: force=1 | Body (POST): { force: true }
 * Devuelve candidatos curados por el MCP (IA + búsqueda web opcional) para resolver en el cliente contra TMDB/Spotify/IGDB/Books/Met.
 */
const getPersonalizedFeedCurated = async (req, res) => {
  try {
    const userId = req.user._id;
    const force =
      req.query.force === "1" ||
      req.query.force === "true" ||
      (req.body && req.body.force === true);

    const key = String(userId);
    if (!force) {
      const hit = FEED_CACHE.get(key);
      if (hit && Date.now() - hit.ts < FEED_TTL_MS) {
        return res.status(200).json({
          message: "ok",
          data: { ...hit.data, cached: true },
        });
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
          candidates: [],
          webSearchUsed: false,
          reason: "no_ocean",
          cached: false,
        },
      });
    }

    const oceanPlain = JSON.parse(JSON.stringify(oceanResult));

    const userFresh = await UserModel.findById(userId).select("savedTags").lean();
    const savedTags = (userFresh?.savedTags || [])
      .map((t) =>
        typeof t === "object" && t && t.name != null ? t.name : String(t)
      )
      .filter(Boolean);

    let artisticProfile = null;
    if (oceanResult.artisticDescription) {
      try {
        const parsed = JSON.parse(oceanResult.artisticDescription);
        if (parsed && typeof parsed === "object") {
          artisticProfile = {
            profile: parsed.profile,
            description: parsed.description,
            recommendations: parsed.recommendations,
          };
        }
      } catch (_) {
        artisticProfile = null;
      }
    }

    const payload = {
      oceanResult: oceanPlain,
      savedTags,
      artisticProfile,
    };

    const data = await mcpAi.postMcpAi(
      "/ai/v1/feed/personalized-curate",
      payload,
      { timeoutMs: 120000 }
    );

    FEED_CACHE.set(key, { ts: Date.now(), data });
    return res.status(200).json({
      message: "ok",
      data: { ...data, cached: false },
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

module.exports = { getPersonalizedFeedCurated };
