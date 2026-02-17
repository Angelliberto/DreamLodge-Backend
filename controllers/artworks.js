const { handleHTTPError } = require("../utils/handleHTTPError");
const { ArtworkModel, UserModel } = require("../models");
const mongoose = require("mongoose");

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

module.exports = {
  getArtworkById,
  getAllArtworks,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addToPending,
  removeFromPending,
  getPending
};
