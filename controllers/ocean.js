const { handleHTTPError } = require("../utils/handleHTTPError");
const { OceanModel, UserModel, ArtworkModel, GenreModel } = require("../models");
const mongoose = require("mongoose");

/**
 * Validar la estructura de scores según el schema OCEAN
 */
const validateScoresStructure = (scores) => {
  if (!scores || typeof scores !== 'object') {
    return { valid: false, message: "scores debe ser un objeto" };
  }

  const requiredTraits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
  const missingTraits = requiredTraits.filter(trait => !scores[trait]);

  if (missingTraits.length > 0) {
    return { 
      valid: false, 
      message: `scores debe incluir las siguientes dimensiones: ${missingTraits.join(', ')}` 
    };
  }

  // Validar que cada trait tenga al menos la propiedad total
  for (const trait of requiredTraits) {
    if (!scores[trait] || typeof scores[trait] !== 'object') {
      return { 
        valid: false, 
        message: `${trait} debe ser un objeto con al menos la propiedad 'total'` 
      };
    }
    if (typeof scores[trait].total !== 'number') {
      return { 
        valid: false, 
        message: `${trait}.total debe ser un número` 
      };
    }
  }

  return { valid: true };
};

/**
 * Guardar o actualizar los resultados del test OCEAN
 * Recibe: { entityType, entityId, scores, totalScore }
 */
const saveTestResults = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    const { entityType, entityId, scores, totalScore } = req.body;

    // Validaciones básicas
    if (!entityType || !['user', 'artwork', 'genre'].includes(entityType)) {
      return handleHTTPError(res, { message: "entityType debe ser 'user', 'artwork' o 'genre'" }, 400);
    }

    if (!entityId) {
      return handleHTTPError(res, { message: "entityId es requerido" }, 400);
    }

    // Validar formato de ObjectId
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return handleHTTPError(res, { message: "entityId debe ser un ObjectId válido" }, 400);
    }

    if (!scores) {
      return handleHTTPError(res, { message: "scores es requerido" }, 400);
    }

    // Validar estructura de scores
    const scoresValidation = validateScoresStructure(scores);
    if (!scoresValidation.valid) {
      return handleHTTPError(res, { message: scoresValidation.message }, 400);
    }

    // Intentar usar transacciones si están disponibles
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (txError) {
      // Si las transacciones no están disponibles (ej: sin replica set), continuar sin ellas
      console.warn("Transacciones no disponibles, continuando sin transacciones:", txError.message);
      useTransaction = false;
    }

    // Verificar que la entidad existe
    let entityModel;
    if (entityType === 'user') {
      entityModel = UserModel;
    } else if (entityType === 'artwork') {
      entityModel = ArtworkModel;
    } else if (entityType === 'genre') {
      entityModel = GenreModel;
    }

    const entityExists = useTransaction 
      ? await entityModel.findById(entityId).session(session)
      : await entityModel.findById(entityId);
      
    if (!entityExists) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return handleHTTPError(res, { message: `${entityType} no encontrado` }, 404);
    }

    // Buscar si ya existe un registro Ocean para esta entidad
    const oceanQuery = OceanModel.findOne({
      entityType,
      entityId,
      deleted: false
    });
    
    if (useTransaction) {
      oceanQuery.session(session);
    }
    
    let oceanResult = await oceanQuery;

    if (oceanResult) {
      // Actualizar registro existente
      oceanResult.scores = scores;
      if (totalScore !== undefined) {
        oceanResult.totalScore = totalScore;
      }
      if (useTransaction) {
        await oceanResult.save({ session });
      } else {
        await oceanResult.save();
      }
    } else {
      // Crear nuevo registro
      if (useTransaction) {
        const created = await OceanModel.create([{
          entityType,
          entityId,
          scores,
          totalScore
        }], { session });
        oceanResult = created[0];
      } else {
        oceanResult = await OceanModel.create({
          entityType,
          entityId,
          scores,
          totalScore
        });
      }
    }

    // Actualizar oceanId en la entidad relacionada (si aplica)
    // Nota: artwork no tiene campo oceanId según el schema
    const updateOptions = useTransaction ? { session } : {};
    
    if (entityType === 'user') {
      await UserModel.findByIdAndUpdate(
        entityId, 
        { oceanId: oceanResult._id },
        updateOptions
      );
    } else if (entityType === 'genre') {
      await GenreModel.findByIdAndUpdate(
        entityId, 
        { oceanId: oceanResult._id },
        updateOptions
      );
    }

    // Confirmar transacción si se usó
    if (useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    // Obtener el resultado con la entidad poblada
    const populatedResult = await OceanModel.findById(oceanResult._id)
      .populate('entityId');

    return res.status(200).json({
      message: "Resultados del test guardados correctamente",
      data: populatedResult
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
    
    console.error("Error guardando resultados del test:", error);
    
    // Proporcionar mensajes de error más específicos
    if (error.name === 'ValidationError') {
      return handleHTTPError(res, { 
        message: "Error de validación en los datos", 
        details: error.message 
      }, 400);
    }
    
    return handleHTTPError(res, { 
      message: "Error al guardar los resultados del test",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Obtener los resultados del test OCEAN por entityType y entityId
 */
const getTestResults = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !['user', 'artwork', 'genre'].includes(entityType)) {
      return handleHTTPError(res, { message: "entityType debe ser 'user', 'artwork' o 'genre'" }, 400);
    }

    if (!entityId) {
      return handleHTTPError(res, { message: "entityId es requerido" }, 400);
    }

    const oceanResult = await OceanModel.findOne({
      entityType,
      entityId,
      deleted: false
    }).populate('entityId');

    if (!oceanResult) {
      return handleHTTPError(res, { message: "Resultados del test no encontrados" }, 404);
    }

    return res.status(200).json({
      data: oceanResult
    });

  } catch (error) {
    console.error("Error obteniendo resultados del test:", error);
    return handleHTTPError(res, { message: "Error al obtener los resultados del test" }, 500);
  }
};

/**
 * Obtener todos los resultados del test de un usuario específico
 * Útil para ver el historial o resultados múltiples
 */
const getUserTestResults = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleHTTPError(res, { message: "userId es requerido" }, 400);
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    const oceanResults = await OceanModel.find({
      entityType: 'user',
      entityId: userId,
      deleted: false
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      data: oceanResults
    });

  } catch (error) {
    console.error("Error obteniendo resultados del test del usuario:", error);
    return handleHTTPError(res, { message: "Error al obtener los resultados del test del usuario" }, 500);
  }
};

/**
 * Eliminar (soft delete) resultados del test
 */
const deleteTestResults = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !['user', 'artwork', 'genre'].includes(entityType)) {
      return handleHTTPError(res, { message: "entityType debe ser 'user', 'artwork' o 'genre'" }, 400);
    }

    if (!entityId) {
      return handleHTTPError(res, { message: "entityId es requerido" }, 400);
    }

    const oceanResult = await OceanModel.findOneAndUpdate(
      {
        entityType,
        entityId,
        deleted: false
      },
      { deleted: true },
      { new: true }
    );

    if (!oceanResult) {
      return handleHTTPError(res, { message: "Resultados del test no encontrados" }, 404);
    }

    return res.status(200).json({
      message: "Resultados del test eliminados correctamente"
    });

  } catch (error) {
    console.error("Error eliminando resultados del test:", error);
    return handleHTTPError(res, { message: "Error al eliminar los resultados del test" }, 500);
  }
};

module.exports = {
  saveTestResults,
  getTestResults,
  getUserTestResults,
  deleteTestResults
};
