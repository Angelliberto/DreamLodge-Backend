const { handleHTTPError } = require("../utils/handleHTTPError");
const { OceanModel, UserModel } = require("../models");
const ai = require("../services/ai");
const {
  resolveCuratedFeedCandidates,
  mergeCulturalFeedDedupe,
  extractSuggestedWorksFromArtisticJson,
} = require("../services/feedCandidateResolver");

/** Caché en memoria por usuario (TTL corto; el cliente puede forzar refresh). */
const FEED_CACHE = new Map();
const FEED_TTL_MS = 2 * 60 * 60 * 1000;
const GLOBAL_RECENT_TITLE_COUNTS = new Map();
const GLOBAL_RECENT_TTL_MS = 6 * 60 * 60 * 1000;
const USER_RECENT_FEED_TITLES = new Map();
const USER_RECENT_TTL_MS = 4 * 60 * 60 * 1000;
const REQUIRED_FEED_CATEGORIES = [
  "cine",
  "musica",
  "literatura",
  "videojuegos",
  "arte-visual",
];
const MIN_ITEMS_PER_CATEGORY = 5;

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUserInteractionSignals(userDoc) {
  const sets = {
    favorite: new Set(),
    pending: new Set(),
    avoidTitle: new Set(),
    avoidCreator: new Set(),
    likedGenres: new Set(),
    avoidGenres: new Set(),
  };
  const addTitleGenreCreator = (arr, targetTitleSet, targetCreatorSet, targetGenreSet) => {
    for (const it of arr || []) {
      const t = norm(it?.title);
      if (t) targetTitleSet.add(t);
      const c = norm(it?.creator);
      if (targetCreatorSet && c) targetCreatorSet.add(c);
      for (const g of it?.metadata?.genres || []) {
        const ng = norm(g);
        if (ng) targetGenreSet.add(ng);
      }
    }
  };
  addTitleGenreCreator(userDoc?.favoriteArtworks, sets.favorite, null, sets.likedGenres);
  addTitleGenreCreator(userDoc?.pendingArtworks, sets.pending, null, sets.likedGenres);
  addTitleGenreCreator(userDoc?.notInterestedArtworks, sets.avoidTitle, sets.avoidCreator, sets.avoidGenres);
  addTitleGenreCreator(userDoc?.dislikedArtworks, sets.avoidTitle, sets.avoidCreator, sets.avoidGenres);
  addTitleGenreCreator(userDoc?.seenArtworks, sets.avoidTitle, null, sets.avoidGenres);
  return sets;
}

function scoreByUserSignals(item, signals) {
  const title = norm(item?.title);
  const creator = norm(item?.creator);
  const genres = (item?.metadata?.genres || []).map(norm).filter(Boolean);
  let score = 0;
  if (title && signals.favorite.has(title)) score += 1.8;
  if (title && signals.pending.has(title)) score += 1.2;
  if (title && signals.avoidTitle.has(title)) score -= 4.5;
  if (creator && signals.avoidCreator.has(creator)) score -= 1.3;
  for (const g of genres) {
    if (signals.likedGenres.has(g)) score += 0.55;
    if (signals.avoidGenres.has(g)) score -= 0.55;
  }
  return score;
}

function getGlobalRepeatPenalty(item) {
  const title = norm(item?.title);
  if (!title) return 0;
  const row = GLOBAL_RECENT_TITLE_COUNTS.get(title);
  if (!row || Date.now() - row.ts > GLOBAL_RECENT_TTL_MS) {
    GLOBAL_RECENT_TITLE_COUNTS.delete(title);
    return 0;
  }
  const count = Number(row.count || 0);
  if (count <= 0) return 0;
  // Penalización suave al principio, más fuerte cuando un título se vuelve demasiado común.
  return Math.min(3.0, 0.35 * count);
}

function registerGlobalTitles(items) {
  for (const item of items || []) {
    const title = norm(item?.title);
    if (!title) continue;
    const row = GLOBAL_RECENT_TITLE_COUNTS.get(title);
    const nextCount = row && Date.now() - row.ts <= GLOBAL_RECENT_TTL_MS ? Number(row.count || 0) + 1 : 1;
    GLOBAL_RECENT_TITLE_COUNTS.set(title, { count: nextCount, ts: Date.now() });
  }
}

function getRecentUserTitles(userKey) {
  const row = USER_RECENT_FEED_TITLES.get(String(userKey || ""));
  if (!row) return new Set();
  if (Date.now() - Number(row.ts || 0) > USER_RECENT_TTL_MS) {
    USER_RECENT_FEED_TITLES.delete(String(userKey || ""));
    return new Set();
  }
  return new Set(Array.isArray(row.titles) ? row.titles : []);
}

function registerRecentUserTitles(userKey, items) {
  const key = String(userKey || "");
  if (!key) return;
  const prev = getRecentUserTitles(key);
  const titles = [];
  for (const item of items || []) {
    const t = norm(item?.title);
    if (!t) continue;
    prev.add(t);
  }
  for (const t of prev) {
    titles.push(t);
    if (titles.length >= 120) break;
  }
  USER_RECENT_FEED_TITLES.set(key, { ts: Date.now(), titles });
}

function countByCategory(items, categories) {
  const out = {};
  for (const cat of categories || []) out[cat] = 0;
  for (const item of items || []) {
    const cat = item?.category;
    if (!cat) continue;
    out[cat] = Number(out[cat] || 0) + 1;
  }
  return out;
}

function buildBalancedCategoryFeed(primaryItems, fallbackPool, categories, minPerCategory, maxItems) {
  const primary = Array.isArray(primaryItems) ? primaryItems : [];
  const fallback = Array.isArray(fallbackPool) ? fallbackPool : [];
  const required = Array.isArray(categories) ? categories : [];
  const minEach = Number(minPerCategory || 0);
  const maxTotal = Number(maxItems || 200);
  const pool = mergeCulturalFeedDedupe(primary, fallback);
  const selected = [];
  const selectedIds = new Set();

  const addItem = (item) => {
    if (!item?.id || selectedIds.has(item.id)) return false;
    selected.push(item);
    selectedIds.add(item.id);
    return true;
  };

  for (const cat of required) {
    const catRows = pool.filter((item) => item?.category === cat);
    let picked = 0;
    for (const row of catRows) {
      if (picked >= minEach) break;
      if (addItem(row)) picked += 1;
    }
  }

  for (const item of pool) {
    if (selected.length >= maxTotal) break;
    addItem(item);
  }

  return selected.slice(0, maxTotal);
}

function excludeRecentTitlesForForce(items, recentTitles) {
  const list = Array.isArray(items) ? items : [];
  const recent = recentTitles instanceof Set ? recentTitles : new Set();
  if (!recent.size) return list;
  return list.filter((item) => !recent.has(norm(item?.title)));
}

function hasCategorySurplus(item, categoryCounts, minPerCategory) {
  const cat = item?.category;
  if (!cat) return false;
  const count = Number(categoryCounts?.[cat] || 0);
  return count > Math.max(2, Number(minPerCategory || 0));
}

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
        console.log(
          "[feed/personalized] cache_check userId=%s cacheAgeMs=%s",
          key,
          Date.now() - hit.ts
        );
        if (Array.isArray(hit.data?.items)) {
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
    const aiCandidateCounts = countByCategory(curated, REQUIRED_FEED_CATEGORIES);
    console.log(
      "[feed/personalized] ai_candidates_by_category userId=%s cine=%s musica=%s literatura=%s videojuegos=%s arte_visual=%s",
      key,
      aiCandidateCounts.cine || 0,
      aiCandidateCounts.musica || 0,
      aiCandidateCounts.literatura || 0,
      aiCandidateCounts.videojuegos || 0,
      aiCandidateCounts["arte-visual"] || 0
    );
    const [resolvedAnchors, resolvedCurated, userWithSignals] = await Promise.all([
      resolveCuratedFeedCandidates(suggestedWorksRaw),
      resolveCuratedFeedCandidates(curated),
      UserModel.findById(userId)
        .populate("favoriteArtworks")
        .populate("pendingArtworks")
        .populate("notInterestedArtworks")
        .populate("dislikedArtworks")
        .populate("seenArtworks"),
    ]);
    const resolvedCuratedCounts = countByCategory(resolvedCurated, REQUIRED_FEED_CATEGORIES);
    const resolvedAnchorCounts = countByCategory(resolvedAnchors, REQUIRED_FEED_CATEGORIES);
    console.log(
      "[feed/personalized] resolved_by_category userId=%s curated(cine=%s musica=%s literatura=%s videojuegos=%s arte_visual=%s) anchors(cine=%s musica=%s literatura=%s videojuegos=%s arte_visual=%s)",
      key,
      resolvedCuratedCounts.cine || 0,
      resolvedCuratedCounts.musica || 0,
      resolvedCuratedCounts.literatura || 0,
      resolvedCuratedCounts.videojuegos || 0,
      resolvedCuratedCounts["arte-visual"] || 0,
      resolvedAnchorCounts.cine || 0,
      resolvedAnchorCounts.musica || 0,
      resolvedAnchorCounts.literatura || 0,
      resolvedAnchorCounts.videojuegos || 0,
      resolvedAnchorCounts["arte-visual"] || 0
    );
    const signals = buildUserInteractionSignals(userWithSignals);
    const recentUserTitles = getRecentUserTitles(key);
    const favoriteTitles = signals.favorite;
    const resolvedCuratedEffective = resolvedCurated;
    const resolvedAnchorsEffective = resolvedAnchors;

    const rerankedCurated = [...resolvedCuratedEffective]
      .filter((item) => !favoriteTitles.has(norm(item?.title)))
      .map((item) => {
        const userScore = scoreByUserSignals(item, signals);
        const canPenalizeRecent = hasCategorySurplus(
          item,
          resolvedCuratedCounts,
          MIN_ITEMS_PER_CATEGORY
        );
        const recentPenalty =
          force && canPenalizeRecent && recentUserTitles.has(norm(item?.title))
            ? 1.0
            : 0;
        return {
          item,
          s: userScore - recentPenalty,
          userScore,
          recentPenalty,
        };
      })
      .filter((row) => row.s > -4.5)
      .sort((a, b) => b.s - a.s)
      .map((row) => row.item)
      .slice(0, 120);
    const rerankedCounts = countByCategory(rerankedCurated, REQUIRED_FEED_CATEGORIES);
    console.log(
      "[feed/personalized] reranked_by_category userId=%s cine=%s musica=%s literatura=%s videojuegos=%s arte_visual=%s force=%s recentPenaltyPool=%s",
      key,
      rerankedCounts.cine || 0,
      rerankedCounts.musica || 0,
      rerankedCounts.literatura || 0,
      rerankedCounts.videojuegos || 0,
      rerankedCounts["arte-visual"] || 0,
      Boolean(force),
      recentUserTitles.size
    );

    const categoryPool = mergeCulturalFeedDedupe(
      rerankedCurated,
      mergeCulturalFeedDedupe(resolvedAnchorsEffective, resolvedCuratedEffective)
    );
    const categoryPoolFiltered = categoryPool.filter(
      (item) => !favoriteTitles.has(norm(item?.title))
    );
    let items = buildBalancedCategoryFeed(
      rerankedCurated,
      categoryPoolFiltered,
      REQUIRED_FEED_CATEGORIES
      ,
      MIN_ITEMS_PER_CATEGORY,
      200
    );
    const finalCounts = countByCategory(items, REQUIRED_FEED_CATEGORIES);
    const missingCategories = REQUIRED_FEED_CATEGORIES.filter(
      (cat) => (finalCounts[cat] || 0) < MIN_ITEMS_PER_CATEGORY
    );
    console.log(
      "[feed/personalized] merge userId=%s anchors=%s curated=%s reranked=%s minPerCategory=%s final=%s finalByCategory(cine=%s musica=%s literatura=%s videojuegos=%s arte_visual=%s) missingMin=%s",
      key,
      resolvedAnchors.length,
      resolvedCurated.length,
      rerankedCurated.length,
      MIN_ITEMS_PER_CATEGORY,
      items.length,
      finalCounts.cine || 0,
      finalCounts.musica || 0,
      finalCounts.literatura || 0,
      finalCounts.videojuegos || 0,
      finalCounts["arte-visual"] || 0,
      missingCategories.length ? missingCategories.join(",") : "none"
    );
    registerGlobalTitles(items);
    registerRecentUserTitles(key, items);

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
