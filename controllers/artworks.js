const { handleHTTPError } = require("../utils/handleHTTPError");
const { ArtworkModel } = require("../models");

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

module.exports = {
  getArtworkById,
  getAllArtworks
};
