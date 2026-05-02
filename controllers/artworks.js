const { handleHTTPError } = require("../utils/handleHTTPError");
const { ArtworkModel, UserModel } = require("../models");
const mongoose = require("mongoose");
const ai = require("../services/ai");
const { resolveCuratedFeedCandidates } = require("../services/feedCandidateResolver");

const SIMILAR_CACHE = new Map();
const SIMILAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeTitleForCompare(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSimilarCacheKey(payload) {
  return [
    String(payload.category || "").trim().toLowerCase(),
    String(payload.targetCategory || "").trim().toLowerCase(),
    normalizeTitleForCompare(payload.title),
    normalizeTitleForCompare(payload.creator || ""),
    String(payload.resolverScope || "anon"),
  ].join("|");
}

function normalizeCinemaMediaType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "movie" || v === "pelicula" || v === "película") return "movie";
  if (v === "series" || v === "serie" || v === "tv") return "series";
  return "";
}

function getSimilarCache(key) {
  const row = SIMILAR_CACHE.get(key);
  if (!row) return null;
  if (Date.now() > row.exp) {
    SIMILAR_CACHE.delete(key);
    return null;
  }
  return row.data;
}

function setSimilarCache(key, data) {
  SIMILAR_CACHE.set(key, {
    data,
    exp: Date.now() + SIMILAR_CACHE_TTL_MS,
  });
}

/**
 * Obtener una obra por su ID
 * GET /api/artworks/:id
 */
const getArtworkById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return handleHTTPError(res, { message: "ID es requerido" }, 400);
    }

    // Buscar la obra por ID (puede ser el campo 'id' o '_id')
    const artwork = await ArtworkModel.findOne({
      $or: [
        { id: id },
        { _id: id }
      ]
    });

    if (!artwork) {
      return handleHTTPError(res, { message: "Obra no encontrada" }, 404);
    }

    return res.status(200).json({
      data: artwork
    });

  } catch (error) {
    console.error("Error obteniendo obra:", error);
    return handleHTTPError(res, { 
      message: "Error al obtener la obra",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Obtener todas las obras (con paginación opcional)
 * GET /api/artworks
 */
const getAllArtworks = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, source } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (category) {
      query.category = category;
    }
    if (source) {
      query.source = source;
    }

    const artworks = await ArtworkModel.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await ArtworkModel.countDocuments(query);

    return res.status(200).json({
      data: artworks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error("Error obteniendo obras:", error);
    return handleHTTPError(res, { 
      message: "Error al obtener las obras",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Función helper: Guardar o obtener una obra en la base de datos
 * Evita duplicados usando el campo 'id' único
 * Retorna el ObjectId de la obra (existente o recién creada)
 */
const saveOrGetArtwork = async (artworkData) => {
  try {
    // Validar que tenga el campo 'id' único
    if (!artworkData.id) {
      throw new Error("El campo 'id' es requerido para evitar duplicados");
    }

    // Buscar si la obra ya existe por su 'id' único
    let artwork = await ArtworkModel.findOne({ id: artworkData.id });

    if (artwork) {
      // Si existe, retornar su ObjectId
      return artwork._id;
    }

    // Si no existe, crear la nueva obra
    // Validar campos requeridos
    const requiredFields = ['id', 'originalId', 'source', 'title', 'category', 'imageUrl', 'creator'];
    const missingFields = requiredFields.filter(field => !artworkData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
    }

    // Crear la nueva obra
    artwork = await ArtworkModel.create({
      id: artworkData.id,
      originalId: artworkData.originalId,
      source: artworkData.source,
      title: artworkData.title,
      category: artworkData.category,
      imageUrl: artworkData.imageUrl,
      creator: artworkData.creator,
      year: artworkData.year || null,
      description: artworkData.description || null,
      rating: artworkData.rating || null,
      metadata: artworkData.metadata || {},
      tone_tags: artworkData.tone_tags || [],
      depth_emotional: artworkData.depth_emotional || null,
      depth_artistic: artworkData.depth_artistic || null
    });

    return artwork._id;
  } catch (error) {
    // Si es un error de duplicado único, intentar obtener la obra existente
    if (error.code === 11000 || error.message.includes('duplicate')) {
      const artwork = await ArtworkModel.findOne({ id: artworkData.id });
      if (artwork) {
        return artwork._id;
      }
    }
    throw error;
  }
};

/**
 * Agregar una obra a favoritos
 * POST /api/artworks/favorites
 * Body: { artwork: { ...datos de la obra... } }
 */
const addToFavorites = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    const { artwork } = req.body;
    const userId = req.user._id;

    if (!artwork) {
      return handleHTTPError(res, { message: "Los datos de la obra son requeridos" }, 400);
    }

    // Intentar usar transacciones si están disponibles
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (txError) {
      console.warn("Transacciones no disponibles, continuando sin transacciones:", txError.message);
      useTransaction = false;
    }

    // Guardar o obtener la obra en la BD
    const artworkId = await saveOrGetArtwork(artwork);

    // Verificar que el usuario existe
    const user = useTransaction
      ? await UserModel.findById(userId).session(session)
      : await UserModel.findById(userId);

    if (!user) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    // Verificar si la obra ya está en favoritos
    if (user.favoriteArtworks && user.favoriteArtworks.includes(artworkId)) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(200).json({
        message: "La obra ya está en favoritos",
        data: { artworkId }
      });
    }

    // Agregar la obra a favoritos (evitar duplicados)
    const updateOptions = useTransaction ? { session, new: true } : { new: true };
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { favoriteArtworks: artworkId } }, // $addToSet evita duplicados
      updateOptions
    ).populate('favoriteArtworks');

    // Confirmar transacción si se usó
    if (useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    return res.status(200).json({
      message: "Obra agregada a favoritos correctamente",
      data: { artworkId, favoriteArtworks: updatedUser.favoriteArtworks }
    });

  } catch (error) {
    // Abortar transacción si estaba activa
    if (useTransaction && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortError) {
        console.error("Error al abortar transacción:", abortError);
      }
    }

    console.error("Error agregando a favoritos:", error);
    return handleHTTPError(res, {
      message: "Error al agregar la obra a favoritos",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Remover una obra de favoritos
 * DELETE /api/artworks/favorites/:artworkId
 */
const removeFromFavorites = async (req, res) => {
  try {
    const { artworkId } = req.params;
    const userId = req.user._id;

    if (!artworkId) {
      return handleHTTPError(res, { message: "El ID de la obra es requerido" }, 400);
    }

    // Validar formato de ObjectId
    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
      return handleHTTPError(res, { message: "El ID de la obra debe ser un ObjectId válido" }, 400);
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $pull: { favoriteArtworks: artworkId } },
      { new: true }
    ).populate('favoriteArtworks');

    if (!updatedUser) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    return res.status(200).json({
      message: "Obra removida de favoritos correctamente",
      data: { favoriteArtworks: updatedUser.favoriteArtworks }
    });

  } catch (error) {
    console.error("Error removiendo de favoritos:", error);
    return handleHTTPError(res, {
      message: "Error al remover la obra de favoritos",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Obtener todas las obras favoritas del usuario
 * GET /api/artworks/favorites
 */
const getFavorites = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await UserModel.findById(userId)
      .populate({
        path: 'favoriteArtworks',
        model: 'Artwork'
      });

    if (!user) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    return res.status(200).json({
      data: user.favoriteArtworks || []
    });

  } catch (error) {
    console.error("Error obteniendo favoritos:", error);
    return handleHTTPError(res, {
      message: "Error al obtener las obras favoritas",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Agregar una obra a pendientes
 * POST /api/artworks/pending
 * Body: { artwork: { ...datos de la obra... } }
 */
const addToPending = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    const { artwork } = req.body;
    const userId = req.user._id;

    if (!artwork) {
      return handleHTTPError(res, { message: "Los datos de la obra son requeridos" }, 400);
    }

    // Intentar usar transacciones si están disponibles
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (txError) {
      console.warn("Transacciones no disponibles, continuando sin transacciones:", txError.message);
      useTransaction = false;
    }

    // Guardar o obtener la obra en la BD
    const artworkId = await saveOrGetArtwork(artwork);

    // Verificar que el usuario existe
    const user = useTransaction
      ? await UserModel.findById(userId).session(session)
      : await UserModel.findById(userId);

    if (!user) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    // Verificar si la obra ya está en pendientes
    if (user.pendingArtworks && user.pendingArtworks.includes(artworkId)) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(200).json({
        message: "La obra ya está en pendientes",
        data: { artworkId }
      });
    }

    // Agregar la obra a pendientes (evitar duplicados)
    const updateOptions = useTransaction ? { session, new: true } : { new: true };
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { pendingArtworks: artworkId } }, // $addToSet evita duplicados
      updateOptions
    ).populate('pendingArtworks');

    // Confirmar transacción si se usó
    if (useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    return res.status(200).json({
      message: "Obra agregada a pendientes correctamente",
      data: { artworkId, pendingArtworks: updatedUser.pendingArtworks }
    });

  } catch (error) {
    // Abortar transacción si estaba activa
    if (useTransaction && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortError) {
        console.error("Error al abortar transacción:", abortError);
      }
    }

    console.error("Error agregando a pendientes:", error);
    return handleHTTPError(res, {
      message: "Error al agregar la obra a pendientes",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Remover una obra de pendientes
 * DELETE /api/artworks/pending/:artworkId
 */
const removeFromPending = async (req, res) => {
  try {
    const { artworkId } = req.params;
    const userId = req.user._id;

    if (!artworkId) {
      return handleHTTPError(res, { message: "El ID de la obra es requerido" }, 400);
    }

    // Validar formato de ObjectId
    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
      return handleHTTPError(res, { message: "El ID de la obra debe ser un ObjectId válido" }, 400);
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $pull: { pendingArtworks: artworkId } },
      { new: true }
    ).populate('pendingArtworks');

    if (!updatedUser) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    return res.status(200).json({
      message: "Obra removida de pendientes correctamente",
      data: { pendingArtworks: updatedUser.pendingArtworks }
    });

  } catch (error) {
    console.error("Error removiendo de pendientes:", error);
    return handleHTTPError(res, {
      message: "Error al remover la obra de pendientes",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Obtener todas las obras pendientes del usuario
 * GET /api/artworks/pending
 */
const getPending = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await UserModel.findById(userId)
      .populate({
        path: 'pendingArtworks',
        model: 'Artwork'
      });

    if (!user) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    return res.status(200).json({
      data: user.pendingArtworks || []
    });

  } catch (error) {
    console.error("Error obteniendo pendientes:", error);
    return handleHTTPError(res, {
      message: "Error al obtener las obras pendientes",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

async function addToUserArtworkList(req, res, field, successMessage) {
  try {
    const { artwork } = req.body;
    const userId = req.user._id;
    if (!artwork) {
      return handleHTTPError(res, { message: "Los datos de la obra son requeridos" }, 400);
    }
    const artworkId = await saveOrGetArtwork(artwork);
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $addToSet: { [field]: artworkId } },
      { new: true }
    ).populate(field);
    if (!updatedUser) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }
    return res.status(200).json({
      message: successMessage,
      data: { artworkId, [field]: updatedUser[field] || [] },
    });
  } catch (error) {
    return handleHTTPError(
      res,
      {
        message: "Error actualizando feedback de obra",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      500
    );
  }
}

async function removeFromUserArtworkList(req, res, field, paramName, successMessage) {
  try {
    const artworkId = req.params[paramName];
    const userId = req.user._id;
    if (!artworkId || !mongoose.Types.ObjectId.isValid(artworkId)) {
      return handleHTTPError(res, { message: "artworkId inválido" }, 400);
    }
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $pull: { [field]: artworkId } },
      { new: true }
    ).populate(field);
    if (!updatedUser) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }
    return res.status(200).json({
      message: successMessage,
      data: { [field]: updatedUser[field] || [] },
    });
  } catch (error) {
    return handleHTTPError(
      res,
      {
        message: "Error removiendo feedback de obra",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      500
    );
  }
}

async function getUserArtworkList(req, res, field) {
  try {
    const userId = req.user._id;
    const user = await UserModel.findById(userId).populate({
      path: field,
      model: "Artwork",
    });
    if (!user) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }
    return res.status(200).json({ data: user[field] || [] });
  } catch (error) {
    return handleHTTPError(
      res,
      {
        message: "Error obteniendo feedback de obras",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      500
    );
  }
}

const addToDisliked = async (req, res) =>
  addToUserArtworkList(req, res, "dislikedArtworks", "Obra agregada a no me gustó");
const removeFromDisliked = async (req, res) =>
  removeFromUserArtworkList(req, res, "dislikedArtworks", "artworkId", "Obra removida de no me gustó");
const getDisliked = async (req, res) => getUserArtworkList(req, res, "dislikedArtworks");

const addToSeen = async (req, res) =>
  addToUserArtworkList(req, res, "seenArtworks", "Obra marcada como ya vista");
const removeFromSeen = async (req, res) =>
  removeFromUserArtworkList(req, res, "seenArtworks", "artworkId", "Obra removida de ya vista");
const getSeen = async (req, res) => getUserArtworkList(req, res, "seenArtworks");

const addToNotInterested = async (req, res) =>
  addToUserArtworkList(req, res, "notInterestedArtworks", "Obra agregada a no me interesa");
const removeFromNotInterested = async (req, res) =>
  removeFromUserArtworkList(
    req,
    res,
    "notInterestedArtworks",
    "artworkId",
    "Obra removida de no me interesa"
  );
const getNotInterested = async (req, res) => getUserArtworkList(req, res, "notInterestedArtworks");

/**
 * Obtener 3 obras similares recomendadas por IA para una obra base.
 * POST /api/artworks/similar
 * Body: { artwork: CulturalItem-like, limit?: number }
 */
const getSimilarArtworks = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const artwork = body.artwork && typeof body.artwork === "object" ? body.artwork : {};
    const limit = Math.max(1, Math.min(6, Number(body.limit) || 3));
    const requestedTargetCategory = String(body.targetCategory || "")
      .trim()
      .toLowerCase();
    const allowedCategories = new Set([
      "cine",
      "musica",
      "literatura",
      "videojuegos",
      "arte-visual",
    ]);
    const title = String(artwork.title || "").trim();
    const category = String(artwork.category || "").trim().toLowerCase();
    const targetCategory = allowedCategories.has(requestedTargetCategory)
      ? requestedTargetCategory
      : category;

    if (!title || !category) {
      return handleHTTPError(res, { message: "artwork.title y artwork.category son requeridos" }, 400);
    }

    const resolverScope = req.user?._id ? String(req.user._id) : "anon";
    const key = buildSimilarCacheKey({ ...artwork, targetCategory, resolverScope });
    const cacheHit = getSimilarCache(key);
    if (cacheHit) {
      return res.status(200).json({
        data: { items: cacheHit.slice(0, limit), cached: true },
      });
    }

    const aiResult = await ai.recommendSimilarWorks(artwork, {
      limit,
      targetCategory,
    });
    const candidates = Array.isArray(aiResult?.candidates) ? aiResult.candidates : [];
    const resolved = await resolveCuratedFeedCandidates(candidates, {
      diversitySeed: resolverScope,
    });
    const wantedTitle = normalizeTitleForCompare(title);
    const wantedMediaType = normalizeCinemaMediaType(artwork?.metadata?.mediaType);
    const filtered = resolved.filter((item) => {
      if (String(item?.category || "").trim().toLowerCase() !== targetCategory) return false;
      if (normalizeTitleForCompare(item?.title) === wantedTitle) return false;
      if (targetCategory === "cine" && wantedMediaType) {
        const itemMediaType = normalizeCinemaMediaType(item?.metadata?.mediaType);
        if (itemMediaType && itemMediaType !== wantedMediaType) return false;
      }
      return true;
    });
    const finalItems = filtered.slice(0, limit);
    setSimilarCache(key, finalItems);

    return res.status(200).json({
      data: { items: finalItems, cached: false },
    });
  } catch (error) {
    console.error("Error obteniendo obras similares:", error);
    return handleHTTPError(res, {
      message: "Error al obtener obras similares",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

module.exports = {
  getArtworkById,
  getAllArtworks,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addToPending,
  removeFromPending,
  getPending,
  addToDisliked,
  removeFromDisliked,
  getDisliked,
  addToSeen,
  removeFromSeen,
  getSeen,
  addToNotInterested,
  removeFromNotInterested,
  getNotInterested,
  getSimilarArtworks,
};
